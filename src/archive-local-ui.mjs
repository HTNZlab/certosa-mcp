import path from 'node:path';
import fs from 'node:fs';
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {archiveError} from './archive-format.mjs';

// The only password channel is an anonymous local pipe, consumed here. Never a
// command argument, disk file, HTTP response, MCP message, stderr or diagnostic.
export class LocalArchiveUI{
  constructor({runtime}){this.runtime=runtime;this.child=null;this.cancelPending=null;}
  ask(mode,input){
    if(process.platform!=='win32')return Promise.reject(archiveError('LOCAL_UNLOCK_UNSUPPORTED'));
    if(this.child)return Promise.reject(archiveError('LOCAL_DIALOG_BUSY'));
    return new Promise((resolve,reject)=>{
      const windows=process.env.SystemRoot||'C:\\Windows';
      const executable=path.join(windows,'System32/WindowsPowerShell/v1.0/powershell.exe');
      const script=fs.readFileSync(fileURLToPath(new URL('./archive-dialog.ps1',import.meta.url)),'utf8');
      const child=spawn(executable,['-NoLogo','-NoProfile','-STA','-Command','& {\n'+script+'\n} -Mode '+mode],{
        cwd:this.runtime,env:{...process.env,TEMP:path.join(this.runtime,'.tmp'),TMP:path.join(this.runtime,'.tmp'),TMPDIR:path.join(this.runtime,'.tmp')},
        stdio:['pipe','pipe','pipe'],windowsHide:false
      });
      this.child=child;let output=[],length=0,settled=false;
      const finish=(error,value)=>{if(settled)return;settled=true;if(this.child===child){this.child=null;this.cancelPending=null;}for(const chunk of output)chunk.fill(0);output=[];error?reject(error):resolve(value);};
      this.cancelPending=()=>{finish(archiveError('CANCELLED'));child.kill();};
      child.stderr.resume();child.stdin.on('error',()=>{});
      child.stdout.on('data',chunk=>{if(settled){chunk.fill(0);return;}length+=chunk.length;if(length>1024*1024){chunk.fill(0);child.kill();finish(archiveError('LOCAL_DIALOG_UNAVAILABLE'));}else output.push(chunk);});
      child.on('error',()=>finish(archiveError('LOCAL_DIALOG_UNAVAILABLE')));
      child.on('close',code=>{
        if(settled)return;
        try{const value=JSON.parse(Buffer.concat(output).toString('utf8').replace(/^\uFEFF/,''));if(code||value.error)finish(archiveError('LOCAL_DIALOG_UNAVAILABLE'));else finish(null,value);}
        catch{finish(archiveError('LOCAL_DIALOG_UNAVAILABLE'));}
      });
      child.stdin.end(JSON.stringify(input));
    });
  }
  cancel(){this.cancelPending?.();}
  notice(code){
    const messages={
      ARCHIVE_OUTSIDE_PROJECT:'Scegli un file .certosa nella cartella di progetto configurata. Il file selezionato non e stato modificato.',
      ARCHIVE_IN_USE:'Un altro motore sta lavorando su questo archivio. Chiudi quella sessione prima di riprovare. Un blocco lasciato da un arresto richiede una verifica locale.',
      UNLOCK_FAILED:'Sblocco non riuscito. Controlla la password della copia .certosa: puo essere diversa da quella usata nell’app.',
      ARCHIVE_TOO_LARGE:'Questo archivio supera il limite sperimentale del motore attuale. Non e stato modificato.',
      INVALID_ARCHIVE:'Il file non e un archivio Certosa valido o non e integro. Non e stato modificato.',
      INVALID_ATTACHMENT:'Un allegato non supera il controllo di integrita. Il file non e stato modificato.',
      REVISION_CONFLICT:'Il file e cambiato durante l’apertura. Nessuna modifica e stata applicata. Riaprilo.'
      ,DESTINATION_EXISTS:'Esiste gia un archivio con quel nome. Non e stato sostituito: scegli un nome nuovo.'
      ,LEGACY_EXPORT_TOO_LARGE:'La biblioteca supera i limiti del formato .certosa attualmente supportato. L’archivio incrementale resta integro; nessun contenuto e stato scartato.'
      ,INCREMENTAL_REQUIRED:'Questo comando richiede un archivio incrementale .certosa-db. Per un .certosa usa Esporta oppure crea prima una copia incrementale con Importa.'
    };
    return this.ask('notice',{message:messages[code]||'Apertura non completata. Il file non e stato modificato.'});
  }
}
