import {createLocalNotebookTools} from './notebook-tools.mjs';
import {createLocalSecretCapabilities} from './secret-capabilities.mjs';
// This module is loaded only by the dedicated loopback lab, never by the public PWA.
const fragment=new URLSearchParams(location.hash.slice(1));
const pairing=fragment.get('certosa-pair')||sessionStorage.getItem('certosa-lab-pair');
if(pairing){sessionStorage.setItem('certosa-lab-pair',pairing);history.replaceState(null,'',location.pathname);}
let config,lease,session,secretSession,closed=true,writing=false,archiveReference;
let connectedUntil=0,generation=0;
let lastEdit=null;
const knownErrors=new Set(['REVISION_CONFLICT','ARCHIVE_BUSY','ARCHIVE_LOCKED','ARCHIVE_CHANGED','SESSION_CLOSED','NOT_FOUND','FORBIDDEN','HANDLE_SPENT','NOT_AVAILABLE','CONTEXT_CHANGED','VAULT_LOCKED','SAVE_FAILED','INVALID_EDIT','DEVICE_UNAVAILABLE','OUTCOME_UNKNOWN_DO_NOT_RETRY']);
const error=code=>{throw Object.assign(Error(code),{code});};
async function request(route,data,signal){
  const response=await fetch(route,{method:data===undefined?'GET':'POST',headers:{Authorization:'Bearer '+pairing,'X-Certosa-Session':lease||'','Content-Type':'application/json'},
    body:data===undefined?undefined:JSON.stringify(data),cache:'no-store',redirect:'error',signal});
  if(!response.ok)error('DEVICE_UNAVAILABLE');return response.json();
}
function locked(){return typeof lib==='undefined'||!lib||Store.chiuso||!Cripto.attiva||!Store.protetto;}
function busy(){return writing||Store.rekeying||Store.pendingWrites>0||!!saveTimer||window.certosaImportBusy||Book.animating||!!document.querySelector('.modal.on');}
function readState(){return {archiveId:config.libraryId,revision:Store.revision,locked:locked()||lib!==archiveReference,busy:busy(),lib:structuredClone(lib)};}
async function settle(){
  if(locked())error('ARCHIVE_LOCKED');
  if(Book.commitLive()||saveTimer||Store.pendingWrites){if(!await NotebookSave.flush())error('SAVE_FAILED');}
  if(busy())error('ARCHIVE_BUSY');
}
function htmlText(value){return value.split('\n').map(line=>'<div class="p">'+(esc(line)||'<br>')+'</div>').join('');}
function blockEditing(on){
  writing=on;window.certosaImportBusy=on;
  document.getElementById('certosaWriteGuard')?.remove();
  if(on){const guard=document.createElement('div');guard.id='certosaWriteGuard';guard.style.cssText='position:fixed;inset:0;z-index:999999;cursor:progress;background:#0002';guard.setAttribute('aria-label','Salvataggio dalla chat');document.body.append(guard);}
}
document.addEventListener('keydown',event=>{if(writing){event.preventDefault();event.stopImmediatePropagation();}},true);
document.addEventListener('beforeinput',event=>{if(writing){event.preventDefault();event.stopImmediatePropagation();}},true);
const consumed=new Set();
async function apply({proposalId}){
  const proposal=session.read_proposal({proposalId});
  if(consumed.has(proposalId))error('HANDLE_SPENT');
  if(proposal.stale)error('REVISION_CONFLICT');
  if(proposal.operations.length!==1||proposal.operations[0].type!=='edit_page')error('INVALID_EDIT');
  const operation=proposal.operations[0];
  if(operation.notebookId!==config.notebookId)error('FORBIDDEN');
  const candidate=structuredClone(lib),nb=candidate.notebooks.find(n=>n.id===operation.notebookId);
  if(!nb||nb.sensitivity==='secret'||BuiltinManual.is(nb))error('FORBIDDEN');
  const pg=page(nb,operation.pageNumber);
  if(JsonExport.content(pg.html||'').text!==operation.beforeText)error('REVISION_CONFLICT');
  if(operation.mode==='append')pg.html=(pg.html||'')+htmlText(operation.afterText.slice(operation.beforeText.length));
  else pg.html=htmlText(operation.afterText);
  if(operation.source)pg.connectorSource=operation.source;
  const oldBook=Book.nb?.id,oldPage=Book.activePage;
  const beforePage=structuredClone(lib.notebooks.find(n=>n.id===nb.id).pages[operation.pageNumber]||null);
  consumed.add(proposalId);blockEditing(true);
  try{
    if(!await Store.istantanea('mcp-'+Date.now()))error('SAVE_FAILED');
    if(locked()||lib!==archiveReference||Store.revision!==proposal.baseRevision)error('REVISION_CONFLICT');
    if(!await Store.save(candidate))error('SAVE_FAILED');
    // Store.save uses the existing AES-GCM envelope and atomic revision check.
    lib.notebooks=candidate.notebooks;
  }catch(e){throw Object.assign(Error('SAVE_FAILED'),{code:e.code||'SAVE_FAILED'});}
  finally{blockEditing(false);}
  Object.values(Layout.cache).forEach(p=>p.remove());Layout.cache={};
  slotL.replaceChildren();slotR.replaceChildren();Room.fill();
  if(oldBook){const current=lib.notebooks.find(n=>n.id===oldBook);if(current){Book.open(current);Book.goToPage(oldPage,null,true);}}
  // Rendering may reflow text; finish its ordinary save queue before acknowledging.
  if(saveTimer||Store.pendingWrites)if(!await NotebookSave.flush())error('OUTCOME_UNKNOWN_DO_NOT_RETRY');
  if(locked())error('OUTCOME_UNKNOWN_DO_NOT_RETRY');
  lastEdit={notebookId:nb.id,pageNumber:operation.pageNumber,beforePage,revision:Store.revision};
  toast('Modifica dalla chat salvata.');
  return {status:'saved',notebookId:nb.id,pageNumber:operation.pageNumber,revision:Store.revision,checkpoint:true};
}
async function undoLocal(){
  await settle();
  if(!lastEdit||lastEdit.revision!==Store.revision||closed)error('REVISION_CONFLICT');
  const candidate=structuredClone(lib),nb=candidate.notebooks.find(n=>n.id===lastEdit.notebookId);
  if(!nb||nb.sensitivity==='secret')error('FORBIDDEN');
  nb.pages[lastEdit.pageNumber]=structuredClone(lastEdit.beforePage);
  const oldBook=Book.nb?.id,oldPage=Book.activePage;
  blockEditing(true);
  try{
    if(!await Store.istantanea('mcp-undo-'+Date.now())||!await Store.save(candidate))error('SAVE_FAILED');
    lib.notebooks=candidate.notebooks;lastEdit=null;
  }finally{blockEditing(false);}
  Object.values(Layout.cache).forEach(p=>p.remove());Layout.cache={};slotL.replaceChildren();slotR.replaceChildren();Room.fill();
  if(oldBook){const current=lib.notebooks.find(n=>n.id===oldBook);if(current){Book.open(current);Book.goToPage(oldPage,null,true);}}
  status.textContent='Ultima modifica dalla chat annullata e salvataggio completato.';
}
const vaultId='certosa-lab-private-credential';
function entry(){return lib.notebooks.find(n=>n.id===vaultId&&n.sensitivity==='secret')?.localCredential;}
async function makeFictionalCredential(){
  await settle();
  if(!entry()){
    const candidate=structuredClone(lib),sid='certosa-lab-private-series';
    candidate.series.push({id:sid,label:'Passwords (prova)',color:'#455971',strip:'#d9b875',created:Date.now(),issuedVolume:1});
    const secret=Array.from(crypto.getRandomValues(new Uint8Array(32)),b=>b.toString(16).padStart(2,'0')).join('');
    candidate.notebooks.push({id:vaultId,sid,vol:1,maxPages:40,font:'Sans serif',sensitivity:'secret',created:Date.now(),
      pages:[null,{html:htmlText('Credenziale fittizia gestita localmente. Il valore non viene visualizzato.'),st:[],notes:[]}],
      localCredential:{id:'fictional-service',label:'Servizio di prova',secret}});
    blockEditing(true);
    try{if(!await Store.save(candidate))error('SAVE_FAILED');lib.series=candidate.series;lib.notebooks=candidate.notebooks;}
    finally{blockEditing(false);}
    Room.fill();
  }
  // Explicit lab-only mapping from a logical HTTPS origin to this loopback fixture.
  await request('/fixture/enrol',{secret:entry().secret});
  secretSession?.close();
  secretSession=createLocalSecretCapabilities({
    readState:()=>({contextId:config.libraryId,locked:locked()||closed||lib!==archiveReference}),
    executeLocally:async({credentialId,action,targetOrigin,signal})=>{
      if(credentialId!=='fictional-service'||action!=='authenticate'||targetOrigin!=='https://certosa-fixture.invalid'||!entry())return {status:'failed'};
      const result=await request('/fixture/authenticate',{secret:entry().secret},signal);
      return {status:result.status};
    }
  }).openSession({contextId:config.libraryId,bindings:[{credentialId:'fictional-service',label:'Servizio di prova',action:'authenticate',targetOrigin:'https://certosa-fixture.invalid',maxUses:1}]});
  status.textContent='Credenziale fittizia pronta per un solo uso. Il valore resta escluso dalla chat.';
}
async function revoke(){
  generation++;closed=true;session?.close();secretSession?.close();consumed.clear();lastEdit=null;
  try{if(lease)await request('/bridge/disconnect',{});}catch{}
  lease=null;status.textContent='Collegamento revocato.';
}
async function poll(ownGeneration){
  while(!closed&&ownGeneration===generation){
    try{
      if(locked()||lib!==archiveReference||Date.now()>=connectedUntil){await revoke();break;}
      const {job}=await request('/bridge/poll');
      if(ownGeneration!==generation)break;
      if(job){
        let result;
        try{
          if(job.expiresAt<=Date.now())error('SESSION_CLOSED');
          await settle();
          if(closed)error('SESSION_CLOSED');
          if(job.expiresAt<=Date.now())error('SESSION_CLOSED');
          if(job.name==='apply_proposal')result=await apply(job.arguments);
          else if(['prepare_credential_use','use_credential'].includes(job.name)){
            if(!secretSession)error('NOT_AVAILABLE');result=await secretSession[job.name](job.arguments);
          }else result=await session[job.name](job.arguments);
        }catch(e){result={error:knownErrors.has(e.code)?e.code:'OPERATION_FAILED'};}
        await request('/bridge/result',{id:job.id,result});
      }
    }catch{if(ownGeneration===generation){closed=true;session?.close();secretSession?.close();status.textContent='Disconnesso: ricollega dalla biblioteca.';}}
    if(!closed)await new Promise(r=>setTimeout(r,250));
  }
}
async function connect(){
  await settle();
  // A marker stored by the native test-library bootstrap prevents personal archives.
  const marker=await new Promise((resolve,reject)=>{const q=Store.db.transaction('kv','readonly').objectStore('kv').get('certosa-lab-id');q.onsuccess=()=>resolve(q.result);q.onerror=()=>reject(q.error);});
  if(marker!==config.libraryId||!lib.notebooks.some(n=>n.id===config.notebookId))error('FORBIDDEN');
  session?.close();secretSession?.close();secretSession=null;consumed.clear();lastEdit=null;archiveReference=lib;
  const owner=createLocalNotebookTools({readState,plainText:html=>JsonExport.content(html).text,isSystemNotebook:nb=>BuiltinManual.is(nb),
    searchEntries:(entries,query)=>{const parsed=CertosaSearchEngine.parse(query);if(parsed.error)error('INVALID_EDIT');return CertosaSearchEngine.scan(entries,parsed);}});
  session=owner.openSession({archiveId:config.libraryId,notebookIds:[config.notebookId],permissions:['read','search','propose_edit'],ttlMs:900000});
  ({lease}=await request('/bridge/connect',{}));closed=false;connectedUntil=Date.now()+900000;generation++;
  status.textContent='Collegato per 15 minuti: lettura, ricerca e modifiche a Usi Interessanti. Revocabile qui.';
  void poll(generation);
}
const dialog=document.createElement('dialog');dialog.id='certosaConnectorDialog';
dialog.style.cssText='max-width:440px;width:calc(100% - 36px);padding:18px;background:#fcf9ee;color:#252525;border:1px solid #8b7046;border-radius:8px;font:15px system-ui;line-height:1.4';
dialog.innerHTML='<h2 style="font-size:18px;margin:0 0 10px">Chat · biblioteca di prova</h2><p>Autorizzi soltanto il quaderno Usi Interessanti. Le modifiche sono salvate sul dispositivo con una copia precedente. Gli estratti richiesti saranno leggibili dalla chat.</p><p id="certosaConnectionStatus" role="status">Non collegato.</p><div style="display:flex;flex-wrap:wrap;gap:8px"><button id="certosaConnect">Collega per 15 minuti</button><button id="certosaRevoke">Revoca</button><button id="certosaUndo">Annulla ultima modifica chat</button><button id="certosaFixture">Crea credenziale fittizia</button><button id="certosaDialogClose">Chiudi</button></div>';
dialog.querySelectorAll('button').forEach(b=>b.style.cssText='min-height:36px;padding:6px 9px;font:14px system-ui;cursor:pointer');
const status=dialog.querySelector('#certosaConnectionStatus');
function safeAction(fn){return ()=>{Promise.resolve().then(fn).catch(()=>{status.textContent='Operazione non disponibile: apri e sblocca la biblioteca di prova, poi riprova.';});};}
dialog.querySelector('#certosaConnect').onclick=safeAction(async()=>{await connect();dialog.close();});
dialog.querySelector('#certosaRevoke').onclick=safeAction(revoke);
dialog.querySelector('#certosaUndo').onclick=safeAction(undoLocal);
dialog.querySelector('#certosaFixture').onclick=safeAction(async()=>{if(closed)error('SESSION_CLOSED');await makeFictionalCredential();dialog.close();});
dialog.querySelector('#certosaDialogClose').onclick=()=>dialog.close();
document.body.append(dialog);
if(pairing){
  config=await request('/bridge/config');
  for(const menu of document.querySelectorAll('#menuRoom,#menuDesk')){
    const button=document.createElement('button');button.textContent='Collega alla chat · prova…';button.dataset.certosaConnector='open';
    button.onclick=event=>{event.stopPropagation();menu.classList.remove('on');dialog.showModal();};menu.append(button);
  }
}
