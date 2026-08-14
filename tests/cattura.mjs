/* Il giro principale: inquadra, tocca, è in archivio.
   Chromium usa una fotocamera finta, così il mirino è verificabile davvero.

   node tests/cattura.mjs
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
await new Promise((r) => server.listen(4185, r));

const browser = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium',
  args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'],
});
const ctx = await browser.newContext({
  viewport: { width: 393, height: 851 }, deviceScaleFactor: 2,
  permissions: ['camera'],
});
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });

await page.goto('http://localhost:4185/');
await page.waitForTimeout(1000);

let ok = true;
const controlla = (cond, msg) => { if (!cond) { ok = false; console.log('   ✗ ' + msg); } };
const scatto = (n) => page.screenshot({ path: `/tmp/claude-0/-home-user-Invoice-Wallet/adcdbdf0-8acc-5df0-ac6d-c5ffdf50eb87/scratchpad/shots/${n}.png` });

// ── 1. archivio vuoto: una sola strada, scattare ─────────────────
console.log('1) archivio vuoto:', await page.locator('#empty').isVisible() ? 'invito allo scatto' : 'MANCA');
controlla(await page.locator('#empty').isVisible(), "l'archivio vuoto deve invitare a scattare");
controlla(await page.locator('#fab').isVisible(), 'il pulsante Scatta deve essere sempre visibile');
await scatto('50-archivio-vuoto');

// ── 2. il mirino si apre e mostra il flusso video ────────────────
await page.click('#fab');
await page.waitForTimeout(2000);
const mirino = await page.evaluate(() => {
  const v = document.querySelector('#cam-video');
  return { vista: state.view, larghezza: v.videoWidth, altezza: v.videoHeight, inRiproduzione: !v.paused };
});
console.log('2) mirino:', JSON.stringify(mirino));
controlla(mirino.vista === 'camera', 'si deve entrare nella vista mirino');
controlla(mirino.larghezza > 0 && mirino.inRiproduzione, 'il flusso video deve essere attivo');
controlla(await page.locator('#cam-vuoto').isHidden(), 'con la fotocamera attiva il messaggio di ripiego non serve');
await scatto('51-mirino');

// ── 3. un tocco sull'otturatore: lo scontrino è già in archivio ──
const primaDelloScatto = await page.evaluate(() => state.receipts.length);
await page.click('#otturatore');
await page.waitForTimeout(2500);
const dopoLoScatto = await page.evaluate(() => state.receipts.length);
console.log(`3) scontrini: ${primaDelloScatto} → ${dopoLoScatto}, scheda visibile: ${await page.locator('#scattato').isVisible()}`);
controlla(dopoLoScatto === primaDelloScatto + 1, 'lo scatto deve salvare subito, senza moduli');
controlla(await page.locator('#scattato').isVisible(), 'dopo lo scatto deve comparire la scheda di conferma');
controlla(await page.locator('#view-camera').isVisible(), 'si deve restare nel mirino per scattare ancora');
await scatto('52-scattato');

// ── 4. si continua a scattare senza uscire ───────────────────────
await page.click('#otturatore');
await page.waitForTimeout(2200);
const dopoDue = await page.evaluate(() => state.receipts.length);
console.log(`4) secondo scatto di fila: ${dopoDue} scontrini`);
controlla(dopoDue === primaDelloScatto + 2, 'si deve poter scattare più volte di seguito');

// ── 5. il tastierino salva l'importo in pochi tocchi ─────────────
await page.click('[data-importo]');
await page.waitForTimeout(600);
for (const t of ['1', '2', '5', '0']) await page.click(`.tastierino__tasti button[data-tasto="${t}"]`);
const mostrato = await page.locator('#tast-cifra').textContent();
await page.click('[data-salva]');
await page.waitForTimeout(900);
const importoSalvato = await page.evaluate(() => state.receipts[0].amount);
console.log(`5) tastierino: mostra "${mostrato}" → salvato ${importoSalvato}`);
controlla(importoSalvato === 12.5, `atteso 12,50 salvato, trovato ${importoSalvato}`);
await scatto('53-tastierino');

// ── 6. tornando indietro la fotocamera si spegne ─────────────────
await page.goBack();
await page.waitForTimeout(800);
const spenta = await page.evaluate(() => {
  const v = document.querySelector('#cam-video');
  return { vista: state.view, flusso: !!v.srcObject };
});
console.log('6) uscita dal mirino:', JSON.stringify(spenta));
controlla(spenta.vista === 'home', "si deve tornare all'archivio");
controlla(!spenta.flusso, 'uscendo, la fotocamera deve spegnersi');

// ── 7. l'archivio mostra quello che è stato catturato ────────────
await page.waitForTimeout(500);
const inArchivio = await page.locator('.card, .row').count();
console.log(`7) in archivio: ${inArchivio} voci`);
controlla(inArchivio >= 2, "gli scatti devono comparire nell'archivio");
await scatto('54-archivio-pieno');

console.log(errors.length ? `ERRORI JS:\n${errors.join('\n')}` : 'Nessun errore JS');
console.log(ok && !errors.length ? '\n✅ CATTURA OK' : '\n❌ QUALCOSA NON TORNA');

await browser.close();
server.close();
process.exit(ok && !errors.length ? 0 : 1);
