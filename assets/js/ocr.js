/* ══════════════════════════════════════════════════════════════
   Lettura automatica dello scontrino.

   Il riconoscimento del testo lo fa Android (ML Kit, sul telefono,
   senza rete). Qui c'è la parte che dal testo grezzo tira fuori le
   tre cose che servono: totale, data e negozio.

   Regola di fondo: meglio lasciare un campo vuoto che riempirlo male.
   Chi legge questo file per correggere un caso storto: aggiungi una
   riga a OCR_BRANDS o un indizio a TOTAL_HINTS, poi lancia
   `node tests/ocr.mjs` che verifica su scontrini veri.
   ══════════════════════════════════════════════════════════════ */

/** Catene riconosciute: danno un nome pulito e indovinano la categoria. */
const OCR_BRANDS = [
  { re: /esselunga/i,                 name: 'Esselunga',    cat: 'spesa' },
  { re: /\bcoop\b|ipercoop/i,         name: 'Coop',         cat: 'spesa' },
  { re: /\bconad\b/i,                 name: 'Conad',        cat: 'spesa' },
  { re: /carrefour/i,                 name: 'Carrefour',    cat: 'spesa' },
  { re: /\blidl\b/i,                  name: 'Lidl',         cat: 'spesa' },
  { re: /eurospin/i,                  name: 'Eurospin',     cat: 'spesa' },
  { re: /penny\s*market|\bpenny\b/i,  name: 'Penny Market', cat: 'spesa' },
  { re: /\bpam\b|panorama/i,          name: 'Pam',          cat: 'spesa' },
  { re: /\bdespar\b|eurospar/i,       name: 'Despar',       cat: 'spesa' },
  { re: /\bcrai\b/i,                  name: 'Crai',         cat: 'spesa' },
  { re: /\bbennet\b/i,                name: 'Bennet',       cat: 'spesa' },
  { re: /\btigros\b/i,                name: 'Tigros',       cat: 'spesa' },
  { re: /\btodis\b/i,                 name: 'Todis',        cat: 'spesa' },
  { re: /\bin\s?s\s?mercato|\bmd\b/i, name: 'MD',           cat: 'spesa' },
  { re: /\bgigante\b/i,               name: 'Il Gigante',   cat: 'spesa' },
  { re: /\bfarmacia\b|parafarmacia/i, name: 'Farmacia',     cat: 'salute' },
  { re: /decathlon/i,                 name: 'Decathlon',    cat: 'shopping' },
  { re: /\bzara\b|h\s?&\s?m|\bovs\b/i, name: null,          cat: 'shopping' },
  { re: /\bikea\b/i,                  name: 'IKEA',         cat: 'casa' },
  { re: /leroy\s*merlin|obi\b|bricocenter/i, name: null,    cat: 'casa' },
  { re: /mediaworld|media\s*world/i,  name: 'MediaWorld',   cat: 'tech' },
  { re: /unieuro|euronics|trony/i,    name: null,           cat: 'tech' },
  { re: /\bq8\b|\beni\b|\besso\b|tamoil|\bip\s+distributore|agip/i, name: null, cat: 'trasporti' },
  { re: /autostrad|telepass|parcheggi|\batac\b|\bgtt\b|trenitalia|italo\b/i, name: null, cat: 'trasporti' },
  { re: /ristorante|trattoria|pizzeria|osteria|\bbar\b|caff[eè]/i, name: null, cat: 'ristoro' },
  { re: /amazon/i,                    name: 'Amazon',       cat: 'shopping' },
];

/** Righe che indicano il totale, dalla più affidabile alla meno. */
const TOTAL_HINTS = [
  { re: /totale\s+complessivo/i,            score: 100 },
  { re: /totale\s+(da\s+pagare|documento)/i, score: 95 },
  { re: /totale\s+euro/i,                    score: 90 },
  { re: /^\s*totale\b/i,                     score: 85 },
  { re: /\btotale\b/i,                       score: 70 },
  { re: /importo\s+(pagato|totale)/i,        score: 65 },
  { re: /^\s*(contanti|carta|bancomat|pagamento\s+elettronico)\b/i, score: 40 },
];

/** Righe da ignorare quando si cerca il totale: portano fuori strada. */
const TOTAL_TRAPS = /sconto|sconti|risparmi|subtotale|sub\s*totale|resto|non\s+riscoss|iva\b|imponibile|arrotondament|punti|saldo\s+punti|totale\s+articoli|pezzi/i;

/** Parole che escludono una riga dall'essere il nome del negozio. */
const MERCHANT_TRAPS = /scontrino|documento\s+commerciale|ricevuta|fattura|p\.?\s?iva|part\.?\s?iva|cod\.?\s?fisc|c\.?f\.?[:\s]|\bvia\b|\bviale\b|\bpiazza\b|\bcorso\b|\btel\b|telefono|www\.|@|codice|registratore|matricola|cassa\b|operatore|addetto|\bora\b|scontr|rt\s*\d|\bn[.°]\s*\d/i;

/* ── Numeri ──────────────────────────────────────────────────── */

/** Trova tutti gli importi di una riga, es. "1.234,56" o "12.50". */
function findAmounts(line) {
  const out = [];
  const re = /(?<![\d.,])(\d{1,3}(?:[.\s]\d{3})+|\d+)[.,](\d{2})(?![\d.,])/g;
  let m;
  while ((m = re.exec(line)) !== null) {
    const intero = m[1].replace(/[.\s]/g, '');
    const valore = Number.parseFloat(`${intero}.${m[2]}`);
    if (Number.isFinite(valore)) out.push(valore);
  }
  return out;
}

/* ── Data ────────────────────────────────────────────────────── */

