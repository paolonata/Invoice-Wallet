import { chromium } from 'playwright';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = '/home/user/Invoice-Wallet';
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml', '.webmanifest': 'application/manifest+json', '.json': 'application/json' };

const server = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]);
  if (p === '/') p = '/index.html';
  const file = path.join(ROOT, p);
  if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
    res.writeHead(404); res.end('nope'); return;
  }
  res.writeHead(200, { 'content-type': TYPES[path.extname(file)] || 'application/octet-stream' });
  res.end(fs.readFileSync(file));
});
await new Promise((r) => server.listen(4173, r));

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const ctx = await browser.newContext({ viewport: { width: 400, height: 860 }, deviceScaleFactor: 2 });
const page = await ctx.newPage();

const errors = [];
page.on('pageerror', (e) => errors.push(`PAGEERROR: ${e.message}`));
page.on('console', (m) => { if (m.type() === 'error') errors.push(`CONSOLE: ${m.text()}`); });

await page.goto('http://localhost:4173/', { waitUntil: 'networkidle' });
await page.waitForTimeout(900);

const shot = async (name) => page.screenshot({ path: `/tmp/claude-0/-home-user-Invoice-Wallet/adcdbdf0-8acc-5df0-ac6d-c5ffdf50eb87/scratchpad/shots/${name}.png`, fullPage: false });
fs.mkdirSync('/tmp/claude-0/-home-user-Invoice-Wallet/adcdbdf0-8acc-5df0-ac6d-c5ffdf50eb87/scratchpad/shots', { recursive: true });

await shot('01-empty');

// ── genera finte foto di scontrino e le inietta nell'input file ──
function fakeReceipt(seed, w = 700, h = 1000) {
  // PNG generato lato browser: più semplice fare un canvas dentro la pagina
  return { seed, w, h };
}

async function addReceipt({ title, amount, cat, files = 1, reso = null }) {
  const multi = files > 1;
  await page.click('#fab');
  await page.waitForTimeout(320);
  await page.click(multi ? '.action:has-text("galleria")' : '.action:has-text("Scatta una foto")');
  await page.waitForTimeout(300);

  const buffers = [];
  for (let i = 0; i < files; i++) {
    const dataUrl = await page.evaluate(({ title, i }) => {
      const c = document.createElement('canvas');
      c.width = 640; c.height = 900;
      const x = c.getContext('2d');
      x.fillStyle = '#f7f5f0'; x.fillRect(0, 0, 640, 900);
      x.fillStyle = '#111'; x.font = 'bold 46px sans-serif';
      x.fillText(title, 40, 110);
      x.font = '30px monospace';
      for (let r = 0; r < 12; r++) x.fillText(`Articolo ${r + 1} ......... ${(r * 3.4 + 1.2).toFixed(2)}`, 40, 190 + r * 48);
      x.fillText(`pagina ${i + 1}`, 40, 830);
      return c.toDataURL('image/jpeg', 0.9);
    }, { title, i });
    buffers.push(Buffer.from(dataUrl.split(',')[1], 'base64'));
  }

  await page.setInputFiles(multi ? '#input-gallery' : '#input-camera',
    buffers.map((b, i) => ({ name: `foto${i}.jpg`, mimeType: 'image/jpeg', buffer: b })));
  await page.waitForTimeout(1600);
  if (multi) {
    await page.click('.action:has-text("unico scontrino")');
    await page.waitForTimeout(700);
  }

  await page.fill('#f-amount', amount);
  await page.fill('#f-title', title);
  if (cat) await page.click(`.cat[data-cat="${cat}"]`);
  if (reso) {
    await page.click('#f-ret-row');
    await page.waitForTimeout(200);
    await page.fill('#f-return', reso);
  }
  await page.click('[data-save]');
  await page.waitForTimeout(900);
}

const iso = (delta) => { const d = new Date(); d.setDate(d.getDate() + delta); return d.toISOString().slice(0, 10); };
await addReceipt({ title: 'Esselunga', amount: '43,90', cat: 'spesa' });
await addReceipt({ title: 'Trattoria da Gino', amount: '28,00', cat: 'ristoro' });
await addReceipt({ title: 'Benzina Q8', amount: '62,15', cat: 'trasporti', reso: iso(-4) });
await addReceipt({ title: 'MediaWorld TV', amount: '499,00', cat: 'tech', files: 2, reso: iso(2) });
await addReceipt({ title: 'Zara giacca', amount: '79,95', cat: 'shopping', reso: iso(20) });
await shot('02-home');

