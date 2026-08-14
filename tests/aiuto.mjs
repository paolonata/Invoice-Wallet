/* Attrezzi comuni ai test: server statico, browser, e un modo rapido per
   riempire l'archivio senza passare dall'interfaccia (quella la si guida
   solo quando è lei l'oggetto della prova). */
import { chromium } from 'playwright';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const SHOTS = '/tmp/claude-0/-home-user-Invoice-Wallet/adcdbdf0-8acc-5df0-ac6d-c5ffdf50eb87/scratchpad/shots';

const TYPES = {
  '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css',
  '.png': 'image/png', '.svg': 'image/svg+xml', '.webmanifest': 'application/manifest+json',
};

export async function avviaServer(porta) {
  const server = http.createServer((req, res) => {
    let p = decodeURIComponent(req.url.split('?')[0]);
    if (p === '/') p = '/index.html';
    const f = path.join(ROOT, p);
    if (!fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { 'content-type': TYPES[path.extname(f)] || 'application/octet-stream' });
    res.end(fs.readFileSync(f));
  });
  await new Promise((r) => server.listen(porta, r));
  return server;
}

export async function apriApp(porta, opzioni = {}) {
  const browser = await chromium.launch({
    executablePath: '/opt/pw-browsers/chromium',
    args: opzioni.fotocameraFinta
      ? ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream']
      : [],
  });
  const ctx = await browser.newContext({
    viewport: { width: 393, height: 851 },
    deviceScaleFactor: 2,
    permissions: opzioni.fotocameraFinta ? ['camera'] : [],
  });
  const page = await ctx.newPage();
  const errori = [];
  page.on('pageerror', (e) => errori.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errori.push(m.text()); });
  if (opzioni.prima) await page.addInitScript(opzioni.prima.funzione, opzioni.prima.dato);
  await page.goto(`http://localhost:${porta}/`);
  await page.waitForTimeout(1000);
  return { browser, page, errori };
}

/** Mette in archivio uno scontrino finto, con tanto di foto leggibile. */
export async function creaScontrino(page, dati) {
  return page.evaluate(async (d) => {
    const c = document.createElement('canvas');
    c.width = 700; c.height = 1000;
    const x = c.getContext('2d');
    x.fillStyle = '#f7f4ee'; x.fillRect(0, 0, 700, 1000);
    x.fillStyle = '#151515'; x.font = 'bold 42px sans-serif';
    x.fillText(d.title || 'Scontrino', 40, 90);
    x.font = '28px monospace'; x.fillStyle = '#333';
    for (let i = 0; i < 12; i++) x.fillText(`Articolo ${i + 1} ......... ${(i * 3.1 + 1.2).toFixed(2)}`, 40, 170 + i * 46);
    const blob = await new Promise((r) => c.toBlob(r, 'image/jpeg', 0.85));

    const id = uid(), pid = uid(), ora = Date.now();
    const foto = [{ id: pid, receiptId: id, blob, width: 700, height: 1000, createdAt: ora }];
    if (d.pagine === 2) {
      const pid2 = uid();
      foto.push({ id: pid2, receiptId: id, blob, width: 700, height: 1000, createdAt: ora });
      d.photoIds = [pid, pid2];
    }
    await DB.saveReceiptWithPhotos({
      id,
      title: d.title || '', amount: d.amount ?? null, currency: 'EUR',
      date: d.date || todayISO(), category: d.category || 'altro', note: d.note || '',
      photoIds: d.photoIds || [pid], thumb: await makeThumb(blob), favorite: !!d.favorite,
      returnUntil: d.returnUntil || null, returnDays: d.returnDays ?? null,
      warrantyUntil: d.warrantyUntil || null, warrantyYears: d.warrantyYears ?? null,
      createdAt: ora, updatedAt: ora,
    }, foto);
    await afterChange();
    return id;
  }, dati);
}

export function verificatore() {
  const stato = { ok: true };
  return {
    stato,
    controlla(condizione, messaggio) {
      if (!condizione) { stato.ok = false; console.log('   ✗ ' + messaggio); }
    },
  };
}

export function chiudi(errori, ok) {
  console.log(errori.length ? `ERRORI JS:\n${errori.join('\n')}` : 'Nessun errore JS');
  const tutto = ok && !errori.length;
  console.log(tutto ? '\n✅ OK' : '\n❌ QUALCOSA NON TORNA');
  return tutto;
}
