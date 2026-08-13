/* Utility condivise: formattazione, date, categorie. */

const CATEGORIES = [
  { id: 'spesa',     label: 'Spesa',       emoji: '🛒' },
  { id: 'ristoro',   label: 'Bar & Rist.', emoji: '🍽️' },
  { id: 'trasporti', label: 'Trasporti',   emoji: '🚗' },
  { id: 'casa',      label: 'Casa',        emoji: '🏠' },
  { id: 'salute',    label: 'Salute',      emoji: '💊' },
  { id: 'shopping',  label: 'Shopping',    emoji: '🛍️' },
  { id: 'tech',      label: 'Tecnologia',  emoji: '💻' },
  { id: 'viaggi',    label: 'Viaggi',      emoji: '✈️' },
  { id: 'bollette',  label: 'Bollette',    emoji: '📄' },
  { id: 'lavoro',    label: 'Lavoro',      emoji: '💼' },
  { id: 'svago',     label: 'Svago',       emoji: '🎬' },
  { id: 'altro',     label: 'Altro',       emoji: '🏷️' },
];

const CAT_BY_ID = Object.fromEntries(CATEGORIES.map((c) => [c.id, c]));
const catOf = (id) => CAT_BY_ID[id] || CAT_BY_ID.altro;

const CURRENCIES = ['EUR', 'USD', 'GBP', 'CHF'];

const MONTHS_IT = ['gennaio','febbraio','marzo','aprile','maggio','giugno','luglio','agosto','settembre','ottobre','novembre','dicembre'];
const MONTHS_SHORT = ['gen','feb','mar','apr','mag','giu','lug','ago','set','ott','nov','dic'];

/* ── Formattazione ───────────────────────────────────────────── */
function fmtMoney(value, currency = 'EUR') {
  if (value == null || Number.isNaN(value)) return '—';
  try {
    return new Intl.NumberFormat('it-IT', {
      style: 'currency', currency,
      minimumFractionDigits: 2, maximumFractionDigits: 2,
    }).format(value);
  } catch {
    return `${value.toFixed(2)} ${currency}`;
  }
}

function fmtMoneyShort(value, currency = 'EUR') {
  if (value == null || Number.isNaN(value)) return '—';
  const abs = Math.abs(value);
  if (abs >= 10000) {
    const k = (value / 1000).toFixed(abs >= 100000 ? 0 : 1).replace('.', ',');
    return `${k}k ${symbolOf(currency)}`;
  }
  return fmtMoney(value, currency);
}

function symbolOf(currency) {
  return ({ EUR: '€', USD: '$', GBP: '£', CHF: 'CHF' })[currency] || currency;
}

function fmtDate(iso, style = 'medium') {
  const d = parseISO(iso);
  if (!d) return '—';
  if (style === 'short') return `${d.getDate()} ${MONTHS_SHORT[d.getMonth()]}`;
  if (style === 'long') {
    return `${d.getDate()} ${MONTHS_IT[d.getMonth()]} ${d.getFullYear()}`;
  }
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
}

