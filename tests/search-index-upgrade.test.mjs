import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {plainText,SEARCH_TEXT_VERSION} from '../src/archive-text.mjs';
import {LargeArchiveStore} from '../src/large-archive-store.mjs';
import {ArchiveRouter} from '../src/archive-router.mjs';
import {fixture,packFixture,project} from './archive-fixtures.mjs';
const root=path.join(project,'verifiche/debug-writing-mcp-20261108/mcp-search-index','tests-'+Date.now());fs.mkdirSync(root,{recursive:true});let serial=0;
const password='password';
function pack(){const p=packFixture();p.lib.notebooks[0].pages[1].html='<p>Prima</p><p>Seconda</p><div>Pro<b>get</b>to CAFÈ</div>';p.lib.notebooks[0].pages[1].notes=[{id:'note',html:'<p>Nota</p><p>Separata</p>'}];return p;}
function setup(){const folder=path.join(root,String(++serial));fs.mkdirSync(folder);const file=path.join(folder,'synthetic.certosa-db'),value=pack(),store=LargeArchiveStore.create(file,password,value);return {folder,file,store,value};}
const rows=store=>store.statement('SELECT * FROM documents ORDER BY id').all();
function content(store){return Object.fromEntries(['pages','notebooks','chunks','attachments','history'].map(table=>[table,store.statement('SELECT * FROM '+table).all()]).concat([['meta',store.statement("SELECT * FROM meta WHERE key<>'searchIndex' ORDER BY key").all()]]));}
function oldIndex(store,marker){store.statement("UPDATE documents SET text='PrimaSecondaProgetto CAFÈ' WHERE notebook='first' AND kind='page' AND page=1").run();store.statement("UPDATE documents SET text='NotaSeparata' WHERE notebook='first' AND kind='note' AND page=1").run();if(marker)store.setMeta('searchIndex',marker);else store.statement("DELETE FROM meta WHERE key='searchIndex'").run();}
function routerFor(store,folder,write=false){const r=new ArchiveRouter({project:root,runtime:folder});r.large.adopt(store);r.active=r.large;r.grant({notebookIds:['first'],write});return r;}
async function expectSearch(r){for(const query of ['Prima','Seconda','PROGETTO','cafe','Nota','Separata'])assert.equal((await r.call('search_notebooks',{query})).hits.length,1,query);for(const query of ['PrimaSeconda','NotaSeparata'])assert.equal((await r.call('search_notebooks',{query})).hits.length,0,query);for(const word of ['Prima','Seconda','Nota','Separata'])assert.equal((await r.call('count_word',{word})).total,1,word);}
test('extractor preserves inline words and separates the same block elements as advanced frontend',()=>{
 for(const tag of ['p','div','li','h1','h2','h3','blockquote','tr']){
  const h=tag==='tr'?'<table><tr><td>Prima</td></tr><tr><td>Seconda</td></tr></table>':`<${tag}>Prima</${tag}><${tag}>Seconda</${tag}>`;
  assert.equal(plainText(h),'Prima\nSeconda',tag);
 }
 assert.equal(plainText('<p>Pro<b>get</b>to &amp; caffè</p>'),'Progetto & caffè');
});
test('legacy archive search and count respect paragraph boundaries without content writes',async()=>{
 const folder=path.join(root,String(++serial)),f=await fixture(folder,pack()),r=new ArchiveRouter({project:root,runtime:folder});try{await r.unlock(f.file,f.password);r.grant({notebookIds:['first'],write:false});await expectSearch(r);assert.deepEqual(fs.readFileSync(f.file),f.bytes);}finally{r.close();}
});
for(const marker of [undefined,{textVersion:1,revision:0},{textVersion:SEARCH_TEXT_VERSION,revision:-1}])test('opening an old index updates only derived data, marker '+JSON.stringify(marker),async()=>{
 const {folder,file,store}=setup();oldIndex(store,marker);const before=content(store),exported=store.exportPack();store.close();const upgraded=LargeArchiveStore.open(file,password),r=routerFor(upgraded,folder);
 try{assert.deepEqual(content(upgraded),before);assert.deepEqual(upgraded.exportPack(),exported);assert.deepEqual(upgraded.getMeta('searchIndex'),{textVersion:SEARCH_TEXT_VERSION,revision:0});assert.equal(upgraded.ensureSearchIndex(),false);await expectSearch(r);assert.equal(r.status().writeAllowed,false);await assert.rejects(()=>r.call('prepare_edit',{notebookId:'first',pageNumber:1,baseRevision:0,mode:'append',text:'forbidden'}),e=>e.code==='FORBIDDEN');assert.deepEqual(content(upgraded),before);}finally{r.close();}
});
test('an interrupted opening rebuild rolls back the entire old index and all content',()=>{
 const {file,store}=setup();oldIndex(store);const before=content(store),documents=rows(store),original=LargeArchiveStore.prototype.indexPage;let calls=0;
 try{LargeArchiveStore.prototype.indexPage=function(...args){if(++calls===2)throw Error('synthetic rebuild failure');return original.apply(this,args);};assert.throws(()=>LargeArchiveStore.open(file,password),/synthetic rebuild failure/);}
 finally{LargeArchiveStore.prototype.indexPage=original;}
 try{assert.deepEqual(content(store),before);assert.deepEqual(rows(store),documents);assert.equal(store.getMeta('searchIndex'),undefined);assert.equal(store.statement("SELECT COUNT(*) AS n FROM documents_fts WHERE documents_fts MATCH 'PrimaSecondaProgetto'").get().n,1);const upgraded=LargeArchiveStore.open(file,password);assert.deepEqual(content(upgraded),before);assert.equal(upgraded.statement("SELECT COUNT(*) AS n FROM documents_fts WHERE documents_fts MATCH 'Prima'").get().n,1);upgraded.close();}finally{store.close();}
});
test('an older writer revision is detected by search and count during a read-only session',async()=>{
 const {folder,store}=setup(),r=routerFor(store,folder);try{
  const marker=store.getMeta('searchIndex'),page=store.page('first',1);page.html+='<p>Nuova</p><p>Voce</p>';store.commit({baseRevision:0,notebookId:'first',pageNumber:1,pageValue:page});oldIndex(store,marker);store.statement("UPDATE documents SET text='PrimaSecondaProgetto CAFÈNuovaVoce' WHERE notebook='first' AND kind='page' AND page=1").run();
  const before=content(store);assert.equal((await r.call('search_notebooks',{query:'Nuova'})).hits.length,1);assert.deepEqual(content(store),before);assert.deepEqual(store.getMeta('searchIndex'),{textVersion:SEARCH_TEXT_VERSION,revision:1});
  oldIndex(store,marker);assert.equal((await r.call('count_word',{word:'Seconda'})).total,1);assert.deepEqual(content(store),before);assert.equal(r.status().writeAllowed,false);
 }finally{r.close();}
});
test('new commits, recovery and workflow batches keep the index revision in the content transaction',async()=>{
 const {folder,store}=setup(),r=routerFor(store,folder,true);try{
  const saved=store.commit({baseRevision:0,notebookId:'first',pageNumber:2,pageValue:{html:'<p>Terza</p><p>Quarta</p>',notes:[],st:[]}});assert.equal(store.getMeta('searchIndex').revision,1);store.restoreChange(saved.checkpointId);assert.equal(store.getMeta('searchIndex').revision,2);
  const p=await r.call('prepare_archive_edit',{baseRevision:2,operations:[{type:'edit_page',notebookId:'first',pageNumber:2,mode:'append',text:'Quinta'},{type:'set_notebook',notebookId:'first',author:'Nuovo Autore'}]});await r.call('apply_proposal',{proposalId:p.id});assert.equal(store.getMeta('searchIndex').revision,3);assert.equal(store.ensureSearchIndex(),false);assert.equal((await r.call('search_notebooks',{query:'Quinta'})).hits.length,1);
 }finally{r.close();}
});
test('a failed commit rolls back an accompanying index upgrade as well as page/history/revision',()=>{
 const {store}=setup();oldIndex(store);const before=content(store),documents=rows(store),original=store.indexPage;
 try{store.indexPage=function(id,number){if(number===3)throw Error('synthetic commit failure');return original.call(this,id,number);};assert.throws(()=>store.commit({baseRevision:0,notebookId:'first',pageNumber:3,pageValue:{html:'<p>Never</p>',st:[],notes:[]}}),/synthetic commit failure/);assert.deepEqual(content(store),before);assert.deepEqual(rows(store),documents);assert.equal(store.getMeta('searchIndex'),undefined);}finally{store.indexPage=original;store.close();}
});
