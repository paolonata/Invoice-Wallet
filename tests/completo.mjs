/*
 * Giro completo dell'app, guidata dall'interfaccia come la userebbe una
 * persona: niente scorciatoie sul database, tocchi veri (hasTouch) e
 * ogni azione ripetuta più volte — i guasti peggiori non sono al primo
 * tocco ma al terzo, quando qualcosa si è accumulato.
 *
 *   node tests/completo.mjs
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
await new Promise((r) => server.listen(4191, r));

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const ctx = await browser.newContext({
  viewport: { width: 393, height: 851 }, deviceScaleFactor: 2,
  hasTouch: true, isMobile: true,
});
const page = await ctx.newPage();
const errori = [];
page.on('pageerror', (e) => errori.push(`PAGEERROR: ${e.message}`));
page.on('console', (m) => { if (m.type() === 'error') errori.push(`CONSOLE: ${m.text()}`); });

let ok = true;
const guasti = [];
const controlla = (c, m) => { if (!c) { ok = false; guasti.push(m); console.log('   ✗ ' + m); } };
const scatto = (n) => page.screenshot({ path: `${SHOTS}/${n}.png` });
const attendi = (ms = 500) => page.waitForTimeout(ms);
const titolo = (t) => console.log(`\n── ${t} ${'─'.repeat(Math.max(0, 56 - t.length))}`);

/** Niente deve restare aperto sopra la pagina dopo un'azione conclusa. */
async function nessunResiduo(dove) {
  const sopra = await page.evaluate(() => ({
    schede: document.querySelectorAll('.sheet').length,
    veli: document.querySelectorAll('.sheet-backdrop, .modal-backdrop').length,
    visori: document.querySelectorAll('.viewer').length,
  }));
  const pulito = sopra.schede === 0 && sopra.veli === 0 && sopra.visori === 0;
  controlla(pulito, `${dove}: è rimasto qualcosa aperto sopra la pagina (${JSON.stringify(sopra)})`);
  return pulito;
}

async function fotoFinta(testo, pagina = 1) {
  const dataUrl = await page.evaluate(({ testo, pagina }) => {
    const c = document.createElement('canvas');
    c.width = 640; c.height = 900;
    const x = c.getContext('2d');
    x.fillStyle = '#f7f5f0'; x.fillRect(0, 0, 640, 900);
    x.fillStyle = '#111'; x.font = 'bold 46px sans-serif';
    x.fillText(testo, 40, 110);
    x.font = '30px monospace'; x.fillStyle = '#333';
    for (let r = 0; r < 12; r++) x.fillText(`Articolo ${r + 1} ......... ${(r * 3.4 + 1.2).toFixed(2)}`, 40, 190 + r * 48);
    x.fillText(`pagina ${pagina}`, 40, 840);
    return c.toDataURL('image/jpeg', 0.9);
  }, { testo, pagina });
  return { name: `foto-${Date.now()}-${pagina}.jpg`, mimeType: 'image/jpeg', buffer: Buffer.from(dataUrl.split(',')[1], 'base64') };
}

/** Aggiunge uno scontrino passando dall'interfaccia, come si fa davvero. */
async function aggiungi({ titolo: nome, importo, categoria, pagine = 1, reso = null, garanzia = null, nota = null, preferito = false }) {
  await page.tap('#fab');
  await attendi(400);
  await page.tap(pagine > 1 ? '.action:has-text("galleria")' : '.action:has-text("Scatta una foto")');
  await attendi(350);

  const file = [];
  for (let i = 0; i < pagine; i++) file.push(await fotoFinta(nome, i + 1));
  await page.setInputFiles(pagine > 1 ? '#input-gallery' : '#input-camera', file);
  await attendi(1700);

  if (pagine > 1) {
    await page.tap('.action:has-text("unico scontrino")');
    await attendi(800);
  }

  if (importo) await page.fill('#f-amount', importo);
  await page.fill('#f-title', nome);
  if (categoria) await page.tap(`.cat[data-cat="${categoria}"]`);
  if (nota) await page.fill('#f-note', nota);
  if (preferito) await page.tap('#f-fav-row');
  if (reso) { await page.tap('#f-ret-row'); await attendi(250); await page.fill('#f-return', reso); }
  if (garanzia) { await page.tap('#f-war-row'); await attendi(250); await page.fill('#f-warranty', garanzia); }
  await page.tap('[data-save]');
  await attendi(1000);
}

