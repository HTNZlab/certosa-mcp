# Installare Certosa Archives · 0.0.6-alpha.3

I nuovi stili richiedono il frontend Certosa 0.3.8 e blocchi `div.p` indicati da
`styleEditable: true`. La precedente 0.3.7 non interpreta i nuovi stili e
può rimuoverne gli attributi nell'importazione. Nei blocchi `div`/`p` legacy resta
possibile modificare il testo preservando il markup. La verifica dell'export
cifrato non qualifica la nuova presentazione nei frontend precedenti.

Il connettore permette al modello di riconoscere i file `.certosa`, richiedere
lo sblocco sul dispositivo, cercare, creare e modificare quaderni e salvare una
copia verificata nel formato attuale di Certosa. Il modello deve essere usato
attraverso un'app che supporti MCP: il solo modello non installa connettori.

## Download e verifica

File ufficiali: [MCPB Windows](https://certosa.htnzlab.it/downloads/mcp/0.0.6-alpha.3/certosa-archives-0.0.6-alpha.3-windows.mcpb),
[ZIP portatile](https://certosa.htnzlab.it/downloads/mcp/0.0.6-alpha.3/certosa-archives-0.0.6-alpha.3-windows-portable.zip),
[sorgenti](https://certosa.htnzlab.it/downloads/mcp/0.0.6-alpha.3/certosa-mcp-0.0.6-alpha.3-source.zip) e
[SHA256SUMS](https://certosa.htnzlab.it/downloads/mcp/0.0.6-alpha.3/SHA256SUMS).

Confrontare l'hash SHA-256 dei file scaricati con `SHA256SUMS`:

```powershell
Get-FileHash ./certosa-archives-0.0.6-alpha.3-windows.mcpb -Algorithm SHA256
```

Questi download non richiedono una release GitHub. La pubblicazione non installa
il connettore nei client: seguire i passaggi seguenti sul dispositivo scelto.

Aprendo un archivio `.certosa-db` precedente, il connettore può aggiornare il suo
indice locale di ricerca per distinguere correttamente i paragrafi. Questa
manutenzione non modifica pagine, media, metadati, cronologia o revisione dei
contenuti. Non converte il formato dell'archivio.

Per ripristinare allegati PDF e WAV usare la versione 0.3.8 aggiornata di Certosa.
Il connettore controlla i tipi MIME supportati prima dell'export. La conservazione
dei file non implica ricerca nel testo dei PDF, OCR o trascrizione dell'audio.

## Claude Desktop su Windows

Scaricare dai link sopra `certosa-archives-0.0.6-alpha.3-windows.mcpb` e verificarne
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

Scaricare `certosa-archives-0.0.6-alpha.3-windows-portable.zip`, verificare il
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
quaderni». Il consenso scade dopo 30 minuti di inattività e si rinnova automaticamente
a ogni operazione autorizzata riuscita. Controllare soltanto lo stato non lo
rinnova. Un’operazione in corso può terminare; la revoca esplicita la interrompe
prima del salvataggio. Gli errori non rinnovano il consenso. Dopo scadenza o
revoca servono nuovo sblocco e consenso locali, mai la password nella chat.

Esempio di richiesta: «Crea un quaderno Manuale del mio stack di300pagine in
Arial, con autore e indice; aggiorna anche due pagine del quaderno autorizzato.
Mostrami la proposta, applicala, rileggi e salva una copia compatibile Certosa».

Il connettore espone 19 strumenti, inclusi `read_page_blocks` per leggere
i blocchi di una pagina e `prepare_paragraph_edit` per preparare modifiche
mirate al testo e allo stile dei paragrafi. La proposta viene riletta prima
di applicarla; le altre parti della pagina restano preservate.
I gruppi di modifiche sono atomici: fino a 100 operazioni
e 200.000 nuovi caratteri per proposta, con revisioni e punti di recupero. I nuovi
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

## Dati privati e servizi esterni

Il connettore apre e salva gli archivi sul dispositivo. I contenuti dei quaderni
selezionati vengono però consegnati al client della chat: se usa un modello
remoto, possono essere inviati al suo fornitore. Un collegamento MCP locale
non rende locale anche il modello. Certosa non controlla gli invii, i log o
la conservazione dei dati nei programmi e servizi di terze parti.

Per lavorare su un diario che deve restare esclusivamente sul dispositivo,
usare un client e un modello locali il cui funzionamento offline sia stato
verificato. Se questo requisito non è verificato, non concedere a quella chat
l'accesso al diario. La finestra locale permette di scegliere soltanto i
quaderni necessari e autorizzarli con 30 minuti di inattività; `close_archive` revoca
l'accesso. La revoca non cancella gli estratti già ricevuti dalla chat.

La scelta di inviare, per esempio, un romanzo a un servizio vocale remoto deve
essere separata e volontaria, con testo e destinatario indicati prima dell'invio.
Il consenso di accesso MCP non abilita automaticamente servizi di lettura
remoti. Questo candidato non aggiunge provider vocali esterni e conserva i
percorsi vocali locali esistenti.

Le password restano locali. Nessuna chiave API LLM è necessaria al connettore.
Non ripetere automaticamente scritture dall'esito incerto: rileggere prima.
Per rimuoverlo disabilitare l'estensione o la sola voce MCP del client;
conservare cartella archivi e backup. Nessuna disinstallazione cancella i quaderni.

## Fonti ufficiali verificate il 1 novembre 2026

- [MCP in ChatGPT desktop e Codex](https://learn.chatgpt.com/docs/extend/mcp).
- [Estensioni locali Claude Desktop](https://support.claude.com/en/articles/10949351-getting-started-with-local-mcp-servers-on-claude-desktop).
- [Formato MCPB](https://github.com/modelcontextprotocol/mcpb/blob/main/MANIFEST.md).
- [Submission OpenAI desktop-only](https://developers.openai.com/plugins/deploy/desktop-only): accesso per partner approvati; il download GitHub non equivale a pubblicazione nel catalogo. Nessuna submission effettuata.
