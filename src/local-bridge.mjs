// Loopback-only lab service. No notebook database, content log or external relay.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import {randomBytes,randomUUID,createHash,timingSafeEqual} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import Ajv from 'ajv';
import {tools} from './runtime-tools.mjs';
const configFile=path.resolve(process.argv[2]||'');
const settings=JSON.parse(fs.readFileSync(configFile,'utf8'));
const runtime=fs.realpathSync(path.dirname(configFile)),site=fs.realpathSync(settings.site);
const project=fs.realpathSync(settings.project);
if(![runtime,site].every(p=>p===project||p.startsWith(project+path.sep)))throw Error('PROJECT_PATH_REQUIRED');
const instanceId=createHash('sha256').update(runtime).digest('hex').slice(0,16);
if(settings.libraryId!=='certosa-human-lab-20261101'||settings.notebookId!=='usi-interessanti-volume-1-20261101')throw Error('ONLY_SYNTHETIC_LIBRARY_SUPPORTED');
const here=path.dirname(fileURLToPath(import.meta.url));
const clientToken=randomBytes(32).toString('hex'),browserToken=randomBytes(32).toString('hex');
const validators=new Map(tools.map(t=>[t.name,new Ajv().compile(t.inputSchema)]));
const jobs=new Map();let lease=null,lastPoll=0,credentialHash=null;
const secretHash=s=>createHash('sha256').update(s).digest();
function json(res,status,value){if(res.destroyed)return;res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});res.end(JSON.stringify(value));}
async function body(req){let size=0,chunks=[];for await(const part of req){if((size+=part.length)>1000000)throw Error('BODY_LIMIT');chunks.push(part);}return JSON.parse(Buffer.concat(chunks).toString());}
function failJobs(){for(const j of jobs.values()){clearTimeout(j.timer);json(j.res,200,{error:j.delivered?'OUTCOME_UNKNOWN_DO_NOT_RETRY':'SESSION_REVOKED'});}jobs.clear();}
const server=http.createServer(async(req,res)=>{
  const origin='http://127.0.0.1:'+server.address().port;
  if(req.headers.host!=='127.0.0.1:'+server.address().port||req.headers.origin&&req.headers.origin!==origin)return json(res,403,{error:'ORIGIN_REJECTED'});
  try{
    const url=new URL(req.url,origin),route=url.pathname;
    if(route.startsWith('/bridge/')||route.startsWith('/fixture/')){
      const browser=req.headers.authorization==='Bearer '+browserToken;
      const client=req.headers.authorization==='Bearer '+clientToken;
      if(!browser&&!client)return json(res,401,{error:'PAIRING_REQUIRED'});
      if(route==='/bridge/call'&&client&&req.method==='POST'){
        const request=await body(req);
        if(!validators.get(request.name)?.(request.arguments))return json(res,400,{error:'INVALID_TOOL_OR_ARGUMENTS'});
        if(!lease||Date.now()-lastPoll>4000)return json(res,503,{error:'DEVICE_UNAVAILABLE'});
        if(jobs.size>=20)return json(res,429,{error:'BUSY'});
        const id=randomUUID(),expiresAt=Date.now()+15000;
        const job={id,lease,name:request.name,arguments:request.arguments,expiresAt,res,delivered:false};
        job.timer=setTimeout(()=>{jobs.delete(id);json(res,200,{error:job.delivered?'OUTCOME_UNKNOWN_DO_NOT_RETRY':'DEVICE_UNAVAILABLE'});},15000);
        jobs.set(id,job);return;
      }
      if(!browser)return json(res,403,{error:'FORBIDDEN'});
      if(route==='/bridge/config'&&req.method==='GET')return json(res,200,{libraryId:settings.libraryId,notebookId:settings.notebookId,labMode:true});
      if(route==='/bridge/connect'&&req.method==='POST'){
        failJobs();lease=randomUUID();lastPoll=Date.now();return json(res,200,{lease});
      }
      if(req.headers['x-certosa-session']!==lease||!lease)return json(res,403,{error:'SESSION_REVOKED'});
      if(route==='/bridge/disconnect'&&req.method==='POST'){failJobs();lease=null;credentialHash=null;return json(res,200,{status:'disconnected'});}
      if(route==='/bridge/poll'&&req.method==='GET'){
        lastPoll=Date.now();const j=[...jobs.values()].find(j=>!j.delivered&&j.expiresAt>Date.now());
        if(j){j.delivered=true;return json(res,200,{job:{id:j.id,name:j.name,arguments:j.arguments,expiresAt:j.expiresAt}});}
        return json(res,200,{job:null});
      }
      if(route==='/bridge/result'&&req.method==='POST'){
        const reply=await body(req),j=jobs.get(reply.id);
        if(j&&j.lease===lease&&j.delivered){clearTimeout(j.timer);jobs.delete(j.id);json(j.res,200,reply.result);}
        return json(res,200,{status:'accepted'});
      }
      // Fictional authentication service, fixed endpoints, never logs request bodies.
      if(route==='/fixture/enrol'&&req.method==='POST'){
        const data=await body(req);
        if(typeof data.secret!=='string'||!/^[-_A-Za-z0-9]{64}$/.test(data.secret))return json(res,400,{status:'failed'});
        credentialHash=secretHash(data.secret);return json(res,200,{status:'ready'});
      }
      if(route==='/fixture/authenticate'&&req.method==='POST'){
        const data=await body(req);
        const ok=typeof data.secret==='string'&&credentialHash&&timingSafeEqual(secretHash(data.secret),credentialHash);
        return json(res,200,{status:ok?'completed':'failed'});
      }
      return json(res,404,{error:'NOT_FOUND'});
    }
    if(req.method!=='GET')return json(res,405,{error:'METHOD_REJECTED'});
    res.setHeader('Cache-Control','no-store');res.setHeader('Referrer-Policy','no-referrer');res.setHeader('X-Content-Type-Options','nosniff');
    if(route==='/api/lab/status')return json(res,200,{libraryId:settings.libraryId,connector:true,instanceId});
    if(route==='/api/lab/start'){res.setHeader('Content-Type','text/html; charset=utf-8');res.end(fs.readFileSync(path.join(runtime,'seed.html')));return;}
    if(route==='/sw.js'){res.setHeader('Content-Type','text/javascript');res.end("self.addEventListener('install',()=>self.skipWaiting());self.addEventListener('activate',e=>e.waitUntil(self.registration.unregister()));");return;}
    // Pairing token is delivered only through the URL fragment, never through a public GET.
    let file;
    if(route.startsWith('/connector/')){
      const name=route.slice('/connector/'.length);
      if(!['browser-adapter.mjs','notebook-tools.mjs','secret-capabilities.mjs'].includes(name))return json(res,404,{error:'NOT_FOUND'});
      file=path.join(here,name);
    }else{
      const relative=decodeURIComponent(route==='/'?'/app.html':route);
      file=fs.realpathSync(path.join(site,relative));
      if(!file.startsWith(site+path.sep))return json(res,403,{error:'FORBIDDEN'});
    }
    const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript','.mjs':'text/javascript','.json':'application/json','.css':'text/css','.png':'image/png','.webp':'image/webp','.svg':'image/svg+xml','.woff2':'font/woff2','.webmanifest':'application/manifest+json'};
    res.setHeader('Content-Type',mime[path.extname(file)]||'application/octet-stream');
    if(file===path.join(site,'app.html')){
      let html=fs.readFileSync(file,'utf8');
      const loader='<script type="module" src="/connector/browser-adapter.mjs"></script>';
      // The bundle also contains export templates with literal </body> strings.
      // Insert only at the document's last closing body, never inside a script.
      const end=html.lastIndexOf('</body>');
      html=end<0?html+loader:html.slice(0,end)+loader+html.slice(end);res.end(html);
    }else{const stream=fs.createReadStream(file);stream.on('error',()=>res.destroy());stream.pipe(res);}
  }catch{if(!res.headersSent)json(res,400,{error:'REQUEST_REJECTED'});else res.destroy();}
});
await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(settings.port??0,'127.0.0.1',resolve);});
const origin='http://127.0.0.1:'+server.address().port;
fs.writeFileSync(path.join(runtime,'pairing.json'),JSON.stringify({origin,clientToken}),{mode:0o600});
fs.writeFileSync(path.join(runtime,'browser-launch.json'),JSON.stringify({url:origin+'/api/lab/start#certosa-pair='+browserToken}),{mode:0o600});
fs.writeFileSync(path.join(runtime,'ready.json'),JSON.stringify({origin,pid:process.pid,version:'0.0.2-alpha.1',instanceId}));
process.on('SIGTERM',()=>{failJobs();server.close();process.exit(0);});