function findDate(lines) {
  const oggi = new Date();
  const domani = new Date(oggi.getTime() + 86400000);
  const limite = new Date(oggi.getFullYear() - 10, 0, 1);
  const candidate = [];

  lines.forEach((line, i) => {
    const re = /(?<!\d)(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})(?!\d)/g;
    let m;
    while ((m = re.exec(line)) !== null) {
      let [, g, mm, a] = m;
      const anno = a.length === 2 ? 2000 + Number(a) : Number(a);
      const mese = Number(mm);
      const giorno = Number(g);
      if (mese < 1 || mese > 12 || giorno < 1 || giorno > 31) continue;
      const d = new Date(anno, mese - 1, giorno);
      if (d > domani || d < limite) continue;
      if (d.getMonth() !== mese - 1 || d.getDate() !== giorno) continue; // es. 31/02
      candidate.push({
        iso: `${anno}-${String(mese).padStart(2, '0')}-${String(giorno).padStart(2, '0')}`,
        // La riga che dice "DATA" o che porta anche l'ora è quella buona.
        punteggio: (/\bdata\b/i.test(line) ? 10 : 0) + (/\d{1,2}[:.]\d{2}/.test(line) ? 5 : 0) - i * 0.01,
      });
    }
  });

  if (!candidate.length) return null;
  candidate.sort((a, b) => b.punteggio - a.punteggio);
  return candidate[0].iso;
}

/* ── Totale ──────────────────────────────────────────────────── */

function findTotal(lines) {
  let migliore = null;

  lines.forEach((line, i) => {
    if (TOTAL_TRAPS.test(line)) return;
    const hint = TOTAL_HINTS.find((h) => h.re.test(line));
    if (!hint) return;

    // L'importo sta sulla stessa riga; se manca, spesso è sulla successiva.
    let importi = findAmounts(line);
    let riga = i;
    if (!importi.length && lines[i + 1] && !TOTAL_TRAPS.test(lines[i + 1])) {
      importi = findAmounts(lines[i + 1]);
      riga = i + 1;
    }
    if (!importi.length) return;

    const valore = importi[importi.length - 1];
    if (valore <= 0 || valore > 100000) return;

    // A parità di indizio vince la riga più in basso: sugli scontrini
    // il totale definitivo è l'ultimo.
    const punteggio = hint.score + riga * 0.1;
    if (!migliore || punteggio > migliore.punteggio) migliore = { valore, punteggio };
  });

  return migliore ? migliore.valore : null;
}

/* ── Negozio ─────────────────────────────────────────────────── */

function findMerchant(lines, testoIntero) {
  for (const brand of OCR_BRANDS) {
    if (!brand.re.test(testoIntero)) continue;
    if (brand.name) return { name: brand.name, cat: brand.cat };
    // Marchio senza nome fisso: prendo la riga dove compare, ripulita.
    const riga = lines.find((l) => brand.re.test(l));
    return { name: riga ? pulisciNome(riga) : null, cat: brand.cat };
  }

  // Nessun marchio noto: le prime righe in alto sono l'intestazione.
  for (const line of lines.slice(0, 6)) {
    if (MERCHANT_TRAPS.test(line)) continue;
    const pulita = pulisciNome(line);
    if (pulita && pulita.length >= 3 && /[a-zà-ù]/i.test(pulita)) {
      return { name: pulita, cat: null };
    }
  }
  return { name: null, cat: null };
}

function pulisciNome(riga) {
  const pulita = riga
    .replace(/[*#|_]+/g, ' ')
    .replace(/\b(s\.?r\.?l\.?|s\.?p\.?a\.?|s\.?n\.?c\.?|s\.?a\.?s\.?)\b/gi, '')
    .replace(/\s{2,}/g, ' ')
    .trim()
    .slice(0, 40)
    .trim();
  if (!pulita) return null;
  // TUTTO MAIUSCOLO diventa Iniziali Maiuscole, più leggibile nella lista.
  if (pulita === pulita.toUpperCase()) {
    return pulita.toLowerCase().replace(/(^|[\s'’-])([a-zà-ù])/g, (_, sep, c) => sep + c.toUpperCase());
  }
  return pulita;
}

/* ── Ingresso ────────────────────────────────────────────────── */

/**
 * Dal testo grezzo dello scontrino ai campi da compilare.
 * @returns {{amount: number|null, date: string|null, title: string|null,
 *            category: string|null, lines: number}}
 */
function parseReceiptText(raw) {
  const testo = String(raw || '');
  const lines = testo.split(/\r?\n/).map((l) => l.replace(/\s+$/, '').trim()).filter(Boolean);
  if (!lines.length) return { amount: null, date: null, title: null, category: null, lines: 0 };

  const { name, cat } = findMerchant(lines, testo);
  return {
    amount: findTotal(lines),
    date: findDate(lines),
    title: name,
    category: cat,
    lines: lines.length,
  };
}

/* ── Collegamento con Android ────────────────────────────────── */

/** Il riconoscimento c'è solo dentro l'app Android. */
function ocrDisponibile() {
  try { return !!(androidHost && androidHost.canReadText && androidHost.canReadText()); } catch { return false; }
}

/**
 * Manda la foto ad Android, riceve il testo e lo interpreta.
 * @returns {Promise<null|object>} null se il riconoscimento non è disponibile.
 */
async function leggiScontrino(blob) {
  if (!ocrDisponibile()) return null;
  const testo = await hostSaveFile(blob, 'scontrino.jpg', 'ocr');
  if (!testo) return null;
  const campi = parseReceiptText(testo);
  return { ...campi, testo };
}

/* Per i test in Node. */
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { parseReceiptText, findAmounts, findDate, findTotal, findMerchant };
}
