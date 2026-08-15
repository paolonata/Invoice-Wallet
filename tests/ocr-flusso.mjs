/* Il flusso completo di lettura automatica, con un finto ponte Android.
   Verifica che scattando una foto i campi si compilino da soli e che
   quello che scrivi tu non venga mai sovrascritto.

   node tests/ocr-flusso.mjs
*/
import { chromium } from 'playwright';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml', '.webmanifest': 'application/manifest+json' };
const server = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]);
  if (p === '/') p = '/index.html';
  const f = path.join(ROOT, p);
  if (!fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { 'content-type': TYPES[path.extname(f)] || 'application/octet-stream' });
  res.end(fs.readFileSync(f));
});
await new Promise((r) => server.listen(4181, r));

const SCONTRINO = `ESSELUNGA S.P.A.
VIA GIAMBOLOGNA 1 - MILANO
LATTE INTERO 1L          1,29
PANE CASERECCIO          2,45
TOTALE COMPLESSIVO      12,74
Contanti                15,00
Resto                    2,26
04/08/2026 18:42`;

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const page = await (await browser.newContext({ viewport: { width: 400, height: 860 } })).newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });

// Finto ponte: si comporta come Android, ma restituisce un testo noto.
await page.addInitScript((testo) => {
  const pezzi = new Map();
  window.AndroidHost = {
    platform: () => 'android',
    versionName: () => 'test',
    canReadText: () => true,
    fileBegin: (nome) => { const t = 'tok' + Math.random(); pezzi.set(t, { nome, n: 0 }); return t; },
    fileChunk: (t) => { pezzi.get(t).n++; return true; },
    fileEnd: (t, modo) => {
      const info = pezzi.get(t); pezzi.delete(t);
      window.__ocrChiamate = (window.__ocrChiamate || 0) + (modo === 'ocr' ? 1 : 0);
      window.__pezziRicevuti = info.n;
      return modo === 'ocr' ? testo : 'Download/Invoice Wallet/' + info.nome;
    },
    fileAbort: () => {},
  };
}, SCONTRINO);

await page.goto('http://localhost:4181/');
await page.waitForTimeout(900);

const foto = async () => {
  const dataUrl = await page.evaluate(() => {
    const c = document.createElement('canvas'); c.width = 600; c.height = 850;
    const x = c.getContext('2d'); x.fillStyle = '#f6f4ef'; x.fillRect(0, 0, 600, 850);
    x.fillStyle = '#000'; x.font = '26px monospace'; x.fillText('ESSELUNGA', 40, 60);
    return c.toDataURL('image/jpeg', 0.85);
  });
  return Buffer.from(dataUrl.split(',')[1], 'base64');
};

let ok = true;
const controlla = (cond, msg) => { if (!cond) { ok = false; console.log('   ✗ ' + msg); } };

// ── 1. scatto: i campi devono arrivare già compilati ─────────────
await page.click('#fab');
await page.waitForTimeout(300);
await page.click('.action:has-text("Scatta una foto")');
await page.waitForTimeout(200);
await page.setInputFiles('#input-camera', [{ name: 'f.jpg', mimeType: 'image/jpeg', buffer: await foto() }]);
await page.waitForTimeout(2000);

const importo = await page.inputValue('#f-amount');
const negozio = await page.inputValue('#f-title');
const data = await page.inputValue('#f-date');
const categoria = await page.getAttribute('#f-cats .cat.is-active', 'data-cat');
const nota = await page.locator('.sheet .note:has-text("Letto dallo scontrino")').count();
console.log(`1) importo "${importo}", negozio "${negozio}", data "${data}", categoria "${categoria}"`);
controlla(importo === '12,74', `importo atteso 12,74, trovato "${importo}"`);
controlla(negozio === 'Esselunga', `negozio atteso Esselunga, trovato "${negozio}"`);
controlla(data === '2026-08-04', `data attesa 2026-08-04, trovata "${data}"`);
controlla(categoria === 'spesa', `categoria attesa spesa, trovata "${categoria}"`);
controlla(nota === 1, 'manca la nota "Letto dallo scontrino"');

await page.screenshot({ path: '/tmp/claude-0/-home-user-Invoice-Wallet/adcdbdf0-8acc-5df0-ac6d-c5ffdf50eb87/scratchpad/shots/30-ocr-precompilato.png' });

// la foto deve essere arrivata a pezzi, non in un colpo solo
const pezzi = await page.evaluate(() => window.__pezziRicevuti);
console.log(`   foto trasferita in ${pezzi} pezzo/i, chiamate OCR: ${await page.evaluate(() => window.__ocrChiamate)}`);
controlla(pezzi >= 1, 'la foto non è arrivata al ponte');

await page.click('[data-save]');
await page.waitForTimeout(900);

// ── 2. quello che scrivo io non deve essere sovrascritto ─────────
await page.click('.card');
await page.waitForTimeout(700);
await page.click('[data-edit]');
await page.waitForTimeout(600);
await page.fill('#f-title', 'Spesa della domenica');
await page.click('#f-rileggi');
await page.waitForTimeout(1500);
const dopoRilettura = await page.inputValue('#f-title');
console.log(`2) dopo "Compila leggendo la foto": negozio = "${dopoRilettura}"`);
controlla(dopoRilettura === 'Esselunga', 'la rilettura esplicita deve compilare il negozio');

await page.click('[data-cancel]');
await page.waitForTimeout(400);

// ── 3. senza ponte Android il pulsante non deve esistere ─────────
const page2 = await (await browser.newContext({ viewport: { width: 400, height: 860 } })).newPage();
await page2.goto('http://localhost:4181/');
await page2.waitForTimeout(900);
await page2.click('#fab');
await page2.waitForTimeout(300);
await page2.click('.action:has-text("Scatta una foto")');
await page2.waitForTimeout(200);
await page2.setInputFiles('#input-camera', [{ name: 'f.jpg', mimeType: 'image/jpeg', buffer: await foto() }]);
await page2.waitForTimeout(1500);
const pulsante = await page2.locator('#f-rileggi').count();
const importoWeb = await page2.inputValue('#f-amount');
console.log(`3) nel browser: pulsante rileggi = ${pulsante}, importo = "${importoWeb}"`);
controlla(pulsante === 0, 'nel browser il pulsante di lettura non deve comparire');
controlla(importoWeb === '', 'nel browser i campi devono restare vuoti');

console.log(errors.length ? `ERRORI JS:\n${errors.join('\n')}` : 'Nessun errore JS');
console.log(ok && !errors.length ? '\n✅ FLUSSO OCR OK' : '\n❌ QUALCOSA NON TORNA');

await browser.close();
server.close();
process.exit(ok && !errors.length ? 0 : 1);
