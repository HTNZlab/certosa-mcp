# Certosa MCP — archivio locale incrementale · 0.0.4-alpha.1

Il motore legge, cerca e modifica archivi senza aprire Certosa o il browser.
Aggiunge soltanto **autore**, disponibile in lettura, ricerca e modifica con
anteprima. Non introduce campi edizione o illustratore; conserva eventuali
metadati già presenti.

## Due formati, nessuna migrazione automatica

- `.certosa`: formato attuale CRTS2, letto e scritto come prima. Compatibilità
  verificata anche con le funzioni originali di Certosa.
- `.certosa-db`: nuovo archivio di lavoro cifrato, con pagine compresse
  separatamente, indice di ricerca, cronologia e media deduplicati in blocchi
  da 3 MiB. Una modifica aggiorna soltanto i record interessati.

`import_archive` richiede scelta e password locali, crea una **copia separata**
incrementale e conserva l'originale. `export_archive` crea una copia `.certosa`
compatibile quando rientra nei limiti del formato corrente: 256 MiB di file,
512 MiB di JSON espanso, 10.000 pagine per quaderno, 100.000 elementi pagina.
Un export troppo grande viene rifiutato interamente, senza tagliare contenuti.
`backup_archive` salva invece una copia completa `.certosa-db`, cifrata con la
stessa password, verificata anche oltre 1 GiB. Le destinazioni esistenti non
vengono sovrascritte. L'app Certosa attuale non apre direttamente `.certosa-db`.

## Avvio

Node.js 22.13+; flusso locale attualmente supportato su Windows PowerShell con
Windows Forms. Verificato su Windows x64, Node 22.23.4. La dipendenza SQLite
nativa include i precompilati: non occorre abilitarne gli script di installazione
su questa piattaforma. Altri sistemi e telefoni non sono qualificati.
Impostare TEMP/TMP/TMPDIR e cache npm/Node nella cartella del progetto.

```sh
npm ci --ignore-scripts
node src/archive-setup.mjs --project /percorso/progetto --out /percorso/progetto/certosa-archives
```

Nel checkout privato eseguire l'installazione in `connector` e usare
`connector/archive-setup.mjs`. Il setup conserva i runtime esistenti e prepara
esempi Codex TOML e Claude JSON. Configurare il client MCP stdio con
`node <repo>/src/archive-mcp-server.mjs <runtime>/archive-engine.json`.
Chiedere alla chat di aprire o importare un archivio. Scelta file, password e
selezione quaderni avvengono nella finestra Windows, mai nei parametri MCP.

Il consenso dura 15 minuti e può essere di sola lettura. I file incrementali
devono essere nel progetto configurato. I vecchi `.certosa` scelti fuori dal
progetto sono lavorati in una copia cifrata locale dichiarata nella finestra.
Manuale, cestino, quaderni `sensitivity: secret` o con `localCredential` sono
esclusi dagli strumenti generici. Il titolo Passwords da solo non classifica:
escludere localmente eventuali quaderni di credenziali non classificati.
Questa versione non usa credenziali personali. Gli estratti autorizzati
richiesti sono leggibili dalla chat e dal suo provider.

## Quattordici strumenti

- `open_archive`, `import_archive`, `get_archive_status`, `close_archive`.
- `list_notebooks`, `read_notebook`, `search_notebooks`, `count_word`.
- `prepare_edit`, `prepare_author_edit`, `read_proposal`, `apply_proposal`.
- `export_archive`, `backup_archive`.

`count_word` conta esattamente nelle pagine e note autorizzate, escludendo
titoli e cestino. Le posizioni restituite sono limitate, il totale no.
L'HTML è letto come dati; le modifiche del modello inseriscono testo semplice.
Prima della scrittura si prepara e rilegge una proposta legata alla revisione.
Non ripetere automaticamente una scrittura dopo esito incerto: rileggere prima.

## Cifratura, salvataggio e recupero

Il nuovo backend usa SQLite3 Multiple Ciphers, profilo SQLCipher non legacy:
AES-256-CBC con HMAC-SHA512, PBKDF2-SHA512 a 600.000 iterazioni, intestazione
cifrata. Anche indice, cronologia, allegati e journal WAL sono cifrati;
temporanei SQL in memoria, nessun fallback SQLite in chiaro.
Il formato `.certosa` conserva PBKDF2-SHA256 e gzip prima di AES-256-GCM.
Password e chiavi restano nel processo locale di esecuzione, separato dal
servizio che risponde alla chat. Se questo processo cade, servono nuovo
sblocco e consenso; nessuna ripetizione automatica delle scritture.

Le transazioni controllano la revisione e conservano il valore precedente
del record modificato nella cronologia cifrata. Il ripristino è disponibile
nell'API locale del motore, provato su copia isolata; non è esposto come
strumento MCP in questa release. Anche il ripristino crea un punto di recupero.
Importazioni interrotte non diventano archivi completi pubblicati.
Nessuna cancellazione o pulizia automatica di cronologia e media.

Un `.certosa-db` aperto può avere file `-wal` e `-shm`: non copiare il solo file
principale mentre è in uso. Usare `backup_archive` per una copia consistente.
Gli originali multimediali restano identici; si comprime soltanto quando
conviene, senza ricodifica con perdita. SQLite può occupare più spazio del
vecchio formato: il vantaggio misurato è il salvataggio incrementale.

## Prove e limiti

66 test di dominio/motore, più verifiche SDK del vecchio percorso (23), nuovo
percorso incrementale (19) e avvio/riavvio servizio (5). Include password
errata, manomissione, cifratura WAL/FTS, permessi, conflitti, interruzione
di transazione/importazione, recupero e interoperabilità con il formato attuale.

Benchmark sintetico su questo PC e disco H: 10 quaderni, 40.000 pagine e
1 GiB di media pseudocasuali realmente scritti e riletti con checksum.
Modificare una pagina e l'autore produce 86.552 byte di WAL, senza riscrivere
i media; il run ottimizzato ha un picco di memoria di circa 237 MiB.
I tempi dipendono da macchina e disco; non è una prova su Realme/mobile.
Il benchmark pesante è separato: `node --expose-gc tests/benchmark_large_archive.mjs`;
aggiungere `CERTOSA_BENCHMARK_SNAPSHOT=1` per la copia cifrata completa.

```sh
npm test
```

Il flusso Windows di scelta/password/consenso sul formato precedente è stato
verificato anche dall'owner; i nuovi flussi import/backup sono coperti con UI
iniettata nei test, senza dichiararli già accettati dall'owner. Nessuna prova
di perdita elettrica, account provider, ponte remoto o submission ai cataloghi.
Il pacchetto non contiene archivi, profili, runtime, password o log di contenuti.
Il precedente laboratorio è descritto in LIVE-LAB.md; stato distribuzione e
submission in DISTRIBUTION.md. Licenza MIT del codice e licenze dei componenti
nelle dipendenze installate.
