import {isDeepStrictEqual} from 'node:util';
import {validateArchive,archiveError} from './archive-format.mjs';
import {Zip,Copia} from './archive-native-codec.mjs';
import {nativeImportPlan} from './archive-native-import.mjs';

// Native Blobs contract from src/03b-store.js; exact parity is regression-tested.
// Storage of file attachments does not extend the app's rendering whitelist.
export const APP_MEDIA_MIME=/^(image\/(png|jpeg|jpg|gif|webp|avif)|video\/(mp4|webm|ogg|quicktime))$/i;
export const APP_FILE_MIME=/^(application\/(octet-stream|pdf|rtf|msword|vnd\.ms-(excel|powerpoint)|vnd\.openxmlformats-officedocument\.(wordprocessingml\.document|spreadsheetml\.sheet|presentationml\.presentation)|vnd\.oasis\.opendocument\.(text|spreadsheet|presentation)|json|xml|yaml|x-yaml|ogg)|text\/(plain|csv|tab-separated-values|markdown|x-markdown|xml|yaml|x-yaml|rtf|vtt)|audio\/(wav|x-wav|wave|vnd\.wave|x-pn-wav|mpeg|mp3|mp4|aac|ogg|webm|flac|x-flac|opus|aiff|x-aiff))$/i;
const fileMime=mime=>APP_MEDIA_MIME.test(mime)||APP_FILE_MIME.test(mime);
function dataMime(value){
  const match=typeof value==='string'&&value.startsWith('data:')&&/^data:([^,;]+);base64,([A-Za-z0-9+/]*={0,2})$/i.exec(value);
  if(!match||!fileMime(match[1])||match[2].length%4===1||match[2].includes('=')&&match[2].length%4!==0)throw archiveError('INCOMPATIBLE_IMPORT');
  return match[1];
}
export function validateCompatiblePack(pack){
  validateArchive(pack);
  const mimeByHash=new Map(Object.entries(pack.blobs||{}).map(([hash,value])=>[hash,dataMime(value)]));
  const books=[...pack.lib.notebooks,...(pack.lib.trash||[]).map(t=>t.nb)];
  for(const book of books)for(const page of book.pages){
    if(!page)continue;
    for(const item of page.st||[]){
      if(item.hash&&!Object.hasOwn(pack.blobs||{},item.hash))throw archiveError('MISSING_ATTACHMENT');
      const mime=item.hash?mimeByHash.get(item.hash):item.src?dataMime(item.src):null,allowed=item.kind==='file'?fileMime:m=>APP_MEDIA_MIME.test(m);
      if(mime&&!allowed(mime)||item.mime!==undefined&&!allowed(item.mime))throw archiveError('INCOMPATIBLE_IMPORT');
    }
  }
  // The real app planner needs catalogue/history metadata, not page payloads.
  const metadata=book=>{const {pages,...rest}=book;return {...rest,pages:[]};};
  const source={series:pack.lib.series,notebooks:pack.lib.notebooks.map(metadata),trash:(pack.lib.trash||[]).map(t=>({...t,nb:metadata(t.nb)}))};
  let plan;try{plan=nativeImportPlan(source);}catch{throw archiveError('INCOMPATIBLE_IMPORT');}
  if(plan.incoming.length!==source.notebooks.length||plan.incoming.some((n,i)=>n.sid!==source.notebooks[i].sid))throw archiveError('INCOMPATIBLE_IMPORT');
  return {valid:true,format:'certosa/2',attachmentChecksumsVerified:true,attachmentReferencesVerified:true,nativeImportPlanVerified:true};
}
export async function verifyNativeExport(bytes,password,expected){
  const decoded=await Zip.unpackJSON(await Copia.decifra(new Uint8Array(bytes),password));
  validateCompatiblePack(decoded);
  // JSON is the Certosa contract: sparse page slots serialize as null, and
  // optional undefined properties are absent. Compare that exact value model.
  if(!isDeepStrictEqual(decoded,JSON.parse(JSON.stringify(expected))))throw archiveError('EXPORT_READBACK_MISMATCH');
  return {nativeReaderVerified:true,allValuesPreserved:true,nativeImportPlanVerified:true};
}
