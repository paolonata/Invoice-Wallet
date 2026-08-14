/* Regressione: le scadenze seguono la data dello scontrino.
   Il caso arriva da un uso vero: scadenza impostata prima di correggere la data.

   node tests/scadenze.mjs
*/
import { avviaServer, apriApp, creaScontrino, verificatore, chiudi, SHOTS } from './aiuto.mjs';

const server = await avviaServer(4180);
const { browser, page, errori } = await apriApp(4180);
const { stato, controlla } = verificatore();

const piu = (iso, giorni) => {
  const d = new Date(iso + 'T00:00:00'); d.setDate(d.getDate() + giorni);
  return d.toISOString().slice(0, 10);
};
const piuAnni = (iso, anni) => {
  const d = new Date(iso + 'T00:00:00'); d.setFullYear(d.getFullYear() + anni);
  return d.toISOString().slice(0, 10);
};

await creaScontrino(page, { title: 'Decathlon scarpe', amount: 89.90, category: 'shopping' });
await page.waitForTimeout(500);

const apriModifica = async () => {
  await page.click('.card >> nth=0');
  await page.waitForTimeout(800);
  await page.click('[data-edit]');
  await page.waitForTimeout(700);
};

// ── 1. scadenze impostate con le scorciatoie ─────────────────────
await apriModifica();
await page.click('#f-ret-row');
await page.waitForTimeout(200);
await page.click('#f-ret-quick button[data-days="30"]');
await page.click('#f-war-row');
await page.waitForTimeout(200);
await page.click('#f-war-quick button[data-years="2"]');

const dataIniziale = await page.inputValue('#f-date');
console.log(`1) data ${dataIniziale} → reso ${await page.inputValue('#f-return')}, garanzia ${await page.inputValue('#f-warranty')}`);

// ── 2. la data si sposta indietro: le scadenze la seguono ────────
const nuovaData = piu(dataIniziale, -20);
await page.fill('#f-date', nuovaData);
await page.dispatchEvent('#f-date', 'change');
await page.waitForTimeout(400);
await page.screenshot({ path: `${SHOTS}/20-scadenze-ricalcolate.png` });

const reso = await page.inputValue('#f-return');
const garanzia = await page.inputValue('#f-warranty');
console.log(`2) data ${nuovaData} → reso ${reso}, garanzia ${garanzia}`);
controlla(reso === piu(nuovaData, 30), `reso: atteso ${piu(nuovaData, 30)}, trovato ${reso}`);
controlla(garanzia === piuAnni(nuovaData, 2), `garanzia: attesa ${piuAnni(nuovaData, 2)}, trovata ${garanzia}`);

await page.click('[data-save]');
await page.waitForTimeout(900);

const salvato = await page.evaluate(() => {
  const r = state.receipts[0];
  return { date: r.date, returnUntil: r.returnUntil, returnDays: r.returnDays, giorni: daysLeft(r.returnUntil) };
});
console.log('3) salvato:', JSON.stringify(salvato));
controlla(salvato.returnUntil === piu(nuovaData, 30), 'il record salvato ha la scadenza vecchia');
controlla(salvato.giorni === 10, `giorni rimasti: attesi 10, trovati ${salvato.giorni}`);

// ── 4. una data scritta a mano non si tocca ──────────────────────
await page.click('[data-edit]');
await page.waitForTimeout(700);
await page.fill('#f-return', '2027-01-15');
await page.fill('#f-date', '2026-08-01');
await page.dispatchEvent('#f-date', 'change');
await page.waitForTimeout(300);
const manuale = await page.inputValue('#f-return');
console.log(`4) data scritta a mano dopo il cambio: ${manuale}`);
controlla(manuale === '2027-01-15', 'la data scritta a mano è stata sovrascritta');
await page.click('[data-cancel]');
await page.waitForTimeout(400);
await page.goBack();
await page.waitForTimeout(500);

// ── 5. il caso reale: scadenza scelta PRIMA di correggere la data ─
await creaScontrino(page, { title: 'El Corte Ingles', amount: 120 });
await page.waitForTimeout(500);
await page.click('.card >> nth=0');
await page.waitForTimeout(800);
await page.click('[data-edit]');
await page.waitForTimeout(700);
await page.click('#f-ret-row');
await page.waitForTimeout(200);
await page.click('#f-ret-quick button[data-days="30"]');
const scadenzaPrima = await page.inputValue('#f-return');

await page.fill('#f-date', '2026-07-18');
await page.dispatchEvent('#f-date', 'change');
await page.waitForTimeout(300);
await page.click('[data-save]');
await page.waitForTimeout(900);

const secondo = await page.evaluate(() => {
  const r = state.receipts.find((x) => x.title === 'El Corte Ingles');
  return { date: r.date, returnUntil: r.returnUntil };
});
console.log(`5) scadenza prima ${scadenzaPrima} → dopo la correzione ${secondo.returnUntil} (data ${secondo.date})`);
controlla(secondo.returnUntil === '2026-08-17', `atteso 2026-08-17, trovato ${secondo.returnUntil}`);

process.exit(chiudi(errori, stato.ok) ? 0 : 1);