const fra = (giorni) => {
  const d = new Date(); d.setDate(d.getDate() + giorni);
  return d.toISOString().slice(0, 10);
};

await page.goto('http://localhost:4191/');
await attendi(1000);

/* ═══ 1. Primo avvio ═══════════════════════════════════════════ */
titolo('1. primo avvio');
const vuoto = await page.evaluate(() => ({
  invito: !document.querySelector('#empty').hidden,
  fab: !document.querySelector('#fab').hidden,
  schede: document.querySelectorAll('.tab').length,
  riepilogo: document.querySelector('#summary').hidden,
}));
console.log('archivio vuoto:', JSON.stringify(vuoto));
controlla(vuoto.invito, "l'archivio vuoto deve invitare ad aggiungere");
controlla(vuoto.fab && vuoto.schede === 4, 'devono esserci il ➕ e le quattro schede');
controlla(vuoto.riepilogo, 'senza scontrini il totale non ha senso e resta nascosto');
await scatto('90-vuoto');

/* ═══ 2. Aggiunta ══════════════════════════════════════════════ */
titolo('2. aggiunta scontrini');
await aggiungi({ titolo: 'Esselunga', importo: '43,90', categoria: 'spesa', nota: 'spesa della settimana' });
await aggiungi({ titolo: 'Trattoria da Gino', importo: '28,00', categoria: 'ristoro', preferito: true });
await aggiungi({ titolo: 'Benzina Q8', importo: '62,15', categoria: 'trasporti', reso: fra(-4) });
await aggiungi({ titolo: 'MediaWorld TV', importo: '499,00', categoria: 'tech', pagine: 2, reso: fra(2), garanzia: fra(730) });
await aggiungi({ titolo: 'Zara giacca', importo: '79,95', categoria: 'shopping', reso: fra(20) });

const dopoAggiunta = await page.evaluate(() => ({
  quanti: state.receipts.length,
  conFoto: state.receipts.every((r) => r.photoIds.length >= 1),
  multi: state.receipts.find((r) => r.title === 'MediaWorld TV')?.photoIds.length,
  preferiti: state.receipts.filter((r) => r.favorite).length,
  nota: state.receipts.find((r) => r.title === 'Esselunga')?.note,
}));
console.log('dopo l\'aggiunta:', JSON.stringify(dopoAggiunta));
controlla(dopoAggiunta.quanti === 5, `dovevano esserci 5 scontrini, ce ne sono ${dopoAggiunta.quanti}`);
controlla(dopoAggiunta.conFoto, 'ogni scontrino deve avere la sua foto');
controlla(dopoAggiunta.multi === 2, 'lo scontrino a due pagine deve avere due foto');
controlla(dopoAggiunta.preferiti === 1, 'il preferito deve essere salvato');
controlla(dopoAggiunta.nota === 'spesa della settimana', 'la nota deve essere salvata');
await nessunResiduo('dopo il salvataggio');
await scatto('91-archivio');

// più foto = più scontrini diversi
await page.tap('#fab');
await attendi(400);
await page.tap('.action:has-text("galleria")');
await attendi(350);
await page.setInputFiles('#input-gallery', [await fotoFinta('Coop', 1), await fotoFinta('Ikea', 2)]);
await attendi(1800);
await page.tap('.action:has-text("scontrini diversi")');
await attendi(1400);
const separati = await page.evaluate(() => state.receipts.length);
console.log('due foto salvate come scontrini distinti →', separati, 'in archivio');
controlla(separati === 7, `dovevano diventare 7, sono ${separati}`);
await nessunResiduo('dopo il salvataggio in blocco');

