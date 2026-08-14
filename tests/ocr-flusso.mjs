/* La lettura automatica al momento dello scatto: lo scontrino entra in
   archivio già compilato, senza moduli. Il ponte Android è finto.

   node tests/ocr-flusso.mjs
*/
import { avviaServer, apriApp, verificatore, chiudi, SHOTS } from './aiuto.mjs';

const SCONTRINO = `ESSELUNGA S.P.A.
VIA GIAMBOLOGNA 1 - MILANO
LATTE INTERO 1L          1,29
PANE CASERECCIO          2,45
TOTALE COMPLESSIVO      12,74
Contanti                15,00
Resto                    2,26
04/08/2026 18:42`;

const server = await avviaServer(4181);
const { browser, page, errori } = await apriApp(4181, {
  fotocameraFinta: true,
  prima: {
    dato: SCONTRINO,
    funzione: (testo) => {
      const pezzi = new Map();
      window.AndroidHost = {
        platform: () => 'android',
        versionName: () => 'test',
        canReadText: () => true,
        fileBegin: (nome) => { const t = 'tok' + Math.random(); pezzi.set(t, { nome, n: 0 }); return t; },
        fileChunk: (t) => { pezzi.get(t).n++; return true; },
        fileEnd: (t, modo) => {
          const info = pezzi.get(t); pezzi.delete(t);
          window.__ocr = (window.__ocr || 0) + (modo === 'ocr' ? 1 : 0);
          return modo === 'ocr' ? testo : 'Download/Invoice Wallet/' + info.nome;
        },
        fileAbort: () => {},
      };
    },
  },
});
const { stato, controlla } = verificatore();

// ── uno scatto: il record nasce già compilato ────────────────────
await page.click('#fab');
await page.waitForTimeout(2000);
await page.click('#otturatore');
await page.waitForTimeout(3000);

const salvato = await page.evaluate(() => {
  const r = state.receipts[0];
  return r ? { title: r.title, amount: r.amount, date: r.date, category: r.category } : null;
});
console.log('1) letto e salvato:', JSON.stringify(salvato));
controlla(!!salvato, 'lo scatto deve creare uno scontrino');
controlla(salvato?.amount === 12.74, `importo atteso 12.74, trovato ${salvato?.amount}`);
controlla(salvato?.title === 'Esselunga', `negozio atteso Esselunga, trovato ${salvato?.title}`);
controlla(salvato?.date === '2026-08-04', `data attesa 2026-08-04, trovata ${salvato?.date}`);
controlla(salvato?.category === 'spesa', `categoria attesa spesa, trovata ${salvato?.category}`);
console.log('   chiamate al riconoscimento:', await page.evaluate(() => window.__ocr));

// ── la scheda dopo lo scatto mostra l'importo già letto ──────────
const scheda = (await page.locator('#scattato').textContent()).replace(/\s+/g, ' ').trim();
console.log('2) scheda dopo lo scatto:', scheda);
controlla(scheda.includes('12,74'), "la scheda deve mostrare l'importo letto");
await page.screenshot({ path: `${SHOTS}/30-ocr-scatto.png` });

// ── nel browser vero, senza ponte, non si legge nulla: va bene così ──
// (il ponte viene riconosciuto all'avvio, quindi serve una pagina pulita)
const pagina2 = await browser.newContext({ viewport: { width: 393, height: 851 } })
  .then((c) => c.newPage());
await pagina2.goto('http://localhost:4181/');
await pagina2.waitForTimeout(900);
const senzaPonte = await pagina2.evaluate(() => ocrDisponibile());
console.log('3) senza ponte Android, lettura disponibile:', senzaPonte);
controlla(senzaPonte === false, 'senza ponte la lettura non deve essere annunciata');

process.exit(chiudi(errori, stato.ok) ? 0 : 1);
