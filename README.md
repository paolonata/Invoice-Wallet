# Invoice Wallet 🧾

App per **fotografare gli scontrini e non perderli mai più**.
Inquadri, tocchi, è già in archivio: niente moduli, niente account, niente abbonamenti,
niente server. Le foto non lasciano mai il telefono.

<p align="center">
  <img src="icons/icon-192.png" width="96" alt="Icona Invoice Wallet">
</p>

---

## Due schermate, e basta

L'app ha **un mirino** e **un archivio**. Tutto il resto si apre da lì, quando serve.

**Scatta.** Il pulsante nero in basso è sempre a portata di pollice e apre il mirino
vero e proprio, dentro l'app: niente passaggio dalla fotocamera di sistema, niente
schermata di conferma. Tocchi l'otturatore e **lo scontrino è già salvato** — la
lettura automatica gli mette negozio, importo, data e categoria mentre tu sei ancora
lì che inquadri il prossimo. Una scheda in basso ti dice cos'ha capito e offre due
scorciatoie: **Importo** (un tastierino grande, quattro tocchi e via) e **Dettagli**.
Se non tocchi niente, va bene lo stesso: è comunque in archivio.

**Archivio.** Il totale del periodo in grande, con quanto è cambiato rispetto al mese
scorso e l'andamento degli ultimi sei; sotto, gli scontrini a estratto conto o a
griglia. La ricerca è sempre lì, non nascosta dietro una lente. Quando qualcosa sta
per scadere, una fascia rossa in cima lo dice e porta alle scadenze.

| | |
|---|---|
| 📸 **Mirino integrato** | Inquadri e tocchi: salvato. Più scatti di fila senza mai uscire |
| ✨ **Compila da sola** | Nell'app Android legge negozio, totale, data e categoria dallo scatto |
| 🔢 **Tastierino** | L'importo, quando la lettura non basta, in quattro tocchi |
| 🗂️ **Ordine automatico** | Raggruppati per mese, con il totale speso sempre in cima |
| 🔎 **Ritrova tutto** | Ricerca sempre visibile per negozio, nota, importo o data |
| 📊 **Statistiche** | Si aprono toccando il totale: dove vanno i soldi, lo scontrino più caro |
| ⏳ **Scadenze resi e cambi** | Quanti giorni restano per restituire o cambiare, con avviso in cima |
| 🛡️ **Cestino di sicurezza** | Quello che elimini resta recuperabile per 30 giorni |
| 💾 **Backup completo** | Un file `.zip` con tutte le foto + un `.csv` apribile con Excel |
| 📴 **Funziona offline** | Installala sul telefono: si apre come una vera app, anche in aereo |
| 🌗 **Tema chiaro e scuro** | Segue il telefono, oppure lo scegli tu |
| 🔒 **Privacy totale** | Le foto non lasciano mai il dispositivo |

Dal mirino restano raggiungibili la **galleria** (per gli scontrini già fotografati:
se ne scegli più d'uno l'app chiede se sono scontrini diversi o pagine dello stesso)
e la **fotocamera di sistema**, per quando serve la sua messa a fuoco.

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

Nell'app Android, nell'istante in cui tocchi l'otturatore il testo viene riconosciuto
**sul telefono** (ML Kit, senza rete e senza account) e lo scontrino nasce già con
**totale, data e negozio** compilati, categoria indovinata per le catene più diffuse.
È questa la ragione per cui non c'è più un modulo da riempire. I campi restano tutti
modificabili dal dettaglio: quello che scrivi tu non viene mai sovrascritto, e c'è un
pulsante *Compila leggendo la foto* per riprovare se lo scatto era storto.

Il riconoscimento non tocca ancora le singole voci della spesa: per ora legge le
tre cose che si digitano ogni volta. La parte che interpreta il testo è in
`assets/js/ocr.js` ed è coperta da `tests/ocr.mjs` con scontrini di esempio —
se una catena viene letta male, si aggiunge una riga lì e il test dice subito
se è migliorata.

Nella versione web questa parte non c'è: il riconoscimento arriva da Android.

### Scadenze per resi e cambi

Dal dettaglio di uno scontrino puoi attivare **Reso o cambio entro** (scorciatoie da 8,
14, 30 o 60 giorni) e **Garanzia** (1, 2, 3 o 5 anni). La schermata **Scadenze** raccoglie
tutto in ordine di urgenza — scaduti, oggi e domani, entro una settimana, entro un mese —
e si apre dalla fascia rossa che compare in cima all'archivio quando qualcosa scade fra
tre giorni o meno. Nessuna notifica di sistema: gli avvisi vivono dentro l'app.
Se cambi la data dello scontrino, le scadenze si ricalcolano da sole sulla nuova data.

## Come si usa

1. Apri l'app nel browser del telefono.
2. **Installala**: su Android il browser propone «Aggiungi a schermata Home»; su iPhone tocca *Condividi → Aggiungi a Home*.
3. Tocca **Scatta**, inquadra lo scontrino, tocca l'otturatore. Fatto: è salvato.
   Se l'importo non è stato letto, il tastierino è un tocco più in là.
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
index.html               le due schermate (mirino e archivio) e ciò che ci si apre sopra
manifest.webmanifest     dati per l'installazione come app
sw.js                    service worker: funziona offline
assets/css/styles.css    tutto lo stile (temi chiaro/scuro compresi)
assets/js/
  icons.js               icone SVG inline
  util.js                formattazione euro/date, categorie
  db.js                  archivio IndexedDB (scontrini, foto, impostazioni)
  camera.js              il mirino: accende, spegne, scatta
  media.js               ridimensiona e comprime le foto, miniature
  zip.js                 lettura e scrittura ZIP per i backup
  ocr.js                 dal testo dello scontrino a totale, data e negozio
  ui.js                  toast, bottom sheet, conferme, zoom foto
  app.js                 stato, schermate, azioni
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

Sulla lista il totale del periodo è il protagonista, con il confronto sul mese
precedente e sei colonnine che mostrano l'andamento recente: due informazioni
utili nello spazio che prima occupava una decorazione.

**Comportamento da app, non da sito.** La schermata di dettaglio sta tutta in
uno schermo: la foto occupa lo spazio che avanza e i dati restano sempre
visibili, senza scorrere; per leggere lo scontrino si tocca la foto e si apre a
schermo intero. Il tasto Indietro di Android chiude prima quello che è aperto
sopra la pagina — foto ingrandita, schede, conferme — e solo dopo torna alla
schermata precedente: `MainActivity` interroga `window.chiudiSovrapposizione()`
prima di gestire il tasto, e nel browser la stessa pila è collegata alla
cronologia.

**Il mirino dentro l'app.** `assets/js/camera.js` chiede `getUserMedia` con la
fotocamera posteriore alla risoluzione più alta che il telefono concede, e lo scatto
è un `drawImage` del fotogramma su canvas. Funziona anche dentro l'APK perché la
WebView serve i file da `https://appassets.androidplatform.net` (origine sicura) e
`MainActivity` risponde a `onPermissionRequest` concedendo la videocamera dopo aver
chiesto ad Android il permesso `CAMERA`. Se il permesso viene negato, il mirino non
si accende e resta il pulsante che passa alla fotocamera di sistema.

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

## Licenza

MIT — fanne quello che vuoi.
