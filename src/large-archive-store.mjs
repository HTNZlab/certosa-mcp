// SQLite3 Multiple Ciphers: the entire catalogue, FTS, history and WAL are encrypted.
// Pages are independently compressed; media are immutable, deduplicated chunks.
import Database from 'better-sqlite3-multiple-ciphers';
import fs from 'node:fs';
import path from 'node:path';
import {randomUUID,createHash} from 'node:crypto';
import {gzipSync,gunzipSync} from 'node:zlib';
import {archiveError,validateArchive,MAX_JSON_BYTES} from './archive-format.mjs';
import {projectDirectory} from './archive-paths.mjs';
import {plainText,SEARCH_TEXT_VERSION} from './archive-text.mjs';

export const MEDIA_CHUNK_BYTES=3*1024*1024;
const fail=code=>{throw archiveError(code);};
const encode=value=>{const bytes=Buffer.from(JSON.stringify(value));return {data:gzipSync(bytes),bytes:bytes.length};};
const decode=bytes=>JSON.parse(gunzipSync(bytes,{maxOutputLength:MAX_JSON_BYTES}).toString('utf8'));
export const isSystemNotebook=n=>n.systemRole==='manuale-certosa'||n.id==='certosa_manual_notebook';
export const isSecretNotebook=n=>n.sensitivity==='secret'||!!n.localCredential;

function connection(filename,password,{create=false,readonly=false}={}){
  let db;
  try{
    db=new Database(path.toNamespacedPath(filename),{fileMustExist:!create,readonly,timeout:1000});
    db.pragma("cipher='sqlcipher'");db.pragma('legacy=0');db.pragma('kdf_iter=600000');
    db.pragma('kdf_algorithm=2');db.pragma('hmac_algorithm=2');db.pragma('hmac_use=1');db.pragma('plaintext_header_size=0');
    const key=Buffer.from(password,'utf8');try{db.key(key);}finally{key.fill(0);}
    db.pragma('temp_store=MEMORY');db.pragma('cache_size=-16384');db.pragma('mmap_size=0');db.pragma('trusted_schema=OFF');
    db.pragma('foreign_keys=ON');db.pragma('secure_delete=ON');
    if(!readonly){db.pragma('journal_mode=WAL');db.pragma('synchronous=FULL');}
    return db;
  }catch{try{db?.close();}catch{}fail('UNLOCK_FAILED');}
}

