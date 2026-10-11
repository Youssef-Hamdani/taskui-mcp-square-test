import { readFileSync } from 'node:fs';
import express from 'express';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { draftSchema, savedSchema, validationSchema, reviewSchema, configSchema } from './lib/schema.mjs';
import { validate } from './lib/engine.mjs';
import { preview, TaskUIError } from './lib/review.mjs';
import { configuration, version } from './lib/config.mjs';
import { authenticate, oauthReady } from './lib/auth.mjs';
import { ProjectStore } from './lib/store.mjs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
const storageEnabled=process.env.TASKUI_STORAGE_MODE==='persistent' && process.env.TASKUI_DATABASE_PATH?.startsWith('/var/data/') && oauthReady();
const store=storageEnabled?new ProjectStore(process.env.TASKUI_DATABASE_PATH):null;
const editorHTML=readFileSync(new URL('./public/widget-editor.html',import.meta.url),'utf8');
const EDITOR_URI='ui://taskui/editor-v1.html';
const output=value=>({structuredContent:value,content:[{type:'text',text:JSON.stringify(value)}]});
const guarded=fn=>async args=>{try{return output(await fn(args));}catch(e){return {isError:true,content:[{type:'text',text:JSON.stringify({code:e.code??(e.name==='ZodError'?'INVALID_INPUT':'INTERNAL_ERROR'),message:e instanceof TaskUIError?e.message:'The operation failed validation or could not be completed.'})}],...(e.code==='UNAUTHORIZED'&&oauthReady()?{_meta:{'mcp/www_authenticate':[`Bearer resource_metadata="${process.env.TASKUI_PUBLIC_URL}/.well-known/oauth-protected-resource", error="insufficient_scope"`]}}:{})};}};


const RESOURCE_URI = 'ui://taskui-square/v2.html';
const html = readFileSync(new URL('./widget.html', import.meta.url), 'utf8');

