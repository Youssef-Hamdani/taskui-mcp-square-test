// Presentation-independent domain engine; also used by the local editor.
export const STATUSES = ['Not started', 'In progress', 'Blocked', 'Complete', 'Superseded'];
export const FRAMEWORKS = ['dependencies', 'deadlines', 'milestones', 'sprints', 'checklist', 'adaptive'];
export const clone = x => structuredClone(x);
export const newId = prefix => `${prefix}_${globalThis.crypto.randomUUID()}`;
export function adaptTask(t, projectId) {
  if (t.task_id && t.id && t.task_id !== t.id) throw new Error('AMBIGUOUS_ID');
  if (t.title && t.name && t.title !== t.name) throw new Error('AMBIGUOUS_TITLE');
  const {id, name, estimated_min, ...rest} = t;
  return {notes:'', status:'Not started', estimated_minutes:estimated_min === '' ? null : estimated_min ?? null,
    due_date:null, depends_on:[], provenance:'user', version:1, applicability:'applicable', archived:false, condition:null,
    ...rest, task_id:t.task_id ?? id ?? newId('task'), title:t.title ?? name ?? '', project_id:projectId};
}
export function createDraft({name='', goal='', context='', tasks=[]} = {}) {
  const id=newId('project');
  return {schema_version:1, creation_mode:'hybrid', draft_id:newId('draft'), draft_revision:1, expected_revision:0,
    project:{project_id:id,name,goal,context,target_date:null,framework:'dependencies',instructions:'',revision:0},
    tasks:tasks.map(t=>adaptTask(t,id)), exclusions:[], splits:[], split_requests:[], instruction_scope:'this_submission', additional_instructions:''};
}
const taskFields=['title','notes','status','estimated_minutes','due_date','depends_on','provenance','applicability','condition','parent_task_id','cost_estimate','display_alias','group','archived'];
export function taskContent(t) {return Object.fromEntries(taskFields.filter(k=>t[k]!==undefined).map(k=>[k,t[k]]));}
export function impacts(tasks, id) {
  const direct=tasks.filter(t=>t.depends_on.includes(id)).map(t=>t.task_id);
  const seen=new Set(), queue=[...direct];
  while(queue.length){ const k=queue.shift(); if(seen.has(k))continue;seen.add(k);queue.push(...tasks.filter(t=>t.depends_on.includes(k)).map(t=>t.task_id)); }
  return {direct,transitive:[...seen]};
}
export function diff(before, draft) {
  const old=new Map((before?.tasks??[]).map(t=>[t.task_id,t]));
  const next=new Map(draft.tasks.map(t=>[t.task_id,t]));
  const excluded=new Set(draft.exclusions);
  const changes=[...next].map(([id,t])=>{
    const prior=old.get(id);
    const fields=taskFields.filter(k=>JSON.stringify(prior?.[k]??null)!==JSON.stringify(t[k]??null));
    return {task_id:id,kind:excluded.has(id)?'excluded':!prior?'added':fields.length?'edited':'unchanged',
      expected_version:prior?.version??null,before:prior??null,after:t,fields,impacts:impacts(draft.tasks,id)};
  });
  for(const [id,t]of old)if(!next.has(id))changes.push({task_id:id,kind:'removed',before:t,after:null,impacts:impacts(before.tasks,id)});
  const projectFields=['name','goal','context','target_date','framework','instructions'];
  return {tasks:changes,project:projectFields.filter(k=>JSON.stringify(before?.project[k]??null)!==JSON.stringify(draft.project[k]??null)).map(k=>({field:k,before:before?.project[k]??null,after:draft.project[k]})),splits:draft.splits};
}
export function validate(draft, before=null) {
  const issues=[]; const issue=(code,task_id,message,extra={})=>issues.push({code,task_id,message,...extra});
  const {tasks,project}=draft, excluded=new Set([...draft.exclusions,...tasks.filter(t=>t.archived).map(t=>t.task_id)]), ids=new Map();
  if(!project.name.trim()||!project.goal.trim())issue('PROJECT_REQUIRED',null,'Project name and goal are required.');
  for(const t of tasks){
    if(ids.has(t.task_id))issue('DUPLICATE_ID',t.task_id,'Task IDs must be unique.');
    ids.set(t.task_id,t);
    if(t.project_id!==project.project_id)issue('PROJECT_MISMATCH',t.task_id,'Task belongs to another project.');
    if(!t.title.trim())issue('TITLE_REQUIRED',t.task_id,'Task title is required.');
    if(new Set(t.depends_on).size!==t.depends_on.length)issue('DUPLICATE_DEPENDENCY',t.task_id,'Repeated prerequisite.');
    if(t.estimated_minutes!==null&&(!Number.isSafeInteger(t.estimated_minutes)||t.estimated_minutes<0))issue('INVALID_ESTIMATE',t.task_id,'Effort must be unknown or a nonnegative integer.');
    if(t.applicability==='not_applicable'&&t.status==='Complete')issue('NOT_APPLICABLE_COMPLETE',t.task_id,'Unnecessary work is not completed work.');
    if(t.condition){
      const diagnostic=tasks.find(x=>x.task_id===t.condition.diagnostic_task_id);
      if(!diagnostic)issue('MISSING_DIAGNOSTIC',t.task_id,'Conditional work requires a diagnostic task.');
      if(diagnostic?.status!=='Complete'&&t.condition.outcome!=='unknown')issue('DIAGNOSIS_INCOMPLETE',t.task_id,'Record the diagnostic completion before its outcome.');
      const expected=t.condition.outcome==='not_required'?'not_applicable':t.condition.outcome==='required'?'applicable':'pending';
      if(t.applicability!==expected)issue('CONDITION_MISMATCH',t.task_id,`Diagnostic outcome requires applicability ${expected}.`);
    }else if(t.applicability==='pending')issue('CONDITION_REQUIRED',t.task_id,'Pending applicability needs a diagnostic condition.');
  }
  for(const id of excluded)if(!ids.has(id))issue('UNKNOWN_EXCLUSION',id,'Excluded ID is missing.');
  for(const t of tasks){
    if(excluded.has(t.task_id)||t.status==='Superseded')continue;
    for(const dep of t.depends_on){
      const p=ids.get(dep);
      if(dep===t.task_id)issue('SELF_DEPENDENCY',t.task_id,'Task depends on itself.');
      if(!p)issue('MISSING_REFERENCE',t.task_id,`Missing prerequisite ${dep}.`,{prerequisite_id:dep});
      else if(excluded.has(dep)||p.status==='Superseded')issue('INACTIVE_PREREQUISITE',t.task_id,`${p.title} (${dep}) is excluded or superseded. Review changed edges.`,{prerequisite_id:dep,resolutions:['ChatGPT proposes a resolution','Describe a resolution','Keep original task'],impacts:impacts(tasks,dep)});
    }
    if(t.condition&&excluded.has(t.condition.diagnostic_task_id))issue('INACTIVE_DIAGNOSTIC',t.task_id,'Diagnostic task is excluded.');
  }
  const color=new Map();
  function visit(id,path){
    if(color.get(id)===1){issue('CYCLE',id,'Dependency cycle.',{path:[...path,id]});return;}
    if(color.get(id)===2)return;
    const t=ids.get(id); if(!t||excluded.has(id)||t.status==='Superseded')return;
    color.set(id,1);for(const dep of t.depends_on)visit(dep,[...path,id]);color.set(id,2);
  }
  for(const t of tasks)visit(t.task_id,[]);
  if(before){
    if(before.project.project_id!==project.project_id)issue('PROJECT_ID_CHANGED',null,'Project identity cannot change.');
    if(draft.expected_revision!==before.project.revision)issue('STALE_REVISION',null,'Reload the current project before approving.');
    for(const old of before.tasks){
      const t=ids.get(old.task_id);
      if(!t)issue('HISTORY_REMOVAL',old.task_id,'Saved tasks must remain historical; exclude or supersede them.');
      else if(t.version!==old.version)issue('STALE_TASK_VERSION',t.task_id,'Task version differs from source snapshot.');
      if(old.status!=='Superseded'&&t?.status==='Superseded'&&!draft.splits.some(s=>s.parent_task_id===old.task_id))issue('SUPERSESSION_REVIEW_REQUIRED',old.task_id,'Supersession requires a reviewed split.');
    }
  }
  const children=new Set(), parents=new Set();
  for(const s of draft.splits){
    const parent=ids.get(s.parent_task_id);
    if(parents.has(s.parent_task_id))issue('DUPLICATE_SPLIT',s.parent_task_id,'One split per parent in this submission.');parents.add(s.parent_task_id);
    if(!parent||parent.status!=='Superseded'||excluded.has(parent.task_id)||s.child_task_ids.length<2)issue('INVALID_SPLIT',s.parent_task_id,'Split retains a superseded parent and at least two included children.');
    for(const id of s.child_task_ids){const child=ids.get(id);if(children.has(id)||!child||child.parent_task_id!==s.parent_task_id||before?.tasks.some(t=>t.task_id===id)||excluded.has(id))issue('INVALID_SPLIT_CHILD',id,'Each split child must be a new included task with the parent ID.');children.add(id);}
    if(!s.edges_reviewed)issue('SPLIT_REVIEW_REQUIRED',s.parent_task_id,'Review downstream edge changes explicitly.');
  }
  if(draft.instruction_scope==='future_projects'&&draft.additional_instructions.trim())issue('GLOBAL_APPROVAL_REQUIRED',null,'Future defaults are deferred; project approval cannot save them.');
  for(const request of draft.split_requests??[])if(!draft.splits.some(s=>s.parent_task_id===request.task_id))issue('SPLIT_PROPOSAL_PENDING',request.task_id,'Split description needs a reviewed subtask proposal or must be cleared.');
  const cyclic=new Set(issues.filter(i=>i.code==='CYCLE').flatMap(i=>i.path));
  const states=tasks.map(t=>{
    let reasons=[];let state=t.status;
    if(excluded.has(t.task_id))state='Excluded';
    else if(t.status==='Superseded')state='Superseded';
    else if(t.applicability==='not_applicable')state='Not applicable';
    else if(t.status!=='Complete'){
      if(t.applicability==='pending')reasons.push('Awaiting diagnostic outcome');
      if(t.status==='Blocked')reasons.push('Manually blocked');
      if(cyclic.has(t.task_id))reasons.push('Dependency cycle');
      for(const id of t.depends_on){const p=ids.get(id);if(!p||excluded.has(id)||p.status==='Superseded'||(p.status!=='Complete'&&p.applicability!=='not_applicable'))reasons.push(p?`${p.title} (${id}) — ${excluded.has(id)?'Excluded':p.status}`:`Missing ${id}`);}
      state=reasons.length?'Blocked':t.status==='In progress'?'In progress':'Ready';
    }
    return {task_id:t.task_id,title:t.title,stored_status:t.status,effective_status:state,reasons};
  });
  const active=tasks.filter(t=>!excluded.has(t.task_id)&&t.status!=='Superseded'&&t.applicability!=='not_applicable');
  const conditional=active.filter(t=>t.status!=='Complete'&&t.applicability==='pending');
  const remaining=active.filter(t=>t.status!=='Complete'&&t.applicability!=='pending');
  const known=remaining.filter(t=>t.estimated_minutes!==null);
  return {valid:issues.length===0,issues,states,summary:{active:active.length,completed:active.filter(t=>t.status==='Complete').length,ready:states.filter(t=>['Ready','In progress'].includes(t.effective_status)).length,known_remaining_minutes:known.reduce((s,t)=>s+t.estimated_minutes,0),unknown_remaining_count:remaining.length-known.length,conditional_count:conditional.length,known_conditional_minutes:conditional.reduce((sum,t)=>sum+(t.estimated_minutes??0),0),unknown_conditional_count:conditional.filter(t=>t.estimated_minutes===null).length},diff:diff(before,draft)};
}
export function splitTask(draft,parentId,titles){
  const next=clone(draft),parent=next.tasks.find(t=>t.task_id===parentId);
  if(!parent||titles.length<2)throw new Error('INVALID_SPLIT');
  parent.status='Superseded';
  const children=titles.map(title=>adaptTask({title,parent_task_id:parentId,provenance:'AI',depends_on:[...parent.depends_on]},next.project.project_id));
  next.tasks.push(...children);next.splits.push({parent_task_id:parentId,child_task_ids:children.map(t=>t.task_id),edges_reviewed:false});
  // Deliberately do not retarget dependents.
  next.draft_revision++;
  return next;
}
export function materialize(draft,before,now=new Date().toISOString()){
  const prior=new Map((before?.tasks??[]).map(t=>[t.task_id,t]));
  const project={...draft.project,revision:draft.expected_revision+1,created_at:before?.project.created_at??now,updated_at:now};
  if(draft.instruction_scope==='this_project'&&draft.additional_instructions.trim())project.instructions=[project.instructions,draft.additional_instructions].filter(Boolean).join('\n');
  const tasks=draft.tasks.filter(t=>!draft.exclusions.includes(t.task_id)||prior.has(t.task_id)).map(t=>{
    const old=prior.get(t.task_id),next={...t};
    if(draft.exclusions.includes(t.task_id))next.archived=true;
    next.version=old?old.version+(JSON.stringify(taskContent(old))!==JSON.stringify(taskContent(next))?1:0):1;
    return {...next,created_at:old?.created_at??now,updated_at:now};
  });
  return {schema_version:1,project,tasks};
}
export function draftFrom(saved){return {schema_version:1,creation_mode:'hybrid',draft_id:newId('draft'),draft_revision:1,expected_revision:saved.project.revision,project:clone(saved.project),tasks:clone(saved.tasks),exclusions:[],splits:[],split_requests:[],instruction_scope:'this_submission',additional_instructions:''};}
export function reduceEditor(state,action){
  if(action.type==='reset')return {...state,draft:clone(state.original),mode:state.original.creation_mode??'hybrid',undo:[...state.undo,clone(state.draft)],review:null};
  if(action.type==='undo'){if(!state.undo.length)return state;return {...state,draft:state.undo.at(-1),mode:state.undo.at(-1).creation_mode??'hybrid',undo:state.undo.slice(0,-1),review:null};}
  if(action.type==='select')return {...state,selected:action.id};
  if(action.type==='mode')return {...state,mode:action.mode,draft:{...state.draft,creation_mode:action.mode,draft_revision:state.draft.draft_revision+1},review:null};
  const next=clone(state.draft);
  if(action.type==='task')Object.assign(next.tasks.find(t=>t.task_id===action.id),action.patch);
  if(action.type==='project')Object.assign(next.project,action.patch);
  if(action.type==='draft')Object.assign(next,action.patch);
  if(action.type==='add')next.tasks.push(adaptTask({title:'New task'},next.project.project_id));
  if(action.type==='exclude')next.exclusions=next.exclusions.includes(action.id)?next.exclusions.filter(id=>id!==action.id):[...next.exclusions,action.id];
  next.draft_revision++;
  return {...state,draft:next,undo:[...state.undo,clone(state.draft)].slice(-50),review:null};
}
