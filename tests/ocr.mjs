/* Verifica dell'interpretazione degli scontrini: testo grezzo → campi.
   I testi qui sotto ricalcano scontrini italiani veri, con le loro storture
   (righe sporche, importi in mezzo, date in fondo).

   node tests/ocr.mjs
*/
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const qui = path.dirname(fileURLToPath(import.meta.url));
const sorgente = readFileSync(path.join(qui, '..', 'assets', 'js', 'ocr.js'), 'utf8');
const modulo = { exports: {} };
new Function('module', 'exports', sorgente)(modulo, modulo.exports);
const { parseReceiptText } = modulo.exports;

const annoCorrente = new Date().getFullYear();
const oggi = new Date();
const dataRecente = `${String(oggi.getDate()).padStart(2, '0')}/${String(oggi.getMonth() + 1).padStart(2, '0')}/${annoCorrente}`;
const isoRecente = `${annoCorrente}-${String(oggi.getMonth() + 1).padStart(2, '0')}-${String(oggi.getDate()).padStart(2, '0')}`;

const casi = [
  {
    nome: 'Supermercato con sconto fedeltà',
    testo: `ESSELUNGA S.P.A.
VIA GIAMBOLOGNA 1 - MILANO
P.IVA 04916380159

DOCUMENTO COMMERCIALE
di vendita o prestazione

LATTE INTERO 1L          1,29
PANE CASERECCIO          2,45
3 x 0,89 MELE GOLDEN     2,67
DETERSIVO PIATTI         3,99
TOTALE SCONTI           -1,50
TOTALE COMPLESSIVO       8,90
Contanti                10,00
Resto                    1,10
${dataRecente} 18:42
SCONTRINO N. 0042`,
    atteso: { amount: 8.90, date: isoRecente, title: 'Esselunga', category: 'spesa' },
  },
  {
    nome: 'Benzinaio, totale su riga successiva',
    testo: `Q8 STAZIONE SERVIZIO
CORSO FRANCIA 210 TORINO

GASOLIO SELF
LITRI 32,45
TOTALE EURO
58,41
DATA 12/07/${annoCorrente} ORE 07:15`,
    atteso: { amount: 58.41, date: `${annoCorrente}-07-12`, title: 'Q8 Stazione Servizio', category: 'trasporti' },
  },
  {
    nome: 'Bar, importi con punto e migliaia',
    testo: `CAFFE DEL CORSO SRL
CAPPUCCINO           1.50
CORNETTO             1.20
TOTALE               2.70
CARTA                2.70
05.03.${annoCorrente}  08:03`,
    atteso: { amount: 2.70, date: `${annoCorrente}-03-05`, category: 'ristoro' },
  },
  {
    nome: 'Elettronica, importo grande con migliaia',
    testo: `MEDIAWORLD
CENTRO COMMERCIALE
TV OLED 55 POLLICI    1.299,00
GARANZIA ESTESA         149,00
TOTALE COMPLESSIVO    1.448,00
PAGAMENTO ELETTRONICO 1.448,00
22/11/${annoCorrente - 1}`,
    atteso: { amount: 1448.00, date: `${annoCorrente - 1}-11-22`, title: 'MediaWorld', category: 'tech' },
  },
  {
    nome: 'Negozio sconosciuto: nome dalla prima riga',
    testo: `MACELLERIA DA MARIO
di Rossi Mario & C. SNC
VIA ROMA 12
ARROSTO DI VITELLO      12,40
SALSICCIA                6,20
TOTALE                  18,60
${dataRecente}`,
    atteso: { amount: 18.60, date: isoRecente, title: 'Macelleria Da Mario' },
  },
  {
    nome: 'Trappole: totale articoli e IVA non devono ingannare',
    testo: `CONAD CITY
TOTALE ARTICOLI 7
IMPONIBILE           14,50
IVA 10%               1,45
TOTALE               15,95
${dataRecente} 11:20`,
    atteso: { amount: 15.95, date: isoRecente, title: 'Conad', category: 'spesa' },
  },
  {
    nome: 'Farmacia, data futura da ignorare (scadenza prodotto)',
    testo: `FARMACIA SAN CARLO
TACHIPIRINA 500          7,90
SCAD. 12/12/2030
TOTALE                   7,90
${dataRecente}`,
    atteso: { amount: 7.90, date: isoRecente, title: 'Farmacia', category: 'salute' },
  },
  {
    nome: 'Testo illeggibile: meglio non inventare',
    testo: `#### ???? ####
~~~~~~~~~~~~
!!!!!!!`,
    atteso: { amount: null, date: null },
  },
];

let passati = 0;
let falliti = 0;

for (const caso of casi) {
  const esito = parseReceiptText(caso.testo);
  const problemi = [];
  for (const [campo, atteso] of Object.entries(caso.atteso)) {
    if (atteso === null) {
      if (esito[campo] !== null) problemi.push(`${campo}: atteso vuoto, trovato ${JSON.stringify(esito[campo])}`);
    } else if (esito[campo] !== atteso) {
      problemi.push(`${campo}: atteso ${JSON.stringify(atteso)}, trovato ${JSON.stringify(esito[campo])}`);
    }
  }
  if (problemi.length) {
    falliti++;
    console.log(`✗ ${caso.nome}`);
    problemi.forEach((p) => console.log(`    ${p}`));
  } else {
    passati++;
    console.log(`✓ ${caso.nome}  →  ${esito.title ?? '—'} · ${esito.amount ?? '—'} · ${esito.date ?? '—'}`);
  }
}

console.log(`\n${passati} passati, ${falliti} falliti`);
process.exit(falliti ? 1 : 0);