export function makeServer(auth=null,storage=store) {
  const server = new McpServer({ name: 'taskui-square-test', version });
  server.registerResource('taskui-square', RESOURCE_URI, {}, async () => ({
    contents: [{ uri: RESOURCE_URI, mimeType: 'text/html;profile=mcp-app', text: html,
      _meta: { ui: { prefersBorder: true } } }],
  }));
  server.registerTool('render_taskui_square', {
    title: 'Render TaskUI square',
    description: 'Render a blue square saying "I am a plugin UI" and two clickable task nodes (P006 and P007). UI-only demo, no outside data access.',
    inputSchema: {},
    outputSchema: { title: z.string(), selectedTaskId: z.string() },
    _meta: { ui: { resourceUri: RESOURCE_URI },
      'openai/toolInvocation/invoking': 'Opening TaskUI square…',
      'openai/toolInvocation/invoked': 'TaskUI square ready.' },
  }, async () => ({
    structuredContent: { title: "I'm a plugin UI", selectedTaskId: 'P006' },
    content: [{ type: 'text', text: 'TaskUI square UI: choose P006 or P007. No project data read or written.' }],
  }));
  server.registerTool('ping', {
    title: 'Ping TaskUI',
    description: 'Return a minimal JSON pong response for connection testing. No inputs, reads, or writes.',
    inputSchema: {},
    outputSchema: { pong: z.boolean() },
  }, async () => ({
    structuredContent: { pong: true },
    content: [{ type: 'text', text: JSON.stringify({ pong: true }) }],
  }));
  server.registerTool('echo_form', {
    title: 'Echo TaskUI form',
    description: 'Accept a small TaskUI layout-preference form and echo the values back as JSON. Read-only experiment; nothing is stored.',
    inputSchema: {
      layout: z.enum(['compact', 'detailed']),
      default_view: z.enum(['dependency_graph', 'milestone_roadmap', 'task_list']),
      show_progress_bars: z.boolean(),
      currency: z.enum(['CAD', 'USD', 'EUR']),
    },
    outputSchema: {
      received: z.boolean(),
      layout: z.string(),
      default_view: z.string(),
      show_progress_bars: z.boolean(),
      currency: z.string(),
    },
  }, async ({ layout, default_view, show_progress_bars, currency }) => {
    const payload = { received: true, layout, default_view, show_progress_bars, currency };
    return { structuredContent: payload, content: [{ type: 'text', text: JSON.stringify(payload) }] };
  });
  server.registerResource('taskui-editor', EDITOR_URI, {}, async()=>({contents:[{uri:EDITOR_URI,mimeType:'text/html;profile=mcp-app',text:editorHTML,_meta:{'openai/widgetPrefersBorder':true,'openai/widgetCSP':{connect_domains:[],resource_domains:[]}}}]}));
  const readonly={readOnlyHint:true,destructiveHint:false,openWorldHint:false};
  const publicMeta={securitySchemes:[{type:'noauth'}]};
  const privateReadMeta={securitySchemes:[{type:'oauth2',scopes:['taskui:read']}],'openai/widgetAccessible':true};
  const privateMeta={securitySchemes:[{type:'oauth2',scopes:['taskui:read','taskui:write']}],'openai/widgetAccessible':true};
  function requireStore(write=false){
    if(!auth?.read || (write&&!auth.write))throw new TaskUIError('UNAUTHORIZED','Authenticate as the configured owner with required scope.');
    if(!storage)throw new TaskUIError('STORAGE_NOT_CONFIGURED','Connected mode requires OAuth and an explicitly mounted durable database.');
    return storage;
  }
  server.registerTool('get_taskui_configuration',{description:'Get versioned adaptive UX guidance, visual semantics and actual connected capabilities. JSON recipes are not native executable UI.',inputSchema:{},outputSchema:configSchema.shape,annotations:readonly,_meta:publicMeta},guarded(()=>configuration(Boolean(storage&&auth?.read))));
  server.registerTool('validate_project_draft',{description:'Validate a complete editable simulation draft. Unknown effort stays null. Report dependency conflicts without writing. Does not approve domain reasoning.',inputSchema:{draft:draftSchema,source:savedSchema.nullable().default(null)},outputSchema:validationSchema.shape,annotations:readonly,_meta:{...publicMeta,'openai/widgetAccessible':true}},guarded(({draft,source})=>validate(draft,source)));
  server.registerTool('preview_project_changes',{description:'Freeze an exact draft review digest. Connected mode rereads the authenticated stored source; simulation mode uses explicit supplied source. Review is not write authorization.',inputSchema:{draft:draftSchema,mode:z.enum(['simulation','connected']),source:savedSchema.nullable().default(null)},outputSchema:reviewSchema.shape,annotations:readonly,_meta:{...publicMeta,'openai/widgetAccessible':true}},guarded(({draft,mode,source})=>preview(draft,mode==='connected'?requireStore().load(draft.project.project_id):source)));
  server.registerTool('list_projects',{description:'List genuine stored projects for the authenticated single owner; fails closed when storage or OAuth is unavailable.',inputSchema:{},outputSchema:{projects:z.array(z.object({project_id:z.string(),name:z.string(),revision:z.number().int(),updated_at:z.string().datetime()}).strict())},annotations:readonly,_meta:privateReadMeta},guarded(()=>({projects:requireStore().list()})));
  server.registerTool('load_project',{description:'Read a persisted canonical project and task snapshot with current revisions. Never returns simulation data.',inputSchema:{project_id:z.string().min(1).max(150)},outputSchema:{saved:savedSchema},annotations:readonly,_meta:privateReadMeta},guarded(({project_id})=>{const saved=requireStore().load(project_id);if(!saved)throw new TaskUIError('NOT_FOUND','Project not found.');return {saved};}));
  server.registerTool('commit_approved_changes',{description:'Write only after explicit user approval of the frozen digest and draft revision. Transactionally reject stale source revisions, invalid graphs, or changed approvals. Return verified readback. Never save global defaults.',inputSchema:{draft:draftSchema,approval:z.object({approval_id:z.string().min(1).max(150),review_digest:z.string().regex(/^[a-f0-9]{64}$/),draft_revision:z.number().int().positive(),explicit_approval:z.literal(true)}).strict()},outputSchema:{saved:savedSchema,verified:z.literal(true),idempotent:z.boolean()},annotations:{readOnlyHint:false,destructiveHint:false,idempotentHint:true,openWorldHint:false},_meta:privateMeta},guarded(args=>requireStore(true).commit(args,true)));
  server.registerTool('render_taskui_editor',{description:'Optional coherent local task editor and dependency inspector. Owns all editor state; never shares state with native controls. Defaults to simulation. Use native adaptive UI for ordinary planning.',inputSchema:{draft:draftSchema,source:savedSchema.nullable().default(null),mode:z.enum(['simulation','connected']).default('simulation')},outputSchema:{draft:draftSchema,source:savedSchema.nullable(),mode:z.enum(['simulation','connected']),configuration:configSchema},annotations:readonly,_meta:{...publicMeta,'openai/outputTemplate':EDITOR_URI,ui:{resourceUri:EDITOR_URI}}},guarded(({draft,source,mode})=>{if(mode==='connected'){const actual=requireStore().load(draft.project.project_id);if(JSON.stringify(actual)!==JSON.stringify(source))throw new TaskUIError('STALE_REVISION','Editor source must match stored snapshot.');}return {draft,source,mode,configuration:configuration(Boolean(storage&&auth?.read))};}));
  return server;
}

