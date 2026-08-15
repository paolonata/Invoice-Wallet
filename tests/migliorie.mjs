/* Le quattro rifiniture: testata che si ritrae, ricerca su tutto
   l'archivio, importo mancante toccabile, totale che dichiara i buchi.

   node tests/migliorie.mjs
*/
import { chromium } from 'playwright';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = '/home/user/Invoice-Wallet';
const SHOTS = '/tmp/claude-0/-home-user-Invoice-Wallet/adcdbdf0-8acc-5df0-ac6d-c5ffdf50eb87/scratchpad/shots';
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml', '.webmanifest': 'application/manifest+json' };

const server = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]);
  if (p === '/') p = '/index.html';
  const f = path.join(ROOT, p);
  if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { 'content-type': TYPES[path.extname(f)] || 'application/octet-stream' });
  res.end(fs.readFileSync(f));
});
await new Promise((r) => server.listen(4186, r));

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const ctx = await browser.newContext({ viewport: { width: 393, height: 851 }, deviceScaleFactor: 2 });
const page = await ctx.newPage();
const errori = [];
page.on('pageerror', (e) => errori.push(e.message));
page.on('console', (m) => { if (m.type() === 'error') errori.push(m.text()); });

await page.goto('http://localhost:4186/');
await page.waitForTimeout(900);

let ok = true;
const controlla = (c, m) => { if (!c) { ok = false; console.log('   ✗ ' + m); } };
const scatto = (n) => page.screenshot({ path: `${SHOTS}/${n}.png` });

const crea = (d) => page.evaluate(async (d) => {
  const c = document.createElement('canvas');
  c.width = 700; c.height = 1000;
  const x = c.getContext('2d');
  x.fillStyle = '#f7f4ee'; x.fillRect(0, 0, 700, 1000);
  x.fillStyle = '#151515'; x.font = 'bold 42px sans-serif';
  x.fillText(d.title, 40, 90);
  x.font = '28px monospace'; x.fillStyle = '#333';
  for (let i = 0; i < 12; i++) x.fillText(`Articolo ${i + 1} ......... ${(i * 3.1 + 1.2).toFixed(2)}`, 40, 170 + i * 46);
  const blob = await new Promise((r) => c.toBlob(r, 'image/jpeg', 0.85));
  const id = uid(), pid = uid(), ora = Date.now();
  await DB.saveReceiptWithPhotos({
    id, title: d.title, amount: d.amount ?? null, currency: 'EUR',
    date: d.date, category: d.category || 'altro', note: '', photoIds: [pid],
    thumb: await makeThumb(blob), favorite: false,
    returnUntil: null, returnDays: null, warrantyUntil: null, warrantyYears: null,
    createdAt: ora, updatedAt: ora,
  }, [{ id: pid, receiptId: id, blob, width: 700, height: 1000, createdAt: ora }]);
  await afterChange();
}, d);

// Archivio su due mesi, con un buco d'importo.
await crea({ title: 'Esselunga', amount: 43.90, date: '2026-08-03', category: 'spesa' });
await crea({ title: 'Trattoria da Gino', amount: 28.00, date: '2026-08-07', category: 'ristoro' });
await crea({ title: 'MediaWorld TV', amount: 499.00, date: '2026-08-09', category: 'tech' });
await crea({ title: 'Zara giacca', amount: 79.95, date: '2026-08-11', category: 'shopping' });
await crea({ title: 'Farmacia', amount: null, date: '2026-08-12', category: 'salute' });
await crea({ title: 'Benzina Q8 autostrada', amount: 62.15, date: '2026-06-14', category: 'trasporti' });
await page.waitForTimeout(700);

// ── 1. la testata si ritrae scorrendo ────────────────────────────
const prima = await page.evaluate(() => {
  const t = document.querySelector('#view-home .topbar');
  return { testata: Math.round(t.getBoundingClientRect().height) };
});
await scatto('60-testata-aperta');

await page.evaluate(() => window.scrollTo(0, 400));
await page.waitForTimeout(700);
const dopo = await page.evaluate(() => {
  const s = document.querySelector('#topbar-stick');
  const r = s.getBoundingClientRect();
  return {
    altezza: Math.round(r.height),
    attaccata: s.classList.contains('is-stuck'),
    inCima: Math.round(r.top) <= 1,
    marchioVia: document.querySelector('.brand').getBoundingClientRect().bottom < 0,
    ricerca: document.querySelector('#btn-search-toggle').getBoundingClientRect().top >= 0,
    headH: getComputedStyle(document.documentElement).getPropertyValue('--head-h').trim(),
  };
});
console.log(`1) testata ${prima.testata}px → scorrendo restano ${dopo.altezza}px (--head-h ${dopo.headH})`);
console.log(`   marchio scorso via: ${dopo.marchioVia} · ricerca ancora raggiungibile: ${dopo.ricerca}`);
controlla(dopo.inCima && dopo.attaccata, 'periodo e ricerca devono restare in cima');
controlla(dopo.altezza < prima.testata, 'la parte appiccicata deve costare meno della testata intera');
controlla(dopo.marchioVia, 'il marchio deve scorrere via: lo spazio serve agli scontrini');
controlla(dopo.ricerca, 'la ricerca deve restare raggiungibile a metà elenco');
controlla(dopo.headH === `${dopo.altezza}px`, '--head-h deve seguire la parte appiccicata');