/* ═══ 3. Elenco: ricerca, filtri, ordine, vista ════════════════ */
titolo('3. elenco, ricerca e filtri');
controlla(await page.locator('.card, .row').count() === 7, 'devono comparire tutti');

await page.tap('#btn-search-toggle');
await page.fill('#search-input', 'gino');
await attendi(600);
controlla(await page.locator('.card, .row').count() === 1, 'la ricerca deve restringere');
await page.tap('#search-clear');
await attendi(500);
controlla(await page.locator('.card, .row').count() === 7, 'pulendo la ricerca devono tornare tutti');

// i filtri di categoria, uno dopo l'altro
for (const [cat, atteso] of [['spesa', 1], ['tech', 1], ['fav', 1], ['all', 7]]) {
  await page.tap(`.chip[data-cat="${cat}"]`);
  await attendi(450);
  const n = await page.locator('.card, .row').count();
  controlla(n === atteso, `filtro "${cat}": attesi ${atteso}, trovati ${n}`);
}

// ordinamento: tre giri, per vedere se si accumula qualcosa
for (let giro = 1; giro <= 3; giro++) {
  await page.tap('#btn-sort');
  await attendi(400);
  const voci = await page.locator('.sheet .action').count();
  controlla(voci > 0 && await page.locator('.sheet').count() === 1,
    `ordinamento, giro ${giro}: doveva aprirsi una sola scheda (${await page.locator('.sheet').count()})`);
  await page.tap('.sheet .action >> nth=1');
  await attendi(700);
  await nessunResiduo(`ordinamento, giro ${giro}`);
}
console.log('ordinamento in uso:', await page.evaluate(() => state.settings.sort));

// griglia ↔ elenco, tre volte
for (let giro = 1; giro <= 3; giro++) {
  await page.tap('#btn-layout');
  await attendi(400);
}
console.log('vista in uso:', await page.evaluate(() => state.settings.layout));
controlla(await page.locator('.card, .row').count() === 7, 'cambiando vista devono restare tutti');
await scatto('92-elenco');
await page.tap('#btn-layout');
await attendi(400);

// i mesi
const mesi = await page.locator('.month').count();
console.log('linguette dei periodi:', mesi);
controlla(mesi >= 2, 'devono esserci almeno «Tutti» e il mese corrente');

/* ═══ 4. Dettaglio ═════════════════════════════════════════════ */
titolo('4. dettaglio dello scontrino');
await page.tap('.card:has-text("MediaWorld") >> nth=0');
await attendi(900);
controlla(await page.locator('#view-detail').isVisible(), 'il dettaglio deve aprirsi');
const dettaglio = await page.evaluate(() => ({
  scorre: document.documentElement.scrollHeight > window.innerHeight + 2,
  miniature: document.querySelectorAll('.detail__gallery img, .detail__thumb').length,
}));
console.log('dettaglio:', JSON.stringify(dettaglio));
controlla(!dettaglio.scorre, 'il dettaglio deve stare in una schermata');
await scatto('93-dettaglio');

// foto a schermo intero, aperta e chiusa tre volte
for (let giro = 1; giro <= 3; giro++) {
  await page.tap('[data-zoom]');
  await attendi(600);
  controlla(await page.locator('.viewer').count() === 1, `visore, giro ${giro}: doveva aprirsene uno solo`);
  await page.tap('.viewer__close');
  await attendi(400);
  controlla(await page.locator('.viewer').count() === 0, `visore, giro ${giro}: doveva chiudersi`);
}