if (process.argv[1] && import.meta.url===pathToFileURL(resolve(process.argv[1])).href) {
if (process.env.MCP_TRANSPORT === 'stdio') {
  await makeServer().connect(new StdioServerTransport());
} else {
  const app = express();
  app.disable('x-powered-by');
  app.use(express.json({ limit: '1mb' }));
  app.get('/health', (_req, res) => res.json({ ok: true, service: 'taskui', version, commit:process.env.RENDER_GIT_COMMIT??'local', storage:store?'configured':'disabled', oauth:oauthReady() }));
  app.use((_req,res,next)=>{res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','no-referrer');next();});
  app.get('/.well-known/oauth-protected-resource',(_req,res)=>{
    if(!oauthReady())return res.status(503).json({error:'OAuth not configured'});
    res.json({resource:process.env.TASKUI_OAUTH_AUDIENCE,authorization_servers:[process.env.TASKUI_OAUTH_ISSUER],scopes_supported:['taskui:read','taskui:write']});
  });
  app.get('/engine.mjs',(_req,res)=>res.sendFile(resolve('lib/engine.mjs')));
  app.use('/editor',express.static(resolve('public')));
  app.post('/api/preview',(req,res)=>{try{res.json(preview(req.body.draft,req.body.source??null));}catch{res.status(400).json({code:'INVALID_INPUT',message:'Invalid draft shape.'});}});
  app.all('/mcp', async (req, res) => {
    // Stateless Streamable HTTP: each POST starts a request-scoped MCP server.
    if (req.method !== 'POST') {
      res.setHeader('Allow', 'POST');
      return res.status(405).json({ error: 'Use POST /mcp' });
    }
    const server = makeServer(await authenticate(req));
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
    try {
      await server.connect(transport);
      res.on('close', () => { transport.close().catch(() => {}); server.close().catch(() => {}); });
      await transport.handleRequest(req, res, req.body);
    } catch (error) {
      console.error('MCP request failed:', error?.code??'TRANSPORT_ERROR');
      if (!res.headersSent) res.status(500).json({ error: 'MCP request failed' });
    }
  });
  const port = Number(process.env.PORT || 3000);
  app.listen(port, '0.0.0.0', () => console.log(`TaskUI MCP listening on ${port}; endpoint /mcp`));
}

}