// scadenze
await page.click('.tab[data-tab="deadlines"]');
await page.waitForTimeout(800);
await shot('14-scadenze');
console.log('BADGE:', await page.locator('#tab-badge').textContent().catch(() => '-'));
await page.click('.tab[data-tab="home"]');
await page.waitForTimeout(600);
console.log('ALERTBAR in home:', await page.locator('#alertbar').isVisible(), '|',
  (await page.locator('#alertbar').textContent()).replace(/\s+/g, ' ').trim());
await shot('15-home-avviso');

// lista
await page.click('#btn-layout');
await page.waitForTimeout(500);
await shot('03-list');
await page.click('#btn-layout');
await page.waitForTimeout(400);

// ricerca
await page.click('#btn-search-toggle');
await page.fill('#search-input', 'benzina');
await page.waitForTimeout(500);
await shot('04-search');
await page.click('#btn-search-toggle');
await page.waitForTimeout(300);

// dettaglio
await page.click('.card');
await page.waitForTimeout(900);
await shot('05-detail');

// visualizzatore
await page.click('[data-zoom-btn]');
await page.waitForTimeout(700);
await shot('06-viewer');
await page.click('.viewer__close');
await page.waitForTimeout(300);
await page.goBack();
await page.waitForTimeout(500);

// statistiche
await page.click('.tab[data-tab="stats"]');
await page.waitForTimeout(800);
await shot('07-stats');

// impostazioni
await page.click('.tab[data-tab="settings"]');
await page.waitForTimeout(800);
await shot('08-settings');

// editor aperto
await page.click('.tab[data-tab="home"]');
await page.waitForTimeout(400);
await page.click('#fab');
await page.waitForTimeout(300);
await page.click('.action:has-text("Scatta una foto")');
await page.waitForTimeout(200);
const buf = Buffer.from((await page.evaluate(() => {
  const c = document.createElement('canvas'); c.width = 640; c.height = 900;
  const x = c.getContext('2d'); x.fillStyle = '#fff'; x.fillRect(0, 0, 640, 900);
  x.fillStyle = '#222'; x.font = 'bold 40px sans-serif'; x.fillText('Farmacia', 40, 100);
  return c.toDataURL('image/jpeg', 0.9);
})).split(',')[1], 'base64');
await page.setInputFiles('#input-camera', [{ name: 'f.jpg', mimeType: 'image/jpeg', buffer: buf }]);
await page.waitForTimeout(1200);
await shot('09-editor');
await page.click('[data-cancel]');
await page.waitForTimeout(400);

// tema scuro
await page.click('.tab[data-tab="settings"]');
await page.waitForTimeout(400);
await page.click('[data-theme-opt="dark"]');
await page.waitForTimeout(500);
await page.click('.tab[data-tab="home"]');
await page.waitForTimeout(600);
await shot('10-dark');

// backup: export + import
await page.click('.tab[data-tab="settings"]');
await page.waitForTimeout(400);
const dl = page.waitForEvent('download', { timeout: 20000 });
await page.click('[data-act="export"]');
const download = await dl;
const zipPath = '/tmp/claude-0/-home-user-Invoice-Wallet/adcdbdf0-8acc-5df0-ac6d-c5ffdf50eb87/scratchpad/backup.zip';
await download.saveAs(zipPath);
console.log('BACKUP:', download.suggestedFilename(), fs.statSync(zipPath).size, 'byte');

// svuota e ripristina
await page.evaluate(async () => { await DB.wipeAll(); await afterChange(); });
await page.waitForTimeout(500);
await page.setInputFiles('#input-restore', zipPath);
await page.waitForTimeout(3000);
const restored = await page.evaluate(() => state.receipts.length);
console.log('RIPRISTINATI:', restored);
await page.click('.tab[data-tab="home"]');
await page.waitForTimeout(700);
await shot('11-restored');

// cestino
await page.click('.card');
await page.waitForTimeout(700);
await page.click('[data-trash]');
await page.waitForTimeout(900);
await shot('12-trash-toast');
await page.click('.tab[data-tab="settings"]');
await page.waitForTimeout(400);
await page.click('[data-act="trash"]');
await page.waitForTimeout(600);
await shot('13-trash');

console.log('SCONTRINI FINALI:', await page.evaluate(() => state.receipts.filter(r=>!r.deletedAt).length));
console.log(errors.length ? `ERRORI:\n${errors.join('\n')}` : 'NESSUN ERRORE JS');

await browser.close();
server.close();
