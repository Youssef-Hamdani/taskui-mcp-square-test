import {createDraft,adaptTask,clone,validate,reduceEditor,STATUSES,FRAMEWORKS,splitTask,draftFrom,impacts} from '/engine.mjs';
const $=id=>document.getElementById(id);
const initial=createDraft();
let state={draft:initial,original:clone(initial),source:null,undo:[],selected:null,mode:'hybrid',review:null,connected:false};
let bridge=null, generation=0, busy=false, lastHostKey=null;
const labels={'Ready':'○ Ready','In progress':'◷ In progress','Blocked':'🔒 Blocked','Complete':'✓ Complete','Superseded':'▤ Superseded','Excluded':'− Excluded','Not applicable':'— Not applicable'};
const tones={'Ready':'','In progress':'warning','Blocked':'danger','Complete':'success','Superseded':'history','Excluded':'history','Not applicable':'history'};
function el(tag,text,cls){const n=document.createElement(tag);if(text!==undefined)n.textContent=text;if(cls)n.className=cls;return n;}
function message(text){$('message').textContent=text;}
function dispatch(a){state=reduceEditor(state,a);generation++;render();}
function install(draft,source=null,connected=false){
  // Imported data is local untrusted input; backend remains authoritative.
  if(!draft?.project||!Array.isArray(draft.tasks)||!Array.isArray(draft.exclusions)||!Array.isArray(draft.splits)||draft.tasks.length>500)throw Error('Invalid complete draft');
  validate(draft,source);
  state={draft:clone(draft),original:clone(draft),source:clone(source),undo:[],selected:draft.tasks[0]?.task_id??null,mode:'hybrid',review:null,connected};generation++;render();
}
function field(parent,label,value,onChange,kind='text',options=null){
  const wrap=el('div');wrap.append(el('label',label));
  const input=el(options?'select':kind==='textarea'?'textarea':'input');
  input.id=`field-${label.replace(/\W/g,'-')}`;wrap.firstChild.htmlFor=input.id;
  if(options)for(const x of options){const option=el('option',x);option.value=x;input.append(option);}else if(kind!=='textarea')input.type=kind;
  if(kind==='number'){input.min='0';input.step='1';}
  input.value=value??'';input.addEventListener('change',()=>onChange(input.value));wrap.append(input);parent.append(wrap);return input;
}
function taskButton(t,s){const b=el('button',t.title||'Untitled task',`task ${tones[s.effective_status]??''}`);b.type='button';b.dataset.taskId=t.task_id;b.setAttribute('aria-pressed',String(state.selected===t.task_id));b.append(el('small',`${labels[s.effective_status]} · ${t.provenance==='AI'?'✦ AI proposal':t.provenance} · ${t.estimated_minutes===null?'Effort unknown':t.estimated_minutes+' min'}`));if(s.reasons.length)b.append(el('small',s.reasons.join('; ')));b.onclick=()=>dispatch({type:'select',id:t.task_id});return b;}
function render(){
  const d=state.draft,r=validate(d,state.source), by=new Map(r.states.map(s=>[s.task_id,s]));
  $('modeBadge').textContent=state.connected?'Connected · approval required':'Simulation · no remote save';
  $('notice').textContent=state.connected?'Local edits are unsaved. Review exact changes before approving a remote write.':'Local editor. No remote save is configured. Export complete JSON to preserve work and continue in ChatGPT.';
  for(const [id,key]of [['name','name'],['goal','goal'],['context','context'],['target','target_date'],['framework','framework']])$(id).value=d.project[key]??'';
  $('creationMode').value=state.mode;$('instructions').value=d.additional_instructions;$('scope').value=d.instruction_scope;
  $('undo').disabled=!state.undo.length;$('review').disabled=busy;$('approve').disabled=busy||!state.connected||!state.review?.valid;
  $('summary').replaceChildren();for(const [n,v]of [['Complete / active',`${r.summary.completed} / ${r.summary.active}`],['Ready now',r.summary.ready],['Known minutes left',r.summary.known_remaining_minutes],['Unknown efforts',r.summary.unknown_remaining_count],['Conditional tasks',r.summary.conditional_count]]){const a=el('div',n);a.prepend(el('strong',String(v)));$('summary').append(a);}
  $('tasks').replaceChildren();
  for(const [title,states]of [['Ready now',['Ready','In progress']],['Blocked',['Blocked']],['History',['Complete','Superseded','Excluded','Not applicable']]]){
    const rows=d.tasks.filter(t=>states.includes(by.get(t.task_id).effective_status)).sort((a,b)=>(a.due_date??'9999').localeCompare(b.due_date??'9999'));if(rows.length){$('tasks').append(el('h3',title));rows.forEach(t=>$('tasks').append(taskButton(t,by.get(t.task_id))));}
  }
  if(!d.tasks.length)$('tasks').append(el('p','Add tasks or ask ChatGPT to propose a plan.'));
  $('graph').replaceChildren();for(const t of d.tasks){const row=el('div');const b=el('button',t.title||'Untitled','node');b.dataset.nodeId=t.task_id;b.onclick=()=>dispatch({type:'select',id:t.task_id});row.append(b,el('small',t.depends_on.length?' ← '+t.depends_on.map(id=>d.tasks.find(t=>t.task_id===id)?.title??`Missing ${id}`).join(', '):' · independent'));$('graph').append(row);}
  $('editor').replaceChildren();const t=d.tasks.find(t=>t.task_id===state.selected);
  if(t){
    $('editor').append(el('p',`${t.task_id} · version ${t.version} · ${t.provenance}`,'id'));
    const fields=el('div',undefined,'fields'),patch=p=>dispatch({type:'task',id:t.task_id,patch:p});
    field(fields,'Title',t.title,v=>patch({title:v}));field(fields,'Stored status',t.status,v=>patch({status:v}),'text',STATUSES);
    field(fields,'Notes',t.notes,v=>patch({notes:v}),'textarea');field(fields,'Estimated minutes (blank = unknown)',t.estimated_minutes,v=>patch({estimated_minutes:v===''?null:Number(v)}),'number');
    field(fields,'Due date',t.due_date,v=>patch({due_date:v||null}),'date');
    field(fields,'Prerequisite IDs (comma separated)',t.depends_on.join(', '),v=>patch({depends_on:v.split(',').map(x=>x.trim()).filter(Boolean)}),'textarea');
    field(fields,'Group / milestone / sprint',t.group??'',v=>patch({group:v}));
    if(t.condition){field(fields,'Diagnostic outcome',t.condition.outcome,v=>patch({condition:{...t.condition,outcome:v},applicability:v==='unknown'?'pending':v==='required'?'applicable':'not_applicable'}),'text',['unknown','required','not_required']);fields.append(el('p',`Diagnostic: ${t.condition.diagnostic_task_id}`,'id'));}
    $('editor').append(fields);
    const exclude=el('button',t.archived?'Restore task to active work':d.exclusions.includes(t.task_id)?'Keep original task':'Exclude from active work');exclude.id='excludeTask';exclude.onclick=()=>dispatch(t.archived?{type:'task',id:t.task_id,patch:{archived:false}}:{type:'exclude',id:t.task_id});$('editor').append(exclude);
    const impact=impacts(d.tasks,t.task_id);if(impact.direct.length)$('editor').append(el('p',`Direct dependents: ${impact.direct.join(', ')}. Transitive: ${impact.transitive.join(', ')}`,'id'));
    const detail=el('details');detail.append(el('summary','Propose a split'));
    const text=el('textarea');text.id='splitText';text.setAttribute('aria-label','Describe the split');text.placeholder='Describe subtasks. Use one title per line for a manual proposal; free prose can be sent to ChatGPT.';text.value=d.split_requests?.find(r=>r.task_id===t.task_id)?.description??'';text.oninput=()=>{const requests=(state.draft.split_requests??[]).filter(r=>r.task_id!==t.task_id);if(text.value.trim())requests.push({task_id:t.task_id,description:text.value});state={...state,draft:{...state.draft,split_requests:requests,draft_revision:state.draft.draft_revision+1},review:null};generation++;$('reviewPanel').hidden=true;$('approve').disabled=true;};detail.append(text);
    const propose=el('button','Propose named subtasks');propose.id='splitTask';propose.onclick=()=>{
      const titles=text.value.split('\n').map(s=>s.trim()).filter(Boolean);if(titles.length<2){message('Describe the split to ChatGPT, or enter at least two task titles on separate lines. No changes applied.');return;}
      const next=splitTask(state.draft,t.task_id,titles);next.split_requests=(next.split_requests??[]).filter(r=>r.task_id!==t.task_id);next.tasks.filter(c=>c.parent_task_id===t.task_id).forEach(c=>c.provenance='user');
      state={...state,draft:next,undo:[...state.undo,clone(state.draft)],review:null};generation++;render();message('Split proposed. Parent retained; review and resolve downstream edges.');};detail.append(propose);
    const send=el('button','Send split description to ChatGPT');send.onclick=async()=>{const textValue=text.value.trim();if(!textValue)return;const content=JSON.stringify({intent:'propose_task_split',task_id:t.task_id,description:textValue,draft:state.draft});if(window.openai?.sendFollowUpMessage)await window.openai.sendFollowUpMessage({prompt:content});else download(content,'taskui-split-request.json');};detail.append(send);$('editor').append(detail);
  }else $('editor').append(el('p','Select a task to edit it.'));
  $('issues').replaceChildren();if(!r.issues.length)$('issues').append(el('p','✓ Draft graph is valid. This does not approve a proposed repair.'));
  for(const i of r.issues){const box=el('div',`${i.code}: ${i.message}`,'error');if(i.resolutions)box.append(el('p',i.resolutions.join(' · ')));$('issues').append(box);}
  for(const s of d.splits){const b=el('button',s.edges_reviewed?'✓ Split edges reviewed':'Confirm review of split edges');b.onclick=()=>dispatch({type:'draft',patch:{splits:d.splits.map(x=>x===s?{...x,edges_reviewed:!x.edges_reviewed}:x)}});$('issues').append(el('pre',JSON.stringify({parent:s.parent_task_id,children:s.child_task_ids,affected:impacts(state.source?.tasks??d.tasks,s.parent_task_id),proposed_edges:d.tasks.map(t=>({task_id:t.task_id,depends_on:t.depends_on}))},null,2)),b);}
  $('reviewPanel').hidden=!state.review;
  if(state.review){$('diff').replaceChildren();for(const x of state.review.diff.tasks.filter(x=>x.kind!=='unchanged')){const details=el('details');details.append(el('summary',`${x.kind}: ${x.after?.title??x.before?.title} (${x.task_id})`),el('pre',JSON.stringify({fields:x.fields,before:x.before,after:x.after,impacts:x.impacts},null,2)));$('diff').append(details);}if(state.review.diff.project.length)$('diff').append(el('pre',JSON.stringify(state.review.diff.project,null,2)));$('digest').textContent=`Draft revision ${d.draft_revision} · ${state.review.review_digest}`;}
}
for(const f of FRAMEWORKS){const o=el('option',f);o.value=f;$('framework').append(o);}
for(const [id,key]of [['name','name'],['goal','goal'],['context','context'],['target','target_date'],['framework','framework']])$(id).onchange=()=>dispatch({type:'project',patch:{[key]:$(id).value||(key==='target_date'?null:'')}});
$('creationMode').onchange=()=>{dispatch({type:'mode',mode:$('creationMode').value});message(state.mode==='manual'?'Manual entries retained.':'Entries retained. Ask ChatGPT to propose tasks using the complete exported draft.');};
$('instructions').onchange=()=>dispatch({type:'draft',patch:{additional_instructions:$('instructions').value}});
$('scope').onchange=()=>dispatch({type:'draft',patch:{instruction_scope:$('scope').value}});
$('add').onclick=()=>{dispatch({type:'add'});dispatch({type:'select',id:state.draft.tasks.at(-1).task_id});};
$('reset').onclick=()=>dispatch({type:'reset'});$('undo').onclick=()=>dispatch({type:'undo'});
function download(value,name){const url=URL.createObjectURL(new Blob([value],{type:'application/json'}));const a=el('a');a.href=url;a.download=name;a.click();URL.revokeObjectURL(url);message('Complete JSON exported. No remote write.');}
$('export').onclick=()=>download(JSON.stringify(state.draft,null,2),'taskui-draft.json');
$('import').onclick=()=>{try{const x=JSON.parse($('importJson').value);if(x.saved)install(draftFrom(x.saved),x.saved);else if(x.schema_version===1&&x.project&&!x.draft_id)install(draftFrom(x),x);else install(x);message('Imported locally. No remote write.');}catch(e){message('Import failed: '+e.message);}};
async function call(name,args){
  if(bridge){const result=await bridge(name,args);if(result.isError)throw Error(result.content?.[0]?.text??'Tool failed');return result.structuredContent??JSON.parse(result.content?.find(c=>c.type==='text')?.text??'{}');}
  if(name==='preview_project_changes'){const response=await fetch('/api/preview',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(args)});const data=await response.json();if(!response.ok)throw Error(data.message);return data;}
  throw Error('Host MCP bridge unavailable. Export complete draft JSON for a conversation review.');
}
$('review').onclick=async()=>{const g=generation;busy=true;render();try{const r=await call('preview_project_changes',{draft:state.draft,source:state.source,mode:state.connected?'connected':'simulation'});if(g===generation){state.review=r;message(r.valid?'Exact review ready. No write made.':'Resolve validation issues before approval.');}else message('Draft changed during review. Review again.');}catch(e){message(e.message);}finally{busy=false;render();}};
$('approve').onclick=async()=>{
  if(!state.connected||!state.review?.valid||busy)return;
  const draft=clone(state.draft),review=state.review,g=generation;busy=true;render();
  try{const result=await call('commit_approved_changes',{draft,approval:{approval_id:globalThis.crypto.randomUUID(),review_digest:review.review_digest,draft_revision:draft.draft_revision,explicit_approval:true}});
    const fresh=await call('load_project',{project_id:draft.project.project_id});
    if(!result.verified||fresh.saved.project.revision<result.saved.project.revision)throw Error('Save readback not verified.');
    if(g===generation)install(draftFrom(fresh.saved),fresh.saved,true);
    message(`Saved and reread revision ${fresh.saved.project.revision}.${g===generation?'':' Newer local edits retained; export and rebase them against this saved revision.'}`);
  }catch(e){message(`Save not confirmed: ${e.message}. Reload stored project before retrying.`);}finally{busy=false;render();}
};
function hostData(){const data=window.openai?.toolOutput;if(data?.draft){const key=JSON.stringify(data);if(key===lastHostKey)return;if(lastHostKey&&generation>0){message('New host draft received. Export local work before importing it; current inputs retained.');return;}lastHostKey=key;try{install(data.draft,data.source,data.mode==='connected');}catch(e){message(e.message);}}}
if(window.openai?.callTool)bridge=(name,args)=>window.openai.callTool(name,args);
window.addEventListener('openai:set_globals',()=>{if(window.openai?.callTool)bridge=(name,args)=>window.openai.callTool(name,args);hostData();});
render();hostData();
// Testable host-independent behavior is in reduceEditor and validate. No invented postMessage bridge.
