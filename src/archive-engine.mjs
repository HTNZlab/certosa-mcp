import fs from 'node:fs';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {archiveError,hashBytes,MAX_FILE_BYTES,unlockArchiveBytes,encryptArchive} from './archive-format.mjs';
import {plainText,textHtml} from './archive-text.mjs';
import search from './archive-search.mjs';
import {createLocalNotebookTools,assertPlainReplaceSafe,createIdleConsent,DEFAULT_IDLE_TTL_MS} from './notebook-tools.mjs';
import {projectDirectory} from './archive-paths.mjs';

const fail=code=>{throw archiveError(code);};
const system=n=>n.systemRole==='manuale-certosa'||n.id==='certosa_manual_notebook';
const secret=n=>n.sensitivity==='secret'||!!n.localCredential;
export class ArchiveEngine{
  constructor({project,backupDirectory,now=Date.now,io=fs}){
    this.io=io;this.now=now;this.project=fs.realpathSync(project);
    const candidate=path.resolve(backupDirectory);
    if(!this.inside(candidate))fail('PROJECT_PATH_REQUIRED');
    this.backups=projectDirectory(this.project,candidate);
    if(!this.inside(this.backups))fail('PROJECT_PATH_REQUIRED');
    this.material=null;this.session=null;this.filename=null;this.revision=0;this.busy=false;this.lockFile=null;this.idleConsent=null;this.applied=new Set();this.epoch=0;
  }
  get expiresAt(){return this.idleConsent?.expiresAt||0;}
  runUse(fn){if(!this.session||!this.idleConsent)fail('ARCHIVE_LOCKED');return this.idleConsent.run(()=>{this.readState();return fn();});}
  inside(value){return value===this.project||value.startsWith(this.project+path.sep);}
  inputPath(filename){
    const absolute=this.io.realpathSync(filename),stat=this.io.statSync(absolute);
    if(path.extname(absolute).toLowerCase()!=='.certosa'||!stat.isFile())fail('INVALID_ARCHIVE');
    if(stat.size>MAX_FILE_BYTES)fail('ARCHIVE_TOO_LARGE');
    return absolute;
  }
  pathFor(filename){const absolute=this.inputPath(filename);if(!this.inside(absolute))fail('ARCHIVE_OUTSIDE_PROJECT');return absolute;}
  bytes(){
    if(this.pathFor(this.filename)!==this.filename)fail('ARCHIVE_PATH_CHANGED');
    return this.io.readFileSync(this.filename);
  }
  checkDisk(){if(hashBytes(this.bytes())!==this.diskHash)fail('REVISION_CONFLICT');}
  async unlock(filename,password,{importDirectory}={}){
    this.close();
    const epoch=this.epoch;
    let absolute=importDirectory?this.inputPath(filename):this.pathFor(filename);
    let bytes=this.io.readFileSync(absolute);
    const hash=hashBytes(bytes),material=await unlockArchiveBytes(bytes,password);
    if(epoch!==this.epoch){material.key.fill(0);fail('SESSION_CLOSED');}
    if(hashBytes(this.io.readFileSync(absolute))!==hash){material.key.fill(0);fail('REVISION_CONFLICT');}
    this.imported=false;
    if(importDirectory){
      try{
        const folder=projectDirectory(this.project,importDirectory);
        absolute=path.join(folder,'imported-'+randomUUID()+'.certosa');
        if(material.legacy){bytes=encryptArchive(material.pack,material);material.legacy=false;}
        const fd=this.io.openSync(absolute,'wx',0o600);try{this.io.writeFileSync(fd,bytes);this.io.fsyncSync(fd);}finally{this.io.closeSync(fd);}
        this.imported=true;
      }catch(e){material.key.fill(0);throw archiveError(e.code==='PROJECT_PATH_REQUIRED'?e.code:'SAVE_FAILED');}
    }
    this.filename=absolute;this.material=material;this.diskHash=hashBytes(bytes);this.revision=parseInt(this.diskHash.slice(0,12),16);
    this.archiveId='archive-'+hashBytes(Buffer.from(absolute)).slice(0,24);
    return material.pack.lib.notebooks.filter(n=>!system(n)).map(n=>({id:n.id,title:material.pack.lib.series.find(s=>s.id===n.sid)?.label||'',volume:n.vol,reserved:secret(n)}));
  }
  grant({notebookIds,write=false,ttlMs=DEFAULT_IDLE_TTL_MS,allowCreate=false}){
    if(!this.material)fail('ARCHIVE_LOCKED');
    if(this.session){this.idleConsent.check();fail('ARCHIVE_IN_USE');}
    if(!Number.isSafeInteger(ttlMs)||ttlMs<1||ttlMs>DEFAULT_IDLE_TTL_MS)fail('INVALID_GRANT');
    const eligible=new Set(this.material.pack.lib.notebooks.filter(n=>!system(n)&&!secret(n)).map(n=>n.id));
    if(!Array.isArray(notebookIds)||!notebookIds.length&&!(write&&allowCreate)||notebookIds.some(id=>!eligible.has(id)))fail('INVALID_GRANT');
    this.checkDisk();
    if(write){
      this.lockFile=this.filename+'.lock';this.lockToken=randomUUID();let fd;
      try{fd=this.io.openSync(this.lockFile,'wx',0o600);this.io.writeFileSync(fd,JSON.stringify({pid:process.pid,token:this.lockToken}));this.io.fsyncSync(fd);}
      catch(e){this.lockFile=null;fail(e.code==='EEXIST'?'ARCHIVE_IN_USE':'SAVE_FAILED');}
      finally{if(fd!==undefined)this.io.closeSync(fd);}
    }
    this.session?.close();++this.epoch;
    const consent=createIdleConsent({ttlMs,now:this.now,onExpire:()=>{if(this.idleConsent===consent)this.close();}});this.idleConsent=consent;
    this.allowed=new Set(notebookIds);this.write=write;
    const owner=createLocalNotebookTools({readState:()=>this.readState(),plainText,isSystemNotebook:system,isSensitiveNotebook:secret,now:this.now,
      searchEntries:(entries,query)=>{const parsed=search.parse(query);if(parsed.error)fail('INVALID_QUERY');return search.scan(entries,parsed);}});
    this.session=owner.openSession({archiveId:this.archiveId,notebookIds,permissions:write?['read','search','propose_edit']:['read','search'],ttlMs,idleConsent:consent});
    return this.status();
  }
  status(){
    if(this.session)try{this.idleConsent.check();}catch{this.close();}
    return {state:this.session?'ready':this.material?'awaiting_consent':'closed',archiveId:this.session?this.archiveId:undefined,
      notebookCount:this.session?this.allowed.size:0,writeAllowed:!!this.session&&this.write,workingCopy:this.session?!!this.imported:undefined,expiresAt:this.session?this.expiresAt:undefined,revision:this.session?this.revision:undefined};
  }
  readState(){
    if(!this.session||!this.material)fail('ARCHIVE_LOCKED');
    this.idleConsent.check();
    this.checkDisk();
    return {archiveId:this.archiveId,revision:this.revision,locked:false,busy:this.busy,lib:this.material.pack.lib};
  }
  async call(name,args){
    return this.runUse(()=>this.dispatch(name,args));
  }
  dispatch(name,args){
    this.readState();
    if(name==='apply_proposal')return this.apply(args);
    if(name==='count_word')return this.count(args);
    if(!['list_notebooks','read_notebook','search_notebooks','prepare_edit','prepare_author_edit','read_proposal'].includes(name))fail('INVALID_TOOL_OR_ARGUMENTS');
    return this.session[name](args);
  }
  count({word,notebookId,caseSensitive=false}){
    if(typeof word!=='string'||word.length>100||!/^\p{L}[\p{L}\p{N}\p{M}]*$/u.test(word))fail('INVALID_WORD');
    const target=caseSensitive?word.normalize('NFKC'):word.normalize('NFKC').toLocaleLowerCase('it');
    const matches=value=>[...plainText(value).matchAll(/[\p{L}\p{N}][\p{L}\p{N}\p{M}]*/gu)].filter(m=>(caseSensitive?m[0].normalize('NFKC'):m[0].normalize('NFKC').toLocaleLowerCase('it'))===target).length;
    const locations=[];let total=0,found=!notebookId,locationCount=0;
    for(const nb of this.material.pack.lib.notebooks){
      if(!this.allowed.has(nb.id)||system(nb)||secret(nb)||notebookId&&nb.id!==notebookId)continue;
      found=true;
      for(let number=1;number<nb.pages.length;number++){
        const p=nb.pages[number];if(!p)continue;
        const count=matches(p.html||'')+(p.notes||[]).reduce((sum,n)=>sum+matches(n.html||''),0);
        if(count){total+=count;locationCount++;if(locations.length<1000)locations.push({notebookId:nb.id,pageNumber:number,count});}
      }
    }
    if(!found)fail('NOT_FOUND');this.checkDisk();
    return {archiveId:this.archiveId,revision:this.revision,word,wholeWord:true,caseSensitive,total,locations,locationsTruncated:locationCount>locations.length};
  }
  apply({proposalId}){
    if(!this.write)fail('FORBIDDEN');
    if(this.applied.has(proposalId))fail('HANDLE_SPENT');
    const proposal=this.session.read_proposal({proposalId});
    if(proposal.stale)fail('REVISION_CONFLICT');
    if(proposal.operations.length!==1)fail('INVALID_EDIT');
    const op=proposal.operations[0],candidate=structuredClone(this.material.pack),nb=candidate.lib.notebooks.find(n=>n.id===op.notebookId);
    if(!nb||!this.allowed.has(nb.id)||secret(nb)||system(nb))fail('NOT_FOUND');
    if(op.type==='set_notebook_author'){
      const before=String(typeof nb.author==='string'?nb.author:typeof candidate.lib.series.find(s=>s.id===nb.sid)?.author==='string'?candidate.lib.series.find(s=>s.id===nb.sid).author:'').slice(0,500);
      if(before!==op.beforeAuthor)fail('REVISION_CONFLICT');nb.author=op.afterAuthor;
    }else{
      const page=nb.pages[op.pageNumber]||{html:'',st:[],notes:[]};
      if(plainText(page.html||'')!==op.beforeText)fail('REVISION_CONFLICT');
      if(op.mode==='replace')assertPlainReplaceSafe(page.html||'');page.html=op.mode==='append'?(page.html||'')+textHtml(op.afterText.slice(op.beforeText.length)):textHtml(op.afterText);
      if(op.source)page.connectorSource=op.source;nb.pages[op.pageNumber]=page;
    }
    this.applied.add(proposalId);const saved=this.persist(candidate);return {...saved,notebookId:nb.id,pageNumber:op.pageNumber};
  }
  persist(candidate){
    this.readState();if(!this.write)fail('FORBIDDEN');this.busy=true;
    let temporary,checkpoint;
    try{
      this.checkDisk();
      const original=this.bytes(),output=encryptArchive(candidate,this.material);
      checkpoint=randomUUID();const backup=path.join(this.backups,checkpoint+'.certosa');
      // Preserve an encrypted recovery copy, including when opening a legacy clear export.
      this.io.writeFileSync(backup,this.material.legacy?encryptArchive(this.material.pack,this.material):original,{flag:'wx',mode:0o600});
      const backupFd=this.io.openSync(backup,'r+');try{this.io.fsyncSync(backupFd);}finally{this.io.closeSync(backupFd);}
      temporary=this.filename+'.write-'+randomUUID();
      const fd=this.io.openSync(temporary,'wx',0o600);try{this.io.writeFileSync(fd,output);this.io.fsyncSync(fd);}finally{this.io.closeSync(fd);}
      this.idleConsent.check();
      this.checkDisk();
      this.io.renameSync(temporary,this.filename);temporary=null;
      this.material.pack=candidate;this.material.legacy=false;this.diskHash=hashBytes(output);this.revision++;
      return {status:'saved',archiveId:this.archiveId,revision:this.revision,checkpoint:true,checkpointId:checkpoint};
    }catch(e){throw archiveError(['REVISION_CONFLICT','SESSION_CLOSED','ARCHIVE_PATH_CHANGED'].includes(e.code)?e.code:'SAVE_FAILED');}
    finally{
      this.busy=false;
      if(temporary){try{this.io.unlinkSync(temporary);}catch{}}
    }
  }
  close(){
    ++this.epoch;
    this.session?.close();this.session=null;
    this.material?.key.fill(0);this.material=null;this.allowed=new Set();this.applied.clear();
    if(this.lockFile){try{const own=JSON.parse(this.io.readFileSync(this.lockFile,'utf8'));if(own.token===this.lockToken)this.io.unlinkSync(this.lockFile);}catch{}this.lockFile=null;}
    this.idleConsent?.close();this.idleConsent=null;this.filename=null;this.write=false;
  }
}
