# Certosa MCP — prototipo pubblico

Questo repository prepara un connettore per la biblioteca locale Certosa.
La prima versione pubblica contiene il motore di lettura/ricerca e le anteprime
non applicate delle modifiche. Non è ancora un server MCP installabile nei
client: mancano trasporto, collegamento al dispositivo, consenso e commit reale.

I quaderni restano sul dispositivo. Password, archivi, profili browser e cronologia
privata non sono distribuiti. Il contenuto scelto per un LLM remoto sarà comunque
visto da quel servizio. Nessuna accettazione nei cataloghi è stata ottenuta.

Il prototipo include anche un riferimento opaco monouso per chiedere un'autenticazione locale: il modello riceve solo l'esito, non il segreto.
Deposito credenziali ed esecutore reali non sono implementati; le azioni sono
simulate nei test. Il semplice titolo Passwords non protegge un quaderno: serve
classificarlo ed escluderlo dalla lettura/ricerca generica.

Le 27 prove unitarie si avviano con `npm test` da un clone, usando Node.js 22+.
Il pacchetto prerelease è una libreria JavaScript senza dipendenze runtime;
non contiene un comando server o un collegamento automatico a Certosa.

[Stato e utilizzo](README.md) · [Distribuzione e submission](DISTRIBUTION.md)

Il quaderno locale «Usi Interessanti» guiderà la scelta dei flussi, partendo da
bisogni umani e da riscontri di utilizzo, non da un elenco di automazioni.
