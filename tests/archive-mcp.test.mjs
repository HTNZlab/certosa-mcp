// Actual SDK stdio -> authenticated local service -> encrypted .certosa, no app/browser.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {Client} from '../node_modules/@modelcontextprotocol/sdk/dist/esm/client/index.js';
import {StdioClientTransport} from '../node_modules/@modelcontextprotocol/sdk/dist/esm/client/stdio.js';
import {createArchiveService} from '../src/archive-service.mjs';
import {unlockArchiveBytes} from '../src/archive-format.mjs';
import {fixture,project,native} from './archive-fixtures.mjs';

const root=path.join(project,'verifiche/archive-engine-20261101','mcp-'+Date.now());fs.mkdirSync(root,{recursive:true});
const config=path.join(root,'archive-engine.json');fs.writeFileSync(config,JSON.stringify({project:root,port:0}));
const data=await fixture(path.join(root,'archive'));let unlockResolve,grantResolve,grantInput;
const ui={cancel(){},async ask(mode,input){if(mode==='choose')return {path:data.file};if(mode==='unlock')return new Promise(resolve=>unlockResolve=resolve);grantInput=input;return new Promise(resolve=>grantResolve=resolve);}};
const service=await createArchiveService({filename:config,ui});const checks=[],transcript=[];let client;
function check(label,condition){assert.ok(condition,label);checks.push(label);console.log('PASS '+label);}
async function connect(){
  const c=new Client({name:'archive-e2e',version:'1'}),env=Object.fromEntries(['TEMP','TMP','TMPDIR','NODE_COMPILE_CACHE'].filter(k=>process.env[k]).map(k=>[k,process.env[k]]));
  const transport=new StdioClientTransport({command:process.execPath,args:[fileURLToPath(new URL('../src/archive-mcp-server.mjs',import.meta.url)),config],env,stderr:'pipe'});transport.stderr?.resume();await c.connect(transport);return c;
}
async function call(name,args={}){const result=await client.callTool({name,arguments:args});const value=JSON.parse(result.content[0].text);transcript.push({name,arguments:args,result:value});return value;}
async function until(phase){for(let i=0;i<100;i++){const state=await call('get_archive_status');if(state.state===phase)return state;await new Promise(resolve=>setTimeout(resolve,20));}throw Error('STATE_TIMEOUT');}
try{
  client=await connect();check('fourteen archive tools exposed by the actual SDK',(await client.listTools()).tools.length===14);
  const schemas=(await client.listTools()).tools;check('no password or filesystem path accepted by open tool',Object.keys(schemas.find(t=>t.name==='open_archive').inputSchema.properties).length===0);
  check('archive initially closed',(await call('get_archive_status')).state==='closed');
  check('closed archive cannot be read',(await call('list_notebooks')).error==='ARCHIVE_LOCKED');
  check('file selection requested asynchronously',(await call('open_archive')).state==='awaiting_file_selection');
  await until('awaiting_local_unlock');check('password required outside the model',(await call('list_notebooks')).error==='ARCHIVE_LOCKED');
  unlockResolve({password:data.password});await until('awaiting_local_consent');
  check('secret notebook absent from local consent choices',grantInput.notebooks.length===2&&!grantInput.notebooks.some(n=>n.id==='reserved'));
  check('unlock alone does not authorise reading',(await call('list_notebooks')).error==='ARCHIVE_LOCKED');
  grantResolve({notebookIds:['first','second'],write:true});await until('ready');
  check('all owner-selected notebooks available',(await call('list_notebooks')).items.length===2);
  check('exact whole-archive count includes both notebooks',(await call('count_word',{word:'cosa'})).total===6);
  check('native search engine finds a note',(await call('search_notebooks',{query:'annotata'})).hits[0].kind==='note');
  check('secret notebook cannot be read',(await call('read_notebook',{notebookId:'reserved'})).error==='NOT_FOUND');
  const read=await call('read_notebook',{notebookId:'first',startPage:3,limit:1});
  const text='Traduction française de la bibliothèque. Une chose importante.';
  const proposal=await call('prepare_edit',{notebookId:'first',pageNumber:3,baseRevision:read.revision,mode:'append',text,provenance:{kind:'chat',reference:'Synthetic archive-engine test'}});
  check('reviewable proposal bound to exact file revision',proposal.status==='proposal_only'&&!(await call('read_proposal',{proposalId:proposal.id})).stale);
  const saved=await call('apply_proposal',{proposalId:proposal.id});check('write confirmed with encrypted recovery checkpoint',saved.status==='saved'&&saved.checkpoint);
  check('French write read back through MCP',(await call('read_notebook',{notebookId:'first',startPage:3,limit:1})).pages[0].text===text);
  check('same proposal not committed twice',(await call('apply_proposal',{proposalId:proposal.id})).error==='HANDLE_SPENT');
  await client.close();client=await connect();check('archive session survives reconnecting the chat client',(await call('search_notebooks',{query:'bibliothèque'})).hits.length>0);
  const current=await unlockArchiveBytes(fs.readFileSync(data.file),data.password);
  check('attachments and unknown metadata survive full file save',JSON.stringify(current.pack.blobs)===JSON.stringify(data.pack.blobs)&&JSON.stringify(current.pack.foreignField)===JSON.stringify(data.pack.foreignField));current.key.fill(0);
  const nativeDecoded=await native.Zip.unpackJSON(await native.Copia.decifra(new Uint8Array(fs.readFileSync(data.file)),data.password));
  check('saved file can be decrypted by original app functions',nativeDecoded.lib.notebooks[0].pages[3].html.includes('Traduction française'));
  const info=JSON.parse(fs.readFileSync(path.join(root,'archive-service.json'),'utf8'));
  check('HTTP access requires local pairing',(await fetch(info.origin+'/status')).status===401);
  check('browser origins rejected even with a valid pairing',(await fetch(info.origin+'/status',{headers:{Authorization:'Bearer '+info.token,Origin:'https://example.invalid'}})).status===403);
  check('locking revokes data access',(await call('close_archive')).state==='closed'&&(await call('list_notebooks')).error==='ARCHIVE_LOCKED');
  const all=JSON.stringify(transcript);check('no password, credential, key, path or raw attachment in MCP transcript',![data.password,data.pack.lib.notebooks[2].localCredential.secret,data.file,Object.values(data.pack.blobs)[0]].some(value=>all.includes(value)));
}finally{
  await client?.close();await service.close();
  fs.writeFileSync(path.join(root,'RESULT.json'),JSON.stringify({checks,noBrowserOrCertosaApp:true,syntheticArchive:true,ownerUiAutomated:false},null,2)+'\n');
  fs.writeFileSync(path.join(root,'MCP-TRANSCRIPT.json'),JSON.stringify(transcript,null,2)+'\n');
}
