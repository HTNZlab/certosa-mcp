// Generated verbatim SeriesLedger from Certosa src/15-series-ledger.js. MIT.
export function nativeImportPlan(source){
const lib={series:[],notebooks:[],trash:[]};
const T=v=>v, TF=(s,args)=>s.replace(/\{(\d+)\}/g,(_,i)=>String(args[Number(i)])), normLabel=s=>String(s).trim().toLowerCase().replace(/\s+/g," "), roman=String;

'use strict';
/* La serie resta anche a scaffale vuoto. Il contatore non è il numero di
   quaderni presenti: è l'ultimo volume emesso, compresa la storia nel cestino. */
const SeriesLedger = {
  volume(v){ return (typeof v==='number'||typeof v==='string'&&/^\d+$/.test(v))&&Number.isSafeInteger(+v)&&+v>0 ? +v : 0; },
  validCounter(s){return s.issuedVolume===undefined||typeof s.issuedVolume==='number'&&Number.isSafeInteger(s.issuedVolume)&&s.issuedVolume>=0;},
  counter(s, strict=false){
    if(strict&&s.issuedVolumeIssue) throw new Error(TF("La storia dei volumi di «{0}» contiene un contatore non valido. Conserva una copia e correggi i metadati prima di creare o ripristinare volumi.",[s.label]));
    if(s.issuedVolume===undefined) return 0;
    const n=s.issuedVolume;
    if(typeof n==='number'&&Number.isSafeInteger(n)&&n>=0) return n;
    if(strict) throw new Error(TF("Contatore dei volumi non valido per «{0}».",[s.label]));
    return 0;
  },
  byLabel(label, series=lib.series){
    const found=series.filter(s=>normLabel(s.label)===normLabel(label));
    if(found.length>1) throw new Error(TF("Più serie storiche hanno il titolo «{0}». Apri il quaderno e usa Nuovo volume, oppure rinomina la serie.",[label]));
    return found[0]||null;
  },
  destination(s, series){
    if(!s||!s.id||typeof s.label!=='string'||!s.label.trim()) throw new Error(T('La copia contiene un quaderno senza una serie valida.'));
    const byID=series.filter(x=>x.id===s.id);
    if(byID.length>1) throw new Error(T('Identificativo di serie duplicato nella libreria.'));
    return byID[0]||this.byLabel(s.label,series);
  },
  highWater(archive, s, strict=false){
    let max=this.counter(s,strict);
    const see=nb=>{
      if(!nb||nb.sid!==s.id) return;
      const n=this.volume(nb.vol);
      if(strict&&!n) throw new Error(TF("Numero di volume non valido per «{0}».",[s.label]));
      max=Math.max(max,n);
    };
    (archive.notebooks||[]).forEach(see);
    (archive.trash||[]).forEach(t=>{
      see(t.nb);
      if(t.series&&t.series.id===s.id) max=Math.max(max,this.counter(t.series,strict));
    });
    return max;
  },
  reconcile(archive=lib){
    let changed=false;
    const ids=new Map(archive.series.map(s=>[s.id,s]));
    const observe=(s,n)=>{
      // Un campo presente ma corrotto non autorizza a riemettere numeri storici.
      if(!this.validCounter(s))return;
      const next=Math.max(this.counter(s),n);
      if(s.issuedVolume!==next){s.issuedVolume=next;changed=true;}
    };
    archive.series.forEach(s=>observe(s,0));
    (archive.notebooks||[]).forEach(nb=>{const s=ids.get(nb.sid);if(s) observe(s,this.volume(nb.vol));});
    (archive.trash||[]).forEach(t=>{
      if(!t.nb) return;
      let s=ids.get(t.nb.sid);
      if(!s&&t.series){
        const matches=archive.series.filter(x=>normLabel(x.label)===normLabel(t.series.label));
        if(matches.length===1) s=matches[0];
        else{
          // Più omonime storiche non autorizzano un merge: conservo il SID
          // del cestino come serie vuota distinta prima della scadenza.
          s=structuredClone(t.series);archive.series.push(s);ids.set(s.id,s);changed=true;
        }
      }
      if(s){
        if(t.series&&(!this.validCounter(t.series)||t.series.issuedVolumeIssue)&&!s.issuedVolumeIssue){s.issuedVolumeIssue=true;changed=true;}
        observe(s,Math.max(this.volume(t.nb.vol),t.series?this.counter(t.series):0));
      }
    });
    return changed;
  },
  next(s){
    const n=this.highWater(lib,s,true)+1;
    if(!Number.isSafeInteger(n)) throw new Error(T('La numerazione di questa serie è esaurita.'));
    return n;
  },
  suggestColor(label){
    const active=new Map();NotebookCatalog.items().forEach(x=>active.set(x.s.id,x.s));
    const sorted=Array.from(active.values()).sort((a,b)=>NotebookCatalog.collator.compare(a.label,b.label)||(a.id<b.id?-1:1));
    const pos=sorted.findIndex(s=>NotebookCatalog.collator.compare(s.label,label)>=0);
    const i=pos<0?sorted.length:pos;
    const used=new Set([sorted[i-1],sorted[i]].filter(Boolean).map(s=>s.color.toLowerCase()));
    return COLORS.find(c=>!used.has(c.c.toLowerCase())).c;
  },
  duplicateSuffix(nb){
    const s=getSeries(nb);if(!s)return '';
    const duplicate=lib.notebooks.some(n=>n.id!==nb.id&&this.volume(n.vol)===this.volume(nb.vol)&&normLabel((getSeries(n)||{}).label)===normLabel(s.label));
    return duplicate?' · ID '+nb.id:'';
  },
  signature(){return JSON.stringify({series:lib.series,notebooks:lib.notebooks,trash:lib.trash});},
  planImport(source, selected){
    const signature=this.signature();
    const series=lib.series.map(s=>({...s}));
    const selectedIDs=new Set();
    selected.forEach(nb=>{
      if(!nb.id||selectedIDs.has(nb.id)) throw new Error(T('La selezione contiene un identificativo di quaderno duplicato o assente.'));
      selectedIDs.add(nb.id);
    });
    const notebooks=lib.notebooks.filter(nb=>!selectedIDs.has(nb.id));
    const incoming=[];
    for(const nb of selected){
      const sources=(source.series||[]).filter(s=>s.id===nb.sid);
      if(sources.length!==1) throw new Error(T('Il quaderno non ha una serie univoca nella copia.'));
      const origin=sources[0];
      let target=this.destination(origin,series);
      if(!target){target=structuredClone(origin);series.push(target);}
      const vol=this.volume(nb.vol);
      if(!vol) throw new Error(TF("Numero di volume non valido per «{0}».",[origin.label]));
      const prior=lib.notebooks.find(n=>n.id===nb.id);
      const sameHistoricalSlot=prior&&prior.sid===target.id&&this.volume(prior.vol)===vol;
      const historicalPartner=n=>sameHistoricalSlot&&lib.notebooks.some(old=>old.id===n.id&&old.sid===target.id&&this.volume(old.vol)===vol);
      if(notebooks.some(n=>n.sid===target.id&&this.volume(n.vol)===vol&&!historicalPartner(n)))
        throw new Error(TF("«{0}», volume {1}: esiste già un altro quaderno con questo numero. Nessun quaderno è stato importato; scegli una copia senza questo conflitto.",[target.label,roman(vol)]));
      const trashConflict=(lib.trash||[]).some(t=>{
        if(!t.nb||t.nb.id===nb.id||this.volume(t.nb.vol)!==vol)return false;
        if(t.nb.sid===target.id)return true;
        if(series.some(s=>s.id===t.nb.sid)||!t.series)return false;
        const matches=series.filter(s=>normLabel(s.label)===normLabel(t.series.label));
        return matches.length===1&&matches[0].id===target.id;
      });
      if(!sameHistoricalSlot&&trashConflict) throw new Error(TF("«{0}», volume {1}: un altro quaderno con questo numero è nel cestino. Nessun quaderno è stato importato.",[target.label,roman(vol)]));
      target.issuedVolume=Math.max(this.highWater(lib,target,true),this.counter(target,true),this.highWater(source,origin,true));
      const copy=structuredClone(nb);copy.sid=target.id;copy.vol=vol;
      notebooks.push(copy);incoming.push(copy);
    }
    return {signature,series,notebooks,incoming};
  },
  commit(plan){
    if(plan.signature!==this.signature()) throw new Error(T('La libreria è cambiata durante il ripristino. Rivedi la selezione e riprova.'));
    lib.series=plan.series;lib.notebooks=plan.notebooks;
  },
  restoreTrash(t){
    if(lib.notebooks.some(n=>n.id===t.nb.id)) throw new Error(T('Questo quaderno è già nella libreria. Il cestino resta intatto.'));
    const origin=t.series||lib.series.find(s=>s.id===t.nb.sid);
    const source={series:origin?[origin]:[],notebooks:[t.nb],trash:[t]};
    const plan=this.planImport(source,[t.nb]);
    this.commit(plan);return plan.incoming[0];
  }
};


return SeriesLedger.planImport(source,source.notebooks);
}
