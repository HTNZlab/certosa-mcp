import fs from 'node:fs';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {loadArchiveConfig} from './archive-service.mjs';
import {archiveError} from './archive-format.mjs';

const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
export async function archiveRuntime(filename){
  const config=loadArchiveConfig(filename),ready=path.join(config.runtime,'archive-service.json');
  async function running(){
    let info;
    try{info=JSON.parse(fs.readFileSync(ready,'utf8'));}catch{return null;}
    const url=new URL(info.origin);
    if(url.protocol!=='http:'||url.hostname!=='127.0.0.1'||url.pathname!=='/'||url.search||url.hash||info.instanceId!==config.instanceId||!/^[-_A-Za-z0-9]{64}$/.test(info.token))throw archiveError('INVALID_LOCAL_SERVICE');
    try{
      const response=await fetch(info.origin+'/status',{headers:{Authorization:'Bearer '+info.token},signal:AbortSignal.timeout(1200),redirect:'error'});
      if(!response.ok)throw archiveError('LOCAL_SERVICE_REJECTED');
      if((await response.json()).instanceId!==config.instanceId)throw archiveError('LOCAL_SERVICE_REJECTED');
      return info;
    }catch(e){if(e.code==='LOCAL_SERVICE_REJECTED')throw e;return null;}
  }
  let info=await running();
  if(!info){
    // Serialize service startup between independent MCP clients. A crash leaves
    // a diagnostic lock; it is never automatically removed as if it were ours.
    const startup=path.join(config.runtime,'service-start.lock');let fd;
    try{fd=fs.openSync(startup,'wx',0o600);}catch(e){if(e.code!=='EEXIST')throw e;}
    if(fd!==undefined){
      try{
        info=await running();
        if(!info){
          const log=fs.openSync(path.join(config.runtime,'logs/service.log'),'a');
          try{
            const child=spawn(process.execPath,[fileURLToPath(new URL('./archive-service.mjs',import.meta.url)),config.configFile],{
              cwd:config.runtime,env:{...process.env,TEMP:path.join(config.runtime,'.tmp'),TMP:path.join(config.runtime,'.tmp'),TMPDIR:path.join(config.runtime,'.tmp'),NODE_COMPILE_CACHE:path.join(config.runtime,'cache-node')},
              stdio:['ignore',log,log],windowsHide:true,detached:true});
            await new Promise((resolve,reject)=>{child.once('spawn',resolve);child.once('error',reject);});child.unref();
          }finally{fs.closeSync(log);}
          for(let i=0;i<50&&!info;i++){await wait(100);info=await running();}
        }
      }finally{fs.closeSync(fd);fs.unlinkSync(startup);}
    }else for(let i=0;i<60&&!info;i++){await wait(100);info=await running();}
  }
  if(!info)throw archiveError('LOCAL_SERVICE_UNAVAILABLE');
  return {
    async call(name,args){
      const response=await fetch(info.origin+'/call',{method:'POST',headers:{Authorization:'Bearer '+info.token,'Content-Type':'application/json'},body:JSON.stringify({name,arguments:args}),signal:AbortSignal.timeout(30000),redirect:'error'});
      if(!response.ok)throw archiveError('LOCAL_SERVICE_REJECTED');return response.json();
    }
  };
}
