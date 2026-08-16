# Invoice Wallet 🧾

App per **fotografare gli scontrini e non perderli mai più**.
Scatti la foto, la ritrovi per sempre: niente account, niente abbonamenti, niente server.
Nell'app Android legge da sé negozio, totale e data; il resto lo scrivi tu, o non lo scrivi affatto.

<p align="center">
  <img src="icons/icon-192.png" width="96" alt="Icona Invoice Wallet">
</p>

---

## Cosa sa fare

| | |
|---|---|
| 📸 **Scatta e salva** | Foto dalla fotocamera o dalla galleria, anche più pagine per lo stesso scontrino |
| 🗂️ **Ordine automatico** | Raggruppati per mese, con il totale speso sempre in cima |
| 🔎 **Ritrova tutto** | La ricerca guarda in tutto l'archivio, anche fuori dal mese che stai vedendo |
| 📊 **Statistiche** | Quanto spendi al mese, dove vanno i soldi, lo scontrino più caro |
| ✨ **Compila da sola** | Nell'app Android legge lo scontrino e riempie totale, data e negozio |
| ⏳ **Scadenze resi e cambi** | Quanti giorni restano per restituire o cambiare, e un tocco per dire «fatto» |
| 🛡️ **Cestino di sicurezza** | Quello che elimini resta recuperabile per 30 giorni |
| 💾 **Backup completo** | Un file `.zip` con tutte le foto + un `.csv` apribile con Excel |
| 📴 **Funziona offline** | Installala sul telefono: si apre come una vera app, anche in aereo |
| 🌗 **Tema chiaro e scuro** | Segue il telefono, oppure lo scegli tu |
| 🔒 **Privacy totale** | Le foto non lasciano mai il dispositivo |

## L'app Android (APK)

Oltre alla versione web c'è un'app vera e propria, che impacchetta tutto dentro l'APK
(nessuna connessione richiesta, nemmeno per il primo avvio).

1. Dal telefono apri la pagina **[Releases](../../releases/latest)** del repository.
2. Scarica il file `invoice-wallet-vX.Y.Z.N.apk` e toccalo per installarlo.
   La prima volta Android chiede di autorizzare l'installazione da questa fonte.
3. **Aggiornamenti**: ogni push costruisce un APK nuovo. Lo scarichi, lo tocchi e si
   installa *sopra* quello vecchio — niente disinstallazione, gli scontrini restano.
   L'app controlla da sola due volte al giorno se c'è una versione più recente.

Funziona così perché ogni build è firmata con la stessa chiave e ha un
`versionCode` sempre più alto: sono le due condizioni che Android richiede per
un aggiornamento in place.

### La chiave di firma

Ogni build usa `android/keystore/invoice-wallet.jks`, versionata nel repository
proprio per rendere le build ripetibili senza configurare niente. È la scelta
comoda per un'app personale installata a mano.

> Il rovescio della medaglia: chiunque legga il repository può firmare un APK con
> la stessa chiave. Perché sia un problema dovrebbe comunque convincerti a
> scaricarlo e installarlo a mano, quindi per un uso personale è un rischio
> accettabile. Se un domani vuoi chiudere anche quello, sposta la chiave nei
> GitHub Secrets: il build legge già `IW_STORE_FILE`, `IW_STORE_PASSWORD`,
> `IW_KEY_ALIAS` e `IW_KEY_PASSWORD` dalle variabili d'ambiente, che hanno la
> precedenza su quelle del file `gradle.properties`.

**Non perdere quel file.** Senza, le versioni future non si installerebbero più
sopra quelle già sul telefono: si ripartirebbe da una disinstallazione, con gli
scontrini da recuperare dal backup `.zip`.

### Lettura automatica dello scontrino

Nell'app Android, appena scatti la foto il testo viene riconosciuto **sul telefono**
(ML Kit, senza rete e senza account) e l'app compila da sola **totale, data e
negozio**, indovinando anche la categoria per le catene più diffuse. I campi
restano tutti modificabili: quello che scrivi tu non viene mai sovrascritto, e
c'è un pulsante *Compila leggendo la foto* per riprovare se lo scatto era storto.

Il riconoscimento non tocca ancora le singole voci della spesa: per ora legge le
tre cose che si digitano ogni volta. La parte che interpreta il testo è in
`assets/js/ocr.js` ed è coperta da `tests/ocr.mjs` con scontrini di esempio —
se una catena viene letta male, si aggiunge una riga lì e il test dice subito
se è migliorata.

Nella versione web questa parte non c'è: il riconoscimento arriva da Android.

### Scadenze per resi e cambi

Quando salvi uno scontrino puoi attivare **Reso o cambio entro** (scorciatoie da 8,
14, 30 o 60 giorni) e **Garanzia** (1, 2, 3 o 5 anni). La scheda **Scadenze** raccoglie
tutto in ordine di urgenza — scaduti, oggi e domani, entro una settimana, entro un mese —
con un pallino rosso sulla scheda e una fascia in cima alla home quando mancano
tre giorni o meno. Nessuna notifica di sistema: gli avvisi vivono dentro l'app.

