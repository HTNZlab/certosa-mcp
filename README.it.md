# Certosa MCP — laboratorio locale funzionante

La versione 0.0.2-alpha.2 aggiunge il trasporto MCP stdio alla biblioteca di prova
Certosa: ricerca, lettura e modifiche salvate realmente nell'archivio cifrato.
Note e formattazione precedente sono conservate in append; il pannello locale
permette di annullare l'ultima modifica se la revisione è ancora valida.

Una credenziale fittizia generata nel browser autentica una richiesta HTTP
loopback. Il suo valore non appare nella chat o nei messaggi MCP: torna solo
l'esito. È una prova locale, non un'integrazione con account o password reali.

[Avvio e configurazione](LIVE-LAB.md) · [Guida completa](README.md) ·
[Distribuzione e submission](DISTRIBUTION.md).

Servono Node.js22+ e una copia attendibile della PWA Certosa con i suoi asset,
non inclusa nel pacchetto. `npm ci --ignore-scripts` installa le dipendenze;
`npm test` esegue27 unitari. Il collaudo separato nella vera app usa un archivio
sintetico cifrato e un client SDK MCP reale. Non qualifica telefono fisico o
installazione nei tre account. Le chat web richiedono ancora un ponte remoto.

Sono accettati solo la biblioteca sintetica e un profilo separato; i quaderni
personali e la PWA pubblica restano fuori da questa prova. Nessuna submission
inviata e nessuna approvazione dei fornitori ottenuta.
