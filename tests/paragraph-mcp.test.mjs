import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {randomBytes,createHash} from 'node:crypto';
import {readPageBlocks,editPageBlocks} from '../src/paragraph-edit.mjs';
import {ArchiveRouter} from '../src/archive-router.mjs';
import {LargeArchiveStore} from '../src/large-archive-store.mjs';
import {assertPlainReplaceSafe,createLocalNotebookTools} from '../src/notebook-tools.mjs';
import {fixture,packFixture,project} from './archive-fixtures.mjs';
const root=path.join(project,'verifiche/debug-writing-mcp-20261108/mcp-paragraph','regression-'+Date.now());fs.mkdirSync(root,{recursive:true});let serial=0;
const html='<div class="p" style="font-size:24px;color:#123456" data-certosa-style="title"><b>Un &amp; </b><i>progetto 😀</i><img src="blob:synthetic" data-local-id="image"></div>\n<div class="p" data-certosa-style="quote">Secondo <span style="color:red">paragrafo</span>.</div>';
const operation=(value,index,textEdits,style)=>({blockIndex:index,blockHash:readPageBlocks(value).blocks[index].blockHash,...(textEdits?{textEdits}:{}),...(style?{style}:{})});
const code=(fn,expected)=>assert.throws(fn,e=>e.code===expected);
test('bounded structure exposes decoded text and runs without HTML, media or URLs',()=>{
 const r=readPageBlocks(html,{limit:1});assert.equal(r.blocks[0].text,'Un & progetto 😀');assert.equal(r.hasMore,true);assert.equal(r.totalBlocks,2);assert.equal(r.offsetUnit,'UTF-16');assert.equal(r.blocks[0].style,'title');assert.equal(r.blocks[0].editable,true);assert.doesNotMatch(JSON.stringify(r),/blob:|img src|font-size|#123456/);assert.equal(readPageBlocks(html,{offset:1}).blocks[0].blockIndex,1);
});
test('cross-run text replacement inherits first run and keeps markup, images and other paragraphs byte-identical',()=>{
 const r=editPageBlocks(html,[operation(html,0,[{start:3,end:13,expectedText:'& progetto',text:'nuovo progetto'}])]);
 assert.equal(r.html,html.replace('Un &amp; </b><i>progetto 😀','Un nuovo progetto</b><i> 😀'));assert.equal(r.preservesFormatting,true);assert.equal(r.changes[0].afterText,'Un nuovo progetto 😀');
});
test('style and disjoint text edits preserve inline styles and escape literal HTML',()=>{
 const r=editPageBlocks(html,[operation(html,0,[{start:0,end:2,expectedText:'Un',text:'Il'},{start:5,end:13,expectedText:'progetto',text:'<script>x</script>'}],'heading')]);
 assert.ok(r.html.includes('data-certosa-style="heading"'));assert.ok(r.html.includes('<b>Il &amp; </b><i>&lt;script&gt;x&lt;/script&gt; 😀</i>'));assert.ok(r.html.endsWith(html.slice(html.indexOf('\n'))));assert.ok(r.html.includes('style="font-size:24px;color:#123456"'));
});
test('empty paragraphs and insertions work without removing existing nodes',()=>{
 const h='<div class="p"><br></div>',r=editPageBlocks(h,[operation(h,0,[{start:0,end:0,expectedText:'',text:'Inizio'}],'bullet')]);assert.equal(r.html,'<div class="p" data-certosa-style="bullet">Inizio<br></div>');
 const styled='<div class="p"><b>AB</b><i>CD</i></div>';assert.equal(editPageBlocks(styled,[operation(styled,0,[{start:2,end:2,expectedText:'',text:'X'}])]).html,'<div class="p"><b>AB</b><i>XCD</i></div>');
});
test('insertions around one or multiple empty line breaks respect UTF-16 offsets',()=>{
 for(const [h,offset,expected] of [
  ['<div class="p"><br></div>',1,'<div class="p"><br>X</div>'],
  ['<div class="p"><br><br></div>',0,'<div class="p">X<br><br></div>'],
  ['<div class="p"><br><br></div>',1,'<div class="p"><br>X<br></div>'],
  ['<div class="p"><br><br></div>',2,'<div class="p"><br><br>X</div>'],
  ['<div class="p"><br><b>A</b></div>',0,'<div class="p">X<br><b>A</b></div>'],
 ])assert.equal(editPageBlocks(h,[operation(h,0,[{start:offset,end:offset,expectedText:'',text:'X'}])]).html,expected);
});
test('stale hashes/text, overlapping ranges, surrogate splits and line break removal fail closed',()=>{
 code(()=>editPageBlocks(html,[{...operation(html,0,[],'normal'),blockHash:'0'.repeat(64)}]),'REVISION_CONFLICT');
 code(()=>editPageBlocks(html,[operation(html,0,[{start:0,end:2,expectedText:'No',text:'X'}])]),'REVISION_CONFLICT');
 code(()=>editPageBlocks(html,[operation(html,0,[{start:0,end:2,expectedText:'Un',text:'X'},{start:1,end:2,expectedText:'n',text:'Y'}])]),'INVALID_PARAGRAPH_EDIT');
 code(()=>editPageBlocks(html,[operation(html,0,[{start:15,end:16,expectedText:'',text:'X'}])]),'INVALID_PARAGRAPH_EDIT');
 const br='<div class="p">A<br>B</div>';code(()=>editPageBlocks(br,[operation(br,0,[{start:0,end:3,expectedText:'A\nB',text:'AB'}])]),'UNSUPPORTED_TEXT_RANGE');
});
test('inserted malformed Unicode and HTML control characters cannot make a page uneditable',()=>{
 for(const text of ['\uD800','\uDC00','\u0001','\u000B','\u007F','\u0080','\uFDD0','\uFFFE','\uFFFF','\u{1FFFE}'])
  code(()=>editPageBlocks(html,[operation(html,0,[{start:0,end:2,expectedText:'Un',text}])]),'INVALID_PARAGRAPH_EDIT');
 const out=editPageBlocks(html,[operation(html,0,[{start:0,end:2,expectedText:'Un',text:'\t👩‍💻'}])]);
 assert.equal(readPageBlocks(out.html).blocks[0].editable,true);assert.equal(out.changes[0].afterText,'\t👩‍💻 & progetto 😀');
});
test('existing CRLF is read and edited with consistent normalized offsets while tabs remain valid',()=>{
 const h='<div class="p"><b>A\r\nB\tC</b></div>',b=readPageBlocks(h).blocks[0];assert.equal(b.text,'A\nB\tC');
 const out=editPageBlocks(h,[operation(h,0,[{start:2,end:3,expectedText:'B',text:'X\t😀'}],'quote')]);
 assert.equal(out.changes[0].afterText,'A\nX\t😀\tC');assert.equal(readPageBlocks(out.html).blocks[0].text,out.changes[0].afterText);assert.equal(readPageBlocks(out.html).blocks[0].editable,true);
 for(const text of ['X\nY','X\r\nY'])code(()=>editPageBlocks(h,[operation(h,0,[{start:2,end:3,expectedText:'B',text}])]),'INVALID_PARAGRAPH_EDIT');
});
test('nested/unsupported blocks are readable but not silently rewritten',()=>{
 const h='<div class="p"><div>Nested</div></div><table><tr><td>X</td></tr></table>';
 assert.equal(readPageBlocks(h).blocks[0].editable,false);code(()=>editPageBlocks(h,[operation(h,0,[],'normal')]),'UNSUPPORTED_PARAGRAPH');
});
test('structured reads and previews reject oversized data and unknown styles',()=>{
 code(()=>readPageBlocks('<div>'+('x'.repeat(200001))+'</div>'),'READ_BUDGET_EXCEEDED');
 code(()=>readPageBlocks('x'.repeat(1000001)),'READ_BUDGET_EXCEEDED');
 code(()=>editPageBlocks(html,[operation(html,0,[],'unknown')]),'INVALID_PARAGRAPH_EDIT');
});
test('legacy div/p text stays editable but only DIV.p supports app-rendered paragraph styles',()=>{
 for(const h of ['<p><b>Testo</b></p>','<div><b>Testo</b></div>','<div class="other">Testo</div>']){
  const block=readPageBlocks(h).blocks[0];assert.equal(block.editable,true);assert.equal(block.styleEditable,false);
  code(()=>editPageBlocks(h,[operation(h,0,[],'heading')]),'UNSUPPORTED_PARAGRAPH_STYLE');
  assert.equal(editPageBlocks(h,[operation(h,0,[{start:0,end:5,expectedText:'Testo',text:'Idea'}])]).html,h.replace('Testo','Idea'));
 }
 assert.equal(readPageBlocks('<div class="p other">Testo</div>').blocks[0].styleEditable,true);
});
test('legacy plain replacement is forbidden for rich paragraphs including live owner adapters',()=>{
 for(const h of [html,'<div class="p" data-certosa-style="normal">A</div>','<div><b>A</b></div>','<img src="local">'])code(()=>assertPlainReplaceSafe(h),'RICH_TEXT_REQUIRES_PARAGRAPH_EDIT');
 assertPlainReplaceSafe('<div class="p">A &amp; B<br></div>');
 const state={archiveId:'test',revision:1,lib:{series:[{id:'s',label:'test'}],notebooks:[{id:'n',sid:'s',maxPages:40,pages:[null,{html}]}]}};
 const session=createLocalNotebookTools({readState:()=>state,plainText:x=>x,searchEntries:async()=>({hits:[]}),isSystemNotebook:()=>false}).openSession({archiveId:'test',notebookIds:['n'],permissions:['propose_edit']});
 code(()=>session.prepare_edit({notebookId:'n',pageNumber:1,baseRevision:1,mode:'replace',text:'flatten'}),'RICH_TEXT_REQUIRES_PARAGRAPH_EDIT');
});
async function setup(large){
 const runtime=path.join(root,String(++serial));fs.mkdirSync(runtime);const pack=packFixture();pack.lib.notebooks[0].pages[1].html=html;pack.lib.notebooks[0].pages[2]={html:'<div class="p">Invariato</div>',notes:[],st:[]};
 const router=new ArchiveRouter({project:root,runtime});
 if(large){router.large.adopt(LargeArchiveStore.create(path.join(runtime,'synthetic.certosa-db'),randomBytes(24).toString('hex'),pack));router.active=router.large;}
 else{const f=await fixture(runtime,pack);await router.unlock(f.file,f.password);}
 router.grant({notebookIds:['first','second'],write:true});return {router,pack,runtime};
}
const packOf=r=>r.active.store?r.active.store.exportPack():structuredClone(r.active.material.pack);
for(const large of [false,true]){
 test('invalid inserted text produces no proposal, revision or archive change: '+large,async()=>{
  const {router:r}=await setup(large);try{
   const before=packOf(r),read=await r.call('read_page_blocks',{notebookId:'first',pageNumber:1}),count=r.workflow.proposals.size;
   for(const text of ['\uD800','\u0001','\u{1FFFF}'])await assert.rejects(()=>r.call('prepare_paragraph_edit',{notebookId:'first',pageNumber:1,baseRevision:read.revision,operations:[{blockIndex:0,blockHash:read.blocks[0].blockHash,style:'heading',textEdits:[{start:0,end:2,expectedText:'Un',text}]}]}),e=>e.code==='INVALID_PARAGRAPH_EDIT');
   assert.equal(r.workflow.proposals.size,count);assert.equal(r.status().revision,read.revision);assert.deepEqual(packOf(r),before);
   const after=await r.call('read_page_blocks',{notebookId:'first',pageNumber:1});assert.equal(after.blocks[0].editable,true);assert.equal(after.blocks[0].blockHash,read.blocks[0].blockHash);
  }finally{r.close();}
 });
 test('structured edit commits only expected HTML, preserves media checksums and exports through native app reader: '+large,async()=>{
  const {router:r,pack,runtime}=await setup(large);try{
   const before=packOf(r),read=await r.call('read_page_blocks',{notebookId:'first',pageNumber:1}),rev=r.status().revision;
   const p=await r.call('prepare_paragraph_edit',{notebookId:'first',pageNumber:1,baseRevision:rev,operations:[{blockIndex:0,blockHash:read.blocks[0].blockHash,style:'heading',textEdits:[{start:0,end:2,expectedText:'Un',text:'Il'}]}]});
   assert.deepEqual(packOf(r),before);assert.doesNotMatch(JSON.stringify(p),/img src|blob:synthetic/);assert.equal(p.operations[0].changes[0].afterText,'Il & progetto 😀');
   p.operations[0].paragraphOperations[0].textEdits[0].text='MUTATED';const reviewed=await r.call('read_proposal',{proposalId:p.id});assert.equal(reviewed.operations[0].paragraphOperations[0].textEdits[0].text,'Il');
   const saved=await r.call('apply_proposal',{proposalId:p.id});assert.equal(saved.checkpoint,true);assert.equal(saved.revision,rev+1);
   const after=packOf(r),expected=structuredClone(before);expected.lib.notebooks[0].pages[1].html=html.replace('data-certosa-style="title"','data-certosa-style="heading"').replace('<b>Un ','<b>Il ');assert.deepEqual(after,expected);
   const hash=v=>createHash('sha256').update(JSON.stringify(v)).digest('hex');assert.equal(hash(after.blobs),hash(pack.blobs));
   const exportReport=await r.exportLegacy(path.join(runtime,'compatible.certosa'),randomBytes(24).toString('hex'));assert.equal(exportReport.nativeReaderVerified,true);assert.equal(exportReport.nativeImportPlanVerified,true);assert.equal(exportReport.allValuesPreserved,true);
   await assert.rejects(()=>r.call('apply_proposal',{proposalId:p.id}),e=>e.code==='HANDLE_SPENT');
  }finally{r.close();}
 });
 test('legacy replacement, stale proposals, unauthorized reads and failed edits preserve source: '+large,async()=>{
  const {router:r}=await setup(large);try{
   const before=packOf(r),rev=r.status().revision;
   for(const tool of ['prepare_edit','prepare_archive_edit'])await assert.rejects(()=>r.call(tool,tool==='prepare_edit'?{notebookId:'first',pageNumber:1,baseRevision:rev,mode:'replace',text:'flatten'}:{baseRevision:rev,operations:[{type:'edit_page',notebookId:'first',pageNumber:1,mode:'replace',text:'flatten'}]}),e=>e.code==='RICH_TEXT_REQUIRES_PARAGRAPH_EDIT');
   await assert.rejects(()=>r.call('read_page_blocks',{notebookId:'reserved',pageNumber:1}),e=>e.code==='NOT_FOUND');assert.deepEqual(packOf(r),before);
   const p=await r.call('prepare_paragraph_edit',{notebookId:'first',pageNumber:1,baseRevision:rev,operations:[operation(html,0,[],'quote')]});
   const other=await r.call('prepare_edit',{notebookId:'second',pageNumber:2,baseRevision:rev,mode:'append',text:'New revision'});await r.call('apply_proposal',{proposalId:other.id});
   await assert.rejects(()=>r.call('apply_proposal',{proposalId:p.id}),e=>e.code==='REVISION_CONFLICT');assert.deepEqual(packOf(r).lib.notebooks[0],before.lib.notebooks[0]);
  }finally{r.close();}
 });
 test('format-only drift, revoked permission and persistence failures cannot overwrite source: '+large,async()=>{
  const {router:r}=await setup(large);try{
   const p=await r.call('prepare_paragraph_edit',{notebookId:'first',pageNumber:1,baseRevision:r.status().revision,operations:[operation(html,0,[],'heading')]});
   if(large){const page=r.active.store.page('first',1);page.html=page.html.replace('#123456','#654321');r.active.store.commit({baseRevision:r.status().revision,notebookId:'first',pageNumber:1,pageValue:page,advanceRevision:false,expires:()=>false});}
   else r.active.material.pack.lib.notebooks[0].pages[1].html=html.replace('#123456','#654321');
   await assert.rejects(()=>r.call('apply_proposal',{proposalId:p.id}),e=>e.code==='REVISION_CONFLICT');
   const current=await r.call('read_page_blocks',{notebookId:'first',pageNumber:1});const p2=await r.call('prepare_paragraph_edit',{notebookId:'first',pageNumber:1,baseRevision:current.revision,operations:[{blockIndex:0,blockHash:current.blocks[0].blockHash,style:'quote'}]});
   const before=packOf(r);
   if(large){const original=r.active.store.indexPage;r.active.store.indexPage=()=>{throw Error('synthetic write failure');};await assert.rejects(()=>r.call('apply_proposal',{proposalId:p2.id}));r.active.store.indexPage=original;}
   else{const original=r.active.io;r.active.io={...fs,renameSync(){throw Error('synthetic write failure');}};await assert.rejects(()=>r.call('apply_proposal',{proposalId:p2.id}),e=>e.code==='SAVE_FAILED');r.active.io=original;}
   assert.deepEqual(packOf(r),before);
   if(large)r.active.session.write=false;else r.active.write=false;
   await assert.rejects(()=>r.call('prepare_paragraph_edit',{notebookId:'first',pageNumber:1,baseRevision:r.status().revision,operations:[{blockIndex:0,blockHash:current.blocks[0].blockHash,style:'quote'}]}),e=>e.code==='FORBIDDEN');
  }finally{r.close();}
 });
}