Quando il reso l'hai fatto davvero, dal dettaglio dello scontrino tocchi **Fatto**:
quella scadenza smette di chiamarti, sparisce dagli avvisi e dalla scheda Scadenze,
e resta scritta come «reso fatto» con la data. Ci si ripensa con *Annulla*.

## Come si usa

1. Apri l'app nel browser del telefono.
2. **Installala**: su Android il browser propone «Aggiungi a schermata Home»; su iPhone tocca *Condividi → Aggiungi a Home*.
3. Tocca **➕**, scatta la foto dello scontrino, scrivi importo e negozio (o lascia vuoto), **Salva**.
4. Ogni tanto: *Impostazioni → Esporta backup*, e salva lo `.zip` dove vuoi.

> **Il backup è l'unica vera assicurazione.** I dati stanno solo sul dispositivo: se perdi
> il telefono o svuoti i dati del browser, senza backup non si recuperano. Per ridurre il rischio,
> in *Impostazioni* attiva **Archiviazione protetta**: il browser si impegna a non liberare
> quello spazio da solo.

## Dove gira

Serve solo un server statico (o l'apertura da un dominio HTTPS). Per provarla in locale:

```bash
python3 -m http.server 8080
# poi apri http://localhost:8080
```

Per usarla dal telefono deve stare su HTTPS: `GitHub Pages`, Netlify, Vercel, qualunque hosting statico.
Nel repo c'è già un workflow che pubblica su GitHub Pages a ogni push su `main`
(basta attivare *Settings → Pages → Source: GitHub Actions*).

## Com'è fatta

Nessun framework, nessuna dipendenza, nessun passaggio di build: HTML, CSS e JavaScript e basta.

```
index.html               struttura delle schermate
manifest.webmanifest     dati per l'installazione come app
sw.js                    service worker: funziona offline
assets/css/styles.css    tutto lo stile (temi chiaro/scuro compresi)
assets/js/
  icons.js               icone SVG inline
  util.js                formattazione euro/date, categorie
  db.js                  archivio IndexedDB (scontrini, foto, impostazioni)
  media.js               ridimensiona e comprime le foto, miniature
  zip.js                 lettura e scrittura ZIP per i backup
  ocr.js                 dal testo dello scontrino a totale, data e negozio
  ui.js                  toast, bottom sheet, conferme, zoom foto
  app.js                 stato, schermate, azioni
tests/completo.mjs       giro completo dell'app guidato dall'interfaccia
tools/gen-icons.js       rigenera le icone PNG (node tools/gen-icons.js icons)
android/                 contenitore Android: WebView + ponte per salvare i file
  app/src/main/java/…    MainActivity, FileBridge (download), UpdateChecker
.github/workflows/       pages.yml (sito) e android.yml (APK + Release)
```

**L'aspetto: carta e penna.** L'app conserva pezzi di carta stampata, e
l'interfaccia segue quell'idea: fondo carta, testo inchiostro, e un solo colore
forte — il blu della penna — riservato a ciò che si tocca o che chiede
attenzione. Tre regole tengono insieme il tutto:

1. **il colore ha un significato**: blu = azione, ambra = fra poco, rosso = ora.
   Niente colori decorativi;
2. **si separa con linee sottili, non con ombre**: l'ombra è solo di ciò che
   galleggia davvero (pulsante di scatto, schede, avvisi);
3. **i numeri sono grandi e a larghezza fissa**, così si leggono in colonna.

Da lì vengono i tre soli ornamenti che l'app si concede, tutti e tre a costo
zero di attenzione:

- **lo strappo.** Le foto in elenco finiscono con la dentellatura di uno
  scontrino staccato dal rotolo. È l'unica decorazione vera, e dice in un colpo
  d'occhio cosa si sta guardando;
- **la grana.** Puntini radi e quasi invisibili sul fondo: non si guardano, si
  sentono. Sotto alle schede, che sono piene, spariscono del tutto;
- **la valuta in secondo piano.** Nei numeri grandi il simbolo è più piccolo e
  più chiaro delle cifre: le cifre sono il messaggio, il simbolo è servizio.

Sulla lista il totale del periodo è il protagonista, con il confronto sul mese
precedente e sei colonnine che mostrano l'andamento recente: due informazioni
utili nello spazio che prima occupava una decorazione.

**Quattro cose che tolgono attrito.** Sono piccole e si notano solo usandola,
ma è lì che un archivio diventa comodo o fastidioso:

1. **la testata si toglie di mezzo.** Scorrendo, marchio e totale scorrono via e
   restano appiccicati in cima solo il periodo e la ricerca — quaranta pixel al
   posto di centocinquanta, e non si deve più risalire per cambiare mese;
2. **la ricerca guarda ovunque.** Mentre cerchi, mese e categoria si mettono da
   parte: uno scontrino che c'è ma resta nascosto perché era selezionato un
   altro mese è indistinguibile da uno perso;
3. **l'importo che manca si tocca.** Nell'elenco al posto del trattino c'è
   *+ importo*: un tocco apre il campo con la tastiera già pronta, senza passare
   dal dettaglio e dal menu delle azioni;
4. **il totale dichiara i suoi buchi.** Se qualche scontrino è senza importo, la
   somma lo dice sotto al numero invece di sembrare completa.

### Aprire uno scontrino

La schermata di dettaglio parte da una domanda: *perché* stai aprendo questo
scontrino? Quasi sempre per una di tre ragioni — sapere quanto hai speso,
capire se sei ancora in tempo per un reso, o mostrare/mandare la prova
d'acquisto a qualcuno. Perciò è fatta così, dall'alto in basso:

1. **chi è**: importo in grande, esercente, categoria e data. È la prima cosa
   che leggi, non l'ultima;
2. **cosa puoi farci adesso**: se il tempo per il reso è ancora aperto compare
   una fascia con quanti giorni restano e il pulsante **Fatto** — un tocco e
   quello scontrino smette di comparire fra le scadenze, perché il reso l'hai
   già fatto. Ci si ripensa con *Annulla*;
3. **la prova**: la foto, che prende lo spazio che avanza fino a un massimo. Un
   tocco e si apre a schermo intero, che è dove leggerla ha senso;
4. **tutto quello che si sa**: reso, garanzia, nota, quante pagine e quanto
   pesano, quando l'hai aggiunto e quando l'hai modificato. Le righe che non
   hanno niente da dire non compaiono, così quando c'è poco da leggere lo
   spazio va alla foto;
5. **le azioni**: *Modifica* e *Condividi* sempre a portata; nel menu ⋯ ci sono
   *Copia i dati* (negozio · importo · data, da incollare in una nota spese),
   *Salva le foto*, *Duplica* e il cestino.

**Comportamento da app, non da sito.** Il dettaglio sta tutto in uno schermo,
senza scorrere. Il tasto Indietro di Android chiude prima quello che è aperto
sopra la pagina — foto ingrandita, schede, conferme — e solo dopo torna alla
schermata precedente: `MainActivity` interroga `window.chiudiSovrapposizione()`
prima di gestire il tasto, e nel browser la stessa pila è collegata alla
cronologia.

**Perché nell'app non c'è il service worker.** Nella versione web serve a far
funzionare l'app offline. Dentro l'APK i file sono già nel pacchetto: una copia
in cache non aggiungerebbe nulla e continuerebbe a servire la versione
precedente dopo un aggiornamento. Per questo `sw.js`, quando riconosce di girare
dentro l'app, svuota le cache e cancella la propria registrazione.

**Come sono conservati i dati.** Ogni scontrino è un record in IndexedDB con la miniatura;
le foto a piena risoluzione stanno in un archivio separato, così la lista scorre veloce
anche con migliaia di scontrini. Le immagini vengono ridimensionate (lato lungo max 1800 px
di default) e salvate in JPEG: uno scontrino occupa circa 150–250 KB invece di 3–5 MB.

## Il file di backup

Lo `.zip` esportato è pensato per essere utile anche fuori dall'app:

```
foto/2026-08-13_esselunga_a1b2c3.jpg    le immagini, con nomi leggibili
scontrini.csv                            elenco apribile con Excel o Fogli Google
invoice-wallet.json                      dati completi, serve per il ripristino
LEGGIMI.txt                              istruzioni per il te del futuro
```

Il ripristino aggiunge solo gli scontrini mancanti: puoi reimportare lo stesso backup
mille volte senza creare doppioni.

## Le prove

`tests/` contiene prove vere, non finte: ognuna avvia un server, apre l'app in
Chromium e la usa. La più importante è **`tests/completo.mjs`**, che percorre
tutta l'app dall'interfaccia — aggiunge scontrini passando dalla fotocamera e
dalla galleria, cerca, filtra, modifica, cestina, esporta e reimporta il backup —
e **ripete ogni azione tre volte**: i guasti peggiori non sono al primo tocco ma
al terzo, quando qualcosa si è accumulato. Dopo ogni azione conclusa controlla
anche che non sia rimasto niente aperto sopra la pagina.

```bash
node tests/completo.mjs      # il giro completo
node tests/ocr.mjs           # la lettura degli scontrini, senza browser
node tests/migliorie.mjs     # testata, ricerca, importi mancanti
node tests/scadenze.mjs      # resi e garanzie, ricalcolo compreso
node tests/navigazione.mjs   # il tasto Indietro di Android
node tests/service-worker.mjs
```

## Licenza

MIT — fanne quello che vuoi.
