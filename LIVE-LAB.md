# Biblioteca di prova collegata alla chat

Versione 0.0.2-alpha.3, 1 novembre 2026. Laboratorio locale funzionante, distinto
dalla PWA pubblica e dalle integrazioni negli account ChatGPT, Claude e Grok.

## Aprire la prova preparata sul computer dell'owner

Aprire `H:/certosa/verifiche/connector-live-20261101/Apri-Certosa-con-chat.cmd`.
Usa un profilo browser dedicato sul progetto H, diverso sia da Chrome personale
sia dalle revisioni della biblioteca già consegnate. Al primo ingresso scegliere
la propria password locale. Poi premere **Chat**, accanto a Menu (in alto nel quaderno, in basso a destra
nella stanza), e scegliere Collega per
15 minuti. Il pannello resta aperto e mostra la conferma del collegamento. Viene autorizzato soltanto il quaderno «Usi Interessanti».

Se manca l’abbinamento, il pulsante Chat resta presente e spiega come riaprire
la prova. La voce del menu è ora la prima, sempre presente. Per aggiornare una
finestra già aperta salvare con Ctrl+S e ricaricare con Ctrl+R.

La chat locale deve configurare il server stdio con `mcp-server.mjs` e il percorso
di `pairing.json`. Nella cartella della prova sono preparati esempi Codex TOML e
Claude JSON: contengono percorsi, mai il token di abbinamento o una password.
Gli strumenti di una chat già aperta potrebbero richiedere un ricaricamento;
la presenza nel suo elenco va verificata, non dedotta dal collaudo SDK.

Esempi di richieste:

- «Cerca nel quaderno Usi Interessanti gli appunti sull'uso dei segreti.»
- «Aggiungi a pagina 32: Ho provato a ritrovare un appunto senza sfogliare tutto.»
- «Rileggi la pagina e controlla che la modifica sia stata salvata.»
- «Usa una volta la credenziale Servizio di prova, senza mostrarla.»

Per l'ultima richiesta, prima scegliere nel medesimo pannello **Crea credenziale
fittizia** e attendere **Credenziale fittizia pronta per un solo uso**: il pannello
resta aperto, mostra avanzamento ed eventuali errori. Dopo l’uso mostra l’esito;
**Prepara un altro uso** autorizza una nuova prova senza rigenerare il valore già
salvato. Se si riavvia il computer, riaprire il medesimo launcher e ricollegare
la biblioteca: il sito pubblico non avvia questo laboratorio.
Il valore viene generato nel browser, conservato nel quaderno
classificato «Passwords (prova)» dentro l'archivio cifrato, e non visualizzato.
L'esecutore invia il valore solo al servizio di autenticazione locale di prova.
Alla chat tornano un handle monouso e, dopo l'uso, soltanto uno stato fisso.

**Revoca** chiude l'accesso. Chiudere/bloccare l'archivio o sostituirlo invalida
la sessione; riaprirlo non riattiva l'accesso precedente. Un browser sospeso può
risultare non disponibile. Nessuna copia dei quaderni è tenuta nel servizio. Prima di ogni richiesta il server
MCP rilegge l’abbinamento locale per riconoscere un servizio riavviato, mantenendo
fissa la destinazione. Le richieste già inviate non sono ripetute automaticamente.

## Scrittura e ripristino

Il client legge la revisione, chiama `prepare_edit`, mostra/controlla l'anteprima
e usa `apply_proposal`. L'applicazione verifica nuovamente revisione e testo
originale, blocca brevemente gli ingressi locali, crea un checkpoint cifrato e
salva attraverso lo Store nativo. La risposta `saved` arriva dopo il commit.
Append conserva l'HTML precedente; replace sostituisce il testo con paragrafi
semplici. Note e allegati della pagina sono conservati. Nessun HTML fornito dal
modello è eseguito. L'impaginazione fisica può cambiare quando si apre il volume.

**Annulla ultima modifica chat** è un comando locale del pannello: funziona nella
sessione e solo se nessuna scrittura successiva ha cambiato la revisione.
I checkpoint nativi conservano inoltre due istantanee cifrate. Nessuna
cancellazione è esposta. Un errore o timeout dopo l'invio può lasciare un esito
incerto: rileggere prima di riprovare; non ripetere automaticamente una scrittura.

## Strumenti e limiti

Otto strumenti: `list_notebooks`, `read_notebook`, `search_notebooks`,
`prepare_edit`, `read_proposal`, `apply_proposal`, `prepare_credential_use`,
`use_credential`. Il nucleo supporta anche proposte di collezioni, ma non sono
esposte finché la loro applicazione persistente non è completata.

Il laboratorio accetta soltanto la biblioteca sintetica prevista. La PWA
pubblica non carica questi moduli e i quaderni personali non sono abilitati.
Il pannello non costituisce ancora la gestione generale dei permessi Certosa.
L'API credenziali non è un password manager per account reali.

Il target logico `https://certosa-fixture.invalid` è mappato esplicitamente sul
servizio loopback della prova: è un test di autenticazione HTTP locale, non di
TLS/redirect/login esterni. Il server conserva solo un digest in memoria, senza
log dei corpi. Rifiuta origini/Host estranei e richiede token distinti per browser
e client; protegge da chiamate di pagine estranee, non da codice malevolo già
eseguito con i diritti dell'utente o nella stessa origine.

I client remoti vedranno gli estratti dei quaderni richiesti. Il valore della
credenziale resta fuori da argomenti, risultati, errori e log del modello.
Provider web, gateway, OAuth, installazioni native dei tre provider e dispositivo
fisico non sono collaudati in questa milestone. Nessuna submission inviata.

## Avvio da sorgenti distribuiti

Richiede Node.js 22+ e una copia locale attendibile della PWA Certosa compatibile
(cartella contenente `app.html` e i suoi asset), non inclusa nel pacchetto MCP.
Impostare TEMP/TMP/TMPDIR e cache nel proprio progetto prima di installare.

```sh
npm ci --ignore-scripts
node src/lab-setup.mjs --project /absolute/project --site /absolute/project/certosa-pwa --out /absolute/project/test-lab --browser /absolute/path/chrome
```

Senza `--library` genera un quaderno sintetico minimo. `--library` può caricare
la biblioteca nativa di prova con l'identificativo previsto e un solo quaderno;
nessun archivio personale generico è accettato. Un output già esistente viene
conservato: per riavviare usare `node src/local-bridge.mjs /absolute/project/test-lab/lab.json`
e il lancio browser locale con lo stesso profilo. Configurare il client stdio:

```json
{"mcpServers":{"certosa":{"command":"node","args":["/absolute/repo/src/mcp-server.mjs","/absolute/project/test-lab/pairing.json"],"env":{"TEMP":"/absolute/project/test-lab/.tmp","TMP":"/absolute/project/test-lab/.tmp","TMPDIR":"/absolute/project/test-lab/.tmp","NODE_COMPILE_CACHE":"/absolute/project/test-lab/cache-node"}}}}
```

La configurazione si riferisce all'export pubblico; nel checkout dell'app i
moduli si trovano sotto `connector/`. Il test automatizzato chiama gli strumenti
tramite client/server SDK ufficiali su stdio, non con una simulazione del protocollo.

Riferimenti: [SDK MCP](https://ts.sdk.modelcontextprotocol.io/server),
[configurazione MCP locale](https://learn.chatgpt.com/docs/extend/mcp).