// preferito: acceso e spento
await page.tap('[data-fav]');
await attendi(600);
const acceso = await page.evaluate(() => state.receipts.find((r) => r.title === 'MediaWorld TV').favorite);
await page.tap('[data-fav]');
await attendi(600);
const spento = await page.evaluate(() => state.receipts.find((r) => r.title === 'MediaWorld TV').favorite);
console.log(`preferito: ${acceso} → ${spento}`);
controlla(acceso === true && spento === false, 'il preferito deve accendersi e spegnersi');

// modifica dal dettaglio
await page.tap('[data-edit]');
await attendi(800);
await page.fill('#f-title', 'MediaWorld televisore');
await page.fill('#f-amount', '449,00');
await page.tap('[data-save]');
await attendi(1000);
const modificato = await page.evaluate(() => {
  const r = state.receipts.find((x) => x.title === 'MediaWorld televisore');
  return r ? { titolo: r.title, importo: r.amount } : null;
});
console.log('dopo la modifica:', JSON.stringify(modificato));
controlla(modificato?.importo === 449, 'la modifica deve essere salvata');
await nessunResiduo('dopo la modifica');

// il reso si può segnare come fatto, e la scadenza sparisce
const primaDelReso = await page.evaluate(() => ({
  fascia: !!document.querySelector('[data-reso-fatto]'),
  scadenze: state.receipts.filter((r) => r.returnUntil && !r.returnDoneAt).length,
}));
await page.goBack();
await attendi(600);
await page.locator('.card, .row').filter({ hasText: 'MediaWorld' }).first().tap();
await attendi(900);
controlla(await page.locator('[data-reso-fatto]').count() === 1, 'con il reso aperto deve comparire la fascia con «Fatto»');
await page.tap('[data-reso-fatto]');
await attendi(1200);
const dopoIlReso = await page.evaluate(() => {
  const r = state.receipts.find((x) => x.id === state.detailId);
  return {
    segnato: !!r.returnDoneAt,
    fasciaFatto: !!document.querySelector('[data-reso-annulla]'),
    inScadenza: deadlineEntries().some((e) => e.receipt.id === r.id && e.kind === 'reso'),
  };
});
console.log(`reso: fascia prima ${primaDelReso.fascia} → segnato ${dopoIlReso.segnato}, ancora fra le scadenze: ${dopoIlReso.inScadenza}`);
controlla(dopoIlReso.segnato, 'il reso doveva risultare fatto');
controlla(dopoIlReso.fasciaFatto, 'la fascia deve poter annullare');
controlla(!dopoIlReso.inScadenza, 'un reso fatto non deve più comparire fra le scadenze');
await scatto('93b-reso-fatto');

await page.tap('[data-reso-annulla]');
await attendi(1200);
const annullato = await page.evaluate(() => {
  const r = state.receipts.find((x) => x.id === state.detailId);
  return { segnato: !!r.returnDoneAt, inScadenza: deadlineEntries().some((e) => e.receipt.id === r.id && e.kind === 'reso') };
});
console.log(`   annullato: segnato ${annullato.segnato}, torna fra le scadenze: ${annullato.inScadenza}`);
controlla(!annullato.segnato && annullato.inScadenza, 'annullando, il reso deve tornare in attesa');

// la scheda dei dati deve dire quello che si sa dello scontrino
const dati = await page.evaluate(() => {
  const righe = [...document.querySelectorAll('.dati__riga')].map((r) => ({
    etichetta: r.querySelector('dt').textContent.trim(),
    valore: r.querySelector('dd').textContent.replace(/\s+/g, ' ').trim(),
  }));
  return righe;
});
console.log('   scheda dati:', dati.map((d) => `${d.etichetta}=${d.valore}`).join(' | '));
controlla(dati.length >= 4, `la scheda deve dire più di due cose (righe: ${dati.length})`);
controlla(dati.some((d) => d.etichetta.includes('Reso')), 'deve comparire la scadenza del reso');
controlla(dati.some((d) => d.etichetta === 'Foto' && /pagine|pagina/.test(d.valore) && /KB|MB/.test(d.valore)),
  'deve dire quante foto e quanto pesano');
