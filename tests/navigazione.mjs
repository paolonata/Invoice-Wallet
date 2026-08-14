/* Comportamento da app: il tasto Indietro chiude quello che è aperto, il
   dettaglio sta in una schermata, il mirino si chiude e si spegne.

   node tests/navigazione.mjs
*/
import { avviaServer, apriApp, creaScontrino, verificatore, chiudi, SHOTS } from './aiuto.mjs';

const server = await avviaServer(4184);
const { browser, page, errori } = await apriApp(4184, { fotocameraFinta: true });
const { stato, controlla } = verificatore();

await creaScontrino(page, {
  title: 'Zapatillas El Corte Ingles', amount: 120, category: 'shopping',
  date: '2026-07-19', pagine: 2,
  note: 'Regalo di compleanno per Marco. Scatola conservata in cantina, con dentro lo scontrino originale e il sacchetto.',
  returnUntil: '2026-08-18', returnDays: 30, warrantyUntil: '2028-07-19', warrantyYears: 2,
});
await page.waitForTimeout(600);

// ── 1. il dettaglio non deve scorrere ────────────────────────────
await page.click('.card >> nth=0');
await page.waitForTimeout(900);
await page.screenshot({ path: `${SHOTS}/40-dettaglio.png` });

const misure = await page.evaluate(() => ({
  scorre: document.documentElement.scrollHeight > window.innerHeight + 2,
  azioniDentro: document.querySelector('.detail__actions').getBoundingClientRect().bottom <= window.innerHeight,
  etichetteDentro: [...document.querySelectorAll('.detail__tags .tag')]
    .every((t) => t.getBoundingClientRect().bottom <= window.innerHeight),
}));
console.log('1) dettaglio:', JSON.stringify(misure));
controlla(!misure.scorre, 'la pagina di dettaglio non deve scorrere');
controlla(misure.azioniDentro, 'i pulsanti devono stare nello schermo');
controlla(misure.etichetteDentro, 'le etichette devono stare nello schermo');

// ── 2. Indietro chiude la foto aperta, non la schermata ──────────
await page.click('[data-zoom]');
await page.waitForTimeout(700);
controlla(await page.locator('.viewer').count() === 1, 'la foto non si è aperta');
let gestito = await page.evaluate(() => window.chiudiSovrapposizione());
await page.waitForTimeout(300);
console.log(`2) Indietro sulla foto: gestito=${gestito}, viewer=${await page.locator('.viewer').count()}, nel dettaglio=${await page.locator('#view-detail').isVisible()}`);
controlla(gestito === true && await page.locator('.viewer').count() === 0, 'la foto doveva chiudersi');
controlla(await page.locator('#view-detail').isVisible(), 'dovevamo restare nel dettaglio');

// ── 3. Indietro chiude la scheda azioni e poi l'editor ───────────
await page.click('[data-more]');
await page.waitForTimeout(500);
gestito = await page.evaluate(() => window.chiudiSovrapposizione());
await page.waitForTimeout(400);
console.log(`3) Indietro sulla scheda azioni: gestito=${gestito}`);
controlla(gestito === true, 'il tasto doveva chiudere la scheda');

await page.click('[data-edit]');
await page.waitForTimeout(800);
gestito = await page.evaluate(() => window.chiudiSovrapposizione());
await page.waitForTimeout(500);
console.log(`4) Indietro sull'editor: gestito=${gestito}, nel dettaglio=${await page.locator('#view-detail').isVisible()}`);
controlla(gestito === true, "il tasto doveva chiudere l'editor");
controlla(await page.locator('#view-detail').isVisible(), 'dovevamo restare nel dettaglio');

// ── 5. senza niente aperto il tasto passa alla navigazione ───────
gestito = await page.evaluate(() => window.chiudiSovrapposizione());
console.log(`5) Indietro senza sovrapposizioni: gestito=${gestito} (deve essere false)`);
controlla(gestito === false, 'senza sovrapposizioni il tasto deve passare alla navigazione');
await page.goBack();
await page.waitForTimeout(600);
controlla(await page.locator('#view-home').isVisible(), "si doveva tornare all'archivio");

// ── 6. dal mirino, Indietro torna all'archivio e spegne ──────────
await page.click('#fab');
await page.waitForTimeout(1800);
controlla(await page.evaluate(() => !!document.querySelector('#cam-video').srcObject), 'il mirino doveva accendersi');
await page.goBack();
await page.waitForTimeout(800);
const dopo = await page.evaluate(() => ({
  vista: state.view,
  flusso: !!document.querySelector('#cam-video').srcObject,
}));
console.log('6) uscita dal mirino:', JSON.stringify(dopo));
controlla(dopo.vista === 'home' && !dopo.flusso, 'uscendo dal mirino la fotocamera deve spegnersi');

process.exit(chiudi(errori, stato.ok) ? 0 : 1);
