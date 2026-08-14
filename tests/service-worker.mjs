/* Il service worker deve restare attivo nel browser (offline) e ritirarsi
   dentro l'app Android (dove i file arrivano dall'APK). */
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
await new Promise((r) => server.listen(4183, r));

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
let ok = true;

// ── 1. browser normale: il service worker si registra e la cache si popola ──
const ctx = await browser.newContext({ viewport: { width: 400, height: 860 } });
const page = await ctx.newPage();
page.on('pageerror', (e) => { console.log('PAGEERROR:', e.message); ok = false; });
await page.goto('http://localhost:4183/');
await page.waitForTimeout(2500);

const stato = await page.evaluate(async () => {
  const regs = await navigator.serviceWorker.getRegistrations();
  const chiavi = await caches.keys();
  let inCache = 0;
  for (const k of chiavi) inCache += (await (await caches.open(k)).keys()).length;
  return { registrazioni: regs.length, cache: chiavi, fileInCache: inCache };
});
console.log('1) browser:', JSON.stringify(stato));
if (stato.registrazioni !== 1) { console.log('   ✗ nel browser il service worker deve registrarsi'); ok = false; }
if (stato.fileInCache < 10) { console.log('   ✗ la cache offline non si è popolata'); ok = false; }

// offline davvero: ricarico senza rete
await ctx.setOffline(true);
await page.reload();
await page.waitForTimeout(1200);
const vivaOffline = await page.evaluate(() => !!document.querySelector('#fab') && typeof state === 'object');
console.log('   offline:', vivaOffline ? 'app viva' : 'app morta');
if (!vivaOffline) { console.log('   ✗ senza rete l app non si apre'); ok = false; }
await ctx.setOffline(false);

// ── 2. dentro l'app Android: il service worker deve ritirarsi ──────────────
const ctx2 = await browser.newContext({ viewport: { width: 400, height: 860 } });
const page2 = await ctx2.newPage();
await page2.addInitScript(() => {
  window.AndroidHost = {
    platform: () => 'android', versionName: () => 'test', canReadText: () => true,
    fileBegin: () => 'x', fileChunk: () => true, fileEnd: () => '', fileAbort: () => {},
  };
});
// Prima sporco: simulo la cache lasciata da una versione precedente.
await page2.goto('http://localhost:4183/');
await page2.evaluate(async () => {
  const c = await caches.open('invoice-wallet-v3');
  await c.put('/vecchio.js', new Response('roba vecchia'));
});
await page2.reload();
await page2.waitForTimeout(2000);

const statoApp = await page2.evaluate(async () => {
  const regs = await navigator.serviceWorker.getRegistrations();
  return { registrazioni: regs.length, cache: await caches.keys() };
});
console.log('2) app Android:', JSON.stringify(statoApp));
if (statoApp.registrazioni !== 0) { console.log('   ✗ nell app il service worker non deve restare registrato'); ok = false; }
if (statoApp.cache.length !== 0) { console.log('   ✗ le cache vecchie devono essere svuotate'); ok = false; }

console.log(ok ? '\n✅ SERVICE WORKER OK' : '\n❌ QUALCOSA NON TORNA');
await browser.close();
server.close();
process.exit(ok ? 0 : 1);
