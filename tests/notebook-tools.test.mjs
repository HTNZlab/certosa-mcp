import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {createLocalNotebookTools} from '../src/notebook-tools.mjs';

// Reuse Certosa's real search implementation, not a second search catalogue.
const window={};
vm.runInNewContext(fs.readFileSync(new URL('../test-support/search-engine.html',import.meta.url),'utf8').match(/<script>([\s\S]*?)<\/script>/)[1],{window,setTimeout});
const searchEntries=(entries,query)=>{const parsed=window.CertosaSearchEngine.parse(query);if(parsed.error)throw Error(parsed.error);return window.CertosaSearchEngine.scan(entries,parsed);};
function fixture(options={}){
 let clock=0,id=0;
 const state={archiveId:'archive-local',revision:4,locked:false,busy:false,lib:{
  settings:{privateSetting:'not-for-tools'},utente:{email:'synthetic-private@example.invalid'},
  series:[{id:'s',label:'Stack'}],notebooks:[
   {id:'allowed',sid:'s',vol:1,maxPages:40,pages:[null,{html:'Decisioni Certosa',notes:[{id:'note1',html:'Appunto importante'}],st:[{hash:'synthetic-attachment'}]}]},
   {id:'secret',sid:'s',vol:2,maxPages:40,pages:[null,{html:'Quaderno fuori ambito',notes:[]}]},
   {id:'manual',sid:'s',vol:3,maxPages:40,pages:[null,{html:'Manuale di sistema'}]},
  ],trash:[{nb:{id:'deleted',sid:'s',vol:10,pages:[]}}],
 }};
 const owner=createLocalNotebookTools({readState:()=>state,plainText:v=>v,searchEntries,
  isSystemNotebook:n=>n.id==='manual',now:()=>clock,newId:()=>`proposal-${++id}`,...options});
 const session=owner.openSession({archiveId:state.archiveId,notebookIds:['allowed','manual'],permissions:['read','search','propose_create','propose_edit']});
 return {state,owner,session,tick:()=>{clock+=1800001;}};
}
const code=(fn,expected)=>assert.throws(fn,e=>e.code===expected);

