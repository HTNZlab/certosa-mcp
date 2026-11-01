# Motore autonomo degli archivi Certosa — 0.0.3-alpha.1

Il percorso principale apre direttamente un file `.certosa`, senza Certosa,
Chrome, IndexedDB, PWA o profilo browser. Il file resta nel formato corrente
CRTS2: PBKDF2-SHA256, gzip prima di AES-256-GCM, intestazione autenticata.
Il precedente laboratorio browser è conservato e descritto in LIVE-LAB.md.

## Avvio locale

Node.js22+; su Windows PowerShell e Windows Forms per la finestra locale.
Impostare TEMP/TMP/TMPDIR/cache sul progetto prima di installare o avviare.
Da questo repository: `npm ci --ignore-scripts`, quindi
`node src/archive-setup.mjs --project /percorso/progetto --out /percorso/progetto/certosa-archives`.
Un runtime già presente viene preservato. I moduli si trovano sotto `src/`.
Gli esempi Codex/Claude preparati nel runtime contengono soltanto percorsi.
Configurare il server `archive-mcp-server.mjs <runtime>/archive-engine.json`.

«Apri un archivio Certosa» richiama `open_archive`, che risponde subito:
la scelta del file, la password e i quaderni autorizzati sono richiesti in una
piccola finestra Windows sul dispositivo. Non si apre l’app Certosa.
La copia .certosa può avere una password diversa dalla biblioteca del browser.
Nessuna password nei parametri, risultati, URL, log o file di configurazione.
La password passa soltanto da una pipe locale al derivatore; la chiave resta
nel processo locale. I file nel progetto vengono aggiornati direttamente. Per un file scelto fuori
dal progetto, la finestra locale dichiara la creazione di una copia di lavoro
cifrata in <runtime>/archives: le modifiche riguardano questa copia e non
l’originale. Anche un export in chiaro viene cifrato prima di scrivere la copia.
Gli export storici in chiaro richiedono una password locale per cifrare i
successivi salvataggi nel formato già esistente; il file cambia solo al commit.

Il consenso dura15minuti, riguarda i soli quaderni selezionati e può essere di
sola lettura. I quaderni marcati sensitivity secret, i campi localCredential,
il manuale e il cestino sono esclusi dagli strumenti generici. Un titolo
Passwords da solo non classifica i dati: escludere localmente i quaderni con
credenziali non classificati. Nessun uso/reveal di credenziali personali in
questa versione. `close_archive` revoca e rilascia la chiave.

## Strumenti e salvataggio

Dieci strumenti: open_archive, get_archive_status, close_archive,
list_notebooks, read_notebook, search_notebooks, count_word,
prepare_edit, read_proposal, apply_proposal.
count_word calcola il totale esatto nelle pagine e nelle note autorizzate,
con parola intera e maiuscole ignorate per default; titoli/cestino esclusi.
La ricerca riusa il motore testuale di Certosa. L’HTML viene letto come dati,
non eseguito. Il modello fornisce solo testo semplice per aggiunte/sostituzioni.

Le proposte sono legate a revisione e testo originale. Prima del commit sono
ricontrollati file e permessi; un lock coordina altri motori cooperanti.
Si crea una copia di recupero cifrata, poi un file temporaneo cifrato nello
stesso filesystem, sincronizzato e rinominato sul file originale. Note,
allegati, campi sconosciuti e quaderni esclusi sono conservati. Nessuna
cancellazione esposta. Non ripetere automaticamente una scrittura dopo timeout:
rileggere prima. I backup non vengono cancellati automaticamente.
Il lock e i controlli hash non sono un protocollo di collaborazione con editor
esterni che ignorino il lock. Un lock lasciato da un crash richiede verifica
locale; non viene rimosso automaticamente come se fosse nostro.
Il file aggiornato può essere riaperto/importato in Certosa; il database di
un browser già aperto non viene aggiornato implicitamente.

## Capienza e futura biblioteca multimediale

Questa release è di compatibilità, non un collaudo di archivi da gigabyte.
Limite sperimentale256MiB per file,512MiB di JSON espanso; il formato attuale
richiede di autenticare/decifrare l’intero payload e di ricomprimere/ricifrare
l’intero archivio al salvataggio. I backup completi aumentano lo spazio usato.
La UI offre20–120pagine; il formato valida già fino a10.000pagine per quaderno
ed entro100.000elementi pagina per archivio. Aumentare una costante non prova
la velocità della UI: oggi il quaderno viene impaginato integralmente.

Per grandi opere illustrabili occorre separare: opera/edizione e relativi
autori, traduttori, illustratori, fonte e diritti; struttura testuale con
capitoli e ancore stabili; pagine come vista; allegati originali immutati e
anteprime derivate. L’indice e le immagini vanno ancorati ai passaggi del testo,
così un cambio font non altera la loro posizione logica. Questo modello
bibliografico e il relativo editor non sono implementati in questa release.

Ipotesi dimensionale, non misura di un romanzo:10opere da1MBtesto ciascuna,
200immagini/opera da800KB,1oraaudio/opera a96kbps e10minvideo/opera a2Mbps
portano a3,542GB. Testo10MB,immagini1,6GB,audio432MB,video1,5GB. Una riscrittura
completa più una copia integrale comporterebbero circa7GBdi scritture, prima
degli overhead. Questo scenario supera i limiti attuali: nessuna prova GB.

Il prossimo backend da confrontare deve aggiornare solo record/blocchi
modificati, deduplicare gli allegati, comprimerli prima della cifratura,
proteggere anche indici/anteprime/journal e consentire lettura a richiesta e
streaming audio/video. Testo e metadati si comprimono; ricomprimere JPEG/WebP,
MP3/Opus o MP4 già compressi non garantisce un risparmio. Gli originali non
vanno ricodificati con perdita automaticamente. SQLite cifrato più allegati
cifrati a blocchi è un candidato da misurare, non una migrazione decisa.
Il motore è separato dall’UI proprio per poter cambiare backend mantenendo
l’API e il lettore del formato attuale. Nessun nuovo formato scritto ora.

## Evidenza e limiti

23test del motore più27unitari di dominio,23controlli SDK/MCP reali sul file e
5controlli di avvio/riavvio servizio. I test usano archivi cifrati sintetici,
con decifratura finale tramite le funzioni ORIGINALI dell’app; nessun browser
usato nel flusso del motore. La finestra/password owner richiede prova locale,
separata dai provider UI sostitutivi dei test. Non sono collaudati account
ChatGPT/Claude/Grok, telefono fisico o ponte MCP remoto; nessuna submission.
