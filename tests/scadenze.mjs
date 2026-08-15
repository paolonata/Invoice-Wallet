/* Regressione: cambiando la data dello scontrino, le scadenze devono seguirla. */
import { chromium } from 'playwright';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = '/home/user/Invoice-Wallet';
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml', '.webmanifest': 'application/manifest+json' };
const server = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]);
  if (p === '/') p = '/index.html';
  const f = path.join(ROOT, p);
  if (!fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { 'content-type': TYPES[path.extname(f)] || 'application/octet-stream' });
  res.end(fs.readFileSync(f));
});
await new Promise((r) => server.listen(4180, r));

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const page = await (await browser.newContext({ viewport: { width: 400, height: 860 } })).newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });

await page.goto('http://localhost:4180/');
await page.waitForTimeout(900);

const shot = (n) => page.screenshot({ path: `/tmp/claude-0/-home-user-Invoice-Wallet/adcdbdf0-8acc-5df0-ac6d-c5ffdf50eb87/scratchpad/shots/${n}.png` });

const foto = async () => {
  const dataUrl = await page.evaluate(() => {
    const c = document.createElement('canvas'); c.width = 500; c.height = 700;
    const x = c.getContext('2d'); x.fillStyle = '#f5f3ee'; x.fillRect(0, 0, 500, 700);
    x.fillStyle = '#111'; x.font = 'bold 34px sans-serif'; x.fillText('Decathlon', 30, 70);
    return c.toDataURL('image/jpeg', 0.85);
  });
  return Buffer.from(dataUrl.split(',')[1], 'base64');
};

// ── 1. nuovo scontrino: data di oggi + reso a 30 giorni ──────────
await page.click('#fab');
await page.waitForTimeout(300);
await page.click('.action:has-text("Scatta una foto")');
await page.waitForTimeout(200);
await page.setInputFiles('#input-camera', [{ name: 'f.jpg', mimeType: 'image/jpeg', buffer: await foto() }]);
await page.waitForTimeout(1300);

await page.fill('#f-amount', '89,90');
await page.fill('#f-title', 'Decathlon scarpe');
await page.click('#f-ret-row');                       // attiva "reso entro"
await page.waitForTimeout(200);
await page.click('#f-ret-quick button[data-days="30"]');
await page.click('#f-war-row');                       // attiva garanzia
await page.waitForTimeout(200);
await page.click('#f-war-quick button[data-years="2"]');

const primaData = await page.inputValue('#f-date');
const primoReso = await page.inputValue('#f-return');
const primaGaranzia = await page.inputValue('#f-warranty');
console.log(`1) data ${primaData} → reso ${primoReso}, garanzia ${primaGaranzia}`);
await page.click('[data-save]');
await page.waitForTimeout(900);

// ── 2. riapro e sposto la data indietro di 20 giorni ─────────────
await page.click('.card');
await page.waitForTimeout(800);
await page.click('[data-edit]');
await page.waitForTimeout(700);

const nuovaData = await page.evaluate(() => {
  const d = new Date(); d.setDate(d.getDate() - 20);
  return d.toISOString().slice(0, 10);
});
await page.fill('#f-date', nuovaData);
await page.dispatchEvent('#f-date', 'change');
await page.waitForTimeout(400);
await shot('20-scadenze-ricalcolate');

const resoDopo = await page.inputValue('#f-return');
const garanziaDopo = await page.inputValue('#f-warranty');
console.log(`2) data ${nuovaData} → reso ${resoDopo}, garanzia ${garanziaDopo}`);

const atteso = (iso, giorni) => {
  const d = new Date(iso + 'T00:00:00'); d.setDate(d.getDate() + giorni);
  return d.toISOString().slice(0, 10);
};
const attesoAnni = (iso, anni) => {
  const d = new Date(iso + 'T00:00:00'); d.setFullYear(d.getFullYear() + anni);
  return d.toISOString().slice(0, 10);
};