// le intestazioni dei mesi non devono finire dietro la testata
const mese = await page.evaluate(() => {
  const m = document.querySelector('.feed__month');
  const s = document.querySelector('#topbar-stick');
  return Math.round(m.getBoundingClientRect().top - s.getBoundingClientRect().bottom);
});
console.log(`   intestazione del mese: ${mese}px sotto la testata`);
controlla(mese >= -1, "l'intestazione del mese non deve infilarsi dietro la testata");
await scatto('61-testata-ritratta');

// ── 2. la ricerca guarda tutto l'archivio ────────────────────────
await page.evaluate(() => window.scrollTo(0, 0));
await page.waitForTimeout(400);
await page.click('.month:has-text("agosto")');
await page.waitForTimeout(400);
const soloAgosto = await page.locator('.card, .row').count();

await page.click('#btn-search-toggle');
await page.fill('#search-input', 'benzina');
await page.waitForTimeout(500);
const trovati = await page.locator('.card, .row').count();
const barra = (await page.locator('#results-bar').textContent()).trim();
const etichetta = (await page.locator('#summary-label').textContent()).trim();
console.log(`2) mese agosto: ${soloAgosto} scontrini; cercando "benzina" (che è di giugno): ${trovati}`);
console.log(`   barra: "${barra}" · etichetta del totale: "${etichetta}"`);
controlla(trovati === 1, 'la ricerca deve trovare anche fuori dal mese selezionato');
controlla(barra.includes("in tutto l'archivio"), 'la barra deve dire che sta cercando ovunque');
controlla(etichetta.toLowerCase().includes('risultati'), 'il totale deve dichiarare che è quello dei risultati');
await scatto('62-ricerca-archivio');

await page.click('#search-clear');
await page.waitForTimeout(400);
await page.click('.month:has-text("Tutti")');
await page.waitForTimeout(400);

// ── 3. il totale dichiara gli scontrini senza importo ────────────
const todo = await page.locator('#summary-todo');
console.log(`3) riepilogo: "${(await todo.textContent()).trim()}" (visibile: ${await todo.isVisible()})`);
controlla(await todo.isVisible(), 'con un importo mancante il totale deve dirlo');
controlla((await todo.textContent()).includes('1 senza importo'), 'deve contare gli scontrini senza importo');

// ── 4. «+ importo» porta dritto al campo ─────────────────────────
const chip = page.locator('[data-fill]');
console.log(`4) inviti «+ importo» nell'elenco: ${await chip.count()}`);
controlla(await chip.count() === 1, 'lo scontrino senza importo deve mostrare l\'invito');

await chip.first().click();
await page.waitForTimeout(900);
const messoAFuoco = await page.evaluate(() => document.activeElement?.id);
console.log(`   dopo il tocco: campo attivo = ${messoAFuoco}`);
controlla(await page.locator('#f-amount').isVisible(), 'si deve aprire la modifica');
controlla(messoAFuoco === 'f-amount', 'il campo importo deve essere già pronto');
await scatto('63-importo-mancante');

await page.fill('#f-amount', '9,90');
await page.click('[data-save]');
await page.waitForTimeout(1000);
const salvato = await page.evaluate(() => state.receipts.find((r) => r.title === 'Farmacia')?.amount);
const todoDopo = await page.locator('#summary-todo').isVisible();
console.log(`   salvato: ${salvato} · avviso "senza importo" ancora lì: ${todoDopo}`);
controlla(salvato === 9.9, `atteso 9,90, trovato ${salvato}`);
controlla(!todoDopo, "completato l'importo, l'avviso deve sparire");
controlla(await page.locator('[data-fill]').count() === 0, "l'invito deve sparire dall'elenco");
await scatto('64-completato');

console.log(errori.length ? `ERRORI JS:\n${errori.join('\n')}` : 'Nessun errore JS');
console.log(ok && !errori.length ? '\n✅ MIGLIORIE OK' : '\n❌ QUALCOSA NON TORNA');
await browser.close();
server.close();
process.exit(ok && !errori.length ? 0 : 1);