controlla(dati.some((d) => d.etichetta === 'Aggiunto'), 'deve dire quando è stato aggiunto');

// il menu ⋯, tre volte
for (let giro = 1; giro <= 3; giro++) {
  await page.tap('[data-more]');
  await attendi(500);
  const schede = await page.locator('.sheet').count();
  controlla(schede === 1, `menu ⋯, giro ${giro}: schede aperte ${schede}, doveva essere 1`);
  await page.evaluate(() => window.chiudiSovrapposizione());
  await attendi(400);
  await nessunResiduo(`menu ⋯, giro ${giro}`);
}

await page.goBack();
await attendi(700);
controlla(await page.locator('#view-home').isVisible(), "Indietro deve riportare all'archivio");

/* ═══ 5. Scadenze ══════════════════════════════════════════════ */
titolo('5. scadenze');
controlla(await page.locator('#alertbar').isVisible(), 'con una scadenza vicina deve comparire la fascia');
await page.tap('#alertbar');
await attendi(800);
controlla(await page.locator('#view-deadlines').isVisible(), "dalla fascia si aprono le scadenze");
const scadenze = await page.evaluate(() => document.querySelectorAll('#deadlines-body .row, #deadlines-body .item, #deadlines-body .card').length);
console.log('voci in scadenza:', scadenze);
controlla(scadenze >= 3, 'reso scaduto, reso vicino e garanzia devono comparire');
for (const f of await page.locator('#deadlines-filter button').all()) {
  await f.tap();
  await attendi(400);
}
console.log('filtro scadenze finale:', await page.locator('#deadlines-filter .is-active').textContent().catch(() => '—'));
await scatto('94-scadenze');
await page.goBack();
await attendi(600);

/* ═══ 6. Statistiche ═══════════════════════════════════════════ */
titolo('6. statistiche');
await page.tap('.tab[data-tab="stats"]');
await attendi(900);
controlla(await page.locator('#view-stats').isVisible(), 'le statistiche devono aprirsi');
const intervalli = await page.locator('#stats-range button').all();
controlla(intervalli.length >= 2, 'devono esserci gli intervalli (mese, anno, tutto)');
for (const b of intervalli) {
  const quale = (await b.textContent()).trim();
  await b.tap();
  await attendi(600);
  const misura = await page.evaluate(() => {
    const c = document.querySelector('#stats-body');
    const testo = c.textContent.replace(/\s+/g, ' ');
    return {
      vuoto: !testo.trim(),
      barre: c.querySelectorAll('.bar, .bars > *, [class*="bar"]').length,
      attivo: document.querySelector('#stats-range .is-active')?.textContent.trim(),
      cifre: (testo.match(/\d+,\d{2}/g) || []).length,
    };
  });
  console.log(`   ${quale}: ${misura.barre} barre, ${misura.cifre} importi, selezionato "${misura.attivo}"`);
  controlla(!misura.vuoto, `statistiche "${quale}": non devono restare vuote`);
  controlla(misura.attivo === quale, `statistiche: l'intervallo "${quale}" non risulta selezionato`);
  controlla(misura.cifre > 0, `statistiche "${quale}": devono comparire degli importi`);
}
// il totale delle statistiche deve tornare con quello che c'è in archivio
await page.locator('#stats-range button >> nth=-1').tap();
await attendi(600);
const quadra = await page.evaluate(() => {
  const somma = state.receipts.filter((r) => !r.deletedAt && r.amount != null)
    .reduce((t, r) => t + r.amount, 0);
  const testo = document.querySelector('#stats-body').textContent.replace(/\s+/g, ' ');
  const atteso = somma.toFixed(2).replace('.', ',');
  return { atteso, presente: testo.includes(atteso) };
});
console.log(`   totale atteso ${quadra.atteso} € presente nelle statistiche: ${quadra.presente}`);
controlla(quadra.presente, `le statistiche devono riportare il totale reale (${quadra.atteso})`);
await scatto('95-statistiche');