let ok = true;
if (resoDopo !== atteso(nuovaData, 30)) { console.log(`   ✗ reso: atteso ${atteso(nuovaData, 30)}`); ok = false; }
if (garanziaDopo !== attesoAnni(nuovaData, 2)) { console.log(`   ✗ garanzia: attesa ${attesoAnni(nuovaData, 2)}`); ok = false; }

await page.click('[data-save]');
await page.waitForTimeout(900);

// ── 3. il dato salvato e il conteggio devono essere coerenti ─────
const salvato = await page.evaluate(() => {
  const r = state.receipts[0];
  return { date: r.date, returnUntil: r.returnUntil, returnDays: r.returnDays,
           warrantyUntil: r.warrantyUntil, warrantyYears: r.warrantyYears,
           giorniMancanti: daysLeft(r.returnUntil) };
});
console.log('3) salvato:', JSON.stringify(salvato));
if (salvato.returnUntil !== atteso(nuovaData, 30)) { console.log('   ✗ il record salvato ha la scadenza vecchia'); ok = false; }
if (salvato.giorniMancanti !== 10) { console.log(`   ✗ conteggio giorni: atteso 10, trovato ${salvato.giorniMancanti}`); ok = false; }

// ── 4. una data scritta a mano non deve essere sovrascritta ─────
// (dopo il salvataggio siamo rimasti sul dettaglio dello scontrino)
await page.click('[data-edit]');
await page.waitForTimeout(700);
await page.fill('#f-return', '2027-01-15');
await page.fill('#f-date', '2026-08-01');
await page.dispatchEvent('#f-date', 'change');
await page.waitForTimeout(300);
const manuale = await page.inputValue('#f-return');
console.log(`4) data a mano dopo il cambio data scontrino: ${manuale}`);
if (manuale !== '2027-01-15') { console.log('   ✗ la data scritta a mano è stata sovrascritta'); ok = false; }
await page.click('[data-cancel]');
await page.waitForTimeout(300);

// (dal dettaglio si torna alla home, dove c'è il pulsante di aggiunta)
await page.goBack();
await page.waitForTimeout(600);

// ── 5. il caso dal telefono: scadenza scelta PRIMA di correggere la data ──
// (la lettura automatica non trova la data, resta oggi; imposti il reso a 30
//  giorni; poi correggi la data all'acquisto vero)
await page.click('#fab');
await page.waitForTimeout(300);
await page.click('.action:has-text("Scatta una foto")');
await page.waitForTimeout(200);
await page.setInputFiles('#input-camera', [{ name: 'f2.jpg', mimeType: 'image/jpeg', buffer: await foto() }]);
await page.waitForTimeout(1300);

await page.fill('#f-title', 'El Corte Ingles');
await page.click('#f-ret-row');                        // reso attivo, oggi + 30
await page.waitForTimeout(200);
await page.click('#f-ret-quick button[data-days="30"]');
const scadenzaPrima = await page.inputValue('#f-return');

const dataAcquisto = '2026-07-18';                     // corretta dopo
await page.fill('#f-date', dataAcquisto);
await page.dispatchEvent('#f-date', 'change');
await page.waitForTimeout(300);
await page.click('[data-save]');
await page.waitForTimeout(900);

const salvato2 = await page.evaluate(() => {
  const r = state.receipts.find((x) => x.title === 'El Corte Ingles');
  return { date: r.date, returnUntil: r.returnUntil, returnDays: r.returnDays };
});
console.log(`5) scadenza prima ${scadenzaPrima} → dopo la correzione ${salvato2.returnUntil} (data ${salvato2.date})`);
if (salvato2.returnUntil !== '2026-08-17') {
  console.log(`   ✗ atteso 2026-08-17 (18 luglio + 30 giorni), trovato ${salvato2.returnUntil}`);
  ok = false;
}

console.log(errors.length ? `ERRORI JS:\n${errors.join('\n')}` : 'Nessun errore JS');
console.log(ok ? '\n✅ TUTTI I CONTROLLI PASSATI' : '\n❌ QUALCOSA NON TORNA');

await browser.close();
server.close();
process.exit(ok && !errors.length ? 0 : 1);
