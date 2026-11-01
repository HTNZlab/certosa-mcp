import fs from 'node:fs';
import {randomUUID} from 'node:crypto';
import {archiveError} from './archive-format.mjs';
import {plainText,textHtml} from './archive-text.mjs';
import search from './archive-search.mjs';
import {LargeArchiveStore,isSystemNotebook,isSecretNotebook} from './large-archive-store.mjs';

const fail=code=>{throw archiveError(code);};
export class LargeArchiveEngine{
  constructor({now=Date.now}={}){this.now=now;this.store=null;this.session=null;this.epoch=0;this.proposals=new Map();this.applied=new Set();}
  adopt(store){this.close();this.store=store;this.filename=store.filename;const stat=fs.statSync(this.filename);this.identity=[stat.dev,stat.ino,stat.birthtimeMs].join(':');return this.descriptors();}
  descriptors(){return this.store.books().filter(n=>!isSystemNotebook(n)).map(n=>({id:n.id,title:this.store.title(n),author:this.store.author(n),volume:n.vol,reserved:isSecretNotebook(n)}));}
  checkIdentity(){
    let stat;try{stat=fs.statSync(this.filename);}catch{fail('ARCHIVE_PATH_CHANGED');}
    if([stat.dev,stat.ino,stat.birthtimeMs].join(':')!==this.identity)fail('ARCHIVE_PATH_CHANGED');
  }
  grant({notebookIds,write=false,ttlMs=900000,allowCreate=false}){
    if(!this.store)fail('ARCHIVE_LOCKED');
    if(!Number.isSafeInteger(ttlMs)||ttlMs<1||ttlMs>900000)fail('INVALID_GRANT');
    const eligible=new Set(this.store.books().filter(n=>!isSystemNotebook(n)&&!isSecretNotebook(n)).map(n=>n.id));
    if(!Array.isArray(notebookIds)||!notebookIds.length&&!(write&&allowCreate)||notebookIds.some(id=>!eligible.has(id)))fail('INVALID_GRANT');
    this.checkIdentity();this.session={ids:new Set(notebookIds),write,expiresAt:this.now()+ttlMs};return this.status();
  }
  status(){
    if(this.session&&this.now()>=this.session.expiresAt)this.close();
    return {state:this.session?'ready':this.store?'awaiting_consent':'closed',backend:this.store?'incremental':undefined,archiveId:this.session?this.store.archiveId:undefined,
      notebookCount:this.session?this.session.ids.size:0,writeAllowed:!!this.session?.write,revision:this.session?this.store.revision:undefined,expiresAt:this.session?.expiresAt};
  }
  check(write=false){
    if(!this.session||!this.store)fail('ARCHIVE_LOCKED');
    if(this.now()>=this.session.expiresAt){this.close();fail('SESSION_CLOSED');}
    if(write&&!this.session.write)fail('FORBIDDEN');this.checkIdentity();return this.store.revision;
  }
  book(id){const book=this.store.book(id);if(!book||!this.session.ids.has(id)||isSystemNotebook(book)||isSecretNotebook(book))fail('NOT_FOUND');return book;}
  metadata(book,revision=this.store.revision){return {archiveId:this.store.archiveId,notebookId:book.id,seriesId:book.sid,title:this.store.title(book),author:this.store.author(book),volume:book.vol,pageCapacity:book.maxPages,revision};}
  eligible(){return this.store.books().filter(n=>this.session.ids.has(n.id)&&!isSystemNotebook(n)&&!isSecretNotebook(n));}
  assertRevision(revision,epoch=this.epoch){if(epoch!==this.epoch)fail('SESSION_CLOSED');if(this.check()!==revision)fail('REVISION_CONFLICT');}
  read({notebookId,startPage=1,limit=10}){
    const revision=this.check(),book=this.book(notebookId);
    if(!Number.isSafeInteger(startPage)||startPage<1||startPage>book.maxPages||!Number.isSafeInteger(limit)||limit<1||limit>20)fail('INVALID_RANGE');
    const pages=[];let characters=0,notes=0;
    const text=html=>{const value=plainText(html||'');characters+=value.length;if(characters>200000)fail('READ_BUDGET_EXCEEDED');return value;};
    for(let number=startPage;number<=Math.min(book.maxPages,startPage+limit-1);number++){
      const page=this.store.page(book.id,number);
      pages.push({number,text:text(page?.html),notes:(page?.notes||[]).map(note=>{if(++notes>500)fail('READ_BUDGET_EXCEEDED');return {id:note.id,text:text(note.html)};})});
    }
    this.assertRevision(revision);return {...this.metadata(book,revision),pages};
  }
  rows(after,match,ids,includeTitles=true){
    if(!ids.length)return [];
    const params=ids.map(()=>'?').join(',');
    const join=match?' JOIN documents_fts ON documents_fts.rowid=d.id':'';
    const where=match?' AND documents_fts MATCH ?':'';
    const sql=`SELECT d.* FROM documents d${match?'':' NOT INDEXED'}${join} WHERE d.id>? AND d.notebook IN (${params})${where}${includeTitles?'':" AND d.kind<>'title'"} ORDER BY d.id LIMIT 100`;
    return this.store.statement(sql).all(after,...ids,...(match?[match]:[]));
  }
  async search({query,limit=25}){
    const revision=this.check(),epoch=this.epoch;
    if(typeof query!=='string'||query.length>240||!Number.isSafeInteger(limit)||limit<1||limit>50)fail('INVALID_QUERY');
    const parsed=search.parse(query);if(parsed.error)fail('INVALID_QUERY');
    const ids=this.eligible().map(n=>n.id),match=parsed.positives.some(group=>/[^\u0000-\u024f]/u.test(group.value))?null:parsed.positives.map(group=>'"'+group.value.replaceAll('"','""')+'"').join(' AND ');
    let after=0,best=[];
    while(true){
      this.assertRevision(revision,epoch);const rows=this.rows(after,match,ids);if(!rows.length)break;
      const entries=rows.map(row=>({nbId:row.notebook,page:row.page,where:row.kind,noteId:row.note_id,text:row.text,order:row.id}));
      const result=await search.scan(entries,parsed);this.assertRevision(revision,epoch);
      best.push(...result.hits);best.sort((a,b)=>b.score-a.score||a.order-b.order);best=best.slice(0,limit);after=rows.at(-1).id;
    }
    return {archiveId:this.store.archiveId,revision,hits:best.map(hit=>{const start=Math.max(0,(hit.ranges?.[0]?.start||0)-120);return {notebookId:hit.nbId,pageNumber:hit.page,kind:hit.where,noteId:hit.noteId||undefined,excerpt:hit.text.slice(start,start+500),excerptStart:start};})};
  }
  count({word,notebookId,caseSensitive=false}){
    const revision=this.check();if(typeof word!=='string'||word.length>100||!/^\p{L}[\p{L}\p{N}\p{M}]*$/u.test(word))fail('INVALID_WORD');
    if(notebookId)this.book(notebookId);
    const target=caseSensitive?word.normalize('NFKC'):word.normalize('NFKC').toLocaleLowerCase('it');
    const ids=this.eligible().filter(n=>!notebookId||n.id===notebookId).map(n=>n.id),locations=new Map();let total=0,after=0;
    // Count bounded text batches, never media. This retains the exact Unicode
    // token/NFKC semantics of the legacy engine without FTS tokeniser omissions.
    while(true){
      const rows=this.rows(after,null,ids,false);if(!rows.length)break;
      for(const row of rows){let count=0;for(const token of row.text.matchAll(/[\p{L}\p{N}][\p{L}\p{N}\p{M}]*/gu))if((caseSensitive?token[0].normalize('NFKC'):token[0].normalize('NFKC').toLocaleLowerCase('it'))===target)count++;
        if(count){total+=count;const key=JSON.stringify([row.notebook,row.page]);locations.set(key,(locations.get(key)||0)+count);}
      }
      after=rows.at(-1).id;
    }
    this.assertRevision(revision);
    return {archiveId:this.store.archiveId,revision,word,wholeWord:true,caseSensitive,total,locations:[...locations].slice(0,1000).map(([key,count])=>{const [id,page]=JSON.parse(key);return {notebookId:id,pageNumber:page,count};}),locationsTruncated:locations.size>1000};
  }
  prepare(name,args){
    const revision=this.check(true),book=this.book(args.notebookId);
    if(args.baseRevision!==revision)fail('REVISION_CONFLICT');if(this.proposals.size>=20)fail('TOO_MANY_PROPOSALS');
    let op;
    if(name==='prepare_author_edit'){
      if(typeof args.author!=='string'||args.author.length>500)fail('INVALID_TEXT');op={type:'set_notebook_author',notebookId:book.id,beforeAuthor:this.store.author(book),afterAuthor:args.author.trim()};
    }else{
      if(!Number.isSafeInteger(args.pageNumber)||args.pageNumber<1||args.pageNumber>book.maxPages)fail('INVALID_PAGE');
      if(typeof args.text!=='string'||args.text.length>100000||!['append','replace'].includes(args.mode))fail('INVALID_EDIT');
      const before=plainText(this.store.page(book.id,args.pageNumber)?.html||'');
      op={type:'edit_page',notebookId:book.id,pageNumber:args.pageNumber,mode:args.mode,beforeText:before,afterText:args.mode==='append'?before+args.text:args.text,source:args.provenance};
    }
    const proposal={id:randomUUID(),archiveId:this.store.archiveId,baseRevision:revision,status:'proposal_only',expiresAt:this.session.expiresAt,operations:[op]};this.proposals.set(proposal.id,structuredClone(proposal));return proposal;
  }
  proposal({proposalId}){
    const revision=this.check(),value=this.proposals.get(proposalId);if(!value)fail('NOT_FOUND');for(const op of value.operations)this.book(op.notebookId);
    return {...structuredClone(value),stale:value.baseRevision!==revision,currentRevision:revision};
  }
  apply({proposalId}){
    this.check(true);if(this.applied.has(proposalId))fail('HANDLE_SPENT');const proposal=this.proposal({proposalId});if(proposal.stale)fail('REVISION_CONFLICT');
    const op=proposal.operations[0];this.book(op.notebookId);let change;
    if(op.type==='set_notebook_author'){
      if(this.store.author(this.book(op.notebookId))!==op.beforeAuthor)fail('REVISION_CONFLICT');change={author:op.afterAuthor};
    }else{
      const page=this.store.page(op.notebookId,op.pageNumber)||{html:'',st:[],notes:[]};if(plainText(page.html||'')!==op.beforeText)fail('REVISION_CONFLICT');
      page.html=op.mode==='append'?(page.html||'')+textHtml(op.afterText.slice(op.beforeText.length)):textHtml(op.afterText);if(op.source)page.connectorSource=op.source;change={pageNumber:op.pageNumber,pageValue:page};
    }
    this.applied.add(proposalId);
    try{
      const saved=this.store.commit({baseRevision:proposal.baseRevision,notebookId:op.notebookId,...change,expires:()=>!this.session||this.now()>=this.session.expiresAt});
      return {status:'saved',backend:'incremental',archiveId:this.store.archiveId,notebookId:op.notebookId,pageNumber:op.pageNumber,revision:saved.revision,checkpoint:true,checkpointId:saved.checkpointId};
    }catch(e){if(['REVISION_CONFLICT','SESSION_CLOSED'].includes(e.code))throw e;fail('SAVE_FAILED');}
  }
  async call(name,args={}){
    this.check();
    if(name==='list_notebooks'){
      const {offset=0,limit=50}=args;if(!Number.isSafeInteger(offset)||offset<0||offset>10000||!Number.isSafeInteger(limit)||limit<1||limit>100)fail('INVALID_RANGE');
      const revision=this.store.revision,books=this.eligible();return {items:books.slice(offset,offset+limit).map(n=>this.metadata(n,revision)),nextOffset:offset+limit<books.length?offset+limit:null};
    }
    if(name==='read_notebook')return this.read(args);if(name==='search_notebooks')return this.search(args);if(name==='count_word')return this.count(args);
    if(name==='prepare_edit'||name==='prepare_author_edit')return this.prepare(name,args);if(name==='read_proposal')return this.proposal(args);if(name==='apply_proposal')return this.apply(args);fail('INVALID_TOOL_OR_ARGUMENTS');
  }
  close(){++this.epoch;this.session=null;this.proposals.clear();this.applied.clear();this.store?.close();this.store=null;this.filename=null;}
}
