/* Comportamento da app: il tasto Indietro chiude quello che è aperto, e la
   schermata di dettaglio sta tutta dentro lo schermo senza scorrere.

   node tests/navigazione.mjs
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
await new Promise((r) => server.listen(4184, r));

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
// Telefono stretto e alto, come quello vero.
const ctx = await browser.newContext({ viewport: { width: 393, height: 851 }, deviceScaleFactor: 2 });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });

await page.goto('http://localhost:4184/');
await page.waitForTimeout(900);

let ok = true;
const controlla = (cond, msg) => { if (!cond) { ok = false; console.log('   ✗ ' + msg); } };

// scontrino con nota lunga e due foto: il caso peggiore per lo spazio
await page.evaluate(async () => {
  const foto = async (testo) => {
    const c = document.createElement('canvas'); c.width = 700; c.height = 1000;
    const x = c.getContext('2d'); x.fillStyle = '#f6f3ec'; x.fillRect(0, 0, 700, 1000);
    x.fillStyle = '#111'; x.font = 'bold 40px sans-serif'; x.fillText(testo, 40, 90);
    x.font = '28px monospace';
    for (let i = 0; i < 16; i++) x.fillText(`Articolo ${i + 1} .......... ${(i * 2.7 + 1).toFixed(2)}`, 40, 170 + i * 46);
    return new Promise((r) => c.toBlob(r, 'image/jpeg', 0.85));
  };
  const b1 = await foto('El Corte Ingles');
  const b2 = await foto('pagina 2');
  const id = uid(), p1 = uid(), p2 = uid(), now = Date.now();
  await DB.saveReceiptWithPhotos({
    id, title: 'Zapatillas El Corte Ingles', amount: 120, currency: 'EUR',
    date: '2026-07-19', category: 'shopping',
    note: 'Regalo di compleanno per Marco. Scatola conservata in cantina, con dentro lo scontrino originale e il sacchetto.',
    photoIds: [p1, p2], thumb: await makeThumb(b1), favorite: false,
    returnUntil: '2026-08-18', returnDays: 30,
    warrantyUntil: '2028-07-19', warrantyYears: 2,
    createdAt: now, updatedAt: now,
  }, [
    { id: p1, receiptId: id, blob: b1, width: 700, height: 1000, createdAt: now },
    { id: p2, receiptId: id, blob: b2, width: 700, height: 1000, createdAt: now },
  ]);
  await afterChange();
});
await page.waitForTimeout(500);

// ── 1. il dettaglio non deve scorrere ────────────────────────────
await page.click('.card');
await page.waitForTimeout(900);
await page.screenshot({ path: '/tmp/claude-0/-home-user-Invoice-Wallet/adcdbdf0-8acc-5df0-ac6d-c5ffdf50eb87/scratchpad/shots/40-dettaglio.png' });

const misure = await page.evaluate(() => ({
  paginaScorre: document.documentElement.scrollHeight > window.innerHeight + 2,
  altezzaContenuto: document.querySelector('#view-detail').scrollHeight,
  finestra: window.innerHeight,
  azioniVisibili: document.querySelector('.detail__actions').getBoundingClientRect().bottom <= window.innerHeight,
  scadenzeVisibili: [...document.querySelectorAll('.detail__tags .tag')]
    .every((t) => t.getBoundingClientRect().bottom <= window.innerHeight),
}));
console.log('1) dettaglio:', JSON.stringify(misure));
controlla(!misure.paginaScorre, 'la pagina di dettaglio non deve scorrere');
controlla(misure.azioniVisibili, 'i pulsanti Modifica/Condividi devono stare nello schermo');
controlla(misure.scadenzeVisibili, 'le etichette (data, reso, garanzia) devono stare nello schermo');

// ── 2. Indietro chiude la foto aperta, non la schermata ──────────
await page.click('[data-zoom]');
await page.waitForTimeout(700);
controlla(await page.locator('.viewer').count() === 1, 'la foto a schermo intero non si è aperta');

let gestito = await page.evaluate(() => window.chiudiSovrapposizione());
await page.waitForTimeout(300);
console.log(`2) Indietro sulla foto: gestito=${gestito}, viewer aperti=${await page.locator('.viewer').count()}, ancora nel dettaglio=${await page.locator('#view-detail').isVisible()}`);
controlla(gestito === true, 'il tasto Indietro doveva essere assorbito dalla foto');
controlla(await page.locator('.viewer').count() === 0, 'la foto doveva chiudersi');
controlla(await page.locator('#view-detail').isVisible(), 'dovevamo restare nel dettaglio');

// ── 3. Indietro chiude la scheda delle azioni ────────────────────
await page.click('[data-more]');
await page.waitForTimeout(500);
gestito = await page.evaluate(() => window.chiudiSovrapposizione());
await page.waitForTimeout(400);
console.log(`3) Indietro sulla scheda azioni: gestito=${gestito}, schede aperte=${await page.locator('.sheet-backdrop').count()}`);
controlla(gestito === true, 'il tasto Indietro doveva chiudere la scheda');

// ── 4. Indietro chiude l'editor senza uscire dal dettaglio ───────
await page.click('[data-edit]');
await page.waitForTimeout(800);
gestito = await page.evaluate(() => window.chiudiSovrapposizione());
await page.waitForTimeout(500);
console.log(`4) Indietro sull'editor: gestito=${gestito}, ancora nel dettaglio=${await page.locator('#view-detail').isVisible()}`);
controlla(gestito === true, "il tasto Indietro doveva chiudere l'editor");
controlla(await page.locator('#view-detail').isVisible(), 'dovevamo restare nel dettaglio');

// ── 5. senza niente aperto, Indietro torna alla lista ────────────
gestito = await page.evaluate(() => window.chiudiSovrapposizione());
console.log(`5) Indietro senza sovrapposizioni: gestito=${gestito} (deve essere false, così Android torna indietro)`);
controlla(gestito === false, 'senza sovrapposizioni il tasto deve passare alla navigazione');

await page.goBack();
await page.waitForTimeout(600);
controlla(await page.locator('#view-home').isVisible(), 'si doveva tornare alla lista');

console.log(errors.length ? `ERRORI JS:\n${errors.join('\n')}` : 'Nessun errore JS');
console.log(ok && !errors.length ? '\n✅ NAVIGAZIONE OK' : '\n❌ QUALCOSA NON TORNA');

await browser.close();
server.close();
process.exit(ok && !errors.length ? 0 : 1);
