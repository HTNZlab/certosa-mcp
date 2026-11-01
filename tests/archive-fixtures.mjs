import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import {fileURLToPath} from 'node:url';
import {webcrypto,randomBytes,createHash} from 'node:crypto';
const root=new URL('../',import.meta.url);
const code=fs.readFileSync(new URL('test-support/archive-native.html',root),'utf8').split('<script>')[1].split('</script>')[0];
const context={crypto:webcrypto,TextEncoder,TextDecoder,CompressionStream,DecompressionStream,Blob,Response,Uint8Array,DataView,btoa,atob,T:value=>value};
vm.createContext(context);vm.runInContext(code+';globalThis.native={Zip,Copia};',context);
export const native=context.native;
export const project=fileURLToPath(new URL('../',import.meta.url));
export function packFixture(){
  const bytes=randomBytes(128),hash=createHash('sha256').update(bytes).digest('hex');
  return {formato:'certosa/2',creato:1,foreignField:{preserve:true},blobs:{[hash]:'data:image/png;base64,'+bytes.toString('base64')},lib:{v:2,settings:{privateSetting:'preserve'},trash:[{id:'deleted',nb:{id:'deleted-notebook',sid:'removed-series',maxPages:2,pages:[null,{html:'cosa cestino',st:[],notes:[]}]}}],
    series:[{id:'one',label:'Usi Interessanti'},{id:'two',label:'Secondo cosa'},{id:'private',label:'Passwords'}],notebooks:[
      {id:'first',sid:'one',vol:1,maxPages:40,foreignNotebookField:3,pages:[null,{html:'<div><b>Cosa</b> cosa cosacca cosa.</div>',st:[{id:'image',hash,mime:'image/png',x:1,y:2,w:30}],notes:[{id:'note',html:'<div>Una cosa annotata</div>',x:3,y:4,w:20}],unknownPageField:'keep'}]},
      {id:'second',sid:'two',vol:1,maxPages:40,pages:[null,{html:'<div>cosa una altra cosa</div>',st:[],notes:[]}]},
      {id:'reserved',sid:'private',vol:1,maxPages:40,sensitivity:'secret',pages:[null,{html:'<div>cosa riservata</div>',st:[],notes:[]}],localCredential:{secret:randomBytes(32).toString('hex')}}
    ]}};
}
export async function fixture(folder,pack=packFixture()){
  fs.mkdirSync(folder,{recursive:true});
  const password=randomBytes(24).toString('hex'),file=path.join(folder,'synthetic.certosa');
  const compressed=await native.Zip.packJSON(pack),encrypted=await native.Copia.cifra(compressed,password);
  fs.writeFileSync(file,encrypted,{flag:'wx'});
  return {file,password,pack,bytes:Buffer.from(encrypted)};
}
