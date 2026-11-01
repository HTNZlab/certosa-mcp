#!/usr/bin/env node
// Standalone lab bootstrap for the distributable package. No app/profile bundled.
import fs from 'node:fs';
import path from 'node:path';
import {gunzipSync} from 'node:zlib';
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const args=new Map();
for(let i=2;i<process.argv.length;i+=2){if(!process.argv[i].startsWith('--')||!process.argv[i+1])throw Error('EXPECTED_NAMED_ARGUMENTS');args.set(process.argv[i],process.argv[i+1]);}
if(!args.has('--project')||!args.has('--site'))throw Error('Usage: node lab-setup.mjs --project <folder> --site <Certosa PWA folder> [--out <folder>] [--library <test .certosa>] [--browser <Chrome executable>]');
const project=fs.realpathSync(args.get('--project')),site=fs.realpathSync(args.get('--site'));
function inside(p){return p===project||p.startsWith(project+path.sep);}
const out=path.resolve(args.get('--out')||path.join(project,'certosa-mcp-lab'));
// Resolve the nearest existing parent before mkdir, to reject junction escapes.
let parent=out,tail=[];
while(!fs.existsSync(parent)){tail.unshift(path.basename(parent));parent=path.dirname(parent);}
if(!inside(path.join(fs.realpathSync(parent),...tail))||!inside(site))throw Error('PATH_OUTSIDE_PROJECT');
fs.mkdirSync(out,{recursive:true});
for(const name of ['.tmp','profilo-browser','cache-browser','logs']){
 const p=path.join(out,name);fs.mkdirSync(p,{recursive:true});if(!inside(fs.realpathSync(p)))throw Error('LINK_OUTSIDE_PROJECT');
}
for(const name of ['TEMP','TMP','TMPDIR'])process.env[name]=path.join(out,'.tmp');
process.env.NODE_COMPILE_CACHE=path.join(out,'cache-node');
const id='usi-interessanti-volume-1-20261101',marker='certosa-human-lab-20261101';
let library;
if(args.has('--library')){
 const archive=path.resolve(args.get('--library'));
 if(!inside(fs.realpathSync(archive)))throw Error('LIBRARY_OUTSIDE_PROJECT');
 library=JSON.parse(gunzipSync(fs.readFileSync(archive))).lib;
 if(!library||library.notebooks?.length!==1||library.notebooks[0].id!==id)throw Error('ONLY_TEST_LIBRARY_ACCEPTED');
}else{
 library={v:2,settings:{maxPages:40,font:'Sans serif',scale:1,lines:0.34,zoom:1,scena:'cella'},trash:[],
  series:[{id:'demo-series',label:'Usi Interessanti',color:'#3b6772',strip:'#d9b875',issuedVolume:1,created:Date.now()}],
  notebooks:[{id,sid:'demo-series',vol:1,maxPages:40,font:'Sans serif',created:Date.now(),pages:[null,
   {html:'<div class="p"><b>Usi Interessanti</b></div><div class="p">Biblioteca di prova per cercare un appunto, scrivere dalla chat e usare una credenziale fittizia senza mostrarla.</div>',notes:[],st:[]}]}]};
}
const seed=`<!doctype html><html lang="it"><meta charset="utf-8"><p id="status">Preparo la biblioteca di prova…</p><script>
(async()=>{
const library=${JSON.stringify(library).replaceAll('<','\\u003c')},marker=${JSON.stringify(marker)};
const db=await new Promise((ok,no)=>{const q=indexedDB.open('nizix-quaderni',2);q.onupgradeneeded=()=>{for(const name of ['kv','blobs'])if(!q.result.objectStoreNames.contains(name))q.result.createObjectStore(name,name==='blobs'?{keyPath:'hash'}:undefined);};q.onsuccess=()=>ok(q.result);q.onerror=()=>no(Error('Archivio non disponibile'));q.onblocked=()=>no(Error('Archivio occupato'));});
await new Promise((ok,no)=>{const tx=db.transaction(['kv','blobs'],'readwrite'),kv=tx.objectStore('kv');
const tag=kv.get('certosa-lab-id'),existing=kv.get('lib'),keys=kv.count(),blobs=tx.objectStore('blobs').count();let pending=4;
tag.onsuccess=existing.onsuccess=keys.onsuccess=blobs.onsuccess=()=>{if(--pending)return;
if(tag.result!==undefined){if(tag.result!==marker)tx.abort();return;}
if(existing.result!==undefined||keys.result||blobs.result){tx.abort();return;}
kv.put(library,'lib');kv.put(marker,'certosa-lab-id');kv.put(0,'revision');};
tx.oncomplete=ok;tx.onerror=()=>no(Error('Archivio non disponibile'));tx.onabort=()=>no(Error('Profilo non riconosciuto: nessun dato sostituito'));});
db.close();location.replace('/'+location.hash);
})().catch(()=>document.getElementById('status').textContent='Archivio non aperto: nessun dato sostituito.');
</script></html>`;
const configFile=path.join(out,'lab.json');
if(fs.existsSync(configFile))throw Error('EXISTING_LAB_PRESERVED_USE_ITS_LAUNCHER_OR_A_NEW_OUTPUT_FOLDER');
fs.writeFileSync(path.join(out,'seed.html'),seed);
fs.writeFileSync(configFile,JSON.stringify({project,site,port:Number(args.get('--port')||18543),libraryId:marker,notebookId:id},null,2));
const child=spawn(process.execPath,[fileURLToPath(new URL('./local-bridge.mjs',import.meta.url)),configFile],{stdio:'inherit',env:process.env,windowsHide:true});
process.on('SIGINT',()=>child.kill());process.on('SIGTERM',()=>child.kill());
for(let i=0;i<100&&!fs.existsSync(path.join(out,'ready.json'));i++)await new Promise(r=>setTimeout(r,100));
if(!fs.existsSync(path.join(out,'ready.json'))){child.kill();throw Error('BRIDGE_NOT_READY');}
if(args.has('--browser')){
 const browser=fs.realpathSync(args.get('--browser'));
 const {url}=JSON.parse(fs.readFileSync(path.join(out,'browser-launch.json'),'utf8'));
 spawn(browser,['--user-data-dir='+path.join(out,'profilo-browser'),'--disk-cache-dir='+path.join(out,'cache-browser'),
  '--crash-dumps-dir='+path.join(out,'.tmp'),'--no-first-run','--no-default-browser-check','--disable-background-networking','--disable-sync','--disable-component-update','--disable-breakpad','--new-window','--window-position=60,60','--window-size=1180,820',url],{stdio:'ignore',windowsHide:false});
}
process.stdout.write('Local test lab ready. Use pairing.json only from a local MCP client. The browser launch URL is stored locally, never a model argument.\n');
