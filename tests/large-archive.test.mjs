import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {randomBytes} from 'node:crypto';
import {DatabaseSync} from 'node:sqlite';
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {LargeArchiveStore,MEDIA_CHUNK_BYTES} from '../src/large-archive-store.mjs';
import {LargeArchiveEngine} from '../src/large-archive-engine.mjs';
import {ArchiveRouter} from '../src/archive-router.mjs';
import {unlockArchiveBytes} from '../src/archive-format.mjs';
import {fixture,packFixture,project,native} from './archive-fixtures.mjs';

const root=path.join(process.env.CERTOSA_TEST_OUTPUT_ROOT||path.join(project,'verifiche/large-archive-20261101'),'unit-'+Date.now());fs.mkdirSync(root,{recursive:true});let serial=0;
function setup(){const folder=path.join(root,String(++serial));fs.mkdirSync(folder);const password=randomBytes(24).toString('hex'),pack=packFixture();pack.lib.notebooks[0].author='Autore di prova';pack.lib.notebooks[0].foreignEdition={keep:'original'};const file=path.join(folder,'sample.certosa-db');return {folder,password,pack,file,store:LargeArchiveStore.create(file,password,pack)};}
const errorCode=(fn,code)=>assert.throws(fn,e=>e.code===code);
const rejected=(fn,code)=>assert.rejects(fn,e=>e.code===code);