test('default grants are empty and owner adapters are required',()=>{
 code(()=>createLocalNotebookTools({}), 'MISSING_OWNER_ADAPTER');
 const f=fixture(),empty=f.owner.openSession({archiveId:'archive-local'});
 code(()=>empty.list_notebooks(),'FORBIDDEN');
});
test('sensitive notebooks are excluded even when their identifiers are granted',async()=>{
 const f=fixture();f.state.lib.notebooks[0].sensitivity='secret';
 assert.equal(f.session.list_notebooks().items.length,0);
 code(()=>f.session.read_notebook({notebookId:'allowed'}),'NOT_FOUND');
 assert.equal((await f.session.search_notebooks({query:'Certosa'})).hits.length,0);
 code(()=>f.session.prepare_edit({notebookId:'allowed',pageNumber:1,baseRevision:4,mode:'replace',text:'x'}),'NOT_FOUND');
});
test('catalogue and read expose only explicitly selected personal notebooks',()=>{
 const {session}=fixture();assert.deepEqual(session.list_notebooks().items.map(n=>n.notebookId),['allowed']);
 const output=session.read_notebook({notebookId:'allowed'});
 assert.equal(output.pages[0].notes[0].text,'Appunto importante');
 assert.doesNotMatch(JSON.stringify(output),/privateSetting|synthetic-private|synthetic-attachment|outside/);
 for(const notebookId of ['secret','manual','deleted','missing'])code(()=>session.read_notebook({notebookId}),'NOT_FOUND');
});
test('local search includes note citations and never scans an ungranted notebook',async()=>{
 const {session}=fixture();const result=await session.search_notebooks({query:'importante'});
 assert.equal(result.hits.length,1);assert.equal(result.hits[0].noteId,'note1');assert.equal(result.hits[0].pageNumber,1);assert.equal(result.revision,4);
 assert.equal((await session.search_notebooks({query:'fuori ambito'})).hits.length,0);
});
test('search excerpts include a match deep into a long page',async()=>{
 const f=fixture();f.state.lib.notebooks[0].pages[1].html='parola '.repeat(200)+'trovami';
 const r=await f.session.search_notebooks({query:'trovami'});
 assert.ok(r.hits[0].excerpt.includes('trovami'));assert.ok(r.hits[0].excerptStart>0);
});
test('oversized reads fail explicitly instead of silently truncating content',()=>{
 const f=fixture();f.state.lib.notebooks[0].pages[1].html='x'.repeat(200001);
 code(()=>f.session.read_notebook({notebookId:'allowed'}),'READ_BUDGET_EXCEEDED');
});
test('an archive change while asynchronous search runs invalidates the result',async()=>{
 let resume;const f=fixture({searchEntries:()=>new Promise(resolve=>{resume=resolve;})});
 const result=f.session.search_notebooks({query:'Certosa'});f.state.revision++;
 resume({hits:[]});await assert.rejects(result,e=>e.code==='REVISION_CONFLICT');
});
test('lock revokes the session, including after the archive is unlocked again',()=>{
 const f=fixture();f.state.locked=true;code(()=>f.session.list_notebooks(),'ARCHIVE_LOCKED');
 f.state.locked=false;code(()=>f.session.list_notebooks(),'SESSION_CLOSED');
});
test('archive replacement and explicit close revoke access',()=>{
 const f=fixture();f.state.archiveId='another';code(()=>f.session.list_notebooks(),'ARCHIVE_CHANGED');
 const g=fixture();g.session.close();code(()=>g.session.list_notebooks(),'SESSION_CLOSED');
});
test('expired sessions cannot read or prepare writes',()=>{
 const f=fixture();f.tick();code(()=>f.session.list_notebooks(),'SESSION_CLOSED');
});
test('editing/import activity blocks requests rather than using a drifting snapshot',()=>{
 const f=fixture();f.state.busy=true;code(()=>f.session.list_notebooks(),'ARCHIVE_BUSY');
});
test('external mutation of grant arrays cannot expand a session',()=>{
 const f=fixture(),ids=['allowed'],permissions=['read'];
 const s=f.owner.openSession({archiveId:'archive-local',notebookIds:ids,permissions});
 ids.push('secret');permissions.push('propose_edit');code(()=>s.read_notebook({notebookId:'secret'}),'NOT_FOUND');
 code(()=>s.prepare_edit({}),'FORBIDDEN');
});
test('collection proposal supports multiple volumes, capacities and source material without a write',()=>{
 const f=fixture(),before=structuredClone(f.state);
 const result=f.session.prepare_collection({series:[{title:'Applicazioni',volumes:[{pageCapacity:40,content:[{number:1,text:'Manuale preparato',source:{kind:'manual',reference:'Manuale fornito'}}]},{pageCapacity:80}]}],provenance:{kind:'chat',reference:'Chat selezionata'}});
 assert.equal(result.operations[0].volumes[1].pageCapacity,80);assert.equal(result.status,'proposal_only');
 assert.equal(result.operations[0].volumeAllocation,'SeriesLedger-at-commit');assert.deepEqual(f.state,before);
});
test('collections reject duplicate titles, page collisions and excessive capacity',()=>{
 const {session}=fixture();const group=title=>({title,volumes:[{pageCapacity:40}]});
 code(()=>session.prepare_collection({series:[group('Stack'),group(' STACK ')]}),'DUPLICATE_SERIES');
 code(()=>session.prepare_collection({series:[{title:'Stack',volumes:[{pageCapacity:40,content:[{number:1,text:'A'},{number:1,text:'B'}]}]}]}),'INVALID_PAGE');
 code(()=>session.prepare_collection({series:[{title:'Stack',volumes:[{pageCapacity:10001}]}]}),'COLLECTION_LIMIT');
});
test('edit previews are revision bound, preserve the archive and identify notes/attachment constraints',()=>{
 const f=fixture(),before=structuredClone(f.state);
 const p=f.session.prepare_edit({notebookId:'allowed',pageNumber:1,baseRevision:4,mode:'append',text:'\nNuova decisione'});
 assert.equal(p.operations[0].afterText,'Decisioni Certosa\nNuova decisione');assert.equal(p.operations[0].constraints.preserveAttachments,true);
 assert.deepEqual(f.state,before);f.state.revision++;assert.equal(f.session.read_proposal({proposalId:p.id}).stale,true);
 code(()=>f.session.prepare_edit({notebookId:'allowed',pageNumber:1,baseRevision:4,mode:'replace',text:'X'}),'REVISION_CONFLICT');
});
test('HTML in a proposal is literal text and cannot execute through this module',()=>{
 const {session}=fixture();const text='<script>globalThis.exploited=true</script>';
 const p=session.prepare_edit({notebookId:'allowed',pageNumber:1,baseRevision:4,mode:'replace',text});
 assert.equal(p.operations[0].contentFormat,'plain-text');assert.equal(p.operations[0].afterText,text);assert.equal(globalThis.exploited,undefined);
});
test('returned proposals cannot be mutated to alter the stored preview',()=>{
 const {session}=fixture();const p=session.prepare_edit({notebookId:'allowed',pageNumber:1,baseRevision:4,mode:'replace',text:'Originale'});
 p.operations[0].afterText='Alterato';assert.equal(session.read_proposal({proposalId:p.id}).operations[0].afterText,'Originale');
});
test('there is deliberately no apply, delete, restore or arbitrary HTTP/file tool',()=>{
 const {session}=fixture();for(const key of ['apply','delete_notebook','restore','fetch','exec','read_file'])assert.equal(session[key],undefined);
});
test('tool descriptors expose domain tools and never the owner grant methods',()=>{
 const descriptor=JSON.parse(fs.readFileSync(new URL('../tools.json',import.meta.url),'utf8'));
 const f=fixture();
 assert.deepEqual(descriptor.tools.map(t=>t.name).sort(),Object.keys(f.session).filter(k=>k!=='close').sort());
 for(const tool of descriptor.tools){assert.equal(tool.inputSchema.additionalProperties,false);assert.equal(tool.annotations.openWorldHint,false);}
});
