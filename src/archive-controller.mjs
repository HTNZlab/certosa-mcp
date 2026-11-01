import path from 'node:path';
import {isEncrypted,archiveError} from './archive-format.mjs';
import {ArchiveEngine} from './archive-engine.mjs';

export class ArchiveController{
  constructor({project,runtime,ui,engine}){
    this.project=project;this.runtime=runtime;this.ui=ui;this.engine=engine||new ArchiveEngine({project,backupDirectory:path.join(runtime,'backups')});
    this.phase='closed';this.generation=0;this.opening=false;this.lastError=null;
  }
  status(){
    const state=this.engine.status();
    if(this.phase==='ready'&&state.state==='closed')this.phase='closed';
    return {...state,state:this.opening?this.phase:state.state,error:this.lastError||undefined};
  }
  open(){
    if(this.opening)return {state:this.phase};
    this.close();this.opening=true;const generation=++this.generation;
    void this.openLocally(generation);
    return {state:'awaiting_file_selection',nextAction:'select_and_unlock_locally'};
  }
  async openLocally(generation){
    const active=()=>{if(this.generation!==generation)throw archiveError('CANCELLED');};
    try{
      this.phase='awaiting_file_selection';
      const selection=await this.ui.ask('choose',{directory:this.runtime});active();
      if(selection.cancelled)throw archiveError('CANCELLED');
      const filename=this.engine.inputPath(selection.path),encrypted=isEncrypted(this.engine.io.readFileSync(filename));
      const importDirectory=this.engine.inside(filename)?undefined:path.join(this.runtime,'archives');
      let notebooks;
      for(let attempt=0;attempt<3;attempt++){
        this.phase='awaiting_local_unlock';
        const answer=await this.ui.ask('unlock',{name:path.basename(filename),encrypted,retry:attempt>0,copyTo:importDirectory});active();
        if(answer.cancelled)throw archiveError('CANCELLED');
        try{notebooks=await this.engine.unlock(filename,answer.password,{importDirectory});active();break;}
        catch(e){if(e.code!=='UNLOCK_FAILED'||attempt===2)throw e;}
        finally{answer.password='';}
      }
      this.phase='awaiting_local_consent';
      const grant=await this.ui.ask('grant',{notebooks:notebooks.filter(n=>!n.reserved)});active();
      if(grant.cancelled)throw archiveError('CANCELLED');
      this.engine.grant({notebookIds:grant.notebookIds,write:grant.write===true});this.phase='ready';
    }catch(e){
      if(this.generation===generation){
        this.engine.close();this.phase='closed';this.lastError=e.code==='CANCELLED'?null:e.code||'OPEN_FAILED';
        if(this.lastError)try{await this.ui.notice?.(this.lastError);}catch{}
      }
    }finally{if(this.generation===generation)this.opening=false;}
  }
  close(){++this.generation;this.ui.cancel();this.engine.close();this.opening=false;this.phase='closed';this.lastError=null;return {state:'closed'};}
  async call(name,args){
    if(name==='open_archive')return this.open();
    if(name==='get_archive_status')return this.status();
    if(name==='close_archive')return this.close();
    return this.engine.call(name,args);
  }
}