export class LargeArchiveStore{
  constructor(db,filename,{building=false}={}){
    this.db=db;this.filename=filename;this.statements=new Map();
    const format=this.getMeta('format');if(format?.version!==1||format?.kind!=='certosa-incremental'||!building&&this.getMeta('complete')!==true)fail('INVALID_ARCHIVE');
    this.archiveId=format.id;
    if(!building)this.ensureSearchIndex();
  }
  static open(filename,password){
    const db=connection(filename,password);try{return new LargeArchiveStore(db,filename);}catch(e){db.close();throw e;}
  }
  static create(filename,password,pack){
    validateArchive(pack);if(fs.existsSync(filename))fail('DESTINATION_EXISTS');
    const staging=filename+'.building-'+randomUUID();
    const fd=fs.openSync(staging,'wx',0o600);fs.closeSync(fd);
    const db=connection(staging,password,{create:true});
    try{
      db.exec(`
        CREATE TABLE meta(key TEXT PRIMARY KEY,data BLOB NOT NULL,bytes INTEGER NOT NULL) WITHOUT ROWID;
        CREATE TABLE notebooks(id TEXT PRIMARY KEY,position INTEGER NOT NULL,metadata BLOB NOT NULL,bytes INTEGER NOT NULL,pages_length INTEGER NOT NULL) WITHOUT ROWID;
        CREATE TABLE pages(notebook TEXT NOT NULL,number INTEGER NOT NULL,data BLOB NOT NULL,bytes INTEGER NOT NULL,PRIMARY KEY(notebook,number),FOREIGN KEY(notebook) REFERENCES notebooks(id)) WITHOUT ROWID;
        CREATE TABLE chunks(hash TEXT PRIMARY KEY,data BLOB NOT NULL,encoding TEXT NOT NULL,bytes INTEGER NOT NULL) WITHOUT ROWID;
        CREATE TABLE attachments(hash TEXT PRIMARY KEY,prefix TEXT NOT NULL,bytes INTEGER NOT NULL,chunks BLOB NOT NULL) WITHOUT ROWID;
        CREATE TABLE history(id TEXT PRIMARY KEY,revision INTEGER NOT NULL,notebook TEXT NOT NULL,page INTEGER,kind TEXT NOT NULL,before_data BLOB,before_bytes INTEGER,before_length INTEGER) WITHOUT ROWID;
        CREATE TABLE documents(id INTEGER PRIMARY KEY,notebook TEXT NOT NULL,page INTEGER NOT NULL,kind TEXT NOT NULL,note_id TEXT,text TEXT NOT NULL);
        CREATE INDEX documents_location ON documents(notebook,page,kind);
        CREATE VIRTUAL TABLE documents_fts USING fts5(text,content='documents',content_rowid='id',tokenize='unicode61 remove_diacritics 2');
        CREATE TRIGGER documents_ai AFTER INSERT ON documents BEGIN INSERT INTO documents_fts(rowid,text) VALUES(new.id,new.text); END;
        CREATE TRIGGER documents_ad AFTER DELETE ON documents BEGIN INSERT INTO documents_fts(documents_fts,rowid,text) VALUES('delete',old.id,old.text); END;
        CREATE TRIGGER documents_au AFTER UPDATE ON documents BEGIN INSERT INTO documents_fts(documents_fts,rowid,text) VALUES('delete',old.id,old.text); INSERT INTO documents_fts(rowid,text) VALUES(new.id,new.text); END;
      `);
      const insertMeta=db.prepare('INSERT INTO meta VALUES(?,?,?)'),insertNotebook=db.prepare('INSERT INTO notebooks VALUES(?,?,?,?,?)'),insertPage=db.prepare('INSERT INTO pages VALUES(?,?,?,?)');
      const set=(key,value)=>{const record=encode(value);insertMeta.run(key,record.data,record.bytes);};
      const root=structuredClone(pack);delete root.blobs;delete root.lib.notebooks;
      db.transaction(()=>{
        set('format',{kind:'certosa-incremental',version:1,id:'archive-'+randomUUID()});set('complete',false);set('revision',0);set('root',root);
        pack.lib.notebooks.forEach((book,index)=>{
          const metadata=structuredClone(book);delete metadata.pages;const record=encode(metadata);
          insertNotebook.run(book.id,index,record.data,record.bytes,book.pages.length);
          book.pages.forEach((page,number)=>{if(page!=null){const value=encode(page);insertPage.run(book.id,number,value.data,value.bytes);}});
        });
      }).immediate();
      const store=new LargeArchiveStore(db,staging,{building:true});
      for(const [hash,data] of Object.entries(pack.blobs||{})){
        const comma=data.indexOf(','),base64=data.slice(comma+1);
        function* input(){for(let start=0;start<base64.length;start+=4*1024*1024)yield Buffer.from(base64.slice(start,start+4*1024*1024),'base64');}
        const added=store.putAttachment(input(),{prefix:data.slice(0,comma+1)});if(added.hash!==hash.toLowerCase())fail('INVALID_ATTACHMENT');
      }
      db.transaction(()=>{store.ensureSearchIndex();store.setMeta('complete',true);}).immediate();
      store.close();fs.linkSync(staging,filename);fs.unlinkSync(staging);
      return LargeArchiveStore.open(filename,password);
    }catch(e){if(db.open)db.close();throw e;}
  }
  statement(sql){let statement=this.statements.get(sql);if(!statement){statement=this.db.prepare(sql);this.statements.set(sql,statement);}return statement;}
  getMeta(key){const row=this.statement('SELECT data FROM meta WHERE key=?').get(key);return row?decode(row.data):undefined;}
  setMeta(key,value){const data=encode(value);this.statement('INSERT INTO meta VALUES(?,?,?) ON CONFLICT(key) DO UPDATE SET data=excluded.data,bytes=excluded.bytes').run(key,data.data,data.bytes);}
  get revision(){return this.getMeta('revision');}
  markSearchIndex(){this.setMeta('searchIndex',{textVersion:SEARCH_TEXT_VERSION,revision:this.revision});}
  advanceRevision(revision){this.setMeta('revision',revision);this.markSearchIndex();}
  ensureSearchIndex(){
    const current=()=>{const marker=this.getMeta('searchIndex');return marker?.textVersion===SEARCH_TEXT_VERSION&&marker.revision===this.revision;};
    if(current())return false;
    // Rebuild only derived text/FTS, including detection of writes by an older
    // client that advances the archive revision without updating this marker.
    return this.db.transaction(()=>{
      if(current())return false;
      this.statement('DELETE FROM documents').run();
      for(const row of this.statement('SELECT id FROM notebooks ORDER BY position').all()){
        this.indexTitle(row.id);
        for(const page of this.statement('SELECT number FROM pages WHERE notebook=? ORDER BY number').all(row.id))this.indexPage(row.id,page.number);
      }
      this.markSearchIndex();return true;
    }).immediate();
  }
  books(){return this.statement('SELECT id,metadata FROM notebooks ORDER BY position').all().map(row=>decode(row.metadata));}
  book(id){const row=this.statement('SELECT metadata FROM notebooks WHERE id=?').get(id);return row?decode(row.metadata):null;}
  page(id,number){const row=this.statement('SELECT data FROM pages WHERE notebook=? AND number=?').get(id,number);return row?decode(row.data):null;}
  title(book){return this.getMeta('root').lib.series.find(s=>s.id===book.sid)?.label||'';}
  author(book){const series=this.getMeta('root').lib.series.find(s=>s.id===book.sid);return String(typeof book.author==='string'?book.author:typeof series?.author==='string'?series.author:'').slice(0,500);}
  indexTitle(id){
    const book=this.book(id);this.statement("DELETE FROM documents WHERE notebook=? AND kind='title'").run(id);
    if(!isSystemNotebook(book)&&!isSecretNotebook(book))this.statement("INSERT INTO documents(notebook,page,kind,text) VALUES(?,1,'title',?)").run(id,this.title(book)+(this.author(book)?'\n'+this.author(book):''));
  }
  indexPage(id,number){
    this.statement("DELETE FROM documents WHERE notebook=? AND page=? AND kind<>'title'").run(id,number);
    const page=this.page(id,number),book=this.book(id);if(!page||!number||isSystemNotebook(book)||isSecretNotebook(book))return;
    const add=this.statement('INSERT INTO documents(notebook,page,kind,note_id,text) VALUES(?,?,?,?,?)');
    add.run(id,number,'page',null,plainText(page.html||''));for(const note of page.notes||[])add.run(id,number,'note',note.id,plainText(note.html||''));
  }
  attachmentWriter({prefix='data:application/octet-stream;base64,'}={}){
    if(!/^data:[^,;]+;base64,$/.test(prefix))fail('INVALID_ATTACHMENT');
    const hash=createHash('sha256'),chunks=[];let bytes=0;
    const add=this.statement('INSERT OR IGNORE INTO chunks VALUES(?,?,?,?)');
    const insert=this.db.transaction((data)=>{
      const digest=createHash('sha256').update(data).digest('hex');
      const zipped=/^data:(?:text\/|application\/(?:json|xml))/.test(prefix)?gzipSync(data,{level:3}):null;
      const compressed=zipped&&zipped.length+64<data.length;
      add.run(digest,compressed?zipped:data,compressed?'gzip':'raw',data.length);return digest;
    });
    // Bounded reblocking avoids retaining an entire media object in memory.
    let carry=Buffer.alloc(0);
    return {
      write:value=>{
        const incoming=Buffer.from(value);hash.update(incoming);bytes+=incoming.length;
        const joined=carry.length?Buffer.concat([carry,incoming]):incoming;let start=0;
        while(start+MEDIA_CHUNK_BYTES<=joined.length){chunks.push(insert.immediate(joined.subarray(start,start+MEDIA_CHUNK_BYTES)));start+=MEDIA_CHUNK_BYTES;}
        carry=Buffer.from(joined.subarray(start));
      },
      finish:()=>{
        if(carry.length)chunks.push(insert.immediate(carry));
        const digest=hash.digest('hex');this.statement('INSERT OR IGNORE INTO attachments VALUES(?,?,?,?)').run(digest,prefix,bytes,encode(chunks).data);
        return {hash:digest,bytes,chunks:chunks.length};
      }
    };
  }
  putAttachment(input,options){const writer=this.attachmentWriter(options);for(const chunk of input)writer.write(chunk);return writer.finish();}
  async putAttachmentStream(input,options){const writer=this.attachmentWriter(options);for await(const chunk of input)writer.write(chunk);return writer.finish();}
  *attachment(hash){
    const object=this.statement('SELECT chunks,bytes FROM attachments WHERE hash=?').get(hash);if(!object)fail('INVALID_ATTACHMENT');
    let size=0;const digest=createHash('sha256');
    for(const id of decode(object.chunks)){
      const row=this.statement('SELECT data,encoding,bytes FROM chunks WHERE hash=?').get(id);if(!row)fail('INVALID_ATTACHMENT');
      const value=row.encoding==='gzip'?gunzipSync(row.data,{maxOutputLength:MEDIA_CHUNK_BYTES}):row.data;
      if(value.length!==row.bytes||createHash('sha256').update(value).digest('hex')!==id)fail('INVALID_ATTACHMENT');
      size+=value.length;digest.update(value);yield value;
    }
    if(size!==object.bytes||digest.digest('hex')!==hash)fail('INVALID_ATTACHMENT');
  }
  exportPack({maxBytes=MAX_JSON_BYTES}={}){
    const media=this.statement('SELECT hash,prefix,bytes FROM attachments').all();
    const jsonRows=this.statement('SELECT COALESCE(SUM(bytes),0) AS bytes FROM pages').get().bytes+this.statement('SELECT COALESCE(SUM(bytes),0) AS bytes FROM notebooks').get().bytes+this.statement('SELECT bytes FROM meta WHERE key=?').get('root').bytes;
    if(jsonRows+media.reduce((sum,row)=>sum+row.prefix.length+4*Math.ceil(row.bytes/3)+row.hash.length+10,0)>maxBytes)fail('LEGACY_EXPORT_TOO_LARGE');
    const pack=this.getMeta('root');pack.lib.notebooks=[];pack.blobs={};
    for(const row of this.statement('SELECT id,metadata,pages_length FROM notebooks ORDER BY position').all()){
      const book=decode(row.metadata);book.pages=Array(row.pages_length).fill(null);
      for(const page of this.statement('SELECT number,data FROM pages WHERE notebook=? ORDER BY number').all(row.id))book.pages[page.number]=decode(page.data);
      pack.lib.notebooks.push(book);
    }
    for(const object of media)pack.blobs[object.hash]=object.prefix+Buffer.concat([...this.attachment(object.hash)]).toString('base64');
    if(Buffer.byteLength(JSON.stringify(pack))>maxBytes)fail('LEGACY_EXPORT_TOO_LARGE');return validateArchive(pack);
  }
  createNotebook(series,book){
    const root=this.getMeta('root'),before=encode(root),id=randomUUID();root.lib.series.push(series);this.setMeta('root',root);
    const data=encode(book);this.statement('INSERT INTO notebooks VALUES(?,?,?,?,?)').run(book.id,this.statement('SELECT COALESCE(MAX(position)+1,0) AS n FROM notebooks').get().n,data.data,data.bytes,0);
    this.statement('INSERT INTO history VALUES(?,?,?,?,?,?,?,?)').run(id,this.revision,book.id,null,'creation',before.data,before.bytes,null);this.indexTitle(book.id);return {checkpointId:id};
  }
  commit({baseRevision,notebookId,pageNumber,author,metadata,pageValue,expires=()=>false,advanceRevision=true}){
    return this.db.transaction(()=>{
      if(this.revision!==baseRevision)fail('REVISION_CONFLICT');if(expires())fail('SESSION_CLOSED');
      this.ensureSearchIndex();
      const id=randomUUID(),kind=author===undefined&&metadata===undefined?'page':'author';
      const old=kind==='page'?this.statement('SELECT data,bytes FROM pages WHERE notebook=? AND number=?').get(notebookId,pageNumber):this.statement('SELECT metadata AS data,bytes FROM notebooks WHERE id=?').get(notebookId);
      const beforeLength=this.statement('SELECT pages_length FROM notebooks WHERE id=?').get(notebookId)?.pages_length;
      this.statement('INSERT INTO history VALUES(?,?,?,?,?,?,?,?)').run(id,baseRevision,notebookId,pageNumber??null,kind,old?.data||null,old?.bytes||null,beforeLength??null);
      if(kind==='page'){
        const value=encode(pageValue);this.statement('INSERT INTO pages VALUES(?,?,?,?) ON CONFLICT(notebook,number) DO UPDATE SET data=excluded.data,bytes=excluded.bytes').run(notebookId,pageNumber,value.data,value.bytes);
        this.statement('UPDATE notebooks SET pages_length=MAX(pages_length,?) WHERE id=?').run(pageNumber+1,notebookId);this.indexPage(notebookId,pageNumber);
      }else{
        const book=this.book(notebookId);Object.assign(book,metadata||{author});const value=encode(book);this.statement('UPDATE notebooks SET metadata=?,bytes=? WHERE id=?').run(value.data,value.bytes,notebookId);this.indexTitle(notebookId);
      }
      if(expires())fail('SESSION_CLOSED');if(advanceRevision)this.advanceRevision(baseRevision+1);
      return {revision:baseRevision+1,checkpointId:id};
    }).immediate();
  }
  restoreChange(id,{baseRevision=this.revision}={}){
    const change=this.statement('SELECT * FROM history WHERE id=?').get(id);if(!change)fail('NOT_FOUND');if(change.kind==='creation')fail('MANUAL_RECOVERY_REQUIRED');
    return this.db.transaction(()=>{
      if(this.revision!==baseRevision)fail('REVISION_CONFLICT');
      this.ensureSearchIndex();
      const current=change.kind==='page'?this.statement('SELECT data,bytes FROM pages WHERE notebook=? AND number=?').get(change.notebook,change.page):this.statement('SELECT metadata AS data,bytes FROM notebooks WHERE id=?').get(change.notebook);
      const currentLength=this.statement('SELECT pages_length FROM notebooks WHERE id=?').get(change.notebook).pages_length,checkpointId=randomUUID();
      this.statement('INSERT INTO history VALUES(?,?,?,?,?,?,?,?)').run(checkpointId,baseRevision,change.notebook,change.page,change.kind,current?.data||null,current?.bytes||null,currentLength);
      if(change.kind==='page'){
        if(change.before_data)this.statement('INSERT INTO pages(notebook,number,data,bytes) VALUES(?,?,?,?) ON CONFLICT(notebook,number) DO UPDATE SET data=excluded.data,bytes=excluded.bytes').run(change.notebook,change.page,change.before_data,change.before_bytes);
        else this.statement('DELETE FROM pages WHERE notebook=? AND number=?').run(change.notebook,change.page);
        const last=this.statement('SELECT COALESCE(MAX(number)+1,0) AS n FROM pages WHERE notebook=?').get(change.notebook).n;
        this.statement('UPDATE notebooks SET pages_length=? WHERE id=?').run(Math.max(change.before_length||0,last),change.notebook);
        this.indexPage(change.notebook,change.page);
      }else{this.statement('UPDATE notebooks SET metadata=?,bytes=? WHERE id=?').run(change.before_data,change.before_bytes,change.notebook);this.indexTitle(change.notebook);}
      this.advanceRevision(baseRevision+1);return {revision:baseRevision+1,checkpointId,restoredFrom:id};
    }).immediate();
  }
  stats(){return {chunks:this.statement('SELECT COUNT(*) AS n FROM chunks').get().n,mediaBytes:this.statement('SELECT COALESCE(SUM(bytes),0) AS n FROM attachments').get().n,history:this.statement('SELECT COUNT(*) AS n FROM history').get().n,pages:this.statement('SELECT COUNT(*) AS n FROM pages').get().n};}
  checkpoint(){return this.db.pragma('wal_checkpoint(TRUNCATE)');}
  snapshot(filename,{valid=()=>true}={}){
    if(fs.existsSync(filename))fail('DESTINATION_EXISTS');
    const temporary=filename+'.snapshot-'+randomUUID();
    const fd=fs.openSync(temporary,'wx',0o600);fs.closeSync(fd);
    try{
      // SQLite3MC VACUUM INTO retains source encryption; unlike its generic
      // backup API, this path is verified to reopen with the source password.
      this.statement('VACUUM INTO ?').run(path.toNamespacedPath(temporary));
      const handle=fs.openSync(temporary,'r+');try{const header=Buffer.alloc(16);fs.readSync(handle,header,0,16,0);if(header.toString().startsWith('SQLite format'))fail('SAVE_FAILED');fs.fsyncSync(handle);}finally{fs.closeSync(handle);}
      if(!valid())fail('SESSION_CLOSED');fs.linkSync(temporary,filename);
      return {status:'saved',format:'certosa-incremental/1'};
    }finally{try{fs.unlinkSync(temporary);}catch{}}
  }
  close(){if(this.db?.open)this.db.close();this.statements.clear();}
}