function fmtBytes(bytes) {
  if (!bytes) return '0 MB';
  const mb = bytes / 1048576;
  if (mb >= 1024) return `${(mb / 1024).toFixed(2).replace('.', ',')} GB`;
  if (mb >= 1) return `${mb.toFixed(1).replace('.', ',')} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

function fmtRelative(ts) {
  if (!ts) return 'mai';
  const diff = Date.now() - ts;
  const day = 86400000;
  if (diff < 60000) return 'adesso';
  if (diff < 3600000) return `${Math.floor(diff / 60000)} min fa`;
  if (diff < day) return `${Math.floor(diff / 3600000)} h fa`;
  if (diff < day * 2) return 'ieri';
  if (diff < day * 30) return `${Math.floor(diff / day)} giorni fa`;
  return fmtDate(new Date(ts).toISOString().slice(0, 10));
}

/* ── Date ────────────────────────────────────────────────────── */
function parseISO(iso) {
  if (!iso) return null;
  const [y, m, d] = String(iso).slice(0, 10).split('-').map(Number);
  if (!y || !m || !d) return null;
  return new Date(y, m - 1, d);
}

function todayISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** '2026-08-13' → '2026-08' */
const monthKey = (iso) => String(iso || '').slice(0, 7);

function monthLabel(key, short = false) {
  const [y, m] = key.split('-').map(Number);
  if (!y || !m) return key;
  const name = short ? MONTHS_SHORT[m - 1] : MONTHS_IT[m - 1];
  return `${name} ${y}`;
}

function daysBetween(isoA, isoB) {
  const a = parseISO(isoA), b = parseISO(isoB);
  if (!a || !b) return null;
  return Math.round((b - a) / 86400000);
}

/* ── Varie ───────────────────────────────────────────────────── */
function uid() {
  if (crypto.randomUUID) return crypto.randomUUID();
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function esc(str) {
  return String(str ?? '').replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}

function debounce(fn, ms = 220) {
  let t;
  return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
}

/** Converte "12,50" / "12.50" / "€ 12,50" in 12.5 (null se vuoto). */
function parseAmount(raw) {
  if (raw == null) return null;
  const clean = String(raw).replace(/[^\d.,-]/g, '').replace(/\.(?=\d{3}\b)/g, '').replace(',', '.');
  if (!clean) return null;
  const n = Number.parseFloat(clean);
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : null;
}

function haptic(ms = 12) {
  try { navigator.vibrate?.(ms); } catch { /* non supportato */ }
}

function sum(arr, pick = (x) => x) {
  return arr.reduce((acc, x) => acc + (pick(x) || 0), 0);
}

function slugify(str) {
  return String(str || '')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-+|-+$/g, '')
    .toLowerCase().slice(0, 40) || 'scontrino';
}

/* ── Scadenze per resi, cambi e garanzia ─────────────────────── */

/** Giorni che mancano a una data: 0 = oggi, negativo = già passata. */
function daysLeft(iso) {
  if (!iso) return null;
  return daysBetween(todayISO(), iso);
}

const DEADLINE_KINDS = {
  reso:     { label: 'Reso o cambio', short: 'Reso',     emoji: '↩️', icon: 'ret' },
  garanzia: { label: 'Garanzia',      short: 'Garanzia', emoji: '🛡️', icon: 'shield' },
};

/** Come mostrare una scadenza: gravità, colore e testo pronto. */
function deadlineStatus(days) {
  if (days == null) return null;
  if (days < 0) {
    const passati = Math.abs(days);
    return { level: 'scaduto', tone: 'grey', urgent: false,
             text: passati === 1 ? 'scaduto ieri' : `scaduto ${passati} giorni fa` };
  }
  if (days === 0) return { level: 'oggi', tone: 'red', urgent: true, text: 'scade oggi' };
  if (days === 1) return { level: 'domani', tone: 'red', urgent: true, text: 'scade domani' };
  if (days <= 7) return { level: 'settimana', tone: 'amber', urgent: true, text: `fra ${days} giorni` };
  if (days <= 30) return { level: 'mese', tone: 'green', urgent: false, text: `fra ${days} giorni` };
  if (days <= 60) return { level: 'oltre', tone: 'plain', urgent: false, text: `fra ${days} giorni` };
  const mesi = Math.round(days / 30);
  return { level: 'oltre', tone: 'plain', urgent: false,
           text: mesi < 12 ? `fra ${mesi} mesi` : `fra ${(days / 365).toFixed(1).replace('.', ',')} anni` };
}

/** Aggiunge giorni a una data ISO restituendo una data ISO. */
function shiftDays(iso, days) {
  const d = parseISO(iso) || new Date();
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function shiftYears(iso, years) {
  const d = parseISO(iso) || new Date();
  d.setFullYear(d.getFullYear() + years);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
