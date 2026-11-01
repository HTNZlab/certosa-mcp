import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import {randomBytes,createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import Ajv from 'ajv';
import {ArchiveController} from './archive-controller.mjs';
import {LocalArchiveUI} from './archive-local-ui.mjs';
import {archiveTools} from './archive-tools.mjs';
import {projectDirectory} from './archive-paths.mjs';

export const fixedErrors=new Set(['ARCHIVE_LOCKED','ARCHIVE_IN_USE','ARCHIVE_OUTSIDE_PROJECT','ARCHIVE_PATH_CHANGED','ARCHIVE_TOO_LARGE','INVALID_ARCHIVE','INVALID_ATTACHMENT','UNLOCK_FAILED','PASSWORD_REQUIRED','INVALID_GRANT','INVALID_TOOL_OR_ARGUMENTS','INVALID_RANGE','INVALID_WORD','INVALID_QUERY','INVALID_TEXT','INVALID_EDIT','INVALID_PAGE','NOT_FOUND','FORBIDDEN','REVISION_CONFLICT','HANDLE_SPENT','SESSION_CLOSED','SAVE_FAILED','READ_BUDGET_EXCEEDED','TOO_MANY_PROPOSALS','LOCAL_UNLOCK_UNSUPPORTED','LOCAL_DIALOG_UNAVAILABLE','CANCELLED']);
export function loadArchiveConfig(filename){
  const file=fs.realpathSync(filename),config=JSON.parse(fs.readFileSync(file,'utf8'));
  const project=fs.realpathSync(config.project),runtime=fs.realpathSync(path.dirname(file));
  const inside=p=>p===project||p.startsWith(project+path.sep);
  if(!inside(runtime))throw Error('PROJECT_PATH_REQUIRED');
  for(const name of ['.tmp','logs','backups']){
    projectDirectory(project,path.join(runtime,name));
  }
  return {...config,project,runtime,configFile:file,instanceId:createHash('sha256').update(runtime).digest('hex').slice(0,24)};
}
export async function createArchiveService({filename,ui}){
  const config=loadArchiveConfig(filename),controller=new ArchiveController({project:config.project,runtime:config.runtime,ui:ui||new LocalArchiveUI({runtime:config.runtime})});
  const token=randomBytes(32).toString('hex'),validators=new Map(archiveTools.map(t=>[t.name,new Ajv().compile(t.inputSchema)]));
  function reply(res,code,value){res.writeHead(code,{'Content-Type':'application/json','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});res.end(JSON.stringify(value));}
  const server=http.createServer(async(req,res)=>{
    const expectedHost='127.0.0.1:'+server.address().port;
    if(req.headers.host!==expectedHost||req.headers.origin)return reply(res,403,{error:'ORIGIN_REJECTED'});
    if(req.headers.authorization!=='Bearer '+token)return reply(res,401,{error:'PAIRING_REQUIRED'});
    if(req.url==='/status'&&req.method==='GET')return reply(res,200,{instanceId:config.instanceId,...controller.status()});
    if(req.url!=='/call'||req.method!=='POST')return reply(res,404,{error:'NOT_FOUND'});
    try{
      const chunks=[];let size=0;for await(const part of req){size+=part.length;if(size>1000000)return reply(res,413,{error:'REQUEST_TOO_LARGE'});chunks.push(part);}
      const input=JSON.parse(Buffer.concat(chunks).toString('utf8'));
      if(!validators.get(input.name)?.(input.arguments))return reply(res,400,{error:'INVALID_TOOL_OR_ARGUMENTS'});
      const result=await controller.call(input.name,input.arguments);return reply(res,200,result);
    }catch(e){return reply(res,200,{error:fixedErrors.has(e.code)?e.code:'OPERATION_FAILED'});}
  });
  await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(config.port||0,'127.0.0.1',resolve);});
  const origin='http://127.0.0.1:'+server.address().port;
  fs.writeFileSync(path.join(config.runtime,'archive-service.json'),JSON.stringify({origin,token,instanceId:config.instanceId,pid:process.pid}),{mode:0o600});
  const expiry=setInterval(()=>controller.status(),1000);expiry.unref();
  return {server,controller,config,async close(){clearInterval(expiry);controller.close();await new Promise(resolve=>server.close(resolve));}};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const service=await createArchiveService({filename:process.argv[2]});
  for(const signal of ['SIGTERM','SIGINT'])process.on(signal,()=>{void service.close().then(()=>process.exit(0));});
}
