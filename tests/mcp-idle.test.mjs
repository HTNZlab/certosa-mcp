import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {randomBytes} from 'node:crypto';
import {createIdleConsent,createLocalNotebookTools,DEFAULT_IDLE_TTL_MS} from '../src/notebook-tools.mjs';
import {ArchiveRouter} from '../src/archive-router.mjs';
import {LargeArchiveStore} from '../src/large-archive-store.mjs';
import {fixture,packFixture,project} from './archive-fixtures.mjs';
const root=path.join(project,'verifiche/mcp-idle-browser-20261108','unit-'+Date.now());fs.mkdirSync(root,{recursive:true});let serial=0;
const code=(fn,want)=>assert.throws(fn,e=>e.code===want);
test('default is 30 minutes; polling and failed calls do not renew; exact boundary stays closed after clock rollback',()=>{
 let now=0,expired=0;const c=createIdleConsent({now:()=>now,onExpire:()=>expired++});assert.equal(c.expiresAt,1800000);assert.equal(DEFAULT_IDLE_TTL_MS,1800000);
 now=100;c.check();assert.equal(c.expiresAt,1800000);code(()=>c.run(()=>{throw Object.assign(Error(),{code:'FORBIDDEN'});}),'FORBIDDEN');assert.equal(c.expiresAt,1800000);
 now=1800000;code(()=>c.run(()=>true),'SESSION_CLOSED');assert.equal(expired,1);now=0;code(()=>c.run(()=>true),'SESSION_CLOSED');
});
test('in-flight work can finish late, status does not cancel it and new calls cannot borrow its token',async()=>{
 let now=0,resolve;const c=createIdleConsent({ttlMs:10,now:()=>now});now=8;const work=c.run(()=>new Promise(r=>resolve=r));now=11;
 c.check();assert.equal(c.activeOperations,1);code(()=>c.run(()=>true),'SESSION_CLOSED');assert.equal(c.expiresAt,10);assert.equal(c.closed,false);
 now=20;resolve({answer:1});assert.deepEqual(await work,{answer:1});assert.equal(c.expiresAt,30);assert.equal(c.activeOperations,0);assert.equal(c.run(()=>true),true);
});
test('failed late work closes without renewal; revocation vetoes late success; overlapping work uses independent tokens',async()=>{
 let now=0,reject;const c=createIdleConsent({ttlMs:10,now:()=>now});const work=c.run(()=>new Promise((_,r)=>reject=r));now=20;reject(Error('failure'));await assert.rejects(work,/failure/);assert.equal(c.closed,true);assert.equal(c.expiresAt,10);
 let resolve;const d=createIdleConsent({ttlMs:10,now:()=>now});const revoked=d.run(()=>new Promise(r=>resolve=r));d.close();resolve(true);await assert.rejects(revoked,e=>e.code==='SESSION_CLOSED');assert.equal(d.activeOperations,0);
 now=0;let doneA,failB;const e=createIdleConsent({ttlMs:10,now:()=>now});const a=e.run(()=>new Promise(r=>doneA=r)),b=e.run(()=>new Promise((_,r)=>failB=r));now=12;failB(Error('failed B'));await assert.rejects(b,/failed B/);assert.equal(e.closed,false);doneA('A');assert.equal(await a,'A');assert.equal(e.expiresAt,22);
});
test('domain session uses rolling expiry while internal failed operations cannot extend it',async()=>{
 let now=0,resolve;const state={archiveId:'test',revision:1,lib:{series:[{id:'s',label:'S'}],notebooks:[{id:'n',sid:'s',maxPages:40,pages:[null,{html:'A',notes:[]}]}]}};
 const session=createLocalNotebookTools({readState:()=>state,plainText:v=>v,isSystemNotebook:()=>false,searchEntries:()=>new Promise(r=>resolve=r),now:()=>now,newId:()=>String(Math.random())}).openSession({archiveId:'test',notebookIds:['n'],permissions:['read','search','propose_edit'],ttlMs:10});
 now=8;const p=session.prepare_edit({notebookId:'n',pageNumber:2,baseRevision:1,mode:'append',text:'B'});assert.equal(p.expiresAt,18);
 now=16;session.read_notebook({notebookId:'n'});assert.equal(session.idleExpiresAt,26);
 now=20;code(()=>session.read_notebook({notebookId:'forbidden'}),'NOT_FOUND');assert.equal(session.idleExpiresAt,26);
 const preview=session.read_proposal({proposalId:p.id});assert.equal(preview.expiresAt,30);assert.equal(preview.stale,false);
 now=29;const pending=session.search_notebooks({query:'A'});now=45;session.checkConsent();resolve({hits:[]});await pending;assert.equal(session.idleExpiresAt,55);
 session.close();code(()=>session.read_notebook({notebookId:'n'}),'SESSION_CLOSED');
});
async function setup(large,{ttlMs=100,write=true}={}){
 let now=0;const runtime=path.join(root,String(++serial));fs.mkdirSync(runtime);const router=new ArchiveRouter({project:root,runtime,now:()=>now});
 if(large){router.large.adopt(LargeArchiveStore.create(path.join(runtime,'synthetic.certosa-db'),randomBytes(24).toString('hex'),packFixture()));router.active=router.large;}
 else{const data=await fixture(runtime);await router.unlock(data.file,data.password);}
 router.grant({notebookIds:['first'],write,ttlMs});return {r:router,runtime,set:value=>{now=value;}};
}
for(const large of [false,true]){
 test('backend renews only successful use, retains old proposal and never extends grants: '+large,async()=>{
  const {r,set}=await setup(large);try{
   set(80);const p=await r.call('prepare_edit',{notebookId:'first',pageNumber:2,baseRevision:r.status().revision,mode:'append',text:'A'});assert.equal(p.expiresAt,180);
   set(150);await r.call('read_notebook',{notebookId:'first'});assert.equal(r.status().expiresAt,250);
   set(190);await assert.rejects(()=>r.call('read_notebook',{notebookId:'second'}),e=>e.code==='NOT_FOUND');assert.equal(r.status().expiresAt,250);
   const preview=await r.call('read_proposal',{proposalId:p.id});assert.equal(preview.expiresAt,290);assert.equal(preview.stale,false);
   set(260);const saved=await r.call('apply_proposal',{proposalId:p.id});assert.equal(saved.status,'saved');assert.equal(r.status().expiresAt,360);
   set(300);await assert.rejects(()=>r.call('apply_proposal',{proposalId:p.id}),e=>e.code==='HANDLE_SPENT');assert.equal(r.status().expiresAt,360);assert.equal(r.status().notebookCount,1);
   set(360);assert.equal(r.status().state,'closed');set(0);await assert.rejects(()=>r.call('list_notebooks',{}),e=>['ARCHIVE_LOCKED','SESSION_CLOSED'].includes(e.code));
  }finally{r.close();}
 });
 test('workflow structured reads/proposals/validation share expiry without granting writes: '+large,async()=>{
  const {r,set}=await setup(large);try{
   set(90);const blocks=await r.call('read_page_blocks',{notebookId:'first',pageNumber:1});assert.equal(r.status().expiresAt,190);
   set(150);const p=await r.call('prepare_paragraph_edit',{notebookId:'first',pageNumber:1,baseRevision:blocks.revision,operations:[{blockIndex:0,blockHash:blocks.blocks[0].blockHash,textEdits:[{start:0,end:4,expectedText:'Cosa',text:'Idea'}]}]});assert.equal(p.expiresAt,250);
   set(220);assert.equal((await r.call('read_proposal',{proposalId:p.id})).expiresAt,320);
   set(290);await r.call('apply_proposal',{proposalId:p.id});assert.equal(r.status().expiresAt,390);
   set(350);assert.equal((await r.call('validate_archive')).valid,true);assert.equal(r.status().expiresAt,450);
   set(400);await assert.rejects(()=>r.call('apply_proposal',{proposalId:p.id}),e=>e.code==='HANDLE_SPENT');assert.equal(r.status().expiresAt,450);
  }finally{r.close();}
  const readOnly=await setup(large,{write:false});try{readOnly.set(80);await assert.rejects(()=>readOnly.r.call('prepare_edit',{notebookId:'first',pageNumber:2,baseRevision:readOnly.r.status().revision,mode:'append',text:'No'}),e=>e.code==='FORBIDDEN');assert.equal(readOnly.r.status().expiresAt,100);}finally{readOnly.r.close();}
 });
 test('export admitted before expiry finishes late; close prevents publication: '+large,async()=>{
  const {r,set,runtime}=await setup(large);try{
   set(90);const work=r.exportLegacy(path.join(runtime,'late.certosa'),randomBytes(24).toString('hex'));set(150);assert.equal(r.status().state,'ready');await assert.rejects(()=>r.call('list_notebooks',{}),e=>e.code==='SESSION_CLOSED');const saved=await work;assert.equal(saved.nativeReaderVerified,true);assert.equal(r.status().expiresAt,250);
   set(240);const destination=path.join(runtime,'revoked.certosa'),revoked=r.exportLegacy(destination,randomBytes(24).toString('hex'));r.close();await assert.rejects(revoked,e=>e.code==='SESSION_CLOSED');assert.equal(fs.existsSync(destination),false);
  }finally{r.close();}
 });
}
test('incremental backup renews only upon completion and in-place regrant cannot change consent',async()=>{
 const {r,set,runtime}=await setup(true);try{
  const snapshot=r.active.store.snapshot.bind(r.active.store);r.active.store.snapshot=(...args)=>{set(150);return snapshot(...args);};
  set(90);const saved=await r.backup(path.join(runtime,'snapshot.certosa-db'));assert.equal(saved.status,'saved');assert.equal(r.status().expiresAt,250);
  set(240);const target=path.join(runtime,'regrant.certosa'),old=r.exportLegacy(target,randomBytes(24).toString('hex'));code(()=>r.grant({notebookIds:['second'],write:false,ttlMs:100}),'ARCHIVE_IN_USE');assert.equal(r.status().expiresAt,250);r.close();await assert.rejects(old,e=>e.code==='SESSION_CLOSED');assert.equal(fs.existsSync(target),false);
 }finally{r.close();}
});
