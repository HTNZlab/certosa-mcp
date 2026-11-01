import path from 'node:path';
import {isEncrypted,archiveError} from './archive-format.mjs';
import {ArchiveRouter} from './archive-router.mjs';

export class ArchiveController{
  constructor({project,runtime,ui,engine}){
    this.project=project;this.runtime=runtime;this.ui=ui;this.engine=engine||new ArchiveRouter({project,runtime});
    this.phase='closed';this.generation=0;this.opening=false;this.lastError=null;
  }
  status(){
    const state=this.engine.status();
    if(this.phase==='ready'&&state.state==='closed')this.phase='closed';
    return {...state,state:this.opening?this.phase:state.state,operation:this.exporting?this.phase:undefined,lastExport:this.lastExport||undefined,error:this.lastError||undefined};
  }
  report(){this.onState?.();}
  open(mode='open'){
    if(this.opening||this.exporting)return {state:this.phase};
    this.close();this.opening=true;const generation=++this.generation;
    void this.openLocally(generation,mode);
    return {state:'awaiting_file_selection',nextAction:'select_and_unlock_locally'};
  }
  async openLocally(generation,mode){
    const active=()=>{if(this.generation!==generation)throw archiveError('CANCELLED');};
    try{
      this.phase='awaiting_file_selection';
      this.report();
      const selection=await this.ui.ask('choose',{directory:this.runtime,incrementalAllowed:mode!=='import',importing:mode==='import'});active();
      if(selection.cancelled)throw archiveError('CANCELLED');
      const filename=this.engine.inputPath(selection.path),incremental=this.engine.isIncremental?.(filename);
      if(mode==='import'&&incremental)throw archiveError('INVALID_ARCHIVE');
      const encrypted=incremental||isEncrypted(this.engine.io.readFileSync(filename));
      const importDirectory=this.engine.inside(filename)?undefined:path.join(this.runtime,'archives');
      let notebooks;
      for(let attempt=0;attempt<3;attempt++){
        this.phase='awaiting_local_unlock';
        this.report();
        const answer=await this.ui.ask('unlock',{name:path.basename(filename),encrypted,retry:attempt>0,copyTo:mode==='import'?path.join(this.runtime,'archives'):importDirectory,importing:mode==='import'});active();
        if(answer.cancelled)throw archiveError('CANCELLED');
        try{
          this.phase=mode==='import'?'importing_archive':'unlocking_archive';this.report();
          notebooks=mode==='import'?await this.engine.importLegacy(filename,answer.password):await this.engine.unlock(filename,answer.password,{importDirectory});active();break;
        }
        catch(e){if(e.code!=='UNLOCK_FAILED'||attempt===2)throw e;}
        finally{answer.password='';}
      }
      this.phase='awaiting_local_consent';
      this.report();
      const grant=await this.ui.ask('grant',{notebooks:notebooks.filter(n=>!n.reserved)});active();
      if(grant.cancelled)throw archiveError('CANCELLED');
      this.engine.grant({notebookIds:grant.notebookIds,write:grant.write===true});this.phase='ready';
    }catch(e){
      if(this.generation===generation){
        this.engine.close();this.phase='closed';this.lastError=e.code==='CANCELLED'?null:e.code||'OPEN_FAILED';
        if(this.lastError)try{await this.ui.notice?.(this.lastError);}catch{}
      }
    }finally{if(this.generation===generation){this.opening=false;this.report();}}
  }
  export(mode='legacy'){
    if(this.opening||this.exporting)return {state:this.phase};
    if(this.engine.status().state!=='ready')throw archiveError('ARCHIVE_LOCKED');
    this.exporting=true;this.lastError=null;this.lastExport=null;void this.exportLocally(this.generation,mode);return {state:'awaiting_export_destination'};
  }
  async exportLocally(generation,mode){
    const active=()=>{if(this.generation!==generation)throw archiveError('CANCELLED');};
    let answer;
    try{
      this.phase='awaiting_export_destination';this.report();const destination=await this.ui.ask('save',{directory:this.runtime,incrementalCopy:mode==='incremental'});active();
      if(destination.cancelled)throw archiveError('CANCELLED');
      if(mode==='incremental'){this.phase='backing_up_archive';this.report();this.lastExport=this.engine.backup(destination.path);active();return;}
      this.phase='awaiting_export_password';this.report();answer=await this.ui.ask('unlock',{name:path.basename(destination.path),encrypted:false,exporting:true});active();
      if(answer.cancelled)throw archiveError('CANCELLED');
      this.phase='exporting_archive';this.report();this.lastExport=await this.engine.exportLegacy(destination.path,answer.password);active();
    }catch(e){if(this.generation===generation){this.lastError=e.code==='CANCELLED'?null:e.code||'EXPORT_FAILED';if(this.lastError)try{await this.ui.notice?.(this.lastError);}catch{}}}
    finally{if(answer)answer.password='';if(this.generation===generation){this.exporting=false;this.phase=this.engine.status().state;this.report();}}
  }
  close(){++this.generation;this.ui.cancel();this.engine.close();this.opening=false;this.exporting=false;this.phase='closed';this.lastError=null;this.lastExport=null;return {state:'closed'};}
  async call(name,args){
    if(name==='open_archive')return this.open();
    if(name==='import_archive')return this.open('import');
    if(name==='export_archive')return this.export();
    if(name==='backup_archive')return this.export('incremental');
    if(name==='get_archive_status')return this.status();
    if(name==='close_archive')return this.close();
    return this.engine.call(name,args);
  }
}
