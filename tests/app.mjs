/* Giro completo dell'archivio: ricerca, viste, dettaglio, foto a schermo
   intero, backup e ripristino, cestino.

   node tests/app.mjs
*/
import { avviaServer, apriApp, creaScontrino, verificatore, chiudi, SHOTS } from './aiuto.mjs';
import fs from 'node:fs';

const server = await avviaServer(4173);
const { browser, page, errori } = await apriApp(4173);
const { stato, controlla } = verificatore();
const scatto = (n) => page.screenshot({ path: `${SHOTS}/${n}.png` });

// ── archivio di prova ────────────────────────────────────────────
const oggi = new Date();
const fra = (giorni) => {
  const d = new Date(oggi); d.setDate(d.getDate() + giorni);
  return d.toISOString().slice(0, 10);
};

await creaScontrino(page, { title: 'Esselunga', amount: 43.90, category: 'spesa' });
await creaScontrino(page, { title: 'Trattoria da Gino', amount: 28.00, category: 'ristoro' });
await creaScontrino(page, { title: 'Benzina Q8', amount: 62.15, category: 'trasporti', returnUntil: fra(-4), returnDays: 14 });
await creaScontrino(page, { title: 'MediaWorld TV', amount: 499.00, category: 'tech', pagine: 2, returnUntil: fra(2), returnDays: 30 });
await creaScontrino(page, { title: 'Zara giacca', amount: 79.95, category: 'shopping', returnUntil: fra(20), returnDays: 30 });
await page.waitForTimeout(600);
await scatto('01-archivio');

console.log('scontrini in archivio:', await page.evaluate(() => state.receipts.length));
controlla(await page.locator('.card, .row').count() === 5, 'devono comparire tutti e cinque');

// ── avviso delle scadenze ────────────────────────────────────────
const avviso = await page.locator('#alertbar').isVisible();
console.log('avviso scadenze:', avviso ? (await page.locator('#alertbar').textContent()).replace(/\s+/g, ' ').trim() : 'assente');
controlla(avviso, 'con una scadenza a 2 giorni deve comparire la fascia di avviso');

// ── ricerca ──────────────────────────────────────────────────────
await page.fill('#search-input', 'benzina');
await page.waitForTimeout(500);
const trovati = await page.locator('.card, .row').count();
console.log('ricerca "benzina":', trovati, 'risultato/i');
controlla(trovati === 1, 'la ricerca deve restringere a uno');
await scatto('02-ricerca');
await page.click('#search-clear');
await page.waitForTimeout(400);

// ── elenco e griglia ─────────────────────────────────────────────
await page.click('#btn-layout');
await page.waitForTimeout(500);
await scatto('03-elenco');
await page.click('#btn-layout');
await page.waitForTimeout(400);

// ── dettaglio e foto a schermo intero ────────────────────────────
await page.click('.card >> nth=0');
await page.waitForTimeout(900);
await scatto('04-dettaglio');
controlla(await page.locator('.detail__actions').isVisible(), 'il dettaglio deve mostrare le azioni');

await page.click('[data-zoom]');
await page.waitForTimeout(700);
controlla(await page.locator('.viewer').count() === 1, 'la foto deve aprirsi a schermo intero');
await page.click('.viewer__close');
await page.waitForTimeout(400);
controlla(await page.locator('.viewer').count() === 0, 'la foto deve chiudersi');

// ── modifica dal dettaglio ───────────────────────────────────────
await page.click('[data-edit]');
await page.waitForTimeout(700);
await page.fill('#f-title', 'MediaWorld televisore');
await page.click('[data-save]');
await page.waitForTimeout(900);
const titoloAggiornato = await page.evaluate(() => state.receipts.some((r) => r.title === 'MediaWorld televisore'));
console.log('modifica dal dettaglio:', titoloAggiornato ? 'salvata' : 'PERSA');
controlla(titoloAggiornato, 'la modifica deve essere salvata');

await page.goBack();
await page.waitForTimeout(600);

// ── statistiche e scadenze ───────────────────────────────────────
await page.click('#summary');
await page.waitForTimeout(800);
controlla(await page.locator('#view-stats').isVisible(), 'dal totale si devono aprire le statistiche');
await scatto('05-statistiche');
await page.goBack();
await page.waitForTimeout(500);

await page.click('#alertbar');
await page.waitForTimeout(700);
controlla(await page.locator('#view-deadlines').isVisible(), "dall'avviso si devono aprire le scadenze");
await scatto('06-scadenze');
await page.goBack();
await page.waitForTimeout(500);

// ── impostazioni, backup e ripristino ────────────────────────────
await page.click('#btn-settings');
await page.waitForTimeout(700);
controlla(await page.locator('#view-settings').isVisible(), "l'ingranaggio deve aprire le impostazioni");
await scatto('07-impostazioni');

const scaricamento = page.waitForEvent('download', { timeout: 30000 });
await page.click('[data-act="export"]');
const file = await scaricamento;
const zip = `${SHOTS}/../backup-prova.zip`;
await file.saveAs(zip);
console.log('backup:', file.suggestedFilename(), fs.statSync(zip).size, 'byte');
controlla(fs.statSync(zip).size > 10000, 'il backup deve contenere le foto');

await page.evaluate(async () => { await DB.wipeAll(); await afterChange(); });
await page.waitForTimeout(500);
await page.setInputFiles('#input-restore', zip);
await page.waitForTimeout(3500);
const ripristinati = await page.evaluate(() => state.receipts.length);
console.log('ripristinati:', ripristinati);
controlla(ripristinati === 5, `dal backup dovevano tornare 5 scontrini, ne sono tornati ${ripristinati}`);

// ── cestino ──────────────────────────────────────────────────────
await page.goBack();
await page.waitForTimeout(600);
await page.click('.card >> nth=0');
await page.waitForTimeout(800);
await page.click('[data-more]');
await page.waitForTimeout(500);
await page.click('.action:has-text("cestino")');
await page.waitForTimeout(1200);
const vivi = await page.evaluate(() => state.receipts.filter((r) => !r.deletedAt).length);
console.log('dopo il cestino:', vivi, 'scontrini attivi');
controlla(vivi === 4, 'il cestino deve togliere lo scontrino dalla lista');

process.exit(chiudi(errori, stato.ok) ? 0 : 1);
