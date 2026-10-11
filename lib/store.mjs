import {DatabaseSync} from 'node:sqlite';
import {TaskUIError,preview,digest} from './review.mjs';
import {materialize} from './engine.mjs';
import {savedSchema} from './schema.mjs';
// Transactional single-user snapshot store. Production requires an explicitly mounted persistent disk.
export class ProjectStore {
  constructor(path){
    this.db=new DatabaseSync(path);this.db.exec(`PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;
      CREATE TABLE IF NOT EXISTS projects(id TEXT PRIMARY KEY, revision INTEGER NOT NULL, body TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS approvals(id TEXT PRIMARY KEY, project_id TEXT NOT NULL, review_digest TEXT NOT NULL, request_digest TEXT NOT NULL, body TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS history(project_id TEXT NOT NULL, revision INTEGER NOT NULL, approval_id TEXT NOT NULL, body TEXT NOT NULL, PRIMARY KEY(project_id,revision));`);
  }
  load(id){const r=this.db.prepare('SELECT body FROM projects WHERE id=?').get(id);return r?savedSchema.parse(JSON.parse(r.body)):null;}
  list(){return this.db.prepare('SELECT body FROM projects ORDER BY id').all().map(r=>{const s=savedSchema.parse(JSON.parse(r.body));return {project_id:s.project.project_id,name:s.project.name,revision:s.project.revision,updated_at:s.project.updated_at};});}
  close(){this.db.close();}
  commit({draft,approval},authorized){
    if(!authorized)throw new TaskUIError('UNAUTHORIZED','An authenticated project owner is required.');
    if(approval?.explicit_approval!==true||!approval.approval_id||!approval.review_digest)throw new TaskUIError('INVALID_APPROVAL','Explicit approval of the exact reviewed digest is required.');
    const requestDigest=digest({draft,approval});
    this.db.exec('BEGIN IMMEDIATE');
    try{
      const prior=this.db.prepare('SELECT * FROM approvals WHERE id=?').get(approval.approval_id);
      if(prior){if(prior.request_digest!==requestDigest)throw new TaskUIError('APPROVAL_REUSED','Approval ID was already used for another request.');this.db.exec('COMMIT');return {...JSON.parse(prior.body),idempotent:true};}
      const before=this.load(draft.project.project_id),review=preview(draft,before);
      if((before?.project.revision??0)!==draft.expected_revision)throw new TaskUIError('STALE_REVISION','Stored revision changed; reload and review.');
      if(!review.valid)throw new TaskUIError('INVALID_DRAFT',JSON.stringify(review.issues));
      if(review.review_digest!==approval.review_digest||draft.draft_revision!==approval.draft_revision)throw new TaskUIError('INVALID_APPROVAL','The reviewed draft or source snapshot changed. Review again.');
      const saved=savedSchema.parse(materialize(draft,before)),body=JSON.stringify(saved);
      this.db.prepare('INSERT INTO projects VALUES(?,?,?) ON CONFLICT(id) DO UPDATE SET revision=excluded.revision,body=excluded.body').run(saved.project.project_id,saved.project.revision,body);
      this.db.prepare('INSERT INTO history VALUES(?,?,?,?)').run(saved.project.project_id,saved.project.revision,approval.approval_id,body);
      const readback=this.load(saved.project.project_id);
      if(digest(readback)!==digest(saved))throw new TaskUIError('WRITE_VERIFICATION_FAILED','Readback did not match.');
      const result={saved:readback,verified:true,idempotent:false};
      this.db.prepare('INSERT INTO approvals VALUES(?,?,?,?,?)').run(approval.approval_id,saved.project.project_id,review.review_digest,requestDigest,JSON.stringify(result));
      this.db.exec('COMMIT');return result;
    }catch(e){this.db.exec('ROLLBACK');throw e;}
  }
}
