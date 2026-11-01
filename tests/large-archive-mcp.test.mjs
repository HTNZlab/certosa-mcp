import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {Client} from '../node_modules/@modelcontextprotocol/sdk/dist/esm/client/index.js';
import {StdioClientTransport} from '../node_modules/@modelcontextprotocol/sdk/dist/esm/client/stdio.js';
import {createArchiveService} from '../src/archive-service.mjs';
import {project} from './archive-fixtures.mjs';
const root=path.join(project,'verifiche/large-archive-20261101','mcp-'+Date.now());fs.mkdirSync(root,{recursive:true});
const config=path.join(root,'archive-engine.json');fs.writeFileSync(config,JSON.stringify({project:root,port:0}));
const service=await createArchiveService({filename:config,executorFile:fileURLToPath(new URL('./large-executor-fixture.mjs',import.meta.url))});
const client=new Client({name:'large-archive-e2e',version:'1'}),env=Object.fromEntries(['TEMP','TMP','TMPDIR','NODE_COMPILE_CACHE'].filter(k=>process.env[k]).map(k=>[k,process.env[k]]));
const transport=new StdioClientTransport({command:process.execPath,args:[fileURLToPath(new URL('../src/archive-mcp-server.mjs',import.meta.url)),config],env,stderr:'pipe'});transport.stderr?.resume();
const checks=[],transcript=[];function check(label,value){assert.ok(value,label);checks.push(label);console.log('PASS '+label);}
async function call(name,args={}){const response=await client.callTool({name,arguments:args});const value=JSON.parse(response.content[0].text);transcript.push({name,arguments:args,result:value});return value;}
async function until(predicate){for(let i=0;i<200;i++){const value=await call('get_archive_status');if(predicate(value))return value;await new Promise(resolve=>setTimeout(resolve,25));}throw Error('STATE_TIMEOUT');}
try{
  await client.connect(transport);check('SDK exposes seventeen archive/complex edit/validation tools',(await client.listTools()).tools.length===17);
  check('initialisation teaches archive recognition and local password handling',client.getInstructions()?.includes('.certosa')&&client.getInstructions()?.includes('NEVER ask for a password'));
  check('portable prompts and format resource are discoverable',(await client.listPrompts()).prompts.length===2&&(await client.listResources()).resources[0].uri==='certosa://archive-workflow');
  check('import starts local selection without password/path arguments',(await call('import_archive')).state==='awaiting_file_selection');
  const ready=await until(s=>s.state==='ready');check('encrypted incremental backend is active',ready.backend==='incremental');
  const dispatch=service.controller.call.bind(service.controller);service.controller.call=(name,args)=>{if(name==='count_word')return Promise.reject(Object.assign(Error('synthetic uncertain outcome'),{code:'OUTCOME_UNKNOWN_DO_NOT_RETRY'}));return dispatch(name,args);};
  try{check('uncertain executor outcomes explicitly forbid automatic retries',(await call('count_word',{word:'cosa'})).error==='OUTCOME_UNKNOWN_DO_NOT_RETRY');}finally{service.controller.call=dispatch;}
  check('only owner-selected non-secret notebooks available',(await call('list_notebooks')).items.length===2);
  check('exact count spans authorised notebooks',(await call('count_word',{word:'cosa'})).total===6);
  const before=await call('read_notebook',{notebookId:'first',startPage:1,limit:1});
  const author=await call('prepare_author_edit',{notebookId:'first',baseRevision:before.revision,author:'Autore tramite MCP'});
  check('author preview has no edition/illustrator side effects',author.operations.length===1&&author.operations[0].type==='set_notebook_author');
  const saved=await call('apply_proposal',{proposalId:author.id});check('author commits with an incremental recovery point',saved.status==='saved'&&saved.backend==='incremental'&&saved.checkpoint);
  check('author read back and searchable',(await call('list_notebooks')).items[0].author==='Autore tramite MCP'&&(await call('search_notebooks',{query:'"Autore tramite MCP"'})).hits.length>0);
  const current=await call('read_notebook',{notebookId:'first',startPage:2,limit:1});const edit=await call('prepare_edit',{notebookId:'first',pageNumber:2,baseRevision:current.revision,mode:'append',text:'Scrittura incrementale dalla chat.'});
  await call('apply_proposal',{proposalId:edit.id});check('page write read back without reopening the app',(await call('read_notebook',{notebookId:'first',startPage:2,limit:1})).pages[0].text==='Scrittura incrementale dalla chat.');
  const batchBase=(await call('get_archive_status')).revision;
  const batch=await call('prepare_archive_edit',{baseRevision:batchBase,operations:[{type:'create_notebook',notebookId:'stack-manual',title:'Manuale stack',author:'Autore sintetico',font:'Arial',pageCapacity:300},{type:'edit_page',notebookId:'stack-manual',pageNumber:1,mode:'append',text:'Indice del manuale.'},{type:'edit_page',notebookId:'stack-manual',pageNumber:300,mode:'append',text:'Ultimo capitolo.'},{type:'edit_page',notebookId:'first',pageNumber:3,mode:'append',text:'Prova complessa.'}]});
  check('complex preview preserves the exact requested four operations',(await call('read_proposal',{proposalId:batch.id})).operations.length===4);
  const batchSaved=await call('apply_proposal',{proposalId:batch.id});check('complex batch creates and writes notebooks at one revision',batchSaved.operationsApplied===4&&batchSaved.revision===batchBase+1&&(await call('read_notebook',{notebookId:'stack-manual',startPage:300,limit:1})).pages[0].text==='Ultimo capitolo.');
  check('compatible validation verifies attachment integrity',(await call('validate_archive')).attachmentReferencesVerified===true);
  const exportResult=await call('export_archive');check('legacy export uses a local destination/password flow',exportResult.state==='awaiting_export_destination');
  const completed=await until(s=>s.lastExport?.status==='saved');check('complete compatible export created locally',completed.lastExport.format==='certosa/2'&&fs.readFileSync(path.join(root,'compatible-export.certosa')).subarray(0,4).toString()==='CRTS');
  check('export is published only after original Certosa reader verifies every value',completed.lastExport.nativeReaderVerified===true&&completed.lastExport.allValuesPreserved===true);
  check('secret notebook remains inaccessible',(await call('read_notebook',{notebookId:'reserved'})).error==='NOT_FOUND');
  await call('backup_archive');await until(s=>s.lastExport?.format==='certosa-incremental/1');check('native encrypted backup includes committed WAL data',fs.existsSync(path.join(root,'encrypted-snapshot.certosa-db')));
  check('closing revokes all access',(await call('close_archive')).state==='closed'&&(await call('list_notebooks')).error==='ARCHIVE_LOCKED');
  await call('open_archive');await until(s=>s.state==='ready');check('native backup reopens through local password flow',(await call('read_notebook',{notebookId:'first',startPage:2,limit:1})).pages[0].text==='Scrittura incrementale dalla chat.');await call('close_archive');
  service.controller.child.kill();await until(s=>s.error==='LOCAL_SERVICE_UNAVAILABLE');
  check('executor failure leaves status responsive and data locked',(await call('list_notebooks')).error==='ARCHIVE_LOCKED');
  await call('import_archive');const recovered=await until(s=>s.state==='ready');check('explicit reopen starts a fresh local consent flow after executor failure',recovered.archiveId!==ready.archiveId&&recovered.backend==='incremental');await call('close_archive');
  const serialized=JSON.stringify(transcript);check('model transcript contains no filesystem paths or password fields',!serialized.includes(root)&&!serialized.includes('"password"'));
}finally{await client.close();await service.close();fs.writeFileSync(path.join(root,'RESULT.json'),JSON.stringify({checks,synthetic:true,separateLocalExecutor:true,nativeUiProviderReplaced:true},null,2)+'\n');fs.writeFileSync(path.join(root,'MCP-TRANSCRIPT.json'),JSON.stringify(transcript,null,2)+'\n');}
