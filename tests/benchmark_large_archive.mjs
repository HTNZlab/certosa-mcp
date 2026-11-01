// Real encrypted on-disk benchmark. Synthetic data only, no plaintext media file.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {randomBytes,createCipheriv,createHash} from 'node:crypto';
import {LargeArchiveStore,MEDIA_CHUNK_BYTES} from '../src/large-archive-store.mjs';
import {LargeArchiveEngine} from '../src/large-archive-engine.mjs';
import {project} from './archive-fixtures.mjs';
const root=path.join(project,'verifiche/large-archive-20261101','scale-'+Date.now());fs.mkdirSync(root,{recursive:true});
const filename=path.join(root,'one-gib.certosa-db'),password=randomBytes(32).toString('hex');
const start=performance.now();let peakRss=process.memoryUsage().rss;const memory={};
const sample=()=>{peakRss=Math.max(peakRss,process.memoryUsage().rss);};
let pack={formato:'certosa/2',creato:1,lib:{v:2,settings:{font:'Sans serif',maxPages:4000},series:[],notebooks:[],trash:[]},blobs:{}};
for(let book=0;book<10;book++){
  const id='book-'+book,sid='series-'+book;pack.lib.series.push({id:sid,label:'Biblioteca sintetica '+book});
  const nb={id,sid,vol:1,author:'Autore sintetico '+book,maxPages:4000,font:'Sans serif',pages:[null]};
  for(let number=1;number<=4000;number++)nb.pages.push({html:'<div>Una cosa importante. '+('Testo sintetico per verificare il salvataggio incrementale. '.repeat(6))+book+' '+number+'</div>',st:[],notes:number%50===0?[{id:'note-'+number,html:'<div>Una cosa annotata.</div>',x:1,y:1,w:20}]:[]});
  pack.lib.notebooks.push(nb);
}
console.log('Creating 40,000 compressed pages and encrypted search index');
let store=LargeArchiveStore.create(filename,password,pack);pack=null;global.gc?.();sample();
const catalogueMs=performance.now()-start;
memory.afterCatalogueRss=process.memoryUsage().rss;
const streamKey=randomBytes(32),streamIv=randomBytes(16),total=1024*1024*1024;let firstChunk;
async function* media(){
  const cipher=createCipheriv('chacha20',streamKey,streamIv);let written=0;
  while(written<total){const size=Math.min(MEDIA_CHUNK_BYTES,total-written),chunk=cipher.update(Buffer.alloc(size));if(!firstChunk)firstChunk=Buffer.from(chunk);yield chunk;written+=size;sample();if(written%(96*1024*1024)===0){console.log('Encrypted media imported: '+written+' bytes');await new Promise(resolve=>setImmediate(resolve));}}
  cipher.final();
}
const mediaStart=performance.now(),added=await store.putAttachmentStream(media()),mediaMs=performance.now()-mediaStart;
memory.afterMediaRss=process.memoryUsage().rss;
streamKey.fill(0);streamIv.fill(0);assert.equal(added.bytes,total);
const chunks=store.stats().chunks;store.putAttachment([firstChunk]);assert.equal(store.stats().chunks,chunks);firstChunk.fill(0);firstChunk=null;
const page=store.page('book-0',1);page.st.push({id:'synthetic-large-media',kind:'file',name:'synthetic-stream.bin',mime:'application/octet-stream',hash:added.hash,x:1,y:1,w:30});store.commit({baseRevision:0,notebookId:'book-0',pageNumber:1,pageValue:page});
store.checkpoint();store.close();const fileBytes=fs.statSync(filename).size;
const openStart=performance.now();store=LargeArchiveStore.open(filename,password);const reopenMs=performance.now()-openStart;
memory.afterReopenRss=process.memoryUsage().rss;
const engine=new LargeArchiveEngine();engine.adopt(store);engine.grant({notebookIds:store.books().map(n=>n.id),write:true});
const countStart=performance.now(),count=await engine.call('count_word',{word:'cosa'}),countMs=performance.now()-countStart;assert.equal(count.total,40800);
const searchStart=performance.now(),hits=await engine.call('search_notebooks',{query:'"Autore sintetico 9"'}),searchMs=performance.now()-searchStart;assert.equal(hits.hits[0].notebookId,'book-9');
store.checkpoint();const beforeStats=store.stats();const hashRows=()=>createHash('sha256').update(store.db.prepare('SELECT hash FROM chunks ORDER BY hash').all().map(r=>r.hash).join('')).digest('hex');const beforeHashes=hashRows();
const changeStart=performance.now(),revision=store.revision;
const proposal=await engine.call('prepare_edit',{notebookId:'book-0',pageNumber:1,baseRevision:revision,mode:'append',text:'\nAggiunta incrementale verificata.'});const saved=await engine.call('apply_proposal',{proposalId:proposal.id});
const author=await engine.call('prepare_author_edit',{notebookId:'book-0',baseRevision:saved.revision,author:'Autore aggiornato'});await engine.call('apply_proposal',{proposalId:author.id});
const editMs=performance.now()-changeStart,walBytes=fs.statSync(filename+'-wal').size;assert.ok(walBytes<4*1024*1024,'A small edit must not rewrite the archive');assert.equal(hashRows(),beforeHashes);assert.equal(store.stats().chunks,beforeStats.chunks);
const readStart=performance.now(),digest=createHash('sha256');let verified=0;for(const chunk of store.attachment(added.hash)){digest.update(chunk);verified+=chunk.length;sample();}
assert.equal(verified,total);assert.equal(digest.digest('hex'),added.hash);
let legacyRejected=false;try{store.exportPack();}catch(e){legacyRejected=e.code==='LEGACY_EXPORT_TOO_LARGE';}assert.ok(legacyRejected,'Legacy limits must reject oversized exports without losing data');
const readbackMs=performance.now()-readStart,record={synthetic:true,physicalDevice:false,books:10,pages:40000,mediaBytes:total,fileBytes,catalogueMs,mediaMs,reopenMs,countMs,searchMs,editMs,walBytesForPageAndAuthorEdit:walBytes,unchangedMediaChunks:true,mediaChecksumVerified:true,mediaReadbackMs:readbackMs,wholeWordCosa:count.total,peakRssBytes:peakRss,memory,legacyOversizeRejectedSafely:legacyRejected,elapsedMs:performance.now()-start};
if(process.env.CERTOSA_BENCHMARK_SNAPSHOT==='1'){
  const backup=path.join(root,'full-encrypted-backup.certosa-db'),began=performance.now();store.snapshot(backup);const copy=LargeArchiveStore.open(backup,password);assert.equal(copy.revision,store.revision);assert.equal(copy.stats().mediaBytes,store.stats().mediaBytes);assert.equal(copy.book('book-0').author,'Autore aggiornato');record.fullEncryptedSnapshot={bytes:fs.statSync(backup).size,elapsedMs:performance.now()-began,reopened:true};copy.close();
}
engine.close();sample();fs.writeFileSync(path.join(root,'RESULT.json'),JSON.stringify(record,null,2)+'\n');console.log(JSON.stringify(record));
