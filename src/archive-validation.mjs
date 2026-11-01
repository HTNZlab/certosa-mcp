import {isDeepStrictEqual} from 'node:util';
import {validateArchive,archiveError} from './archive-format.mjs';
import {Zip,Copia} from './archive-native-codec.mjs';
import {nativeImportPlan} from './archive-native-import.mjs';

export function validateCompatiblePack(pack){
  validateArchive(pack);
  const books=[...pack.lib.notebooks,...(pack.lib.trash||[]).map(t=>t.nb)];
  for(const book of books)for(const page of book.pages){
    if(!page)continue;
    for(const item of page.st||[])if(item.hash&&!Object.hasOwn(pack.blobs||{},item.hash))throw archiveError('MISSING_ATTACHMENT');
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