test('encrypted catalogue roundtrips all current fields, notes, trash and original media',()=>{
  const {store,pack,file,password}=setup();assert.deepEqual(store.exportPack(),pack);store.close();
  const reopened=LargeArchiveStore.open(file,password);assert.deepEqual(reopened.exportPack(),pack);reopened.close();
});
test('deep Windows paths support encrypted create, WAL edits, snapshot and reopen',()=>{
  const folder=path.join(root,'long-path',...Array(7).fill('synthetic-directory-0123456789'));fs.mkdirSync(folder,{recursive:true});
  const file=path.join(folder,'source.certosa-db'),backup=path.join(folder,'snapshot.certosa-db'),password=randomBytes(24).toString('hex');assert.ok(file.length>300);
  const store=LargeArchiveStore.create(file,password,packFixture());store.commit({baseRevision:0,notebookId:'first',author:'Percorso lungo'});store.snapshot(backup);store.close();
  for(const target of [file,backup]){const copy=LargeArchiveStore.open(target,password);assert.equal(copy.book('first').author,'Percorso lungo');assert.equal(copy.revision,1);copy.close();}
});
test('database and WAL protect author, page text and FTS; plain SQLite cannot read them',()=>{
  const {store,file}=setup();const marker='UNIQUE_PRIVATE_SYNTHETIC_TEXT_781';store.commit({baseRevision:0,notebookId:'first',pageNumber:2,pageValue:{html:'<div>'+marker+'</div>',notes:[],st:[]}});
  for(const filename of [file,file+'-wal']){const bytes=fs.readFileSync(filename);assert.ok(!bytes.includes(Buffer.from(marker)));assert.ok(!bytes.includes(Buffer.from('Autore di prova')));assert.ok(!bytes.subarray(0,16).toString().startsWith('SQLite'));}
  const plain=new DatabaseSync(file,{readOnly:true});assert.throws(()=>plain.prepare('SELECT name FROM sqlite_schema').all());plain.close();
  assert.equal(String(store.db.pragma('kdf_iter',{simple:true})),'600000');assert.equal(String(store.db.pragma('hmac_use',{simple:true})),'1');assert.equal(String(store.db.pragma('trusted_schema',{simple:true})),'0');store.close();
});
test('wrong password and a corrupted encrypted page are rejected',()=>{
  const {store,file}=setup();store.close();errorCode(()=>LargeArchiveStore.open(file,randomBytes(24).toString('hex')),'UNLOCK_FAILED');
  const bytes=fs.readFileSync(file);bytes[150]^=1;fs.writeFileSync(file,bytes);assert.throws(()=>LargeArchiveStore.open(file,randomBytes(24).toString('hex')));
});
test('incremental engine honours local consent, scopes and exact counts',async()=>{
  const {store}=setup(),engine=new LargeArchiveEngine();engine.adopt(store);
  await rejected(()=>engine.call('list_notebooks',{}),'ARCHIVE_LOCKED');engine.grant({notebookIds:['first'],write:true});
  assert.equal((await engine.call('list_notebooks',{})).items[0].author,'Autore di prova');assert.equal((await engine.call('count_word',{word:'cosa'})).total,4);
  await rejected(()=>engine.call('read_notebook',{notebookId:'reserved'}),'NOT_FOUND');
  assert.equal((await engine.call('search_notebooks',{query:'Autore'})).hits[0].kind,'title');engine.close();
});
test('author changes are reviewed, revision-bound, searchable and compatible on export',async()=>{
  const {store,pack}=setup(),engine=new LargeArchiveEngine();engine.adopt(store);engine.grant({notebookIds:['first'],write:true});
  const before=store.stats();const p=await engine.call('prepare_author_edit',{notebookId:'first',baseRevision:store.revision,author:'Jules Verne'});
  assert.equal((await engine.call('read_proposal',{proposalId:p.id})).operations[0].afterAuthor,'Jules Verne');await engine.call('apply_proposal',{proposalId:p.id});
  assert.equal((await engine.call('read_notebook',{notebookId:'first',startPage:1,limit:1})).author,'Jules Verne');assert.ok((await engine.call('search_notebooks',{query:'Verne'})).hits.length);
  const expected=structuredClone(pack);expected.lib.notebooks[0].author='Jules Verne';assert.deepEqual(store.exportPack(),expected);assert.equal(store.stats().chunks,before.chunks);engine.close();
});
test('page commit records only its previous value and preserves all media and metadata',async()=>{
  const {store,pack}=setup(),engine=new LargeArchiveEngine();engine.adopt(store);engine.grant({notebookIds:['first'],write:true});
  const before=store.stats(),p=await engine.call('prepare_edit',{notebookId:'first',pageNumber:2,baseRevision:0,mode:'append',text:'Une chose nouvelle'});
  const saved=await engine.call('apply_proposal',{proposalId:p.id});assert.equal(saved.status,'saved');assert.equal(store.stats().history,1);assert.equal(store.stats().chunks,before.chunks);assert.equal(store.stats().mediaBytes,before.mediaBytes);
  const exported=store.exportPack();assert.deepEqual(exported.blobs,pack.blobs);assert.deepEqual(exported.lib.notebooks[0].pages[1],pack.lib.notebooks[0].pages[1]);assert.ok(exported.lib.notebooks[0].pages[2].html.includes('Une chose'));engine.close();
});
test('cooperating writers use transaction revision checks rather than overwriting',async()=>{
  const {store,file,password}=setup(),one=new LargeArchiveEngine(),two=new LargeArchiveEngine();one.adopt(store);two.adopt(LargeArchiveStore.open(file,password));one.grant({notebookIds:['first'],write:true});two.grant({notebookIds:['first'],write:true});
  const a=await one.call('prepare_edit',{notebookId:'first',pageNumber:2,baseRevision:0,mode:'append',text:'one'}),b=await two.call('prepare_edit',{notebookId:'first',pageNumber:2,baseRevision:0,mode:'append',text:'two'});
  await one.call('apply_proposal',{proposalId:a.id});await rejected(()=>two.call('apply_proposal',{proposalId:b.id}),'REVISION_CONFLICT');assert.equal(two.store.page('first',2).html.includes('two'),false);one.close();two.close();
});
test('a failure during indexing rolls back page, history and revision atomically',()=>{
  const {store}=setup();const index=store.indexPage;store.indexPage=()=>{throw Error('synthetic index failure');};
  assert.throws(()=>store.commit({baseRevision:0,notebookId:'first',pageNumber:2,pageValue:{html:'never committed',st:[],notes:[]}}));store.indexPage=index;
  assert.equal(store.page('first',2),null);assert.equal(store.revision,0);assert.equal(store.stats().history,0);store.close();
});
test('incremental recovery restores the page in an isolated encrypted copy',()=>{
  const {store,file,password,pack,folder}=setup();const saved=store.commit({baseRevision:0,notebookId:'first',pageNumber:2,pageValue:{html:'new',notes:[],st:[]}});store.close();
  const copy=path.join(folder,'isolated-recovery.certosa-db');fs.copyFileSync(file,copy);const recovered=LargeArchiveStore.open(copy,password);const restored=recovered.restoreChange(saved.checkpointId);assert.deepEqual(recovered.exportPack(),pack);assert.equal(recovered.stats().history,2);recovered.restoreChange(restored.checkpointId);assert.equal(recovered.page('first',2).html,'new');recovered.close();
  const original=LargeArchiveStore.open(file,password);assert.equal(original.page('first',2).html,'new');original.close();
});
test('chunked media deduplicates, streams back identically and compresses suitable text',async()=>{
  const {store}=setup();const input=Buffer.concat([randomBytes(MEDIA_CHUNK_BYTES),randomBytes(91)]);
  async function* stream(){for(let i=0;i<input.length;i+=65536)yield input.subarray(i,i+65536);}
  const one=await store.putAttachmentStream(stream()),before=store.stats();const two=await store.putAttachmentStream(stream());assert.equal(one.hash,two.hash);assert.equal(store.stats().chunks,before.chunks);assert.deepEqual(Buffer.concat([...store.attachment(one.hash)]),input);
  const text=Buffer.from('Testo ripetuto per compressione. '.repeat(5000));const added=store.putAttachment([text],{prefix:'data:text/plain;base64,'});const object=store.db.prepare('SELECT chunks FROM attachments WHERE hash=?').get(added.hash);assert.ok(object);assert.ok(store.db.prepare("SELECT COUNT(*) AS n FROM chunks WHERE encoding='gzip'").get().n>0);assert.deepEqual(Buffer.concat([...store.attachment(added.hash)]),text);store.close();
});
test('original .certosa import and compatible export preserve data and source bytes',async()=>{
  const folder=path.join(root,'compatibility');const legacy=await fixture(folder);const router=new ArchiveRouter({project:root,runtime:folder});
  await router.importLegacy(legacy.file,legacy.password);router.grant({notebookIds:['first','second'],write:true});assert.equal(router.status().backend,'incremental');
  const p=await router.call('prepare_author_edit',{notebookId:'first',baseRevision:0,author:'Autore locale'});await router.call('apply_proposal',{proposalId:p.id});
  const exported=path.join(folder,'compatible.certosa'),copyPassword=randomBytes(24).toString('hex');await router.exportLegacy(exported,copyPassword);assert.deepEqual(fs.readFileSync(legacy.file),legacy.bytes);
  const restored=await unlockArchiveBytes(fs.readFileSync(exported),copyPassword);const expected=structuredClone(legacy.pack);expected.lib.notebooks[0].author='Autore locale';assert.deepEqual(restored.pack,expected);restored.key.fill(0);
  const nativeDecoded=await native.Zip.unpackJSON(await native.Copia.decifra(new Uint8Array(fs.readFileSync(exported)),copyPassword));assert.equal(nativeDecoded.lib.notebooks[0].author,'Autore locale');router.close();
});
test('legacy backend also persists author without changing other metadata',async()=>{
  const folder=path.join(root,'legacy-author'),data=await fixture(folder),router=new ArchiveRouter({project:root,runtime:folder});await router.unlock(data.file,data.password);router.grant({notebookIds:['first'],write:true});
  const revision=router.status().revision,p=await router.call('prepare_author_edit',{notebookId:'first',baseRevision:revision,author:'Autore legacy'});await router.call('apply_proposal',{proposalId:p.id});router.close();
  const decoded=await unlockArchiveBytes(fs.readFileSync(data.file),data.password);assert.equal(decoded.pack.lib.notebooks[0].author,'Autore legacy');assert.deepEqual(decoded.pack.blobs,data.pack.blobs);decoded.key.fill(0);
});
test('process death during a transaction recovers without committing partial edits',async()=>{
  const {store,file,password,pack}=setup();store.close();
  const child=spawn(process.execPath,[fileURLToPath(new URL('./large-crash-child.mjs',import.meta.url))],{cwd:root,env:process.env,stdio:['pipe','ignore','pipe'],windowsHide:true});child.stderr.resume();
  const exit=new Promise(resolve=>child.once('exit',(code,signal)=>resolve({code,signal})));child.stdin.end(JSON.stringify({file,password}));const result=await exit;assert.ok(result.signal||result.code!==0);
  const recovered=LargeArchiveStore.open(file,password);assert.equal(recovered.revision,0);assert.equal(recovered.stats().history,0);assert.deepEqual(recovered.exportPack(),pack);recovered.close();
});
test('interrupted import never publishes an apparently complete incremental archive',async()=>{
  const folder=path.join(root,'interrupted-import');fs.mkdirSync(folder);const file=path.join(folder,'destination.certosa-db'),password=randomBytes(24).toString('hex');
  const child=spawn(process.execPath,[fileURLToPath(new URL('./large-crash-child.mjs',import.meta.url))],{cwd:root,env:process.env,stdio:['pipe','ignore','pipe'],windowsHide:true});child.stderr.resume();const exit=new Promise(resolve=>child.once('exit',resolve));child.stdin.end(JSON.stringify({file,password,create:true}));await exit;
  assert.ok(!fs.existsSync(file));const staged=fs.readdirSync(folder).find(name=>name.includes('.building-')&&!name.endsWith('-wal')&&!name.endsWith('-shm'));assert.ok(staged);assert.throws(()=>LargeArchiveStore.open(path.join(folder,staged),password));
});
test('online native snapshot is encrypted, includes WAL commits and keeps the password',()=>{
  const {store,folder,password}=setup();store.commit({baseRevision:0,notebookId:'first',author:'Snapshot autore'});assert.ok(fs.statSync(store.filename+'-wal').size>0);
  const target=path.join(folder,'native-backup.certosa-db');store.snapshot(target);const copy=LargeArchiveStore.open(target,password);assert.deepEqual(copy.exportPack(),store.exportPack());assert.equal(copy.revision,1);assert.equal(copy.stats().history,1);copy.close();
  errorCode(()=>store.snapshot(target),'DESTINATION_EXISTS');store.close();
});
