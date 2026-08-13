# Test

Due script che guidano un browser vero (Playwright) sull'app, come farebbe una persona.

```bash
npm install playwright        # una volta sola
npx playwright install chromium

node tests/ocr.mjs            # interpretazione degli scontrini (niente browser, immediato)
node tests/app.mjs            # giro completo: foto, ricerca, backup, ripristino, cestino
node tests/scadenze.mjs       # regressione: le scadenze seguono la data dello scontrino
node tests/ocr-flusso.mjs     # lettura automatica, con un finto ponte Android
```

Ognuno avvia da sé un server statico sulla cartella del progetto, quindi non
serve altro. Gli screenshot finiscono nella cartella indicata dentro lo script.
