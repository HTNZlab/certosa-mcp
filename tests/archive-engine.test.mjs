import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {randomBytes} from 'node:crypto';
import {ArchiveEngine} from '../src/archive-engine.mjs';
import {ArchiveController} from '../src/archive-controller.mjs';
import {unlockArchiveBytes,encryptArchive,hashBytes,validateArchive} from '../src/archive-format.mjs';
import {plainText} from '../src/archive-text.mjs';
import {fixture,packFixture,native,project} from './archive-fixtures.mjs';

const root=path.join(project,'verifiche/archive-engine-20261101','unit-'+Date.now());fs.mkdirSync(root,{recursive:true});
let serial=0;
async function setup(options={}){
  const folder=path.join(root,String(++serial)),data=await fixture(folder);
  const engine=new ArchiveEngine({project:root,backupDirectory:path.join(folder,'backups'),...options});
  await engine.unlock(data.file,data.password);
  return {...data,engine,folder};
}
const rejectsCode=(fn,code)=>assert.rejects(fn,e=>e.code===code);
const throwsCode=(fn,code)=>assert.throws(fn,e=>e.code===code);

test('CRTS2 interoperates both ways with the actual native Zip and Copia',async()=>{
  const data=await fixture(path.join(root,'format'));const unlocked=await unlockArchiveBytes(data.bytes,data.password);
  assert.deepEqual(unlocked.pack,data.pack);
  const encrypted=encryptArchive(unlocked.pack,unlocked);
  assert.notDeepEqual(encrypted,data.bytes);
  const plain=await native.Copia.decifra(new Uint8Array(encrypted),data.password);
  assert.deepEqual(JSON.parse(JSON.stringify(await native.Zip.unpackJSON(plain))),data.pack);unlocked.key.fill(0);
});
test('wrong password and authenticated-header/ciphertext tampering are rejected',async()=>{
  const data=await fixture(path.join(root,'tamper'));
  await rejectsCode(()=>unlockArchiveBytes(data.bytes,randomBytes(20).toString('hex')),'UNLOCK_FAILED');
  for(const index of [12,30,data.bytes.length-2]){const copy=Buffer.from(data.bytes);copy[index]^=1;await rejectsCode(()=>unlockArchiveBytes(copy,data.password),'UNLOCK_FAILED');}
});
test('invalid attachments, duplicate IDs and malformed archives are rejected',()=>{
  const bad=packFixture();bad.lib.notebooks.push(structuredClone(bad.lib.notebooks[0]));throwsCode(()=>validateArchive(bad),'INVALID_ARCHIVE');
  const missing=packFixture();const key=Object.keys(missing.blobs)[0];missing.blobs[key]='data:image/png;base64,AAAA';throwsCode(()=>validateArchive(missing),'INVALID_ATTACHMENT');
  throwsCode(()=>validateArchive({lib:{}}),'INVALID_ARCHIVE');
});
test('HTML remains data: entities decoded, formatting text preserved, scripts excluded',()=>{
  assert.equal(plainText('<div>A &amp; B<br><b>cosa</b></div><script>secret()</script>'),'A & B\ncosa');
});
test('no access before owner grant and no secret notebook grant',async()=>{
  const {engine}=await setup();await rejectsCode(()=>engine.call('list_notebooks',{}),'ARCHIVE_LOCKED');
  assert.equal(engine.status().state,'awaiting_consent');engine.close();
  const data=await setup();throwsCode(()=>data.engine.grant({notebookIds:['reserved'],write:true}),'INVALID_GRANT');data.engine.close();
});
test('selected notebook scope excludes unselected, secret and trash',async()=>{
  const {engine}=await setup();engine.grant({notebookIds:['first']});
  assert.equal((await engine.call('list_notebooks',{})).items.length,1);
  await rejectsCode(()=>engine.call('read_notebook',{notebookId:'second'}),'NOT_FOUND');
  await rejectsCode(()=>engine.call('read_notebook',{notebookId:'reserved'}),'NOT_FOUND');
  const count=await engine.call('count_word',{word:'cosa'});assert.equal(count.total,4);
  assert.equal((await engine.call('count_word',{word:'Cosa',caseSensitive:true})).total,1);engine.close();
});
test('whole-archive exact count includes notes and excludes title/secret/trash',async()=>{
  const {engine}=await setup();engine.grant({notebookIds:['first','second']});
  assert.equal((await engine.call('count_word',{word:'cosa'})).total,6);
  const hits=await engine.call('search_notebooks',{query:'annotata'});assert.equal(hits.hits[0].kind,'note');
  engine.close();
});
test('read-only grant cannot prepare or apply writes',async()=>{
  const {engine}=await setup();engine.grant({notebookIds:['first']});
  await rejectsCode(()=>engine.call('prepare_edit',{notebookId:'first',pageNumber:2,baseRevision:engine.revision,mode:'append',text:'test'}),'FORBIDDEN');
  await rejectsCode(()=>engine.call('apply_proposal',{proposalId:'anything'}),'FORBIDDEN');engine.close();
});
test('encrypted save preserves attachments, notes, unknown fields and a recovery copy',async()=>{
  const {engine,file,password,pack,bytes,folder}=await setup();engine.grant({notebookIds:['first','second'],write:true});
  const proposal=await engine.call('prepare_edit',{notebookId:'first',pageNumber:2,baseRevision:engine.revision,mode:'append',text:'Une note française <script>non exécutée</script>'});
  assert.equal((await engine.call('read_proposal',{proposalId:proposal.id})).stale,false);
  const saved=await engine.call('apply_proposal',{proposalId:proposal.id});assert.equal(saved.status,'saved');
  assert.deepEqual(fs.readFileSync(path.join(folder,'backups',saved.checkpointId+'.certosa')),bytes);
  const reopened=await unlockArchiveBytes(fs.readFileSync(file),password);
  const candidate=structuredClone(pack);candidate.lib.notebooks[0].pages[2]=reopened.pack.lib.notebooks[0].pages[2];assert.deepEqual(reopened.pack,candidate);
  assert.ok(!fs.readFileSync(file).includes(Buffer.from('Une note')));
  const key=engine.material.key;engine.close();assert.ok(key.every(value=>value===0));assert.ok(!fs.existsSync(file+'.lock'));
  assert.ok(reopened.pack.lib.notebooks[0].pages[2].html.includes('&lt;script&gt;'));reopened.key.fill(0);
});
test('a proposal is single use',async()=>{
  const {engine}=await setup();engine.grant({notebookIds:['first'],write:true});
  const p=await engine.call('prepare_edit',{notebookId:'first',pageNumber:2,baseRevision:engine.revision,mode:'append',text:'test'});await engine.call('apply_proposal',{proposalId:p.id});
  await rejectsCode(()=>engine.call('apply_proposal',{proposalId:p.id}),'HANDLE_SPENT');engine.close();
});
test('external file change is detected before any overwrite',async()=>{
  const {engine,file}=await setup();engine.grant({notebookIds:['first'],write:true});
  const p=await engine.call('prepare_edit',{notebookId:'first',pageNumber:2,baseRevision:engine.revision,mode:'append',text:'test'});
  const outside=Buffer.from('external writer changed this file');fs.writeFileSync(file,outside);
  await rejectsCode(()=>engine.call('apply_proposal',{proposalId:p.id}),'REVISION_CONFLICT');assert.deepEqual(fs.readFileSync(file),outside);engine.close();
});
test('two engines cannot obtain concurrent write sessions',async()=>{
  const {engine,file,password,folder}=await setup();engine.grant({notebookIds:['first'],write:true});
  const other=new ArchiveEngine({project:root,backupDirectory:path.join(folder,'other-backups')});await other.unlock(file,password);
  throwsCode(()=>other.grant({notebookIds:['first'],write:true}),'ARCHIVE_IN_USE');engine.close();other.grant({notebookIds:['first'],write:true});other.close();
});
test('failed replacement keeps original bytes and does not confirm a save',async()=>{
  const io={...fs,renameSync(){const error=Error('test');error.code='EACCES';throw error;}};
  const {engine,file,bytes,folder}=await setup({io});engine.grant({notebookIds:['first'],write:true});
  const p=await engine.call('prepare_edit',{notebookId:'first',pageNumber:2,baseRevision:engine.revision,mode:'append',text:'NEVER SAVED'});
  await rejectsCode(()=>engine.call('apply_proposal',{proposalId:p.id}),'SAVE_FAILED');assert.deepEqual(fs.readFileSync(file),bytes);
  assert.ok(!JSON.stringify(engine.material.pack).includes('NEVER SAVED'));assert.ok(!fs.readdirSync(folder).some(name=>name.includes('.write-')));engine.close();
});
test('expiry locks the archive and releases its cooperative lock',async()=>{
  let clock=0;const {engine,file}=await setup({now:()=>clock});engine.grant({notebookIds:['first'],write:true,ttlMs:10});clock=11;
  assert.equal(engine.status().state,'closed');assert.equal(engine.material,null);assert.ok(!fs.existsSync(file+'.lock'));
});
test('closing during derivation cannot resurrect the key or archive',async()=>{
  const {engine,file,password}=await setup();engine.close();const pending=engine.unlock(file,password);engine.close();
  await rejectsCode(()=>pending,'SESSION_CLOSED');assert.equal(engine.material,null);
});
test('legacy clear export is read and saved encrypted using the same current format',async()=>{
  const {engine,file,password,pack}=await setup();engine.close();fs.writeFileSync(file,await native.Zip.packJSON(pack));await engine.unlock(file,password);engine.grant({notebookIds:['first'],write:true});
  const p=await engine.call('prepare_edit',{notebookId:'first',pageNumber:2,baseRevision:engine.revision,mode:'append',text:'legacy protected'});await engine.call('apply_proposal',{proposalId:p.id});
  assert.equal(fs.readFileSync(file).subarray(0,4).toString(),'CRTS');engine.close();const opened=await unlockArchiveBytes(fs.readFileSync(file),password);assert.ok(opened.pack.lib.notebooks[0].pages[2].html.includes('legacy protected'));opened.key.fill(0);
});
test('selected files outside the approved project are rejected',async()=>{
  const data=await fixture(path.join(root,'outside'));const scope=path.join(root,'scope');fs.mkdirSync(scope);
  const engine=new ArchiveEngine({project:scope,backupDirectory:path.join(scope,'backups')});
  await rejectsCode(()=>engine.unlock(data.file,data.password),'ARCHIVE_OUTSIDE_PROJECT');
});
test('opening is asynchronous and consent is required after local unlock',async()=>{
  const data=await fixture(path.join(root,'controller'));let grantResolve;
  const ui={cancel(){},async ask(mode){if(mode==='choose')return {path:data.file};if(mode==='unlock')return {password:data.password};return new Promise(resolve=>grantResolve=resolve);}};
  const controller=new ArchiveController({project:root,runtime:path.dirname(data.file),ui});
  assert.equal(controller.open().state,'awaiting_file_selection');
  for(let i=0;i<100&&!grantResolve;i++)await new Promise(resolve=>setTimeout(resolve,10));
  assert.equal(controller.status().state,'awaiting_local_consent');assert.equal(controller.engine.session,null);
  grantResolve({notebookIds:['first'],write:true});await new Promise(resolve=>setTimeout(resolve,10));
  assert.equal(controller.status().state,'ready');assert.ok(!JSON.stringify(controller.status()).includes(data.password));controller.close();
});
test('three incorrect local passwords fail closed with a fixed local notice',async()=>{
  const data=await fixture(path.join(root,'wrong-local-password'));let notice,attempts=0;
  const ui={cancel(){},async notice(code){notice=code;},async ask(mode){if(mode==='choose')return {path:data.file};attempts++;return {password:randomBytes(24).toString('hex')};}};
  const controller=new ArchiveController({project:root,runtime:path.dirname(data.file),ui});controller.open();
  for(let i=0;i<200&&controller.opening;i++)await new Promise(resolve=>setTimeout(resolve,10));
  assert.equal(attempts,3);assert.equal(notice,'UNLOCK_FAILED');assert.equal(controller.status().state,'closed');assert.equal(controller.engine.material,null);controller.close();
});
test('local cancellation does not unlock, grant or change the archive',async()=>{
  const ui={cancel(){},async ask(){return {cancelled:true};}};
  const controller=new ArchiveController({project:root,runtime:root,ui});controller.open();await new Promise(resolve=>setTimeout(resolve,10));
  assert.equal(controller.status().state,'closed');assert.equal(controller.engine.material,null);assert.equal(controller.status().error,undefined);controller.close();
});
test('junction escape is rejected before creating a backup directory',async()=>{
  const scope=path.join(root,'junction-scope'),outside=path.join(root,'junction-outside');fs.mkdirSync(scope);fs.mkdirSync(outside);
  const link=path.join(scope,'linked');fs.symlinkSync(outside,link,process.platform==='win32'?'junction':'dir');
  throwsCode(()=>new ArchiveEngine({project:scope,backupDirectory:path.join(link,'must-not-exist')}),'PROJECT_PATH_REQUIRED');
  assert.ok(!fs.existsSync(path.join(outside,'must-not-exist')));
});
test('explicit local import works on a confined encrypted copy and preserves outside original',async()=>{
  const data=await fixture(path.join(root,'import-source'));const scope=path.join(root,'import-scope');fs.mkdirSync(scope);
  const engine=new ArchiveEngine({project:scope,backupDirectory:path.join(scope,'backups')});
  await engine.unlock(data.file,data.password,{importDirectory:path.join(scope,'archives')});
  engine.grant({notebookIds:['first'],write:true});assert.equal(engine.status().workingCopy,true);
  const p=await engine.call('prepare_edit',{notebookId:'first',pageNumber:2,baseRevision:engine.revision,mode:'append',text:'imported copy only'});await engine.call('apply_proposal',{proposalId:p.id});
  assert.deepEqual(fs.readFileSync(data.file),data.bytes);assert.ok(engine.filename.startsWith(scope+path.sep));engine.close();
});
test('importing a historical clear export never writes a clear working copy',async()=>{
  const data=await fixture(path.join(root,'clear-import-source'));fs.writeFileSync(data.file,await native.Zip.packJSON(data.pack));const original=fs.readFileSync(data.file);
  const scope=path.join(root,'clear-import-scope');fs.mkdirSync(scope);const engine=new ArchiveEngine({project:scope,backupDirectory:path.join(scope,'backups')});
  await engine.unlock(data.file,data.password,{importDirectory:path.join(scope,'archives')});
  assert.equal(fs.readFileSync(engine.filename).subarray(0,4).toString(),'CRTS');assert.deepEqual(fs.readFileSync(data.file),original);engine.close();
});
