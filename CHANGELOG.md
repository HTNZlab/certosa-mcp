# Certosa MCP

## 0.0.6-alpha.3 — correzioni, 8 novembre 2026

- Le modifiche ai paragrafi rifiutano Unicode non valido, controlli HTML e
  non-caratteri che renderebbero il blocco non più modificabile. Verifica del
  risultato prima della proposta; markup, media e testo precedente preservati.
- Annullare una finestra locale libera subito la sessione del dialogo, così
  una riapertura rapida riesce. Eventi e output tardivi del vecchio processo
  non interferiscono con la finestra successiva.
- La disconnessione del processo MCP conclude le sue richieste pendenti con
  `OUTCOME_UNKNOWN_DO_NOT_RETRY`. Un processo sostitutivo mantiene richieste e
  stato separati; le chiamate precedenti non restano appese.
- La ricerca distingue le parole in paragrafi separati anche nell'HTML legacy.
  Gli archivi `.certosa-db` già esistenti ricostruiscono il solo indice derivato
  quando necessario, in una transazione. Pagine, media, metadati, cronologia e
  revisione dei contenuti restano intatti; sono rilevate anche scritture di un
  client precedente che rendono obsoleto l'indice.
- Il controllo di compatibilità verifica MIME e sorgenti degli allegati secondo
  il contratto del decoder dell'app. PDF, WAV e gli altri tipi di file ammessi
  restano file; non diventano sorgenti per immagini o video. Tipi attivi non
  ammessi e sorgenti incompatibili sono rifiutati prima dell'export. Il frontend
  0.3.8 corretto conserva il MIME dei file durante il ripristino; collaudo dei
  pacchetti con PNG/PDF/WAV, lettore nativo e sanitizer originale.

Conservati 19 strumenti, consenso di 30 minuti di inattività, formato degli
archivi e compatibilità con Certosa 0.3.8. Nessuna installazione automatica nei
client, nuova funzione browser o modifica al limite storico di `Store.save`.
Download ufficiali e checksum indicati in INSTALL.it.md e INSTALL.md.

## 0.0.6-alpha.2 — candidata locale, 8 novembre 2026

- Consenso predefinito: 30 minuti di inattività. Letture, ricerche, proposte,
  modifiche, validazione ed export/backup riusciti rinnovano l’attesa.
- Stato, capabilities e handshake non tengono aperto il consenso. Operazioni
  fallite o non autorizzate non lo rinnovano; scadenza e revoca richiedono un
  nuovo consenso locale senza riattivazione automatica.
- Un’operazione già autorizzata in corso conta come attività e può completarsi;
  revoca esplicita e cambio sessione continuano a impedire commit tardivi.
- Archivio portatile, copia incrementale, dominio quaderni e proposte usano la
  stessa regola; TTL brevi espliciti restano disponibili per i collaudi.
- Nessun nuovo strumento grafico o avvio automatico del browser esposto da MCP.
  L’archivio resta una copia strutturata dei dati, non include il programma,
  permessi browser o motori vocali. Export/import non è sincronizzazione live.

Conservati i 19 strumenti e la compatibilità dei paragrafi con Certosa 0.3.8.
Pacchetti candidati locali; nessuna installazione nei client o pubblicazione.

## 0.0.6-alpha.1 — candidata locale, 8 novembre 2026

- Aggiunti `read_page_blocks` e `prepare_paragraph_edit`, 19 strumenti archivio.
- Modifiche di testo per intervallo UTF-16, hash del paragrafo e testo atteso;
  inserimenti ereditano il primo segmento coinvolto, gli altri stili restano intatti.
- Stili paragrafo tipizzati: normale, titolo, sottotitolo, elenco, citazione.
- Campo `styleEditable`: stili applicabili soltanto a `div.p`; i paragrafi legacy
  `div`/`p` restano modificabili nel testo senza una promessa di resa del nuovo stile.
- Anteprima senza HTML grezzo, controllo revisione e hash al salvataggio,
  checkpoint cifrato, export verificato dal lettore/import originale dell'app.
- `replace` storico rifiuta HTML ricco anche nel laboratorio browser.
- Consenso/documentazione distinguono elaborazione locale e inoltro al provider
  da parte del client; nessun provider o canale remoto nuovo.

Limiti: modifiche strutturate sugli archivi, non sul laboratorio browser live;
paragrafi top-level `div`/`p` con markup inline supportato; blocchi annidati,
tabelle e intervalli che attraversano `<br>` non modificabili. Lettura limitata
a 50 blocchi / 200.000 caratteri e pagine HTML di un milione di caratteri.
Nessuna migrazione automatica o modifica del formato archivio. Nessuna nuova
installazione nei client, pubblicazione o qualifica telefono.

La visualizzazione e l'importazione dei nuovi stili richiedono Certosa 0.3.8.
Il frontend pubblico precedente 0.3.7 non interpreta gli stili nuovi e può
rimuoverne gli attributi durante importazione. Export cifrato verificato dal
lettore originale non equivale a nuova presentazione qualificata in vecchie app.
