import {createHash} from 'node:crypto';
import {validate,materialize} from './engine.mjs';
import {draftSchema,savedSchema} from './schema.mjs';
export class TaskUIError extends Error {constructor(code,message){super(message);this.code=code;}}
export function stable(x){if(Array.isArray(x))return x.map(stable);if(x&&typeof x==='object')return Object.fromEntries(Object.keys(x).sort().map(k=>[k,stable(x[k])]));return x;}
export const digest=x=>createHash('sha256').update(JSON.stringify(stable(x))).digest('hex');
export function preview(raw,before=null){
  const draft=draftSchema.parse(raw); if(before)savedSchema.parse(before);
  const result=validate(draft,before);
  if(draft.project.revision!==draft.expected_revision){result.issues.push({code:'REVISION_MISMATCH',task_id:null,message:'Project and expected revisions must match.'});result.valid=false;}
  if(draft.expected_revision>0&&!before){result.issues.push({code:'MISSING_SOURCE',task_id:null,message:'A saved project requires its current source snapshot.'});result.valid=false;}
  return {...result,draft_id:draft.draft_id,draft_revision:draft.draft_revision,expected_revision:draft.expected_revision,review_digest:digest({draft,before}),authorization:'Review only. No write authorized.'};
}
