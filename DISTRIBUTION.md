# Certosa MCP: GitHub pubblico e submission

Requisito owner, 1 novembre 2026: l'adattatore deve avere un repository GitHub
pubblico autonomo, documentazione e pacchetti installabili; puntiamo anche ai
cataloghi OpenAI e Claude. Prima priorità operativa: biblioteca di prova locale
con il quaderno «Usi Interessanti», orientato a bisogni umani.

## Stato reale

Repository pubblico: [HTNZlab/certosa-mcp](https://github.com/HTNZlab/certosa-mcp).
La prerelease 0.0.4-alpha.1 aggiunge il backend incrementale cifrato `.certosa-db`,
conservando lettura/scrittura/export del formato `.certosa`. Solo il campo autore
viene aggiunto. Importazione crea una copia, nessuna migrazione automatica.
Quattordici strumenti MCP locali, scelta/password/consenso su Windows, copia
cifrata consistente anche per archivi grandi. Dettagli e limiti nel README.
Collaudo sintetico reale: 40.000 pagine e 1 GiB di media, checksum verificato;
una pagina più autore scrivono circa 86 KB senza riscrivere i media.

Distribuire soltanto sorgenti, contratti, test sintetici e documentazione.
Non esportare archivi, credenziali, cronologia privata, profili, runtime o log.
Release con pacchetto e checksum; codice MIT, dipendenze con proprie licenze.
Non qualificati telefoni, account provider e integrazione nella PWA pubblica.

Il trasporto è MCP stdio locale. Non è un endpoint remoto per ChatGPT/Claude web.
Questi richiedono un ponte autorizzato al dispositivo ancora da implementare;
gli estratti richiesti diventano visibili al provider della chat. Nessuna
submission o accesso ai portali provider è stato eseguito. Le indicazioni sotto
sono quelle verificate il 1 novembre 2026, non un'approvazione dei cataloghi.

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
