# Installare Certosa Archives · 0.0.5-alpha.1

Il connettore permette al modello di riconoscere i file `.certosa`, richiedere
lo sblocco sul dispositivo, cercare, creare e modificare quaderni e salvare una
copia verificata nel formato attuale di Certosa. Il modello deve essere usato
attraverso un'app che supporti MCP: il solo modello non installa connettori.

## Claude Desktop su Windows

Scaricare dalla release `certosa-archives-0.0.5-alpha.1-windows.mcpb` e verificarne
il checksum. In Claude Desktop aprire Impostazioni → Estensioni → impostazioni
avanzate → Installa estensione e scegliere il file. Selezionare una cartella
di lavoro locale per archivi, backup e temporanei. Non inserire password del
quaderno nelle impostazioni dell'estensione. Il pacchetto include dipendenze
e modulo nativo; richiede un runtime Node 22.13+ disponibile nel client.
La finestra Windows richiederà la password dell'archivio soltanto all'apertura.
Le regole dell'organizzazione possono impedire estensioni personalizzate.

Il pacchetto è validato e costruito con MCPB ufficiale 2.1.2, provato dopo
estrazione con SDK MCP reale su Windows x64 / Node22.23.4. Questo non equivale
a installazione accettata su uno specifico account Claude Desktop.

## ChatGPT desktop, Codex e client MCP per modelli locali

Scaricare `certosa-archives-0.0.5-alpha.1-windows-portable.zip`, verificare il
checksum ed estrarre in una cartella stabile del disco di progetto. Serve
Node22.13+; tutte le dipendenze sono già incluse, senza installazioni globali.
Per questo progetto usare H, inclusi temporanei/cache, mai C come ripiego.

```powershell
node <cartella-estratta>/src/desktop-config.mjs --project H:/CartellaArchivi
```

La cartella di progetto deve già esistere. Il comando crea esempi in
`H:/CartellaArchivi/certosa-client-configs`, preservando file già presenti:

- `chatgpt-codex.toml`: aggiungere la sezione MCP alle impostazioni supportate
  dal client, preservando le altre sezioni. La configurazione di progetto può
  essere usata nei progetti attendibili di ChatGPT/Codex.
- `claude-desktop.json`: configurazione manuale alternativa al pacchetto MCPB.
- `mcp-local.json`: blocco stdio per host MCP che eseguono modelli locali.

In ChatGPT desktop è disponibile anche Impostazioni → MCP servers → Add server:
scegliere STDIO e riportare comando, argomenti e variabili dell'esempio generato,
salvare e riavviare il collegamento. Le funzioni disponibili dipendono dalla
superficie e dalle policy dell'account. La configurazione locale non collega
automaticamente ChatGPT web o un esecutore cloud.

Il generatore non modifica le impostazioni dei client e non apre archivi.
Il connettore non registra associazioni di file di Windows. Il riconoscimento
avviene tramite descrizioni, istruzioni MCP, prompt e skill inclusa. Un host
che non inoltra le istruzioni MCP può usare la skill o la risorsa
`certosa://archive-workflow`.

## Prima prova e salvataggio compatibile

Chiedere: «Apri una copia del mio archivio Certosa». Scegliere il file e
inserire la password solo nella finestra Windows, poi selezionare i quaderni.
Per creare nuovi quaderni abilitare anche «Consenti la creazione di nuovi
quaderni». Il consenso scade dopo15minuti; non deve essere rinnovato in chat
comunicando la password al modello.

Esempio di richiesta: «Crea un quaderno Manuale del mio stack di300pagine in
Arial, con autore e indice; aggiorna anche due pagine del quaderno autorizzato.
Mostrami la proposta, applicala, rileggi e salva una copia compatibile Certosa».

Il server espone17strumenti. I gruppi di modifiche sono atomici: fino100operazioni
e200.000nuovi caratteri per proposta, con revisioni e punti di recupero. I nuovi
quaderni hanno titoli di serie distinti; volumi aggiuntivi di serie preesistenti
non sono ancora esposti da questo strumento. Nessuna cancellazione automatica.

`validate_archive` controlla struttura, allegati e piano di importazione originale
di Certosa. `export_archive` sceglie destinazione/password localmente, scrive
un temporaneo cifrato e lo riapre con Zip/Copia originali prima di pubblicarlo:
attendere `lastExport.status=saved`, `nativeReaderVerified=true`,
`nativeImportPlanVerified=true`, `allValuesPreserved=true`. Il file finale è
`.certosa`/CRTS2, non un `.certosa-db` rinominato. L'originale è conservato.

Il controllo garantisce l'identità dei valori serializzati e la leggibilità
con le funzioni attuali incluse; non è una promessa su versioni future o ogni
dispositivo. Limiti attuali export:256MiBfile/512MiBJSON,10.000pagine/quaderno,
100.000elementi pagina. Non si scartano contenuti per rientrarvi. Per archivi
più grandi usare il backup cifrato `.certosa-db`; l'app attuale non lo apre
direttamente. Le prestazioni del renderer per migliaia di pagine non sono
qualificate da un roundtrip del formato.

Gli estratti autorizzati inviati alla chat sono visibili al relativo provider;
le password restano locali. Nessuna chiave API LLM necessaria al connettore.
Non ripetere automaticamente scritture dall'esito incerto: rileggere prima.
Per rimuoverlo disabilitare l'estensione o la sola voce MCP del client;
conservare cartella archivi e backup. Nessuna disinstallazione cancella i quaderni.

## Fonti ufficiali verificate il 1 novembre 2026

- [MCP in ChatGPT desktop e Codex](https://learn.chatgpt.com/docs/extend/mcp).
- [Estensioni locali Claude Desktop](https://support.claude.com/en/articles/10949351-getting-started-with-local-mcp-servers-on-claude-desktop).
- [Formato MCPB](https://github.com/modelcontextprotocol/mcpb/blob/main/MANIFEST.md).
- [Submission OpenAI desktop-only](https://developers.openai.com/plugins/deploy/desktop-only): accesso per partner approvati; il download GitHub non equivale a pubblicazione nel catalogo. Nessuna submission effettuata.