/* ═══ 7. Impostazioni, ogni voce ripetuta ══════════════════════ */
titolo('7. impostazioni');
await page.tap('.tab[data-tab="settings"]');
await attendi(800);
controlla(await page.locator('#view-settings').isVisible(), 'le impostazioni devono aprirsi');

// tema: tre passaggi, con un'occhiata allo scuro anche in archivio
for (const t of ['dark', 'light', 'auto']) {
  await page.tap(`[data-theme-opt="${t}"]`);
  await attendi(500);
  const inUso = await page.evaluate(() => state.settings.theme);
  controlla(inUso === t, `tema "${t}" non applicato (in uso: ${inUso})`);
  if (t === 'dark') {
    await page.tap('.tab[data-tab="home"]');
    await attendi(700);
    await scatto('96b-archivio-scuro');
    await page.tap('.card >> nth=0');
    await attendi(800);
    await scatto('96c-dettaglio-scuro');
    await page.goBack();
    await attendi(600);
    await page.tap('.tab[data-tab="settings"]');
    await attendi(700);
  }
}

// qualità foto: è il punto che si era rotto, quindi tre giri completi
for (const [voce, atteso] of [['Alta', 'alta'], ['Bassa', 'bassa'], ['Media', 'media']]) {
  await page.tap('[data-act="quality"]');
  await attendi(600);
  const schede = await page.locator('.sheet').count();
  const voci = await page.locator('.sheet .action').count();
  controlla(schede === 1, `qualità "${voce}": schede aperte ${schede}, doveva essere 1`);
  controlla(voci === 3, `qualità "${voce}": voci ${voci}, dovevano essere 3`);
  await page.tap(`.sheet .action:has-text("${voce}")`);
  await attendi(800);
  const inUso = await page.evaluate(() => state.settings.quality);
  controlla(inUso === atteso, `qualità "${voce}" non applicata (in uso: ${inUso})`);
  await nessunResiduo(`qualità "${voce}"`);
}
console.log('qualità: tre cambi di fila, tutti applicati');

// valuta: due giri
for (const [voce, atteso] of [['USD', 'USD'], ['EUR', 'EUR']]) {
  await page.tap('[data-act="currency"]');
  await attendi(600);
  controlla(await page.locator('.sheet').count() === 1, `valuta "${voce}": doveva aprirsi una sola scheda`);
  await page.tap(`.sheet .action:has-text("${voce}")`);
  await attendi(800);
  controlla(await page.evaluate(() => state.settings.currency) === atteso, `valuta "${voce}" non applicata`);
  await nessunResiduo(`valuta "${voce}"`);
}
console.log('valuta: due cambi, tornata a EUR');
await scatto('96-impostazioni');

/* ═══ 8. Backup e ripristino ═══════════════════════════════════ */
titolo('8. backup e ripristino');
const scaricamento = page.waitForEvent('download', { timeout: 40000 });
await page.tap('[data-act="export"]');
const file = await scaricamento;
const zip = `${SHOTS}/../backup-completo.zip`;
await file.saveAs(zip);
const peso = fs.statSync(zip).size;
console.log('backup:', file.suggestedFilename(), peso, 'byte');
controlla(peso > 10000, 'il backup deve contenere le foto');

const primaDelRipristino = await page.evaluate(() => state.receipts.length);
await page.evaluate(async () => { await DB.wipeAll(); await afterChange(); });
await attendi(600);
controlla(await page.evaluate(() => state.receipts.length) === 0, "l'archivio doveva svuotarsi");
await page.setInputFiles('#input-restore', zip);
await attendi(4000);
const ripristinati = await page.evaluate(() => state.receipts.length);
console.log(`ripristinati: ${ripristinati} (ce n'erano ${primaDelRipristino})`);
controlla(ripristinati === primaDelRipristino, `dal backup dovevano tornare ${primaDelRipristino} scontrini`);

