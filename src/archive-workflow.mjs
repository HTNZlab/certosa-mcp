import {randomUUID} from 'node:crypto';
import {archiveError,MAX_FILE_BYTES,MAX_JSON_BYTES} from './archive-format.mjs';
import {gzipSync} from 'node:zlib';
import {plainText,textHtml} from './archive-text.mjs';
import {validateCompatiblePack} from './archive-validation.mjs';
import {assertPlainReplaceSafe} from './notebook-tools.mjs';
import {readPageBlocks,editPageBlocks,htmlHash} from './paragraph-edit.mjs';

const fail=code=>{throw archiveError(code);};
const string=(v,max,empty=false)=>{if(typeof v!=='string'||v.length>max||!empty&&!v.trim())fail('INVALID_EDIT');return v;};
export class ArchiveWorkflow{
  constructor(router){this.router=router;this.close();}
  close(){this.proposals=new Map();this.spent=new Set();}
  context(write=false){
    const a=this.router.active;if(!a?.session)fail('ARCHIVE_LOCKED');
    const revision=a.store?a.check(write):a.readState().revision;
    if(write&&!(a.store?a.session.write:a.write))fail('FORBIDDEN');
    const root=a.store?a.store.getMeta('root'):a.material.pack;
    const books=a.store?a.store.books():root.lib.notebooks;
    const ids=a.store?a.session.ids:a.allowed;
    return {a,root,books,ids,revision,archiveId:a.status().archiveId};
  }
  allowed(book,ids){if(!book||!ids.has(book.id)||book.sensitivity==='secret'||book.localCredential||book.systemRole==='manuale-certosa'||book.id==='certosa_manual_notebook')fail('NOT_FOUND');}
  page(a,book,number){return a.store?a.store.page(book.id,number):book.pages[number];}
  readBlocks({notebookId,pageNumber,offset=0,limit=20}){
    const c=this.context(),book=c.books.find(b=>b.id===notebookId);this.allowed(book,c.ids);
    if(!Number.isSafeInteger(pageNumber)||pageNumber<1||pageNumber>book.maxPages)fail('INVALID_PAGE');
    return {archiveId:c.archiveId,notebookId,pageNumber,revision:c.revision,...readPageBlocks(this.page(c.a,book,pageNumber)?.html||'',{offset,limit})};
  }
  prepareParagraph({notebookId,pageNumber,baseRevision,operations}){
    return this.prepare({baseRevision,operations:[{type:'edit_paragraphs',notebookId,pageNumber,paragraphOperations:operations}]});
  }
  prepare({baseRevision,operations}){
    const c=this.context(true);if(c.revision!==baseRevision)fail('REVISION_CONFLICT');
    if(this.proposals.size>=20)fail('TOO_MANY_PROPOSALS');
    if(!Array.isArray(operations)||!operations.length||operations.length>100)fail('INVALID_EDIT');
    let chars=0;const created=new Map(),touched=new Set(),catalogue=new Map(c.books.map(b=>[b.id,{...b}]));
    const ops=operations.map(input=>{
      if(!input||typeof input!=='object')fail('INVALID_EDIT');
      const id=string(input.notebookId,128);if(!/^[A-Za-z0-9_-]+$/.test(id))fail('INVALID_EDIT');
      if(input.type==='create_notebook'){
        if(!c.a.allowCreate)fail('CREATE_NOT_AUTHORISED');
        if(c.books.some(b=>b.id===id)||created.has(id))fail('DUPLICATE_NOTEBOOK');
        const maxPages=input.pageCapacity;if(!Number.isSafeInteger(maxPages)||maxPages<1||maxPages>10000)fail('INVALID_PAGE');
        const title=string(input.title,200).trim(),normal=s=>s.trim().toLowerCase().replace(/\s+/g,' ');
        if([...c.root.lib.series,...[...created.values()].map(n=>({label:n.creationTitle}))].some(s=>normal(s.label)===normal(title)))fail('DUPLICATE_SERIES');
        const series={id:'series-'+randomUUID(),label:title,color:'#1d4ed8',strip:'#f59e0b',created:Date.now(),issuedVolume:1};
        const notebook={id,sid:series.id,vol:1,maxPages,font:input.font===undefined?'Arial':string(input.font,200),author:input.author===undefined?'':string(input.author,500,true).trim(),created:Date.now()};
        created.set(id,{...notebook,creationTitle:title});return {type:input.type,notebookId:id,series,notebook};
      }
      const book=created.get(id)||catalogue.get(id);this.allowed(book,created.has(id)?new Set([id]):c.ids);
      if(input.type==='edit_paragraphs'){
        const number=input.pageNumber;if(!Number.isSafeInteger(number)||number<1||number>book.maxPages)fail('INVALID_PAGE');
        const key=id+':page:'+number;if(touched.has(key))fail('DUPLICATE_OPERATION');touched.add(key);
        const html=created.has(id)?'':this.page(c.a,book,number)?.html||'',edited=editPageBlocks(html,input.paragraphOperations);
        return {type:input.type,notebookId:id,pageNumber:number,paragraphOperations:structuredClone(input.paragraphOperations),beforePageHash:edited.beforePageHash,afterPageHash:edited.afterPageHash,changes:edited.changes,preservesFormatting:true,preservesMedia:true};
      }
      if(input.type==='edit_page'){
        const number=input.pageNumber;if(!Number.isSafeInteger(number)||number<1||number>book.maxPages||!['append','replace'].includes(input.mode))fail('INVALID_PAGE');
        const key=id+':page:'+number;if(touched.has(key))fail('DUPLICATE_OPERATION');touched.add(key);
        const text=string(input.text,100000,true);chars+=text.length;if(chars>200000)fail('CONTENT_LIMIT');
        const beforeHtml=created.has(id)?'':this.page(c.a,book,number)?.html||'';if(input.mode==='replace')assertPlainReplaceSafe(beforeHtml);
        const beforeText=plainText(beforeHtml);
        return {type:input.type,notebookId:id,pageNumber:number,mode:input.mode,beforeText,afterText:input.mode==='append'?beforeText+text:text};
      }
      if(input.type==='set_notebook'){
        const key=id+':metadata';if(touched.has(key))fail('DUPLICATE_OPERATION');touched.add(key);const values={};
        if(input.author!==undefined)values.author=string(input.author,500,true).trim();
        if(input.font!==undefined)values.font=string(input.font,200);
        if(input.pageCapacity!==undefined){if(!Number.isSafeInteger(input.pageCapacity)||input.pageCapacity<book.maxPages||input.pageCapacity>10000)fail('INVALID_PAGE');values.maxPages=input.pageCapacity;}
        if(!Object.keys(values).length)fail('INVALID_EDIT');
        const op={type:input.type,notebookId:id,before:Object.fromEntries(Object.keys(values).map(k=>[k,book[k]??null])),values};Object.assign(book,values);return op;
      }
      fail('INVALID_EDIT');
    });
    const proposal={id:'batch-'+randomUUID(),archiveId:c.archiveId,baseRevision,status:'proposal_only',expiresAt:c.a.status().expiresAt,operations:ops};
    this.proposals.set(proposal.id,structuredClone(proposal));return proposal;
  }
  proposal({proposalId}){
    const c=this.context(),p=this.proposals.get(proposalId);if(!p)fail('NOT_FOUND');
    const created=new Set();for(const op of p.operations){if(op.type==='create_notebook'){if(!c.a.allowCreate)fail('CREATE_NOT_AUTHORISED');created.add(op.notebookId);}else if(!created.has(op.notebookId))this.allowed(c.books.find(b=>b.id===op.notebookId),c.ids);}
    return {...structuredClone(p),expiresAt:c.a.status().expiresAt,stale:p.baseRevision!==c.revision,currentRevision:c.revision};
  }
  apply({proposalId}){
    const c=this.context(true);if(this.spent.has(proposalId))fail('HANDLE_SPENT');const p=this.proposal({proposalId});if(p.stale)fail('REVISION_CONFLICT');
    const created=new Set(),changes=[];
    for(const op of p.operations){
      if(op.type==='create_notebook'){if(c.books.some(b=>b.id===op.notebookId))fail('DUPLICATE_NOTEBOOK');created.add(op.notebookId);changes.push(op);continue;}
      const book=p.operations.find(o=>o.type==='create_notebook'&&o.notebookId===op.notebookId)?.notebook||c.books.find(b=>b.id===op.notebookId);
      if(op.type==='edit_paragraphs'){
        const page=structuredClone(this.page(c.a,book,op.pageNumber))||{html:'',st:[],notes:[]};
        if(htmlHash(page.html||'')!==op.beforePageHash)fail('REVISION_CONFLICT');
        const edited=editPageBlocks(page.html||'',op.paragraphOperations);if(edited.afterPageHash!==op.afterPageHash)fail('REVISION_CONFLICT');page.html=edited.html;changes.push({...op,pageValue:page});
      }else if(op.type==='edit_page'){
        const page=structuredClone(created.has(book.id)?null:this.page(c.a,book,op.pageNumber))||{html:'',st:[],notes:[]};if(plainText(page.html||'')!==op.beforeText)fail('REVISION_CONFLICT');
        if(op.mode==='replace')assertPlainReplaceSafe(page.html||'');page.html=op.mode==='append'?(page.html||'')+textHtml(op.afterText.slice(op.beforeText.length)):textHtml(op.afterText);changes.push({...op,pageValue:page});
      }else{for(const [key,value] of Object.entries(op.before))if((book[key]??null)!==value)fail('REVISION_CONFLICT');changes.push(op);}
    }
    this.spent.add(proposalId);let saved;
    if(c.a.store){
      const store=c.a.store,consent=c.a.idleConsent,expires=()=>!c.a.session||c.a.idleConsent!==consent||consent.closed;
      saved=store.db.transaction(()=>{
        if(store.revision!==p.baseRevision)fail('REVISION_CONFLICT');const checkpoints=[];
        store.ensureSearchIndex();
        for(const op of changes){
          if(expires())fail('SESSION_CLOSED');
          if(op.type==='create_notebook'){checkpoints.push(store.createNotebook(op.series,op.notebook).checkpointId);}
          else checkpoints.push(store.commit({baseRevision:p.baseRevision,notebookId:op.notebookId,...(['edit_page','edit_paragraphs'].includes(op.type)?{pageNumber:op.pageNumber,pageValue:op.pageValue}:{metadata:op.values}),expires,advanceRevision:false}).checkpointId);
        }
        const root=store.getMeta('root'),total=store.statement('SELECT COALESCE(SUM(pages_length),0) AS n FROM notebooks').get().n+(root.lib.trash||[]).reduce((sum,t)=>sum+(t.nb?.pages?.length||0),0);
        if(root.lib.series.length>10000||store.statement('SELECT COUNT(*) AS n FROM notebooks').get().n>10000||total>100000)fail('CONTENT_LIMIT');
        if(expires())fail('SESSION_CLOSED');store.advanceRevision(p.baseRevision+1);return {revision:p.baseRevision+1,checkpoint:true,checkpointIds:checkpoints};
      }).immediate();
    }else{
      const pack=structuredClone(c.a.material.pack);
      for(const op of changes){
        if(op.type==='create_notebook'){pack.lib.series.push(op.series);pack.lib.notebooks.push({...op.notebook,pages:[]});continue;}
        const book=pack.lib.notebooks.find(b=>b.id===op.notebookId);if(['edit_page','edit_paragraphs'].includes(op.type))book.pages[op.pageNumber]=op.pageValue;else Object.assign(book,op.values);
      }
      validateCompatiblePack(pack);saved=c.a.persist(pack);
    }
    for(const id of created){c.ids.add(id);if(!c.a.store)c.a.session.authoriseCreatedNotebook(id);}
    return {status:'saved',archiveId:c.archiveId,...saved,operationsApplied:changes.length,createdNotebookIds:[...created]};
  }
  validate(){
    const c=this.context();let pack,report;
    try{pack=c.a.store?c.a.store.exportPack():c.a.material.pack;report=validateCompatiblePack(pack);}
    catch(e){if(e.code==='LEGACY_EXPORT_TOO_LARGE')return {compatible:false,format:'certosa/2',reason:'LEGACY_EXPORT_TOO_LARGE',nativeBackupAvailable:!!c.a.store};throw e;}
    const json=Buffer.from(JSON.stringify(pack));let fileBytes;
    try{if(json.length>MAX_JSON_BYTES)return {compatible:false,reason:'LEGACY_EXPORT_TOO_LARGE',nativeBackupAvailable:!!c.a.store};const compressed=gzipSync(json);fileBytes=compressed.length+54;compressed.fill(0);}finally{json.fill(0);}
    if(fileBytes>MAX_FILE_BYTES)return {compatible:false,reason:'LEGACY_EXPORT_TOO_LARGE',nativeBackupAvailable:!!c.a.store};
    if(this.context().revision!==c.revision)fail('REVISION_CONFLICT');
    return {...report,compatible:true,estimatedFileBytes:fileBytes,revision:c.revision,publicationRequiresNativeReadback:true};
  }
}
