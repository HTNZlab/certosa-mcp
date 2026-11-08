import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {randomBytes} from 'node:crypto';
import {ArchiveRouter} from '../src/archive-router.mjs';
import {LargeArchiveStore} from '../src/large-archive-store.mjs';
import {validateCompatiblePack,verifyNativeExport} from '../src/archive-validation.mjs';
import {fixture,packFixture,project} from './archive-fixtures.mjs';
const root=path.join(process.env.CERTOSA_TEST_OUTPUT_ROOT||path.join(project,'verifiche/installable-connector-20261101'),'workflow-'+Date.now());fs.mkdirSync(root,{recursive:true});let serial=0;
async function setup(large=true,allowCreate=true,notebookIds=['first','second']){const runtime=path.join(root,String(++serial));fs.mkdirSync(runtime);const router=new ArchiveRouter({project:root,runtime});if(large){router.large.adopt(LargeArchiveStore.create(path.join(runtime,'test.certosa-db'),randomBytes(24).toString('hex'),packFixture()));router.active=router.large;}else{const f=await fixture(runtime);await router.unlock(f.file,f.password);}router.grant({notebookIds,write:true,allowCreate});return router;}
const batch=(r,operations)=>r.call('prepare_archive_edit',{baseRevision:r.status().revision,operations});
const page=(id,n,text)=>({type:'edit_page',notebookId:id,pageNumber:n,mode:'append',text});
for(const large of [false,true])test('atomic complex edits and creations retain notes/media and export through native reader: '+(large?'incremental':'legacy'),async()=>{
 const r=await setup(large);try{const before=await r.call('read_notebook',{notebookId:'first',startPage:1,limit:1}),rev=r.status().revision;
 const p=await batch(r,[{type:'create_notebook',notebookId:'new-book',title:'Manuale di prova',pageCapacity:300,author:'Autore',font:'Arial'},page('new-book',1,'Indice: capitolo uno.'),page('new-book',300,'Ultima pagina.'),page('first',1,'\nAppunto nuovo.'),{type:'set_notebook',notebookId:'first',author:'Nuovo autore',pageCapacity:80,font:'Arial'},page('first',80,'Pagina ampliata.')]);
 assert.equal((await r.call('read_proposal',{proposalId:p.id})).operations.length,6);const saved=await r.call('apply_proposal',{proposalId:p.id});assert.equal(saved.revision,rev+1);assert.equal(saved.operationsApplied,6);
 assert.equal((await r.call('read_notebook',{notebookId:'new-book',startPage:300,limit:1})).pages[0].text,'Ultima pagina.');const after=await r.call('read_notebook',{notebookId:'first',startPage:1,limit:1});assert.deepEqual(after.pages[0].notes,before.pages[0].notes);assert.ok(after.pages[0].text.endsWith('Appunto nuovo.'));
 assert.equal((await r.call('validate_archive')).valid,true);const target=path.join(root,'compatible-'+serial+'.certosa'),password=randomBytes(24).toString('hex'),report=await r.exportLegacy(target,password);assert.equal(report.nativeReaderVerified,true);assert.equal(report.allValuesPreserved,true);
 await assert.rejects(()=>r.call('apply_proposal',{proposalId:p.id}),e=>e.code==='HANDLE_SPENT');}finally{r.close();}
});
test('creation requires its own local grant and forbidden batches leave every page untouched',async()=>{
 const r=await setup(true,false);try{await assert.rejects(()=>r.call('prepare_archive_edit',{baseRevision:0,operations:[{type:'create_notebook',notebookId:'new',title:'New',pageCapacity:40}]}),e=>e.code==='CREATE_NOT_AUTHORISED');await assert.rejects(()=>r.call('prepare_archive_edit',{baseRevision:0,operations:[page('first',2,'safe'),page('reserved',1,'never')]}),e=>e.code==='NOT_FOUND');assert.equal(r.status().revision,0);assert.equal(r.active.store.page('first',2),null);}finally{r.close();}
});
test('failure halfway through a batch rolls back catalogue, pages, index, history and revision',async()=>{
 const r=await setup();try{const store=r.active.store,before=store.exportPack(),p=await batch(r,[{type:'create_notebook',notebookId:'new',title:'new',pageCapacity:40},page('first',2,'one'),page('second',2,'two')]),original=store.indexPage;let calls=0;store.indexPage=(...args)=>{if(++calls===2)throw Error('synthetic failure');return original.apply(store,args);};
 await assert.rejects(()=>r.call('apply_proposal',{proposalId:p.id}));store.indexPage=original;assert.deepEqual(store.exportPack(),before);assert.equal(store.stats().history,0);assert.equal(store.revision,0);assert.equal(store.book('new'),null);assert.equal((await r.call('search_notebooks',{query:'one'})).hits.length,0);}finally{r.close();}
});
test('stale batches and duplicate operations cannot overwrite later edits',async()=>{
 const r=await setup();try{await assert.rejects(()=>r.call('prepare_archive_edit',{baseRevision:0,operations:[page('first',2,'a'),page('first',2,'b')]}),e=>e.code==='DUPLICATE_OPERATION');const stale=await batch(r,[page('first',2,'stale')]),fresh=await r.call('prepare_edit',{notebookId:'second',pageNumber:2,baseRevision:0,mode:'append',text:'fresh'});await r.call('apply_proposal',{proposalId:fresh.id});await assert.rejects(()=>r.call('apply_proposal',{proposalId:stale.id}),e=>e.code==='REVISION_CONFLICT');assert.equal(r.active.store.page('first',2),null);}finally{r.close();}
});
test('compatible validation rejects missing media and native mismatch before publication',async()=>{
 const pack=packFixture();delete pack.blobs[Object.keys(pack.blobs)[0]];assert.throws(()=>validateCompatiblePack(pack),e=>e.code==='MISSING_ATTACHMENT');
 const r=await setup(false);try{const password=randomBytes(24).toString('hex'),target=path.join(root,'mismatch.certosa');await r.exportLegacy(target,password);const wrong=packFixture();await assert.rejects(()=>verifyNativeExport(fs.readFileSync(target),password,wrong),e=>e.code==='EXPORT_READBACK_MISMATCH');}finally{r.close();}
});
test('read-only and expiry revoke complex proposals and creation',async()=>{
 const r=await setup();try{const p=await batch(r,[page('first',2,'pending')]);r.active.session.expiresAt=0;await assert.rejects(()=>r.call('apply_proposal',{proposalId:p.id}),e=>['SESSION_CLOSED','ARCHIVE_LOCKED'].includes(e.code));}finally{r.close();}
});
test('compatible export rejects a concurrent edit before publication',async()=>{
 const r=await setup();try{const target=path.join(root,'stale-export.certosa'),pending=r.exportLegacy(target,randomBytes(24).toString('hex'));const p=await batch(r,[page('first',2,'new revision')]);await r.call('apply_proposal',{proposalId:p.id});await assert.rejects(()=>pending,e=>e.code==='REVISION_CONFLICT');assert.equal(fs.existsSync(target),false);}finally{r.close();}
});
test('native application import planner rejects conflicting volume metadata',async()=>{
 const pack=packFixture();pack.lib.notebooks[0].vol=0;assert.throws(()=>validateCompatiblePack(pack),e=>e.code==='INCOMPATIBLE_IMPORT');
 const r=await setup();try{await assert.rejects(()=>batch(r,[{type:'create_notebook',notebookId:'duplicate-title',title:'Usi Interessanti',pageCapacity:40}]),e=>e.code==='DUPLICATE_SERIES');assert.equal(r.status().revision,0);}finally{r.close();}
});
for(const large of [false,true])test('creation-only local grant can add a first notebook without granting existing ones: '+large,async()=>{
 const r=await setup(large,true,[]);try{assert.equal((await r.call('list_notebooks',{})).items.length,0);
 const p=await batch(r,[{type:'create_notebook',notebookId:'first-new',title:'Primo quaderno',pageCapacity:40},page('first-new',1,'Prima pagina.')]);await r.call('apply_proposal',{proposalId:p.id});assert.equal((await r.call('list_notebooks',{})).items.length,1);assert.equal((await r.call('read_notebook',{notebookId:'first-new',startPage:1,limit:1})).pages[0].text,'Prima pagina.');await assert.rejects(()=>r.call('read_notebook',{notebookId:'first'}),e=>e.code==='NOT_FOUND');}finally{r.close();}
});