// due volte lo stesso backup non deve creare doppioni
await page.setInputFiles('#input-restore', zip);
await attendi(4000);
const dopoDueVolte = await page.evaluate(() => state.receipts.length);
console.log('lo stesso backup importato due volte →', dopoDueVolte);
controlla(dopoDueVolte === ripristinati, 'reimportare lo stesso backup non deve creare doppioni');

// le foto sono tornate davvero, non solo i dati
const fotoVive = await page.evaluate(async () => {
  const r = state.receipts[0];
  const p = await DB.getPhotos(r.photoIds);
  return p.length && p[0].blob?.size > 0;
});
console.log('foto ripristinate leggibili:', fotoVive);
controlla(fotoVive, 'le foto devono tornare, non solo i dati');

/* ═══ 9. Cestino ═══════════════════════════════════════════════ */
titolo('9. cestino');
await page.tap('.tab[data-tab="home"]');
await attendi(700);
await page.tap('.card >> nth=0');
await attendi(800);
const daCestinare = await page.evaluate(() => state.receipts.find((r) => r.id === state.detailId)?.title);
await page.tap('[data-more]');
await attendi(500);
await page.tap('.action:has-text("cestino")');
await attendi(1300);
const vivi = await page.evaluate(() => state.receipts.filter((r) => !r.deletedAt).length);
console.log(`cestinato "${daCestinare}" → ${vivi} attivi`);
controlla(vivi === dopoDueVolte - 1, 'il cestino deve togliere lo scontrino dalla lista');
await nessunResiduo('dopo il cestino');

await page.tap('.tab[data-tab="settings"]');
await attendi(700);
await page.tap('[data-act="trash"]');
await attendi(800);
controlla(await page.locator('#view-trash').isVisible(), 'il cestino deve aprirsi');
const nelCestino = await page.locator('#trash-body .row, #trash-body .item').count();
console.log('nel cestino:', nelCestino);
controlla(nelCestino === 1, 'nel cestino deve esserci lo scontrino eliminato');
await scatto('97-cestino');

await page.tap('#trash-body [data-restore] >> nth=0');
await attendi(1200);
const tornati = await page.evaluate(() => state.receipts.filter((r) => !r.deletedAt).length);
console.log('dopo il ripristino dal cestino:', tornati, 'attivi');
controlla(tornati === dopoDueVolte, 'lo scontrino deve tornare in archivio');

// dal cestino si esce con Indietro: è una sottopagina, la barra delle
// schede non c'è apposta
await page.goBack();
await attendi(700);
controlla(await page.locator('.tab[data-tab="home"]').isVisible(), 'uscendo dal cestino deve tornare la barra delle schede');

/* ═══ 10. Navigazione ══════════════════════════════════════════ */
titolo('10. navigazione');
for (const scheda of ['home', 'deadlines', 'stats', 'settings', 'home']) {
  await page.tap(`.tab[data-tab="${scheda}"]`);
  await attendi(500);
  controlla(await page.locator(`#view-${scheda}`).isVisible(), `la scheda ${scheda} non si è aperta`);
}
const senzaNiente = await page.evaluate(() => window.chiudiSovrapposizione());
controlla(senzaNiente === false, 'senza sovrapposizioni il tasto Indietro deve passare alla navigazione');
await nessunResiduo('fine del giro');
await scatto('98-finale');

/* ═══ Esito ════════════════════════════════════════════════════ */
console.log('\n' + '═'.repeat(60));
console.log(errori.length ? `ERRORI JS:\n${errori.join('\n')}` : 'Nessun errore JS');
if (guasti.length) console.log(`\n${guasti.length} guasti:\n- ${guasti.join('\n- ')}`);
console.log(ok && !errori.length ? '\n✅ GIRO COMPLETO OK' : '\n❌ QUALCOSA NON TORNA');
await browser.close();
server.close();
process.exit(ok && !errori.length ? 0 : 1);
