import {fork} from 'node:child_process';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {archiveError} from './archive-format.mjs';

export class ArchiveExecutor{
  constructor({config,entry=fileURLToPath(new URL('./archive-executor.mjs',import.meta.url))}){
    this.state={state:'closed',notebookCount:0,writeAllowed:false};this.requests=new Map();this.serial=0;
    this.config=config;this.entry=entry;this.start();
  }
  start(){
    const {config,entry}=this;this.state={state:'closed',notebookCount:0,writeAllowed:false};
    const child=fork(entry,[config.configFile],{cwd:config.runtime,env:{...process.env,TEMP:path.join(config.runtime,'.tmp'),TMP:path.join(config.runtime,'.tmp'),TMPDIR:path.join(config.runtime,'.tmp'),NODE_COMPILE_CACHE:path.join(config.runtime,'cache-node')},stdio:['ignore','ignore','pipe','ipc'],windowsHide:true});this.child=child;
    child.stderr.resume();let retired=false;
    child.on('message',message=>{
      if(retired||this.child!==child)return;
      if(message.kind==='status'){this.state=message.value;return;}
      if(message.kind==='response'){const request=this.requests.get(message.id);if(request){this.requests.delete(message.id);request.resolve(message.value);}}
    });
    const failed=()=>{
      if(retired)return;retired=true;
      if(this.child===child)this.state={state:'closed',notebookCount:0,writeAllowed:false,error:'LOCAL_SERVICE_UNAVAILABLE'};
      for(const [id,request] of this.requests)if(request.child===child){this.requests.delete(id);request.reject(archiveError('OUTCOME_UNKNOWN_DO_NOT_RETRY'));}
    };
    child.on('error',failed);child.on('exit',failed);child.on('disconnect',failed);
  }
  status(){return this.state;}
  call(name,args){
    if(name==='get_archive_status')return Promise.resolve(this.status());
    if(!this.child.connected){
      if(name==='open_archive'||name==='import_archive')this.start();
      else return Promise.resolve({error:'ARCHIVE_LOCKED'});
    }
    return new Promise((resolve,reject)=>{
      const id=++this.serial,child=this.child;this.requests.set(id,{resolve,reject,child});
      child.send({kind:'call',id,name,arguments:args},error=>{if(error){this.requests.delete(id);reject(archiveError('OUTCOME_UNKNOWN_DO_NOT_RETRY'));}});
    });
  }
  async shutdown(){
    try{await Promise.race([this.call('close_archive',{}),new Promise(resolve=>setTimeout(resolve,2000))]);}catch{}
    if(this.child.connected)this.child.disconnect();this.child.kill();
  }
}
