# Certosa MCP: GitHub pubblico e submission

Requisito owner, 1 novembre 2026: l'adattatore deve avere un repository GitHub
pubblico autonomo, documentazione e pacchetti installabili; puntiamo anche ai
cataloghi OpenAI e Claude. Prima priorità operativa: biblioteca di prova locale
con il quaderno «Usi Interessanti», orientato a bisogni umani.

## Stato reale

Il ramo contiene ancora un motore di dominio e proposte, non un server MCP
installabile. Il primo export pubblico è una preview del codice, inclusa la
capacità sperimentale di usare credenziali tramite esecutore locale simulato.
Non contiene un deposito credenziali o un esecutore reale. Gli invii ai cataloghi
**non sono stati eseguiti**. L'approvazione di un catalogo non deriva dalla
pubblicazione su GitHub. La scelta «quaderni solo sul dispositivo» resta valida.

## Repository e distribuzione indipendente

Repository previsto per la preview: `HTNZlab/certosa-mcp`, con storia nuova e manifest
di esportazione esplicito. Licenza MIT del codice, notices delle dipendenze,
README inglese e italiano, installazione, esempi, supporto, changelog, test e CI.
Release versionate con checksum e istruzioni per aggiornare e rimuovere il
connettore. Dichiarare chiaramente ambienti supportati e limitazioni mobile.

Prima release utilizzabile come connettore: implementare trasporto MCP con SDK mantenuto, connessione
autorizzata alla Certosa sbloccata, consenso ai quaderni e commit/ripristino.
Testare un'installazione pulita su ogni piattaforma dichiarata. Non presentare
il catalogo JSON attuale come se fosse già un server MCP.

Esportare solo sorgenti, contratti, test sintetici strettamente necessari e
documentazione dell'adattatore. Non pubblicare cronologia del repository
privato, archivi `.certosa`, profili browser, contenuti del quaderno, chiavi,
cache, database o log di lavoro. Gli esempi della biblioteca restano fuori Git.

Il server locale può essere distribuito direttamente da GitHub per client
compatibili. Per ChatGPT web o Claude web occorre il percorso remoto e il
ponte al dispositivo; la biblioteca non deve diventare per questo un archivio
persistente del gateway. Il modello vede gli estratti che vengono inoltrati.

## OpenAI

Fonti ufficiali lette al 1 novembre 2026:
[Submit and publish](https://developers.openai.com/plugins/deploy/submission),
[Remote MCP review](https://developers.openai.com/plugins/deploy/app-review),
[Desktop-only](https://developers.openai.com/plugins/deploy/desktop-only).

1. Preparare il pacchetto plugin ZIP, identità sviluppatore/azienda verificata,
   scheda prodotto, documentazione, privacy e supporto pubblici, dimostrazione e
   casi di prova con dati fittizi. Verificare i permessi dell'organizzazione.
2. Nel [portale Plugins](https://platform.openai.com/plugins) caricare il pacchetto
   e correggere i rilievi automatici. Per MCP remoto: endpoint HTTPS stabile,
   verifica dominio, autenticazione e scansione degli strumenti.
3. Fornire al revisore un accesso di prova realmente funzionante, con istruzioni
   complete. Inviare alla revisione e, dopo l'approvazione, scegliere Publish.

Per **MCP locale/desktop-only** la documentazione limita gli invii ai partner
approvati: serve che OpenAI abiliti l'organizzazione. Il percorso include
server e dipendenze nel pacchetto, configurazione stdio e installazione desktop
pulita. Non promettere oggi una pubblicazione locale self-service per il nostro
account. Per MCP remoto un endpoint localhost o di solo collaudo non è valido.

## Claude

Fonti ufficiali:
[Submit your plugin](https://claude.com/docs/plugins/submit),
[Submit a connector](https://claude.com/docs/connectors/building/submission),
[Annuncio del portale](https://claude.com/resources/articles/build-plugins-for-claude).

Nel [portale sviluppatori](https://claude.ai/directory/manage) scegliere il tipo
appropriato. Per il plugin bundle: repository GitHub, pacchetto, descrizione,
documentazione, privacy, supporto, casi d'uso e dimostrazione funzionante. Il
portale è documentato per sviluppatori con un piano Claude a pagamento.

Per il **connettore remoto**: HTTPS raggiungibile, autenticazione appropriata,
strumenti con titolo e annotazioni, account di prova e collaudo dei tool. Il
portale raccoglie gestione dati, scheda, casi d'uso e informazioni per i revisori.
Gli esiti e la successiva pubblicazione si gestiscono nel portale.

Per il **server locale** usare il percorso plugin: le attuali istruzioni dicono
che nuove schede desktop extension/MCPB non sono più accettate nel catalogo.
Un vecchio tutorial DXT/MCPB non descrive quindi l'attuale submission pubblica.

## Lavoro da completare prima degli invii

- Da «Usi Interessanti» scegliere pochi flussi che una persona riconosce utili.
- Provare ricerca, lettura e modifiche effettive con consenso e ripristino.
- Completare trasporto, bridge, packaging e installazione verificabile.
- Preparare repository pulito, sito documentazione/privacy e contatti reali.
- Preparare ambienti dimostrativi indipendenti da dati e accessi personali.
- Verificare requisiti e abilitazioni dei due account al momento dell'invio.

Le procedure sono documentate, non eseguite sugli account owner. Nessun modulo
è stato inviato, nessun accordo accettato e nessuna idoneità presunta.
