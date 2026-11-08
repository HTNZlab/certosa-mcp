// Current CRTS2/AES-GCM + gzip certosa/2 format. No browser, storage migration or password logging.
import {pbkdf2 as derive,randomBytes,createCipheriv,createDecipheriv,createHash} from 'node:crypto';
import {promisify} from 'node:util';
import {gzipSync,gunzipSync} from 'node:zlib';

const pbkdf2=promisify(derive);
export const MAX_FILE_BYTES=256*1024*1024,MAX_JSON_BYTES=512*1024*1024;
const MAGIC=Buffer.from([0x43,0x52,0x54,0x53,2,0]);
export const archiveError=code=>Object.assign(Error(code),{code});
const fail=code=>{throw archiveError(code);};
export const isEncrypted=bytes=>bytes.length>=6&&Buffer.from(bytes).subarray(0,6).equals(MAGIC);
export const hashBytes=bytes=>createHash('sha256').update(bytes).digest('hex');
export async function createArchiveKey(password){
  if(typeof password!=='string'||!password.length)fail('PASSWORD_REQUIRED');
  const salt=randomBytes(16),iterations=600000,key=await pbkdf2(password,salt,iterations,32,'sha256');return {key,salt,iterations};
}
export function validateArchive(pack){
  const object=v=>v!==null&&typeof v==='object'&&!Array.isArray(v);
  const id=v=>typeof v==='string'&&/^[A-Za-z0-9_-]{1,128}$/.test(v);
  const unique=items=>{const seen=new Set();for(const item of items){if(!object(item)||!id(item.id)||seen.has(item.id))fail('INVALID_ARCHIVE');seen.add(item.id);}};
  if(!object(pack)||pack.formato!=='certosa/2'||!object(pack.lib))fail('INVALID_ARCHIVE');
  const lib=pack.lib;
  if(lib._pageStore||!Array.isArray(lib.series)||!Array.isArray(lib.notebooks)||lib.series.length>10000||lib.notebooks.length>10000)fail('INVALID_ARCHIVE');
  unique(lib.series);unique(lib.notebooks);
  const series=new Set(lib.series.map(s=>s.id));
  if(lib.series.some(s=>typeof s.label!=='string'||!s.label.trim()||s.label.length>10000))fail('INVALID_ARCHIVE');
  let total=0;
  const notebook=(n,active=true)=>{
    if(!object(n)||!id(n.id)||!id(n.sid)||active&&!series.has(n.sid)||!Array.isArray(n.pages)||!Number.isSafeInteger(n.maxPages)||n.maxPages<1||n.maxPages>10000||n.pages.length>n.maxPages+1||(total+=n.pages.length)>100000)fail('INVALID_ARCHIVE');
    for(const p of n.pages){
      if(p==null)continue;
      if(!object(p)||p.$page||p.html!==undefined&&typeof p.html!=='string')fail('INVALID_ARCHIVE');
      for(const field of ['notes','st'])if(p[field]!==undefined&&!Array.isArray(p[field]))fail('INVALID_ARCHIVE');
      if((p.notes?.length||0)>10000||(p.st?.length||0)>10000)fail('INVALID_ARCHIVE');
      for(const note of p.notes||[])if(!object(note)||typeof note.id!=='string'||note.html!==undefined&&typeof note.html!=='string')fail('INVALID_ARCHIVE');
      for(const attachment of p.st||[])if(!object(attachment)||attachment.hash!==undefined&&!/^[a-fA-F0-9]{64}$/.test(attachment.hash))fail('INVALID_ARCHIVE');
    }
  };
  lib.notebooks.forEach(n=>notebook(n));
  if(lib.trash!==undefined){if(!Array.isArray(lib.trash)||lib.trash.length>10000)fail('INVALID_ARCHIVE');for(const entry of lib.trash){if(!object(entry))fail('INVALID_ARCHIVE');notebook(entry.nb,false);}}
  if(pack.blobs!==undefined&&!object(pack.blobs))fail('INVALID_ARCHIVE');
  for(const [hash,value] of Object.entries(pack.blobs||{})){
    if(!/^[a-fA-F0-9]{64}$/.test(hash)||typeof value!=='string'||!/^data:[^,;]+;base64,[A-Za-z0-9+/]*={0,2}$/.test(value))fail('INVALID_ATTACHMENT');
    const bytes=Buffer.from(value.slice(value.indexOf(',')+1),'base64');
    if(hashBytes(bytes)!==hash.toLowerCase())fail('INVALID_ATTACHMENT');
  }
  return pack;
}
export function decodePayload(bytes){
  let json;
  try{json=bytes[0]===0x1f&&bytes[1]===0x8b?gunzipSync(bytes,{maxOutputLength:MAX_JSON_BYTES}):Buffer.from(bytes);}
  catch{fail('INVALID_ARCHIVE');}
  if(json.length>MAX_JSON_BYTES)fail('ARCHIVE_TOO_LARGE');
  try{return validateArchive(JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(json)));}
  catch(e){if(e.code)throw e;fail('INVALID_ARCHIVE');}
  finally{json.fill(0);}
}
export async function unlockArchiveBytes(bytes,password){
  if(bytes.length>MAX_FILE_BYTES)fail('ARCHIVE_TOO_LARGE');
  if(typeof password!=='string'||!password.length)fail('PASSWORD_REQUIRED');
  if(!isEncrypted(bytes)){
    const pack=decodePayload(bytes),salt=randomBytes(16),iterations=600000;
    const key=await pbkdf2(password,salt,iterations,32,'sha256');
    return {pack,key,salt,iterations,legacy:true};
  }
  if(bytes.length<54)fail('INVALID_ARCHIVE');
  const header=bytes.subarray(0,38),iterations=header.readUInt32BE(6);
  if(iterations<100000||iterations>20000000)fail('INVALID_ARCHIVE');
  const salt=Buffer.from(header.subarray(10,26)),key=await pbkdf2(password,salt,iterations,32,'sha256');
  let payload;
  try{
    const decipher=createDecipheriv('aes-256-gcm',key,header.subarray(26,38));
    decipher.setAAD(header);decipher.setAuthTag(bytes.subarray(-16));
    payload=Buffer.concat([decipher.update(bytes.subarray(38,-16)),decipher.final()]);
  }catch{key.fill(0);fail('UNLOCK_FAILED');}
  try{return {pack:decodePayload(payload),key,salt,iterations,legacy:false};}
  catch(e){key.fill(0);throw e;}
  finally{payload.fill(0);}
}
export function encryptArchive(pack,material){
  const plain=Buffer.from(JSON.stringify(validateArchive(pack)),'utf8');
  if(plain.length>MAX_JSON_BYTES){plain.fill(0);fail('ARCHIVE_TOO_LARGE');}
  const zipped=gzipSync(plain);plain.fill(0);
  const header=Buffer.alloc(38);MAGIC.copy(header);header.writeUInt32BE(material.iterations,6);material.salt.copy(header,10);randomBytes(12).copy(header,26);
  try{
    const cipher=createCipheriv('aes-256-gcm',material.key,header.subarray(26,38));cipher.setAAD(header);
    const result=Buffer.concat([header,cipher.update(zipped),cipher.final(),cipher.getAuthTag()]);
    if(result.length>MAX_FILE_BYTES)fail('ARCHIVE_TOO_LARGE');return result;
  }finally{zipped.fill(0);}
}
