import {build} from 'esbuild';
import {readFileSync,writeFileSync} from 'node:fs';
import {zodToJsonSchema} from 'zod-to-json-schema';
import {tokens} from './lib/config.mjs';
import {taskSchema,draftSchema} from './lib/schema.mjs';
const output=await build({entryPoints:['public/editor.mjs'],plugins:[{name:'engine',setup(b){b.onResolve({filter:/^\/engine\.mjs$/},()=>({path:new URL('./lib/engine.mjs',import.meta.url).pathname}));}}],bundle:true,write:false,format:'iife',target:'es2022'});
const html=readFileSync('public/index.html','utf8').replace('<script type="module" src="./editor.mjs"></script>',`<script>${output.outputFiles[0].text.replace(/<\/script/gi,'<\\/script')}</script>`);
writeFileSync('public/widget-editor.html',html);
writeFileSync('templates/task-record.schema.json',JSON.stringify(zodToJsonSchema(taskSchema,'Task'),null,2));
writeFileSync('templates/taskui-template.schema.json',JSON.stringify({$schema:'http://json-schema.org/draft-07/schema#',type:'object',required:['template_version'],properties:{template_version:{const:'taskui-guidance/v1'}},additionalProperties:true},null,2));
writeFileSync('templates/project-draft.schema.json',JSON.stringify(zodToJsonSchema(draftSchema,'Draft'),null,2));

writeFileSync('templates/status-tokens.json',JSON.stringify(tokens,null,2));
