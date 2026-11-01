// Passwords/keys and synchronous SQLite work stay in this separate local process.
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {ArchiveController} from './archive-controller.mjs';
import {LocalArchiveUI} from './archive-local-ui.mjs';
import {loadArchiveConfig,fixedErrors} from './archive-service.mjs';

export function runArchiveExecutor({filename,ui}){
  const config=loadArchiveConfig(filename),controller=new ArchiveController({project:config.project,runtime:config.runtime,ui:ui||new LocalArchiveUI({runtime:config.runtime})});
  const post=()=>{if(process.connected)process.send({kind:'status',value:controller.status()});};
  controller.onState=post;
  const timer=setInterval(post,1000);timer.unref();
  process.on('message',async message=>{
    if(!message||message.kind!=='call')return;
    let value;
    try{value=await controller.call(message.name,message.arguments);}
    catch(e){value={error:fixedErrors.has(e.code)?e.code:'OPERATION_FAILED'};}
    if(process.connected){process.send({kind:'response',id:message.id,value});post();}
  });
  const stop=()=>{controller.close();clearInterval(timer);process.exit(0);};
  process.on('disconnect',stop);process.on('SIGTERM',stop);process.on('SIGINT',stop);post();
  return controller;
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))runArchiveExecutor({filename:process.argv[2]});
