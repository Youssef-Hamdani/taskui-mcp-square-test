import test from 'node:test';import assert from 'node:assert/strict';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';import {StdioClientTransport} from '@modelcontextprotocol/sdk/client/stdio.js';import {createDraft} from '../lib/engine.mjs';
test('real SDK discovery and calls preserve diagnostics, expose tools, validate and fail closed',async()=>{
 const client=new Client({name:'taskui-regression',version:'1'});const transport=new StdioClientTransport({command:process.execPath,args:['server.mjs'],env:{...process.env,MCP_TRANSPORT:'stdio',TASKUI_STORAGE_MODE:'disabled'}});
 try{await client.connect(transport);const names=(await client.listTools()).tools.map(t=>t.name);for(const name of ['ping','echo_form','render_taskui_square','get_taskui_configuration','validate_project_draft','preview_project_changes','list_projects','load_project','commit_approved_changes','render_taskui_editor'])assert(names.includes(name));
 assert.deepEqual((await client.callTool({name:'ping',arguments:{}})).structuredContent,{pong:true});
 const echo=await client.callTool({name:'echo_form',arguments:{layout:'compact',default_view:'task_list',show_progress_bars:true,currency:'CAD'}});assert.equal(echo.structuredContent.received,true);
 const draft=createDraft({name:'Synthetic MCP',goal:'Test real transport',tasks:[{id:'a',name:'A'},{id:'b',name:'B'},{id:'c',name:'C'}]});
 const config=await client.callTool({name:'get_taskui_configuration',arguments:{}});assert.equal(config.structuredContent.mode,'simulation');
 const valid=await client.callTool({name:'validate_project_draft',arguments:{draft}});assert.equal(valid.structuredContent.summary.ready,3);
 const review=await client.callTool({name:'preview_project_changes',arguments:{draft,mode:'simulation'}});assert.equal(review.structuredContent.valid,true);assert.match(review.structuredContent.review_digest,/^[a-f0-9]{64}$/);
 const load=await client.callTool({name:'list_projects',arguments:{}});assert.equal(load.isError,true);assert.equal(JSON.parse(load.content[0].text).code,'UNAUTHORIZED');
 const write=await client.callTool({name:'commit_approved_changes',arguments:{draft,approval:{approval_id:'synthetic',review_digest:review.structuredContent.review_digest,draft_revision:1,explicit_approval:true}}});assert.equal(write.isError,true);assert.equal(JSON.parse(write.content[0].text).code,'UNAUTHORIZED');
 const invalid=await client.callTool({name:'validate_project_draft',arguments:{draft:{...draft,unknown:1}}});assert.equal(invalid.isError,true);
 const resources=await client.listResources();assert(resources.resources.some(r=>r.uri==='ui://taskui/editor-v1.html'));
 const editor=await client.readResource({uri:'ui://taskui/editor-v1.html'});assert(editor.contents[0].text.includes('Dependency inspector'));
 }finally{await client.close();}
});
