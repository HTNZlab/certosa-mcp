import fs from 'node:fs';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {ArchiveEngine} from './archive-engine.mjs';
import {LargeArchiveEngine} from './large-archive-engine.mjs';
import {LargeArchiveStore} from './large-archive-store.mjs';
import {archiveError,unlockArchiveBytes,encryptArchive,createArchiveKey,MAX_FILE_BYTES} from './archive-format.mjs';
import {projectDirectory} from './archive-paths.mjs';
import {ArchiveWorkflow} from './archive-workflow.mjs';
import {validateCompatiblePack,verifyNativeExport} from './archive-validation.mjs';
const fail=code=>{throw archiveError(code);};

export class ArchiveRouter{
  constructor({project,runtime}){
    this.project=fs.realpathSync(project);this.runtime=runtime;this.io=fs;this.active=null;this.epoch=0;
    this.legacy=new ArchiveEngine({project,backupDirectory:path.join(runtime,'backups')});this.large=new LargeArchiveEngine();this.workflow=new ArchiveWorkflow(this);
  }
  inside(filename){return this.legacy.inside(filename);}
  isIncremental(filename){return path.extname(filename).toLowerCase()==='.certosa-db';}
  inputPath(filename){
    const real=fs.realpathSync(filename);
    if(!this.isIncremental(real))return this.legacy.inputPath(real);
    if(!fs.statSync(real).isFile())fail('INVALID_ARCHIVE');
    if(!this.inside(real))fail('ARCHIVE_OUTSIDE_PROJECT');return real;
  }
  get session(){return this.active?.session||null;}
  get material(){return this.active?.material||null;}
  async unlock(filename,password,options={}){
    this.close();const epoch=this.epoch;let items;
    if(this.isIncremental(filename)){
      const store=LargeArchiveStore.open(this.inputPath(filename),password);
      if(epoch!==this.epoch){store.close();fail('SESSION_CLOSED');}
      items=this.large.adopt(store);this.active=this.large;
    }else{items=await this.legacy.unlock(filename,password,options);if(epoch!==this.epoch){this.legacy.close();fail('SESSION_CLOSED');}this.active=this.legacy;}
    return items;
  }
  async importLegacy(filename,password){
    this.close();const epoch=this.epoch,input=this.legacy.inputPath(filename),original=fs.readFileSync(input);
    const material=await unlockArchiveBytes(original,password);
    try{
      if(epoch!==this.epoch)fail('SESSION_CLOSED');
      const folder=projectDirectory(this.project,path.join(this.runtime,'archives'));
      const destination=path.join(folder,'archive-'+randomUUID()+'.certosa-db');
      const store=LargeArchiveStore.create(destination,password,material.pack);
      if(epoch!==this.epoch){store.close();fail('SESSION_CLOSED');}
      this.active=this.large;const items=this.large.adopt(store);return items;
    }finally{material.key.fill(0);}
  }
  async exportLegacy(filename,password){
    const active=this.active,epoch=this.epoch;if(!active?.session)fail('ARCHIVE_LOCKED');
    active.check?.();active.readState?.();
    const parent=projectDirectory(this.project,path.dirname(path.resolve(filename))),target=path.join(parent,path.basename(filename));
    if(path.extname(target).toLowerCase()!=='.certosa')fail('INVALID_ARCHIVE');if(fs.existsSync(target))fail('DESTINATION_EXISTS');
    const revision=active.status().revision;
    const pack=active===this.large?this.large.store.db.transaction(()=>this.large.store.exportPack()).deferred():structuredClone(this.legacy.material.pack);validateCompatiblePack(pack);
    // Reuse the legacy KDF/envelope without ever keeping an export password.
    const material=await createArchiveKey(password);
    let temporary;
    try{
      if(epoch!==this.epoch)fail('SESSION_CLOSED');const output=encryptArchive(pack,material);if(output.length>MAX_FILE_BYTES)fail('LEGACY_EXPORT_TOO_LARGE');
      temporary=target+'.write-'+randomUUID();const fd=fs.openSync(temporary,'wx',0o600);try{fs.writeFileSync(fd,output);fs.fsyncSync(fd);}finally{fs.closeSync(fd);}
      const verification=await verifyNativeExport(fs.readFileSync(temporary),password,pack);
      if(epoch!==this.epoch)fail('SESSION_CLOSED');if(active.status().revision!==revision)fail('REVISION_CONFLICT');active.check?.();active.readState?.();
      // Hard-link publication is exclusive: an existing archive is never overwritten.
      fs.linkSync(temporary,target);fs.unlinkSync(temporary);temporary=null;return {status:'saved',format:'certosa/2',...verification};
    }finally{material.key.fill(0);if(temporary)try{fs.unlinkSync(temporary);}catch{}}
  }
  backup(filename){
    if(this.active!==this.large)fail('INCREMENTAL_REQUIRED');this.large.check();
    const epoch=this.epoch,parent=projectDirectory(this.project,path.dirname(path.resolve(filename))),target=path.join(parent,path.basename(filename));
    if(path.extname(target).toLowerCase()!=='.certosa-db')fail('INVALID_ARCHIVE');
    return this.large.store.snapshot(target,{valid:()=>epoch===this.epoch&&!!this.large.session&&this.large.now()<this.large.session.expiresAt});
  }
  grant(args){if(!this.active)fail('ARCHIVE_LOCKED');const result=this.active.grant(args);this.active.allowCreate=args.write===true&&args.allowCreate===true;return result;}
  status(){return this.active?this.active.status():{state:'closed',notebookCount:0,writeAllowed:false};}
  async call(name,args){if(!this.active)fail('ARCHIVE_LOCKED');if(name==='prepare_archive_edit')return this.workflow.prepare(args);if(name==='validate_archive')return this.workflow.validate();if(args?.proposalId?.startsWith('batch-')){if(name==='read_proposal')return this.workflow.proposal(args);if(name==='apply_proposal')return this.workflow.apply(args);}return this.active.call(name,args);}
  close(){++this.epoch;this.workflow?.close();this.legacy.close();this.large.close();this.active=null;}
}
