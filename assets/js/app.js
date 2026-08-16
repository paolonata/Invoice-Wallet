/* ══════════════════════════════════════════════════════════════
   Invoice Wallet — logica dell'applicazione.
   Tutto gira nel browser: nessun account, nessun server.
   ══════════════════════════════════════════════════════════════ */

const APP_VERSION = '2.3.0';

const DEFAULT_SETTINGS = {
  theme: 'auto',        // auto | light | dark
  currency: 'EUR',
  quality: 'media',     // alta | media | bassa
  layout: 'grid',       // grid | list
  sort: 'date-desc',
};

const SORTS = {
  'date-desc':   { label: 'Più recenti',      cmp: (a, b) => (b.date || '').localeCompare(a.date || '') || b.createdAt - a.createdAt },
  'date-asc':    { label: 'Più vecchi',       cmp: (a, b) => (a.date || '').localeCompare(b.date || '') || a.createdAt - b.createdAt },
  'amount-desc': { label: 'Importo maggiore', cmp: (a, b) => (b.amount || 0) - (a.amount || 0) },
  'amount-asc':  { label: 'Importo minore',   cmp: (a, b) => (a.amount || 0) - (b.amount || 0) },
};

const state = {
  receipts: [],
  settings: { ...DEFAULT_SETTINGS },
  filter: { month: 'all', category: 'all', query: '' },
  view: 'home',
  detailId: null,
  detailPhotoIdx: 0,
  lastBackupAt: null,
  installPrompt: null,
};

/* ═══════════════════ Avvio ═══════════════════ */

async function init() {
  try {
    state.settings = { ...DEFAULT_SETTINGS, ...(await DB.getMeta('settings', {})) };
    state.lastBackupAt = await DB.getMeta('lastBackupAt', null);
    applyTheme();
    await DB.purgeExpiredTrash(30);
    await loadReceipts();
  } catch (err) {
    console.error(err);
    toastError(`Impossibile aprire l'archivio locale. Controlla che il browser non sia in navigazione privata.`);
  }

  hydrateIcons(document);
  wireGlobalEvents();
  render();

  $('#app').hidden = false;
  setTimeout(() => $('#boot')?.remove(), 800);

  history.replaceState({ view: 'home' }, '');
  registerServiceWorker();

  // Scorciatoia dell'icona sulla home del telefono: apre subito la fotocamera.
  if (new URLSearchParams(location.search).get('azione') === 'nuovo') {
    history.replaceState({ view: 'home' }, '', location.pathname);
    setTimeout(startAdd, 500);
  }
}

async function loadReceipts() {
  const all = await DB.allReceipts();
  state.receipts = all.sort(SORTS['date-desc'].cmp);
}

async function saveSettings(patch) {
  state.settings = { ...state.settings, ...patch };
  await DB.setMeta('settings', state.settings);
  applyTheme();
}

function applyTheme() {
  document.documentElement.setAttribute('data-theme', state.settings.theme);
  document.body.setAttribute('data-theme', state.settings.theme);
}

/* ═══════════════════ Selettori ═══════════════════ */

const liveReceipts = () => state.receipts.filter((r) => !r.deletedAt);
const trashedReceipts = () => state.receipts.filter((r) => r.deletedAt).sort((a, b) => b.deletedAt - a.deletedAt);
const byId = (id) => state.receipts.find((r) => r.id === id);
const cur = () => state.settings.currency;

function matchesQuery(r, q) {
  if (!q) return true;
  const hay = [
    r.title, r.note, catOf(r.category).label,
    r.amount != null ? String(r.amount).replace('.', ',') : '',
    fmtDate(r.date), monthLabel(monthKey(r.date)),
  ].join(' ').toLowerCase();
  return q.toLowerCase().split(/\s+/).filter(Boolean).every((word) => hay.includes(word));
}

function filteredReceipts() {
  const { month, category, query } = state.filter;
  const ordina = (l) => l.sort(SORTS[state.settings.sort]?.cmp || SORTS['date-desc'].cmp);

  /*
   * Mentre cerchi, mese e categoria si mettono da parte: uno scontrino
   * che esiste ma resta nascosto perché era selezionato un altro mese è
   * indistinguibile da uno che non c'è, ed è il modo più veloce per
   * credere di aver perso qualcosa.
   */
  if (query) return ordina(liveReceipts().filter((r) => matchesQuery(r, query)));

  return ordina(liveReceipts()
    .filter((r) => (month === 'all' || monthKey(r.date) === month))
    .filter((r) => (category === 'all' || (category === 'fav' ? r.favorite : r.category === category))));
}

function groupByMonth(list) {
  const map = new Map();
  for (const r of list) {
    const key = monthKey(r.date) || 'senza-data';
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(r);
  }
  return [...map.entries()];
}

/* ═══════════════════ Navigazione ═══════════════════ */

function go(view, opts = {}) {
  state.view = view;
  state.detailId = opts.id ?? null;
  state.detailPhotoIdx = 0;
  history.pushState({ view, id: state.detailId }, '');
  render();
  window.scrollTo({ top: 0 });
}

window.addEventListener('popstate', (e) => {
  /*
   * Nel browser il tasto Indietro passa di qui: se c'è qualcosa di aperto
   * sopra la pagina lo chiudo e resto dov'ero, come farebbe un'app.
   * Dentro l'app Android ci pensa il codice nativo, prima ancora di arrivare
   * alla cronologia.
   */
  if (!isAndroidApp && sovrapposizioniAperte()) {
    chiudiSovrapposizione();
    history.pushState({ view: state.view, id: state.detailId }, '');
    return;
  }

  const s = e.state || { view: 'home' };
  state.view = s.view || 'home';
  state.detailId = s.id ?? null;
  render();
});

/* ═══════════════════ Render ═══════════════════ */

function render() {
  ['home', 'deadlines', 'stats', 'settings', 'trash', 'detail'].forEach((v) => {
    $(`#view-${v}`).hidden = v !== state.view;
  });

  const isSub = state.view === 'detail' || state.view === 'trash';
  $('#tabbar').hidden = isSub;
  $('#fab').hidden = isSub;

  $$('#tabbar .tab').forEach((t) => t.classList.toggle('is-active', t.dataset.tab === state.view));

  renderDeadlineAlerts();
  if (state.view === 'home') renderHome();
  if (state.view === 'deadlines') renderDeadlines();
  if (state.view === 'stats') renderStats();
  if (state.view === 'settings') renderSettings();
  if (state.view === 'trash') renderTrash();
  if (state.view === 'detail') renderDetail();
}

/* ── Home ─────────────────────────────────────────────────── */

function renderHome() {
  renderMonths();
  renderChips();
  renderSummary();
  renderFeed();
  // La testata cambia altezza col contenuto (mesi, ricerca aperta):
  // rimisurarla qui evita che `--head-h` resti indietro.
  misuraTestata?.();
}

function renderMonths() {
  const months = [...new Set(liveReceipts().map((r) => monthKey(r.date)).filter(Boolean))]
    .sort().reverse().slice(0, 36);

  const totals = Object.fromEntries(months.map((m) => [
    m, sum(liveReceipts().filter((r) => monthKey(r.date) === m), (r) => r.amount),
  ]));

  const html = [
    `<button class="month ${state.filter.month === 'all' ? 'is-active' : ''}" data-month="all">Tutti<small>${liveReceipts().length} scontrini</small></button>`,
    ...months.map((m) => {
      // "agosto" basta: l'anno si scrive solo se non è quello corrente.
      const [anno] = m.split('-');
      const etichetta = anno === String(new Date().getFullYear())
        ? monthLabel(m).split(' ')[0]
        : monthLabel(m);
      return `
      <button class="month ${state.filter.month === m ? 'is-active' : ''}" data-month="${m}">
        ${esc(etichetta)}<small>${esc(fmtMoneyShort(totals[m], cur()))}</small>
      </button>`;
    }),
  ].join('');

  const box = $('#months');
  box.innerHTML = html;
  box.hidden = liveReceipts().length === 0;
  box.querySelector('.is-active')?.scrollIntoView({ block: 'nearest', inline: 'center' });
}

function renderChips() {
  const live = liveReceipts();
  const counts = {};
  live.forEach((r) => { counts[r.category] = (counts[r.category] || 0) + 1; });
  const favCount = live.filter((r) => r.favorite).length;

  const chips = [
    `<button class="chip ${state.filter.category === 'all' ? 'is-active' : ''}" data-cat="all">Tutte</button>`,
    favCount ? `<button class="chip ${state.filter.category === 'fav' ? 'is-active' : ''}" data-cat="fav"><span class="chip__em">⭐</span>Preferiti</button>` : '',
    ...CATEGORIES.filter((c) => counts[c.id]).map((c) => `
      <button class="chip ${state.filter.category === c.id ? 'is-active' : ''}" data-cat="${c.id}">
        <span class="chip__em">${c.emoji}</span>${esc(c.label)}
      </button>`),
  ].join('');

  $('#category-chips').innerHTML = chips;
  $('.toolbar').hidden = live.length === 0;
  const layoutBtn = $('#btn-layout');
  layoutBtn.dataset.icon = state.settings.layout === 'grid' ? 'list' : 'grid';
  delete layoutBtn.dataset.iconDone;
  hydrateIcons(layoutBtn.parentElement);
}

function renderSummary() {
  const list = filteredReceipts();
  const withAmount = list.filter((r) => r.amount != null);
  const total = sum(withAmount, (r) => r.amount);
  const avg = withAmount.length ? total / withAmount.length : null;
  const mese = state.filter.month;

  $('#summary').hidden = liveReceipts().length === 0;
  $('#summary-label').textContent = state.filter.query
    ? 'Totale dei risultati'
    : (mese === 'all' ? 'Totale archivio' : monthLabel(mese));
  // Il simbolo della valuta è servizio, le cifre sono il messaggio:
  // stesso testo, ma il simbolo più piccolo e più chiaro.
  $('#summary-amount').innerHTML = fmtMoney(total, cur())
    .replace(/[^\d\s., ]+/g, (s) => `<span class="valuta">${s}</span>`);
  $('#summary-count').textContent = `${list.length} ${list.length === 1 ? 'scontrino' : 'scontrini'}`;

  /*
   * Gli scontrini senza importo non entrano nella somma: se sono tanti,
   * il totale sembra completo e non lo è. Meglio dirlo sotto al numero.
   */
  const senza = list.length - withAmount.length;
  const todo = $('#summary-todo');
  todo.hidden = senza === 0;
  todo.textContent = senza === 1 ? '1 senza importo' : `${senza} senza importo`;

  /*
   * Seconda riga: da soli i totali dicono poco, il confronto con il mese
   * prima invece si legge al volo. Sull'archivio intero il paragone non
   * ha senso e resta la media.
   */
  const meta = $('#summary-avg');
  const precedente = mese === 'all' ? null : mesePrecedente(mese);
  const totalePrec = precedente
    ? sum(liveReceipts().filter((r) => monthKey(r.date) === precedente), (r) => r.amount)
    : 0;

  meta.className = 'summary__delta';
  if (precedente && totalePrec > 0 && total > 0) {
    const variazione = Math.round(((total - totalePrec) / totalePrec) * 100);
    if (Math.abs(variazione) < 1) {
      meta.textContent = `come ${monthLabel(precedente).split(' ')[0]}`;
      meta.className = '';
    } else {
      meta.textContent = `${variazione > 0 ? '+' : '−'}${Math.abs(variazione)}% su ${monthLabel(precedente).split(' ')[0]}`;
      meta.classList.add(variazione > 0 ? 'summary__delta--su' : 'summary__delta--giu');
    }
  } else {
    meta.className = '';
    meta.textContent = avg != null ? `media ${fmtMoney(avg, cur())}` : 'importi non indicati';
  }

  renderSpark();
}

/** '2026-08' → '2026-07' */
function mesePrecedente(chiave) {
  const [anno, mese] = chiave.split('-').map(Number);
  const d = new Date(anno, mese - 2, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

/** Sei colonnine: l'andamento recente sotto il totale, senza numeri. */
function renderSpark() {
  const spark = $('#spark');
  const live = liveReceipts();
  spark.hidden = live.length === 0;
  if (!live.length) return;

  const riferimento = state.filter.month === 'all' ? monthKey(todayISO()) : state.filter.month;
  const [anno, mese] = riferimento.split('-').map(Number);

  const mesi = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date(anno, mese - 1 - i, 1);
    const chiave = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    mesi.push({ chiave, totale: sum(live.filter((r) => monthKey(r.date) === chiave), (r) => r.amount) });
  }
  // Con un mese solo non c'è nessun andamento da mostrare.
  if (mesi.filter((m) => m.totale > 0).length < 2) { spark.hidden = true; return; }
  const massimo = Math.max(...mesi.map((m) => m.totale), 1);

  /*
   * Un mese da 60 € accanto a uno da 650 sparirebbe in due pixel: chi
   * guarda non capirebbe se è piccolo o se non c'è. I mesi con qualcosa
   * dentro partono da un'altezza leggibile, quelli vuoti restano un filo.
   */
  const altezza = (t) => (t > 0 ? Math.max(9, Math.round((t / massimo) * 38)) : 2);

  spark.innerHTML = mesi.map((m, i) => `
    <span class="spark__bar ${m.chiave === riferimento ? 'is-now' : ''} ${m.totale > 0 ? '' : 'is-vuoto'}"
          style="height:${altezza(m.totale)}px;animation-delay:${i * 40}ms"
          title="${esc(monthLabel(m.chiave))}: ${esc(fmtMoney(m.totale, cur()))}"></span>`).join('');
}

/** Una voce dell'elenco: scheda con foto oppure riga da estratto conto. */
function receiptCard(r, i) {
  const c = catOf(r.category);
  const delay = `style="animation-delay:${Math.min(i * 20, 240)}ms"`;
  const src = thumbURL(r);
  const importo = r.amount != null ? fmtMoney(r.amount, r.currency || cur()) : '';
  const chip = returnChip(r);

  if (state.settings.layout === 'list') {
    return `
      <button class="row" data-id="${r.id}" ${delay}>
        <span class="row__thumb">${src ? `<img src="${src}" alt="" loading="lazy">` : ''}</span>
        <span class="row__main">
          <span class="row__title">${esc(r.title || 'Scontrino')}</span>
          <span class="row__sub">${c.emoji} ${esc(c.label)} · ${esc(fmtDate(r.date))}${r.photoIds.length > 1 ? ` · ${r.photoIds.length} foto` : ''}</span>
          ${chip ? `<span class="pill pill--${chip.tone} pill--xs">↩️ ${esc(chip.text)}</span>` : ''}
        </span>
        ${r.favorite ? '<span class="card__star" data-icon="starOn" style="position:static"></span>' : ''}
        ${importo
          ? `<span class="row__amount">${esc(importo)}</span>`
          : `<span class="manca" role="button" tabindex="0" data-fill="${r.id}">+ importo</span>`}
      </button>`;
  }

  return `
    <button class="card" data-id="${r.id}" ${delay}>
      <span class="card__img">
        ${src ? `<img src="${src}" alt="Foto di ${esc(r.title || 'scontrino')}" loading="lazy">` : ''}
        ${chip ? `<span class="card__deadline pill pill--${chip.tone} pill--xs">↩️ ${esc(chip.text)}</span>` : ''}
        ${r.favorite ? '<span class="card__star" data-icon="starOn"></span>' : ''}
        ${importo
          ? `<span class="card__amount">${esc(importo)}</span>`
          : `<span class="card__amount manca" role="button" tabindex="0" data-fill="${r.id}">+ importo</span>`}
        ${r.photoIds.length > 1 ? `<span class="card__multi">${r.photoIds.length} 📄</span>` : ''}
      </span>
      <span class="card__body">
        <span class="card__title">${c.emoji} ${esc(r.title || 'Scontrino')}</span>
        <span class="card__date">${esc(fmtDate(r.date))}</span>
      </span>
    </button>`;
}

/** Etichetta con conto alla rovescia, usata nel dettaglio. */
function deadlineTag(r, kind) {
  const date = kind === 'reso' ? r.returnUntil : r.warrantyUntil;
  if (!date) return '';
  const k = DEADLINE_KINDS[kind];
  const st = deadlineStatus(daysLeft(date));
  return `<span class="tag tag--${st.tone}">${k.emoji} ${esc(k.short)} ${esc(k.prep)} ${esc(fmtDate(date))} · ${esc(st.text)}</span>`;
}

/** Avviso compatto sulla card quando il tempo per il reso sta finendo. */
function returnChip(r) {
  if (!r.returnUntil || r.returnDoneAt) return null;
  const days = daysLeft(r.returnUntil);
  if (days > 14 || days < -3) return null;
  const st = deadlineStatus(days);
  const testo = days < 0 ? 'scaduto' : days === 0 ? 'oggi' : days === 1 ? '1 giorno' : `${days} giorni`;
  return { tone: st.tone, text: testo };
}

const _thumbKeys = new Map();
function thumbURL(r) {
  if (!r.thumb) return '';
  const key = `t:${r.id}:${r.updatedAt}`;
  const prev = _thumbKeys.get(r.id);
  if (prev && prev !== key) releaseURL(prev);
  _thumbKeys.set(r.id, key);
  return blobURL(key, r.thumb);
}

function renderFeed() {
  const feed = $('#feed');
  const hasAny = liveReceipts().length > 0;
  const list = filteredReceipts();

  $('#empty').hidden = hasAny;
  $('#results-bar').hidden = !state.filter.query;
  if (state.filter.query) {
    $('#results-bar').textContent = list.length
      ? `${list.length} risultat${list.length === 1 ? 'o' : 'i'} per “${state.filter.query}”, in tutto l'archivio`
      : `Nessuno scontrino per “${state.filter.query}”`;
  }

  if (!hasAny) { feed.innerHTML = ''; return; }

  if (!list.length) {
    feed.innerHTML = `<p class="centered">Nessuno scontrino con questi filtri.<br>Prova a cambiare mese o categoria.</p>`;
    return;
  }

  const wrapCls = state.settings.layout === 'grid' ? 'grid' : 'list';
  let i = 0;
  feed.innerHTML = groupByMonth(list).map(([key, items]) => `
    <div class="feed__month">
      <h3>${key === 'senza-data' ? 'Senza data' : esc(monthLabel(key))}</h3>
      <span>${esc(fmtMoney(sum(items, (r) => r.amount), cur()))}</span>
    </div>
    <div class="${wrapCls}">${items.map((r) => receiptCard(r, i++)).join('')}</div>
  `).join('');

  hydrateIcons(feed);
}

/* ── Dettaglio ────────────────────────────────────────────── */

/**
 * La scheda dei dati: quello che si sa dello scontrino, in righe
 * etichetta/valore. Le righe che non hanno niente da dire non compaiono
 * — così quando c'è poco da leggere la foto si prende lo spazio, e
 * quando c'è molto lo prendono i dati.
 */
function righeDettaglio(r, quante) {
  const righe = [];
  const riga = (etichetta, valore, tono = '') =>
    righe.push(`<div class="dati__riga${tono ? ` dati__riga--${tono}` : ''}">
      <dt>${esc(etichetta)}</dt><dd>${valore}</dd></div>`);

  for (const kind of ['reso', 'garanzia']) {
    const data = kind === 'reso' ? r.returnUntil : r.warrantyUntil;
    if (!data) continue;
    const k = DEADLINE_KINDS[kind];
    if (kind === 'reso' && r.returnDoneAt) {
      riga(`${k.emoji} ${k.short}`, `<b>reso fatto</b> · ${esc(fmtRelative(r.returnDoneAt))}`);
      continue;
    }
    const st = deadlineStatus(daysLeft(data));
    riga(`${k.emoji} ${k.short}`,
      `${esc(fmtDate(data))} <b>${esc(st.text)}</b>`,
      st.tone === 'red' ? 'rosso' : st.tone === 'amber' ? 'ambra' : '');
  }

  if (r.note) riga('Nota', `<span class="dati__nota">${esc(r.note)}</span>`);

  riga('Foto', `${quante === 1 ? '1 pagina' : `${quante} pagine`} <span class="dati__peso" id="detail-peso"></span>`);
  riga('Aggiunto', esc(fmtRelative(r.createdAt)));
  if (r.updatedAt && r.updatedAt - r.createdAt > 60000) riga('Modificato', esc(fmtRelative(r.updatedAt)));

  return righe.join('');
}

/**
 * Se il tempo per il reso è ancora aperto, in cima compare l'unica cosa
 * che serve in quel momento: quanti giorni restano e i due gesti che si
 * fanno davvero — mostrare lo scontrino al negozio, e dire che il reso
 * è stato fatto, così smette di comparire fra le scadenze.
 */
function fasciaReso(r) {
  if (!r.returnUntil) return '';
  const giorni = daysLeft(r.returnUntil);

  if (r.returnDoneAt) {
    return `<div class="azione azione--fatto">
      ${icon('check')}
      <span class="azione__testo"><b>Reso fatto</b> ${esc(fmtRelative(r.returnDoneAt))}</span>
      <button class="azione__btn" data-reso-annulla>Annulla</button>
    </div>`;
  }
  if (giorni < 0) return '';

  const st = deadlineStatus(giorni);
  return `<div class="azione azione--${st.tone === 'red' ? 'ora' : st.tone === 'amber' ? 'presto' : 'calmo'}">
    ${icon('clock')}
    <span class="azione__testo"><b>Puoi ancora renderlo</b> ${esc(st.text)}, entro il ${esc(fmtDate(r.returnUntil))}</span>
    <button class="azione__btn" data-reso-fatto>Fatto</button>
  </div>`;
}

/**
 * I dati in una riga sola, pronti da incollare in una nota spese, in una
 * chat o in un messaggio al negozio.
 */
async function copiaDati(r) {
  const pezzi = [
    r.title || 'Scontrino',
    r.amount != null ? fmtMoney(r.amount, r.currency || cur()) : null,
    fmtDate(r.date),
  ].filter(Boolean);
  try {
    await navigator.clipboard.writeText(pezzi.join(' · '));
    toast('Dati copiati', { icon: 'copy' });
  } catch {
    toastError('Non sono riuscito a copiare');
  }
}

/** Segna il reso come effettuato (o ci ripensa). */
async function segnaReso(r, fatto) {
  r.returnDoneAt = fatto ? Date.now() : null;
  r.updatedAt = Date.now();
  await DB.putReceipt(r);
  haptic();
  await afterChange();
  toast(fatto ? 'Reso segnato come fatto' : 'Reso di nuovo in attesa', { icon: fatto ? 'check' : 'clock' });
}

async function renderDetail() {
  const r = byId(state.detailId);
  const box = $('#detail-body');
  if (!r) { box.innerHTML = '<p class="centered">Scontrino non trovato.</p>'; return; }

  const c = catOf(r.category);
  const quante = r.photoIds.length;

  /*
   * Aprendo uno scontrino si vuole sapere che scontrino è, non guardare
   * una fotografia grande: quello che si sa di lui sta in cima e nella
   * scheda dei dati, la foto è la prova e prende lo spazio che avanza —
   * un tocco e si apre a schermo intero, dove leggerla ha senso.
   */
  box.innerHTML = `
    <div class="detail__nav">
      <button class="iconbtn" data-back aria-label="Indietro">${icon('back')}</button>
      <span class="spacer"></span>
      <button class="iconbtn" data-fav aria-label="Preferito">${icon(r.favorite ? 'starOn' : 'star')}</button>
      <button class="iconbtn" data-more aria-label="Altre azioni">${icon('more')}</button>
    </div>

    <div class="detail__head">
      ${r.amount != null
        ? `<div class="detail__amount">${esc(fmtMoney(r.amount, r.currency || cur())).replace(/[^\d\s., ]+/g, (x) => `<span class="valuta">${x}</span>`)}</div>`
        : `<button class="detail__amount detail__amount--manca" data-edit-amount>+ aggiungi importo</button>`}
      <div class="detail__title">${esc(r.title || 'Scontrino')}</div>
      <div class="detail__meta">
        <span>${c.emoji} ${esc(c.label)}</span>
        <span class="dot" aria-hidden="true"></span>
        <span>${esc(fmtDate(r.date, 'long'))}</span>
      </div>
    </div>

    ${fasciaReso(r)}

    <button class="detail__hero" data-zoom aria-label="Apri la foto a schermo intero">
      <img id="detail-photo" alt="Foto dello scontrino" src="${thumbURL(r)}">
      <span class="detail__zoom">${icon('zoom')}</span>
      ${quante > 1 ? `<span class="detail__count">1 / ${quante}</span>` : ''}
    </button>

    <div class="detail__gallery" id="detail-gallery" hidden></div>

    <div class="detail__info">
      <dl class="dati">${righeDettaglio(r, quante)}</dl>

      <div class="detail__actions">
        <button class="btn" data-edit>${icon('edit')} Modifica</button>
        <button class="btn" data-share>${icon('share')} Condividi</button>
      </div>
    </div>`;

  hydrateIcons(box);

  // foto a piena risoluzione
  const photos = await DB.getPhotos(r.photoIds);
  const urls = photos.map((p) => blobURL(`p:${p.id}`, p.blob));
  const imgEl = $('#detail-photo', box);
  if (urls[0]) imgEl.src = urls[0];

  // il peso si sa solo dopo aver letto le foto: arriva nella sua riga
  const peso = $('#detail-peso', box);
  if (peso) peso.textContent = `· ${fmtBytes(sum(photos, (p) => p.blob?.size || 0))}`;

  const contatore = $('.detail__count', box);
  if (urls.length > 1) {
    const gal = $('#detail-gallery', box);
    gal.hidden = false;
    gal.innerHTML = urls.map((u, i) => `<img src="${u}" alt="Foto ${i + 1}" class="${i === 0 ? 'is-active' : ''}" data-idx="${i}">`).join('');
    gal.addEventListener('click', (e) => {
      const img = e.target.closest('[data-idx]');
      if (!img) return;
      state.detailPhotoIdx = Number(img.dataset.idx);
      imgEl.src = urls[state.detailPhotoIdx];
      if (contatore) contatore.textContent = `${state.detailPhotoIdx + 1} / ${urls.length}`;
      $$('#detail-gallery img', box).forEach((n) => n.classList.toggle('is-active', n === img));
    });
  }

  $('[data-zoom]', box).addEventListener('click', () => {
    if (urls.length) openViewer(urls[state.detailPhotoIdx] || urls[0], r.title || 'Scontrino');
  });
  $('[data-back]', box).addEventListener('click', () => history.back());
  $('[data-edit]', box).addEventListener('click', () => openEditor({ receipt: r }));
  $('[data-edit-amount]', box)?.addEventListener('click', () => openEditor({ receipt: r, focus: 'amount' }));
  $('[data-reso-fatto]', box)?.addEventListener('click', () => segnaReso(r, true));
  $('[data-reso-annulla]', box)?.addEventListener('click', () => segnaReso(r, false));
  $('[data-fav]', box).addEventListener('click', () => toggleFavorite(r));
  $('[data-share]', box).addEventListener('click', () => shareReceipt(r, photos));
  $('[data-more]', box).addEventListener('click', () => openActionSheet(r.title || 'Scontrino', [
    { icon: 'image', label: quante > 1 ? `${quante} foto` : '1 foto',
      hint: `Aggiunto ${fmtRelative(r.createdAt)}`, onClick: () => openEditor({ receipt: r }) },
    { icon: 'copy', label: 'Copia i dati', hint: 'Negozio, importo e data, da incollare altrove', onClick: () => copiaDati(r) },
    { icon: 'download', label: 'Salva le foto sul dispositivo', hint: 'I file JPEG originali', onClick: () => downloadPhotos(r, photos) },
    { icon: 'copy', label: 'Duplica scontrino', hint: 'Utile per spese ricorrenti', onClick: () => duplicateReceipt(r, photos) },
    { icon: 'trash', label: 'Sposta nel cestino', danger: true, onClick: () => trashReceipt(r, true) },
  ]));
}

/* ── Statistiche ──────────────────────────────────────────── */

let statsRange = 'month';

function renderStats() {
  $$('#stats-range button').forEach((b) => b.classList.toggle('is-active', b.dataset.range === statsRange));

  const now = new Date();
  const thisMonth = monthKey(todayISO());
  const thisYear = String(now.getFullYear());

  const list = liveReceipts().filter((r) => {
    if (statsRange === 'month') return monthKey(r.date) === thisMonth;
    if (statsRange === 'year') return String(r.date || '').startsWith(thisYear);
    return true;
  });

  const body = $('#stats-body');
  if (!liveReceipts().length) {
    body.innerHTML = `<p class="centered">Ancora nessun dato.<br>Aggiungi il primo scontrino e qui vedrai i tuoi totali.</p>`;
    return;
  }

  const withAmount = list.filter((r) => r.amount != null);
  const total = sum(withAmount, (r) => r.amount);
  const avg = withAmount.length ? total / withAmount.length : 0;
  const top = [...withAmount].sort((a, b) => b.amount - a.amount)[0];

  // ultimi 12 mesi
  const months = [];
  for (let i = 11; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    months.push({ key, label: MONTHS_SHORT[d.getMonth()], total: sum(liveReceipts().filter((r) => monthKey(r.date) === key), (r) => r.amount) });
  }
  const maxMonth = Math.max(...months.map((m) => m.total), 1);

  // per categoria
  const perCat = CATEGORIES.map((c) => ({
    ...c,
    total: sum(list.filter((r) => r.category === c.id), (r) => r.amount),
    count: list.filter((r) => r.category === c.id).length,
  })).filter((c) => c.count).sort((a, b) => b.total - a.total);
  const maxCat = Math.max(...perCat.map((c) => c.total), 1);

  const rangeLabel = statsRange === 'month' ? 'questo mese' : statsRange === 'year' ? `nel ${thisYear}` : 'in totale';

  body.innerHTML = `
    <div class="panel"><div class="panel__body">
      <div class="bigstat">
        <b>${esc(fmtMoney(total, cur()))}</b>
        <small>spesi ${rangeLabel} · ${list.length} ${list.length === 1 ? 'scontrino' : 'scontrini'}</small>
      </div>
      <div class="statgrid">
        <div><b>${esc(fmtMoney(avg, cur()))}</b><small>scontrino medio</small></div>
        <div><b>${esc(top ? fmtMoney(top.amount, cur()) : '—')}</b><small>${esc(top ? `il più caro · ${top.title || 'senza nome'}` : 'il più caro')}</small></div>
      </div>
    </div></div>

    <div class="panel__title">Andamento ultimi 12 mesi</div>
    <div class="panel"><div class="panel__body">
      <div class="chart">
        ${months.map((m, i) => `
          <div class="chart__col">
            <div class="chart__bar ${m.key === thisMonth ? 'is-current' : ''}"
                 style="height:${Math.max(3, Math.round((m.total / maxMonth) * 104))}px;animation-delay:${i * 35}ms"
                 title="${esc(monthLabel(m.key))}: ${esc(fmtMoney(m.total, cur()))}"></div>
            <div class="chart__lbl">${m.label}</div>
          </div>`).join('')}
      </div>
    </div></div>

    <div class="panel__title">Dove vanno i soldi (${rangeLabel})</div>
    <div class="panel"><div class="panel__body">
      ${perCat.length ? `<div class="breakdown">${perCat.map((c, i) => `
        <div class="bd">
          <div class="bd__top">
            <span>${c.emoji}</span><b>${esc(c.label)}</b>
            <span>${esc(fmtMoney(c.total, cur()))}</span>
          </div>
          <div class="bd__track"><div class="bd__fill" style="width:${(c.total / maxCat) * 100}%;animation-delay:${i * 45}ms"></div></div>
        </div>`).join('')}</div>` : '<p class="centered">Nessun importo indicato in questo periodo.</p>'}
    </div></div>`;

  hydrateIcons(body);
}

/* ── Scadenze (resi, cambi, garanzia) ─────────────────────── */

let deadlineFilter = 'tutte';

/** Una voce per ogni scadenza impostata, ordinata dalla più imminente. */
function deadlineEntries(kind = 'tutte') {
  const out = [];
  for (const r of liveReceipts()) {
    // Un reso già fatto non è più una scadenza: smette di comparire
    // fra gli avvisi, che altrimenti chiamerebbero a vuoto.
    if (kind !== 'garanzia' && r.returnUntil && !r.returnDoneAt) {
      out.push({ receipt: r, kind: 'reso', date: r.returnUntil, days: daysLeft(r.returnUntil) });
    }
    if (kind !== 'reso' && r.warrantyUntil) {
      out.push({ receipt: r, kind: 'garanzia', date: r.warrantyUntil, days: daysLeft(r.warrantyUntil) });
    }
  }
  return out.sort((a, b) => a.days - b.days);
}

/** Quante scadenze incombono: alimenta il pallino sulla scheda. */
function urgentCount() {
  return deadlineEntries().filter((e) => e.days >= 0 && e.days <= 7).length;
}

const DEADLINE_SECTIONS = [
  { id: 'scaduti',  title: 'Scaduti di recente', test: (d) => d < 0 && d >= -60 },
  { id: 'ora',      title: 'Oggi e domani',      test: (d) => d >= 0 && d <= 1 },
  { id: 'settimana',title: 'Entro una settimana',test: (d) => d > 1 && d <= 7 },
  { id: 'mese',     title: 'Entro un mese',      test: (d) => d > 7 && d <= 30 },
  { id: 'dopo',     title: 'Più avanti',         test: (d) => d > 30 },
];

function deadlineRow(entry) {
  const r = entry.receipt;
  const k = DEADLINE_KINDS[entry.kind];
  const st = deadlineStatus(entry.days);
  return `
    <button class="row" data-id="${r.id}">
      <span class="row__thumb">${r.thumb ? `<img src="${thumbURL(r)}" alt="" loading="lazy">` : ''}</span>
      <span class="row__main">
        <span class="row__title">${esc(r.title || 'Scontrino')}</span>
        <span class="row__sub">${k.emoji} ${esc(k.short)} ${esc(k.prep)} ${esc(fmtDate(entry.date))}${r.amount != null ? ` · ${esc(fmtMoney(r.amount, r.currency || cur()))}` : ''}</span>
      </span>
      <span class="pill pill--${st.tone}">${esc(st.text)}</span>
    </button>`;
}

function renderDeadlines() {
  $$('#deadlines-filter button').forEach((b) => b.classList.toggle('is-active', b.dataset.kind === deadlineFilter));

  const body = $('#deadlines-body');
  const entries = deadlineEntries(deadlineFilter);

  if (!entries.length) {
    body.innerHTML = `
      <div class="empty" style="padding:34px 20px">
        <div class="empty__art" style="width:120px;height:110px">
          <svg viewBox="0 0 160 140" fill="none">
            <circle cx="80" cy="70" r="46" class="e-paper2"/>
            <path d="M80 42v30l20 12" class="e-line"/>
          </svg>
        </div>
        <h2>Nessuna scadenza impostata</h2>
        <p>Quando salvi uno scontrino attiva <b>Reso o cambio entro</b>: qui vedrai quanti giorni ti restano per cambiare o restituire.</p>
      </div>`;
    return;
  }

  const urgenti = entries.filter((e) => e.days >= 0 && e.days <= 7).length;
  const scaduti = entries.filter((e) => e.days < 0).length;

  body.innerHTML = `
    <div class="panel"><div class="panel__body">
      <div class="statgrid">
        <div><b>${urgenti}</b><small>in scadenza entro 7 giorni</small></div>
        <div><b>${entries.filter((e) => e.days >= 0).length}</b><small>ancora validi</small></div>
      </div>
      ${urgenti ? `<div class="note note--warn">${icon('warn')}<div><b>Ultimi giorni</b>${urgenti === 1 ? `C'è uno scontrino` : `Ci sono ${urgenti} scontrini`} con il tempo quasi finito: dopo la data non puoi più fare reso o cambio.</div></div>` : ''}
      ${!urgenti && !scaduti ? `<div class="note">${icon('check')}<div><b>Tutto tranquillo</b>Nessuna scadenza nei prossimi sette giorni.</div></div>` : ''}
    </div></div>

    ${DEADLINE_SECTIONS.map((sec) => {
      const items = entries.filter((e) => sec.test(e.days));
      if (!items.length) return '';
      return `
        <div class="panel__title">${esc(sec.title)} · ${items.length}</div>
        <div class="list">${items.map(deadlineRow).join('')}</div>`;
    }).join('')}`;

  hydrateIcons(body);
  body.onclick = (e) => {
    const row = e.target.closest('[data-id]');
    if (row) go('detail', { id: row.dataset.id });
  };
}

/** Pallino sulla scheda Scadenze + fascia di avviso in cima alla home. */
function renderDeadlineAlerts() {
  const badge = $('#tab-badge');
  const count = urgentCount();
  badge.hidden = count === 0;
  badge.textContent = count > 9 ? '9+' : String(count);

  const bar = $('#alertbar');
  const imminenti = deadlineEntries().filter((e) => e.days >= 0 && e.days <= 3);
  if (!imminenti.length) { bar.hidden = true; return; }

  const first = imminenti[0];
  const st = deadlineStatus(first.days);
  bar.hidden = false;
  bar.innerHTML = imminenti.length === 1
    ? `${icon('clock')}<span><b>${esc(DEADLINE_KINDS[first.kind].short)} ${esc(st.text)}</b> · ${esc(first.receipt.title || 'Scontrino')}</span>${icon('chevron')}`
    : `${icon('clock')}<span><b>${imminenti.length} scadenze imminenti</b> · ultimi giorni per resi e cambi</span>${icon('chevron')}`;
  hydrateIcons(bar);
}

/* ── Impostazioni ─────────────────────────────────────────── */

async function renderSettings() {
  const body = $('#settings-body');
  const { usage, quota } = await storageEstimate();
  const persisted = await isPersisted();
  const trashCount = trashedReceipts().length;
  const photoCount = sum(liveReceipts(), (r) => r.photoIds.length);
  const neverBackedUp = !state.lastBackupAt;
  const backupStale = !neverBackedUp && Date.now() - state.lastBackupAt > 30 * 86400000;
  const showBackupNote = liveReceipts().length >= 2 && (neverBackedUp || backupStale);

  const themeBtn = (id, label, ic) =>
    `<button data-theme-opt="${id}" class="${state.settings.theme === id ? 'is-active' : ''}">${label}</button>`;

  body.innerHTML = `
    ${showBackupNote ? `
      <div class="note ${backupStale ? 'note--warn' : ''}">
        ${icon(backupStale ? 'warn' : 'shield')}
        <div><b>${backupStale ? 'Il backup è vecchio' : 'Fai il primo backup'}</b>Le foto vivono solo su questo dispositivo. Esporta il backup e mettilo al sicuro: cloud, computer o chiavetta.</div>
      </div>` : ''}

    <div class="panel__title">Sicurezza dei dati</div>
    <div class="panel">
      <button class="item" data-act="export">
        ${icon('download')}
        <span class="item__text"><b>Esporta backup</b><small>Un unico file .zip con foto, dati e un CSV leggibile${state.lastBackupAt ? ` · ultimo: ${esc(fmtRelative(state.lastBackupAt))}` : ''}</small></span>
        ${icon('chevron')}
      </button>
      <button class="item" data-act="import">
        ${icon('upload')}
        <span class="item__text"><b>Ripristina da backup</b><small>Aggiunge gli scontrini mancanti, senza duplicare</small></span>
        ${icon('chevron')}
      </button>
      <button class="item" data-act="persist">
        ${icon('shield')}
        <span class="item__text"><b>Archiviazione protetta</b><small>${persisted ? 'Attiva: il browser non cancellerà i tuoi dati' : 'Chiedi al browser di non liberare mai questo spazio'}</small></span>
        <span class="item__end">${persisted ? '✓ Attiva' : 'Attiva'}</span>
      </button>
      <button class="item" data-act="trash">
        ${icon('trash')}
        <span class="item__text"><b>Cestino</b><small>Recupera quello che hai eliminato per sbaglio</small></span>
        <span class="item__end">${trashCount || ''} ${icon('chevron')}</span>
      </button>
    </div>

    <div class="panel__title">Aspetto</div>
    <div class="panel"><div class="panel__body">
      <div class="segmented" id="theme-seg">
        ${themeBtn('auto', 'Automatico')}${themeBtn('light', 'Chiaro')}${themeBtn('dark', 'Scuro')}
      </div>
    </div></div>

    <div class="panel__title">Preferenze</div>
    <div class="panel">
      <button class="item" data-act="currency">
        ${icon('euro')}
        <span class="item__text"><b>Valuta</b><small>Usata per totali e statistiche</small></span>
        <span class="item__end">${esc(state.settings.currency)} ${icon('chevron')}</span>
      </button>
      <button class="item" data-act="quality">
        ${icon('camera')}
        <span class="item__text"><b>Qualità foto</b><small>${esc(QUALITY_PRESETS[state.settings.quality].hint)}</small></span>
        <span class="item__end">${esc(QUALITY_PRESETS[state.settings.quality].label)} ${icon('chevron')}</span>
      </button>
      ${state.installPrompt ? `
      <button class="item" data-act="install">
        ${icon('sparkle')}
        <span class="item__text"><b>Installa sul telefono</b><small>Si apre come una vera app, anche senza rete</small></span>
        ${icon('chevron')}
      </button>` : ''}
    </div>

    <div class="panel__title">Spazio occupato</div>
    <div class="panel"><div class="panel__body">
      <div class="bigstat"><b>${esc(fmtBytes(usage))}</b><small>${liveReceipts().length} scontrini · ${photoCount} foto${quota ? ` · disponibili circa ${esc(fmtBytes(quota))}` : ''}</small></div>
      ${quota ? `<div class="progress"><div class="progress__fill" style="width:${Math.min(100, (usage / quota) * 100).toFixed(1)}%"></div></div>` : ''}
      <button class="btn btn--danger btn--block" data-act="wipe">${icon('trash')} Elimina tutti i dati</button>
    </div></div>

    <div class="note">
      ${icon('lock')}
      <div><b>Privacy totale</b>Foto e importi restano dentro questo dispositivo: nessun account, nessun caricamento su internet. Per questo il backup è importante.</div>
    </div>

    <p class="centered" style="padding:8px 0 0;font-size:13px">
      Invoice Wallet v${APP_VERSION}${isAndroidApp ? ` · app Android ${esc(androidVersion())}` : ''}
    </p>`;

  hydrateIcons(body);

}

/*
 * I tocchi delle impostazioni si ascoltano una volta sola, qui.
 * `#settings-body` resta lo stesso elemento a ogni disegno: attaccare
 * l'ascoltatore dentro renderSettings ne aggiungeva uno per ogni
 * modifica, e al secondo cambio di qualità si aprivano due schede
 * sovrapposte — la prima invisibile, ma con il suo velo che si mangiava
 * i tocchi.
 */
function wireSettingsEvents() {
  $('#settings-body').addEventListener('click', async (e) => {
    const tema = e.target.closest('[data-theme-opt]');
    if (tema) {
      await saveSettings({ theme: tema.dataset.themeOpt });
      renderSettings();
      return;
    }
    const btn = e.target.closest('[data-act]');
    if (btn) settingsAction(btn.dataset.act);
  });
}

function settingsAction(act) {
  switch (act) {
    case 'export':  return exportBackup();
    case 'import':  return $('#input-restore').click();
    case 'trash':   return go('trash');
    case 'persist': return enablePersistence();
    case 'install': return promptInstall();
    case 'wipe':    return wipeEverything();
    case 'currency':
      return openActionSheet('Valuta', CURRENCIES.map((code) => ({
        icon: state.settings.currency === code ? 'check' : 'euro',
        label: `${code} (${symbolOf(code)})`,
        onClick: async () => { await saveSettings({ currency: code }); renderSettings(); },
      })));
    case 'quality':
      return openActionSheet('Qualità delle foto', Object.entries(QUALITY_PRESETS).map(([id, p]) => ({
        icon: state.settings.quality === id ? 'check' : 'camera',
        label: p.label, hint: p.hint,
        onClick: async () => { await saveSettings({ quality: id }); renderSettings(); },
      })));
  }
}

/* ── Cestino ──────────────────────────────────────────────── */

function renderTrash() {
  const body = $('#trash-body');
  const list = trashedReceipts();

  if (!list.length) {
    body.innerHTML = `<p class="centered">Il cestino è vuoto.<br>Qui finiscono gli scontrini eliminati: hai 30 giorni per ripensarci.</p>`;
    return;
  }

  body.innerHTML = `
    <div class="list">
      ${list.map((r) => {
        const left = 30 - Math.floor((Date.now() - r.deletedAt) / 86400000);
        return `
        <div class="row">
          <span class="row__thumb">${r.thumb ? `<img src="${thumbURL(r)}" alt="">` : ''}</span>
          <span class="row__main">
            <span class="row__title">${esc(r.title || 'Scontrino')}</span>
            <span class="row__sub">${esc(fmtDate(r.date))} · elimina fra ${left} giorn${left === 1 ? 'o' : 'i'}</span>
          </span>
          <button class="iconbtn iconbtn--sm" data-restore="${r.id}" aria-label="Ripristina">${icon('restore')}</button>
          <button class="iconbtn iconbtn--sm" data-purge="${r.id}" aria-label="Elimina per sempre">${icon('trash')}</button>
        </div>`;
      }).join('')}
    </div>
    <button class="btn btn--danger btn--block btn--marg" data-empty-trash>${icon('trash')} Svuota il cestino</button>`;

  hydrateIcons(body);

  body.onclick = async (e) => {
    const restore = e.target.closest('[data-restore]');
    const purge = e.target.closest('[data-purge]');
    if (restore) {
      await DB.restoreReceipt(restore.dataset.restore);
      await loadReceipts();
      render();
      toast('Scontrino ripristinato');
      return;
    }
    if (purge) {
      const ok = await confirmDialog({
        title: 'Eliminare per sempre?',
        text: 'La foto verrà cancellata definitivamente da questo dispositivo. Non si può annullare.',
        confirmLabel: 'Elimina', danger: true,
      });
      if (!ok) return;
      await DB.purgeReceipt(purge.dataset.purge);
      await loadReceipts();
      render();
      return;
    }
    if (e.target.closest('[data-empty-trash]')) {
      const ok = await confirmDialog({
        title: 'Svuotare il cestino?',
        text: `${list.length} scontrini verranno cancellati definitivamente.`,
        confirmLabel: 'Svuota', danger: true,
      });
      if (!ok) return;
      for (const r of list) await DB.purgeReceipt(r.id);
      await loadReceipts();
      render();
      toast('Cestino svuotato');
    }
  };
}

/* ═══════════════════ Aggiunta scontrini ═══════════════════ */

function startAdd() {
  haptic();
  openActionSheet('Nuovo scontrino', [
    { icon: 'camera', label: 'Scatta una foto', hint: 'Apre la fotocamera', onClick: () => $('#input-camera').click() },
    { icon: 'image', label: 'Scegli dalla galleria', hint: 'Anche più foto insieme', onClick: () => $('#input-gallery').click() },
  ]);
}

async function handleFiles(files, { fromCamera = false } = {}) {
  const images = [...files].filter((f) => f.type.startsWith('image/'));
  if (!images.length) return;

  const closeToast = toast(`Preparo ${images.length > 1 ? `${images.length} foto` : 'la foto'}…`, { icon: 'camera', duration: 60000 });
  let processed = [];
  try {
    processed = await Promise.all(images.map(async (file) => {
      const { blob, thumb, width, height } = await processPicture(file, state.settings.quality);
      return { id: uid(), blob, thumb, width, height, createdAt: Date.now(), isNew: true };
    }));
  } catch (err) {
    console.error(err);
    closeToast();
    toastError('Non sono riuscito a leggere la foto. Riprova.');
    return;
  }
  closeToast();

  const letto = await provaLettura(processed[0]);

  if (processed.length > 1 && !fromCamera) {
    openActionSheet(`${processed.length} foto selezionate`, [
      {
        icon: 'receipt', label: 'Sono un unico scontrino',
        hint: 'Più pagine dello stesso documento',
        onClick: () => openEditor({ photos: processed, suggerimenti: letto }),
      },
      {
        icon: 'grid', label: `Sono ${processed.length} scontrini diversi`,
        hint: 'Li salvo subito, i dettagli li aggiungi dopo',
        onClick: () => quickSaveMany(processed),
      },
    ]);
    return;
  }

  openEditor({ photos: processed, suggerimenti: letto });
}

/**
 * Legge lo scontrino con il riconoscimento del testo, se disponibile.
 * Un fallimento non deve mai fermare il salvataggio: al massimo si compila a mano.
 */
async function provaLettura(foto) {
  if (!foto || !ocrDisponibile()) return null;
  const chiudi = toast('Leggo lo scontrino…', { icon: 'sparkle', duration: 30000 });
  try {
    const letto = await leggiScontrino(foto.blob);
    chiudi();
    return letto && (letto.amount != null || letto.date || letto.title) ? letto : null;
  } catch (err) {
    console.warn('lettura non riuscita:', err);
    chiudi();
    return null;
  }
}

async function quickSaveMany(photos) {
  const now = Date.now();
  for (const p of photos) {
    const id = uid();
    const receipt = {
      id, title: '', amount: null, currency: cur(), date: todayISO(),
      category: 'altro', note: '', photoIds: [p.id], thumb: p.thumb,
      favorite: false, warrantyUntil: null, warrantyYears: null,
      returnUntil: null, returnDays: null, createdAt: now, updatedAt: now,
    };
    await DB.saveReceiptWithPhotos(receipt, [{ id: p.id, receiptId: id, blob: p.blob, width: p.width, height: p.height, createdAt: now }]);
  }
  await afterChange();
  toast(`${photos.length} scontrini salvati`, { icon: 'check' });
  requestPersistence();
}

/* ── Editor ───────────────────────────────────────────────── */

async function openEditor({ receipt = null, photos = null, suggerimenti = null, focus = null }) {
  let working = photos;
  if (!working && receipt) {
    const saved = await DB.getPhotos(receipt.photoIds);
    working = saved.map((p) => ({ ...p, isNew: false }));
  }
  working = working || [];

  // I suggerimenti valgono solo sui campi ancora vuoti: quello che hai
  // scritto tu non viene mai sovrascritto.
  const proposto = suggerimenti || {};
  const draft = {
    amount: receipt?.amount ?? proposto.amount ?? null,
    title: receipt?.title || proposto.title || '',
    date: receipt?.date || proposto.date || todayISO(),
    category: receipt?.category || proposto.category || 'altro',
    note: receipt?.note || '',
    favorite: !!receipt?.favorite,
    warrantyUntil: receipt?.warrantyUntil || null,
    returnUntil: receipt?.returnUntil || null,
    // Scorciatoia scelta (es. 30 giorni, 2 anni): serve a ricalcolare la
    // scadenza quando cambia la data dello scontrino.
    returnDays: receipt?.returnDays ?? presetDaDate(receipt?.date, receipt?.returnUntil, 'days'),
    warrantyYears: receipt?.warrantyYears ?? presetDaDate(receipt?.date, receipt?.warrantyUntil, 'years'),
  };

  const compilati = [
    proposto.amount != null && 'importo',
    proposto.title && 'negozio',
    proposto.date && 'data',
  ].filter(Boolean);

  const body = `
    ${compilati.length ? `
      <div class="note">
        ${icon('sparkle')}
        <div><b>Letto dallo scontrino</b>Ho compilato ${esc(compilati.join(', '))}. Controlla che sia giusto: correggere è normale.</div>
      </div>` : ''}

    <div class="field">
      <label>Importo</label>
      <div class="amount-field">
        <span>${symbolOf(cur())}</span>
        <input id="f-amount" inputmode="decimal" placeholder="0,00" value="${draft.amount != null ? String(draft.amount).replace('.', ',') : ''}">
      </div>
    </div>

    <div class="field">
      <label>Dove / cosa</label>
      <input class="input" id="f-title" placeholder="Es. Supermercato, benzina, farmacia…" value="${esc(draft.title)}" enterkeyhint="done">
    </div>

    <div class="field">
      <label>Data</label>
      <input class="input" type="date" id="f-date" value="${esc(draft.date)}" max="2100-12-31">
    </div>

    <div class="field">
      <label>Categoria</label>
      <div class="catgrid" id="f-cats">
        ${CATEGORIES.map((c) => `
          <button type="button" class="cat ${c.id === draft.category ? 'is-active' : ''}" data-cat="${c.id}">
            <span>${c.emoji}</span>${esc(c.label)}
          </button>`).join('')}
      </div>
    </div>

    <div class="field">
      <label>Foto</label>
      <div class="photostrip" id="f-photos"></div>
      ${ocrDisponibile() ? `
        <button type="button" class="btn btn--ghost btn--block" id="f-rileggi" style="margin-top:4px">
          ${icon('sparkle')} Compila leggendo la foto
        </button>` : ''}
    </div>

    <div class="field">
      <label>Nota</label>
      <textarea class="textarea" id="f-note" placeholder="Numero ordine, cosa hai comprato, con chi eri…">${esc(draft.note)}</textarea>
    </div>

    <div class="switchrow" id="f-fav-row">
      <div class="switchrow__text"><b>⭐ Preferito</b><small>Per ritrovarlo al volo</small></div>
      <div class="switch ${draft.favorite ? 'is-on' : ''}" id="f-fav" role="switch" aria-checked="${draft.favorite}"></div>
    </div>

    <div class="switchrow" id="f-ret-row">
      <div class="switchrow__text"><b>↩️ Reso o cambio entro</b><small>Ti avviso nella scheda Scadenze</small></div>
      <div class="switch ${draft.returnUntil ? 'is-on' : ''}" id="f-ret" role="switch" aria-checked="${!!draft.returnUntil}"></div>
    </div>
    <div class="field" id="f-ret-wrap" ${draft.returnUntil ? '' : 'hidden'}>
      <div class="quickdates" id="f-ret-quick">
        ${[8, 14, 30, 60].map((d) => `
          <button type="button" data-days="${d}" class="${draft.returnDays === d ? 'is-active' : ''}">${d} giorni</button>`).join('')}
      </div>
      <input class="input" type="date" id="f-return" value="${esc(draft.returnUntil || '')}">
    </div>

    <div class="switchrow" id="f-war-row">
      <div class="switchrow__text"><b>🛡️ Garanzia fino al</b><small>Per legge di solito 2 anni</small></div>
      <div class="switch ${draft.warrantyUntil ? 'is-on' : ''}" id="f-war" role="switch" aria-checked="${!!draft.warrantyUntil}"></div>
    </div>
    <div class="field" id="f-war-wrap" ${draft.warrantyUntil ? '' : 'hidden'}>
      <div class="quickdates" id="f-war-quick">
        ${[1, 2, 3, 5].map((y) => `
          <button type="button" data-years="${y}" class="${draft.warrantyYears === y ? 'is-active' : ''}">${y} ${y === 1 ? 'anno' : 'anni'}</button>`).join('')}
      </div>
      <input class="input" type="date" id="f-warranty" value="${esc(draft.warrantyUntil || '')}">
    </div>`;

  const footer = `
    <button class="btn" data-cancel>Annulla</button>
    <button class="btn btn--primary" data-save>${icon('check')} ${receipt ? 'Aggiorna' : 'Salva'}</button>`;

  const close = openSheet({
    title: receipt ? 'Modifica scontrino' : 'Nuovo scontrino',
    body, footer,
    onMount(sheet) {
      // Chi arriva qui da «+ importo» vuole scrivere una cifra e basta:
      // gli si apre il campo con la tastiera già pronta.
      if (focus === 'amount') {
        setTimeout(() => { const f = $('#f-amount', sheet); f?.focus(); f?.select(); }, 320);
      }

      const strip = $('#f-photos', sheet);

      const drawStrip = () => {
        strip.innerHTML = working.map((p, i) => `
          <div class="photostrip__item">
            <img src="${blobURL(`p:${p.id}`, p.blob)}" alt="Foto ${i + 1}">
            <button type="button" class="photostrip__del" data-del="${i}" aria-label="Rimuovi foto">${icon('close')}</button>
          </div>`).join('') + `
          <button type="button" class="photostrip__add" data-add>${icon('plus')}Aggiungi</button>`;
        hydrateIcons(strip);
      };
      drawStrip();

      strip.addEventListener('click', (e) => {
        const del = e.target.closest('[data-del]');
        if (del) {
          working.splice(Number(del.dataset.del), 1);
          drawStrip();
          return;
        }
        if (e.target.closest('[data-add]')) {
          pendingEditorAdd = (extra) => { working = working.concat(extra); drawStrip(); };
          openActionSheet('Aggiungi foto', [
            { icon: 'camera', label: 'Scatta una foto', onClick: () => $('#input-camera').click() },
            { icon: 'image', label: 'Scegli dalla galleria', onClick: () => $('#input-gallery').click() },
          ]);
        }
      });

      $('#f-cats', sheet).addEventListener('click', (e) => {
        const btn = e.target.closest('[data-cat]');
        if (!btn) return;
        draft.category = btn.dataset.cat;
        $$('#f-cats .cat', sheet).forEach((b) => b.classList.toggle('is-active', b === btn));
        haptic(8);
      });

      const favSw = $('#f-fav', sheet);
      $('#f-fav-row', sheet).addEventListener('click', () => {
        draft.favorite = !draft.favorite;
        favSw.classList.toggle('is-on', draft.favorite);
        favSw.setAttribute('aria-checked', draft.favorite);
      });

      /*
       * Scadenze. La scorciatoia scelta ("30 giorni", "2 anni") resta
       * memorizzata: se poi correggi la data dello scontrino, la scadenza
       * si sposta con lei invece di restare ferma su un calcolo vecchio.
       * Una data scritta a mano invece non viene mai toccata.
       */
      const purchaseDate = () => $('#f-date', sheet).value || todayISO();
      const deadlines = [];

      const setupDeadline = ({ rowId, switchId, wrapId, quickId, inputId, unit, fallback, preset }) => {
        const sw = $(switchId, sheet);
        const wrap = $(wrapId, sheet);
        const input = $(inputId, sheet);
        const quick = $(quickId, sheet);
        const state = { sw, input, quick, unit, preset };

        const applyPreset = (value) => {
          state.preset = value;
          input.value = unit === 'days'
            ? shiftDays(purchaseDate(), value)
            : shiftYears(purchaseDate(), value);
          $$(`${quickId} button`, sheet).forEach((b) => b.classList.toggle(
            'is-active', Number(b.dataset.days ?? b.dataset.years) === value));
        };
        state.applyPreset = applyPreset;

        $(rowId, sheet).addEventListener('click', () => {
          const on = !sw.classList.contains('is-on');
          sw.classList.toggle('is-on', on);
          sw.setAttribute('aria-checked', on);
          wrap.hidden = !on;
          if (on && !input.value) applyPreset(fallback);
          haptic(8);
        });

        quick.addEventListener('click', (e) => {
          const btn = e.target.closest('[data-days], [data-years]');
          if (!btn) return;
          applyPreset(Number(btn.dataset.days ?? btn.dataset.years));
          haptic(8);
        });

        // Data scelta a mano: da quel momento comanda quella.
        input.addEventListener('input', () => {
          state.preset = null;
          $$(`${quickId} button`, sheet).forEach((b) => b.classList.remove('is-active'));
        });

        deadlines.push(state);
        return state;
      };

      const ret = setupDeadline({
        rowId: '#f-ret-row', switchId: '#f-ret', wrapId: '#f-ret-wrap',
        quickId: '#f-ret-quick', inputId: '#f-return',
        unit: 'days', fallback: 30, preset: draft.returnDays,
      });
      const war = setupDeadline({
        rowId: '#f-war-row', switchId: '#f-war', wrapId: '#f-war-wrap',
        quickId: '#f-war-quick', inputId: '#f-warranty',
        unit: 'years', fallback: 2, preset: draft.warrantyYears,
      });

      // Cambio la data dello scontrino: le scadenze basate su una scorciatoia
      // si ricalcolano da sola, quelle scritte a mano restano dove sono.
      const allineaScadenze = (avvisa) => {
        const spostate = deadlines.filter((d) => d.preset != null && d.sw.classList.contains('is-on'));
        spostate.forEach((d) => d.applyPreset(d.preset));
        if (avvisa && spostate.length) toast('Scadenze aggiornate alla nuova data', { icon: 'clock', duration: 2600 });
      };
      // Il selettore di data di Android non manda sempre gli stessi eventi:
      // stiamo in ascolto su entrambi.
      $('#f-date', sheet).addEventListener('change', () => allineaScadenze(true));
      $('#f-date', sheet).addEventListener('input', () => allineaScadenze(false));

      const retSw = ret.sw;
      const warSw = war.sw;

      // Rilettura su richiesta: utile se la prima foto era storta o mossa.
      $('#f-rileggi', sheet)?.addEventListener('click', async (e) => {
        if (!working.length) { toastError('Serve una foto da leggere.'); return; }
        const stop = withBusy(e.currentTarget, 'Leggo…');
        try {
          const letto = await leggiScontrino(working[0].blob);
          stop();
          if (!letto || (letto.amount == null && !letto.date && !letto.title)) {
            toast('Non sono riuscito a leggerlo: prova con più luce', { icon: 'info', duration: 4000 });
            return;
          }
          const messi = [];
          if (letto.amount != null) {
            $('#f-amount', sheet).value = String(letto.amount).replace('.', ',');
            messi.push('importo');
          }
          if (letto.title) { $('#f-title', sheet).value = letto.title; messi.push('negozio'); }
          if (letto.date) {
            $('#f-date', sheet).value = letto.date;
            $('#f-date', sheet).dispatchEvent(new Event('change'));
            messi.push('data');
          }
          if (letto.category) {
            draft.category = letto.category;
            $$('#f-cats .cat', sheet).forEach((b) => b.classList.toggle('is-active', b.dataset.cat === letto.category));
          }
          toast(`Compilati: ${messi.join(', ')}`, { icon: 'check' });
        } catch (err) {
          console.error(err);
          stop();
          toastError('Lettura non riuscita.');
        }
      });

      sheet.querySelector('[data-cancel]').addEventListener('click', () => close());

      /*
       * Al salvataggio la scadenza viene ricalcolata dalla data dello scontrino:
       * se è nata da una scorciatoia, non può restare indietro qualunque sia
       * l'ordine in cui hai toccato i campi. Una data scritta a mano resta com'è.
       */
      const scadenzaDefinitiva = (stato, inputId, unit) => {
        if (!stato.sw.classList.contains('is-on')) return null;
        const dataScontrino = $('#f-date', sheet).value || todayISO();
        if (stato.preset != null) {
          return unit === 'days'
            ? shiftDays(dataScontrino, stato.preset)
            : shiftYears(dataScontrino, stato.preset);
        }
        return $(inputId, sheet).value || null;
      };

      sheet.querySelector('[data-save]').addEventListener('click', async (e) => {
        if (!working.length) { toastError('Serve almeno una foto.'); return; }
        const stop = withBusy(e.currentTarget, 'Salvo…');
        try {
          await persistReceipt({
            receipt,
            photos: working,
            fields: {
              amount: parseAmount($('#f-amount', sheet).value),
              title: $('#f-title', sheet).value.trim(),
              date: $('#f-date', sheet).value || todayISO(),
              category: draft.category,
              note: $('#f-note', sheet).value.trim(),
              favorite: draft.favorite,
              warrantyUntil: scadenzaDefinitiva(war, '#f-warranty', 'years'),
              warrantyYears: warSw.classList.contains('is-on') ? war.preset : null,
              returnUntil: scadenzaDefinitiva(ret, '#f-return', 'days'),
              returnDays: retSw.classList.contains('is-on') ? ret.preset : null,
            },
          });
          close();
          toast(receipt ? 'Scontrino aggiornato' : 'Scontrino salvato al sicuro', { icon: 'check' });
        } catch (err) {
          console.error(err);
          stop();
          toastError('Salvataggio non riuscito. Libera spazio e riprova.');
        }
      });

      setTimeout(() => $('#f-amount', sheet)?.focus(), 260);
    },
    onClose() { pendingEditorAdd = null; },
  });
}

/**
 * Scontrini salvati prima che l'app memorizzasse la scorciatoia: se la
 * distanza fra data e scadenza combacia con una delle scelte rapide, la
 * trattiamo come tale, così anche loro seguono le correzioni di data.
 */
function presetDaDate(dal, al, unit) {
  if (!dal || !al) return null;
  const valori = unit === 'days' ? [8, 14, 30, 60] : [1, 2, 3, 5];
  const calcola = (v) => (unit === 'days' ? shiftDays(dal, v) : shiftYears(dal, v));
  return valori.find((v) => calcola(v) === al) ?? null;
}

/** Se valorizzata, le prossime foto scelte vanno nell'editor già aperto. */
let pendingEditorAdd = null;

async function persistReceipt({ receipt, photos, fields }) {
  const now = Date.now();
  const id = receipt?.id || uid();

  // miniatura: riusa quella esistente se la prima foto non è cambiata
  let thumb;
  const first = photos[0];
  if (receipt && receipt.photoIds[0] === first.id && receipt.thumb) thumb = receipt.thumb;
  else thumb = first.thumb || (await makeThumb(first.blob));

  const record = {
    id,
    ...fields,
    currency: cur(),
    photoIds: photos.map((p) => p.id),
    thumb,
    createdAt: receipt?.createdAt || now,
    updatedAt: now,
  };

  const photoRecords = photos.map((p) => ({
    id: p.id, receiptId: id, blob: p.blob,
    width: p.width, height: p.height, createdAt: p.createdAt || now,
  }));

  await DB.saveReceiptWithPhotos(record, photoRecords);

  if (receipt) {
    const removed = receipt.photoIds.filter((pid) => !record.photoIds.includes(pid));
    removed.forEach((pid) => releaseURL(`p:${pid}`));
    await DB.deletePhotos(removed);
  }

  await afterChange();
  requestPersistence();
  return record;
}

async function afterChange() {
  await loadReceipts();
  render();
}

/* ═══════════════════ Azioni sugli scontrini ═══════════════════ */

async function toggleFavorite(r) {
  r.favorite = !r.favorite;
  r.updatedAt = Date.now();
  await DB.putReceipt(r);
  haptic();
  await afterChange();
}

async function trashReceipt(r, goBack = false) {
  await DB.trashReceipt(r.id);
  await loadReceipts();
  if (goBack && state.view === 'detail') history.back();
  else render();

  toast('Spostato nel cestino', {
    icon: 'trash',
    action: {
      label: 'Annulla',
      onClick: async () => { await DB.restoreReceipt(r.id); await afterChange(); },
    },
  });
}

async function duplicateReceipt(r, photos) {
  const now = Date.now();
  const id = uid();
  const copies = photos.map((p) => ({ ...p, id: uid(), receiptId: id, createdAt: now }));
  const record = {
    ...r, id, photoIds: copies.map((p) => p.id),
    title: r.title, date: todayISO(), createdAt: now, updatedAt: now,
  };
  delete record.deletedAt;
  await DB.saveReceiptWithPhotos(record, copies);
  await afterChange();
  toast('Copia creata: controlla data e importo', { icon: 'copy' });
}

async function shareReceipt(r, photos) {
  const files = photos.map((p, i) => new File(
    [p.blob], `${slugify(r.title || 'scontrino')}-${r.date}${photos.length > 1 ? `-${i + 1}` : ''}.jpg`,
    { type: 'image/jpeg' },
  ));
  const text = [r.title, r.amount != null ? fmtMoney(r.amount, r.currency || cur()) : '', fmtDate(r.date)]
    .filter(Boolean).join(' · ');

  if (isAndroidApp && files.length === 1) {
    try {
      await hostSaveFile(files[0], files[0].name, 'share');
      return;
    } catch (err) {
      console.error(err);
    }
  }

  if (canShareFiles(files)) {
    try {
      await navigator.share({ files, title: r.title || 'Scontrino', text });
      return;
    } catch (err) {
      if (err?.name === 'AbortError') return;
    }
  }
  downloadPhotos(r, photos);
}

async function downloadPhotos(r, photos) {
  let where = '';
  try {
    for (let i = 0; i < photos.length; i++) {
      const name = `${slugify(r.title || 'scontrino')}-${r.date}${photos.length > 1 ? `-${i + 1}` : ''}.jpg`;
      where = await downloadBlob(photos[i].blob, name);
    }
  } catch (err) {
    console.error(err);
    toastError('Non sono riuscito a salvare la foto.');
    return;
  }
  const quante = photos.length > 1 ? `${photos.length} foto salvate` : 'Foto salvata';
  toast(where ? `${quante} in ${where.replace(/\/[^/]*$/, '')}` : quante, { icon: 'download' });
}

/* ═══════════════════ Backup ═══════════════════ */

async function exportBackup() {
  const receipts = state.receipts.filter((r) => !r.deletedAt);
  if (!receipts.length) { toast(`Non c'è ancora niente da esportare`, { icon: 'info' }); return; }

  const closeToast = toast('Preparo il backup…', { icon: 'download', duration: 120000 });
  try {
    const zip = new ZipBuilder();
    const meta = [];
    const csv = [['Data', 'Descrizione', 'Importo', 'Valuta', 'Categoria', 'Nota', 'Reso entro', 'Garanzia fino al', 'File']];

    for (const r of receipts) {
      const photos = await DB.getPhotos(r.photoIds);
      const names = [];
      for (let i = 0; i < photos.length; i++) {
        const name = `foto/${r.date || 'senza-data'}_${slugify(r.title)}_${r.id.slice(0, 6)}${photos.length > 1 ? `_${i + 1}` : ''}.jpg`;
        await zip.add(name, photos[i].blob, new Date(r.createdAt));
        names.push(name);
      }
      meta.push({
        id: r.id, title: r.title, amount: r.amount, currency: r.currency,
        date: r.date, category: r.category, note: r.note, favorite: !!r.favorite,
        warrantyUntil: r.warrantyUntil || null, warrantyYears: r.warrantyYears ?? null,
        returnUntil: r.returnUntil || null, returnDays: r.returnDays ?? null,
        createdAt: r.createdAt, updatedAt: r.updatedAt,
        photos: names,
      });
      csv.push([r.date, r.title, r.amount != null ? r.amount.toFixed(2).replace('.', ',') : '',
        r.currency || cur(), catOf(r.category).label, r.note,
        r.returnUntil ? fmtDate(r.returnUntil) : '', r.warrantyUntil ? fmtDate(r.warrantyUntil) : '',
        names.join(' | ')]);
    }

    await zip.add('invoice-wallet.json', JSON.stringify({
      app: 'invoice-wallet', format: 1, version: APP_VERSION,
      exportedAt: Date.now(), count: meta.length, receipts: meta,
    }, null, 2));
    await zip.add('scontrini.csv', toCSV(csv));
    await zip.add('LEGGIMI.txt',
      'Backup di Invoice Wallet.\r\n\r\n' +
      'Le foto sono nella cartella "foto" e si aprono con qualsiasi programma.\r\n' +
      'Il file scontrini.csv si apre con Excel o Fogli Google.\r\n' +
      'Per rimettere tutto nell\'app: Impostazioni → Ripristina da backup, e scegli questo .zip.\r\n');

    const blob = zip.build();
    closeToast();
    const name = `invoice-wallet-backup-${todayISO()}.zip`;
    const result = await shareOrDownload(blob, name, 'Backup Invoice Wallet');

    state.lastBackupAt = await DB.setMeta('lastBackupAt', Date.now());
    toast(result.where
      ? `Backup salvato in ${result.where} · ${fmtBytes(blob.size)}`
      : `Backup pronto · ${fmtBytes(blob.size)}`, { icon: 'check', duration: 5000 });
    if (state.view === 'settings') renderSettings();
  } catch (err) {
    console.error(err);
    closeToast();
    toastError('Backup non riuscito. Se hai molti scontrini prova a chiudere le altre app.');
  }
}

async function importBackup(file) {
  const closeToast = toast('Leggo il backup…', { icon: 'upload', duration: 120000 });
  try {
    const files = await readZip(file);
    const jsonBlob = files.get('invoice-wallet.json');
    if (!jsonBlob) throw new Error('manca invoice-wallet.json');

    const data = JSON.parse(await jsonBlob.text());
    if (data.app !== 'invoice-wallet' || !Array.isArray(data.receipts)) throw new Error('formato sconosciuto');

    const existing = new Set(state.receipts.map((r) => r.id));
    let added = 0, skipped = 0;

    for (const r of data.receipts) {
      if (existing.has(r.id)) { skipped++; continue; }

      const blobs = (r.photos || []).map((n) => files.get(n)).filter(Boolean);
      if (!blobs.length) { skipped++; continue; }

      const now = Date.now();
      const photoRecords = [];
      for (const b of blobs) {
        photoRecords.push({
          id: uid(), receiptId: r.id,
          blob: new Blob([await b.arrayBuffer()], { type: 'image/jpeg' }),
          width: null, height: null, createdAt: r.createdAt || now,
        });
      }

      await DB.saveReceiptWithPhotos({
        id: r.id,
        title: r.title || '', amount: r.amount ?? null, currency: r.currency || cur(),
        date: r.date || todayISO(), category: r.category || 'altro', note: r.note || '',
        favorite: !!r.favorite,
        warrantyUntil: r.warrantyUntil || null, warrantyYears: r.warrantyYears ?? null,
        returnUntil: r.returnUntil || null, returnDays: r.returnDays ?? null,
        photoIds: photoRecords.map((p) => p.id),
        thumb: await makeThumb(photoRecords[0].blob),
        createdAt: r.createdAt || now, updatedAt: now,
      }, photoRecords);
      added++;
    }

    closeToast();
    await afterChange();
    toast(added ? `Ripristinati ${added} scontrini${skipped ? ` · ${skipped} già presenti` : ''}` : 'Erano già tutti presenti', { icon: 'check', duration: 4500 });
  } catch (err) {
    console.error(err);
    closeToast();
    toastError('Backup non leggibile. Scegli il file .zip creato da Invoice Wallet.');
  }
}

async function enablePersistence() {
  const ok = await requestPersistence();
  toast(ok
    ? 'Archiviazione protetta attiva'
    : 'Il browser ha rifiutato: installa l\'app per ottenere la protezione', { icon: ok ? 'shield' : 'info', duration: 4500 });
  renderSettings();
}

async function wipeEverything() {
  const ok = await confirmDialog({
    title: 'Eliminare tutto?',
    text: 'Verranno cancellati tutti gli scontrini e tutte le foto salvate in questa app. Se non hai un backup, non si torna indietro.',
    confirmLabel: 'Elimina tutto', danger: true,
  });
  if (!ok) return;

  const sure = await confirmDialog({
    title: 'Sicuro davvero?',
    text: 'Ultima possibilità di annullare.',
    confirmLabel: 'Sì, elimina', danger: true,
  });
  if (!sure) return;

  await DB.wipeAll();
  _thumbKeys.clear();
  await afterChange();
  go('home');
  toast('Archivio svuotato', { icon: 'trash' });
}

/* ═══════════════════ Eventi globali ═══════════════════ */

/**
 * Marchio e totale scorrono via, periodo e ricerca restano in cima.
 * L'altezza della parte appiccicata finisce in `--head-h`, così le
 * intestazioni dei mesi si fermano lì sotto invece di infilarsi dietro.
 */
let misuraTestata = null;

function wireTestataRitratta() {
  const stick = $('#topbar-stick');
  let inCoda = false;
  let attaccata = null;

  const misura = () => {
    inCoda = false;
    const r = stick.getBoundingClientRect();
    // Si ferma sotto la barra di stato, non sotto il bordo dello schermo:
    // la soglia è quella, non zero.
    const soglia = parseFloat(getComputedStyle(stick).top) || 0;
    /*
     * `scrollY > 0` non è una rifinitura ma la garanzia: se non hai
     * scorrito non c'è niente da coprire, e senza questa condizione una
     * misura presa mentre la pagina non è ancora disposta (top = 0)
     * accendeva la striscia sopra la barra, che si mangiava proprio
     * l'intestazione della home.
     */
    const ora = window.scrollY > 0 && r.top <= soglia + 1;
    if (ora !== attaccata) {
      attaccata = ora;
      stick.classList.toggle('is-stuck', ora);
    }
    // Le intestazioni dei mesi si fermano sotto: conta anche la barra di stato.
    document.documentElement.style.setProperty('--head-h', `${Math.round(soglia + r.height)}px`);
  };
  const aggiorna = () => {
    if (inCoda) return;
    inCoda = true;
    requestAnimationFrame(misura);
  };

  window.addEventListener('scroll', aggiorna, { passive: true });
  window.addEventListener('resize', aggiorna);
  misuraTestata = aggiorna;
  misura();
}

function wireGlobalEvents() {
  wireTestataRitratta();
  wireSettingsEvents();
  $('#fab').addEventListener('click', startAdd);
  $('#empty-cta').addEventListener('click', () => $('#input-camera').click());

  $('#tabbar').addEventListener('click', (e) => {
    const tab = e.target.closest('[data-tab]');
    if (!tab || tab.dataset.tab === state.view) return;
    go(tab.dataset.tab);
  });

  $$('[data-back]').forEach((b) => b.addEventListener('click', () => history.back()));

  // input foto
  const consume = async (input, fromCamera) => {
    // La copia va fatta prima: azzerare input.value svuota la FileList.
    const files = [...(input.files || [])];
    if (!files.length) return;
    const handOff = pendingEditorAdd;
    input.value = '';
    if (handOff) {
      pendingEditorAdd = null;
      const processed = await Promise.all(files.filter((f) => f.type.startsWith('image/')).map(async (file) => {
        const { blob, thumb, width, height } = await processPicture(file, state.settings.quality);
        return { id: uid(), blob, thumb, width, height, createdAt: Date.now(), isNew: true };
      }));
      handOff(processed);
      return;
    }
    await handleFiles(files, { fromCamera });
  };
  $('#input-camera').addEventListener('change', (e) => consume(e.target, true));
  $('#input-gallery').addEventListener('change', (e) => consume(e.target, false));
  $('#input-restore').addEventListener('change', (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (file) importBackup(file);
  });

  // filtri
  $('#months').addEventListener('click', (e) => {
    const btn = e.target.closest('[data-month]');
    if (!btn) return;
    state.filter.month = btn.dataset.month;
    renderHome();
  });

  $('#category-chips').addEventListener('click', (e) => {
    const btn = e.target.closest('[data-cat]');
    if (!btn) return;
    state.filter.category = state.filter.category === btn.dataset.cat ? 'all' : btn.dataset.cat;
    renderHome();
  });

  $('#feed').addEventListener('click', (e) => {
    // «+ importo» porta dritto al campo, senza passare dal dettaglio.
    const manca = e.target.closest('[data-fill]');
    if (manca) {
      e.stopPropagation();
      const r = state.receipts.find((x) => x.id === manca.dataset.fill);
      if (r) openEditor({ receipt: r, focus: 'amount' });
      return;
    }
    const card = e.target.closest('[data-id]');
    if (card) go('detail', { id: card.dataset.id });
  });

  // ricerca
  const searchbar = $('#searchbar');
  const input = $('#search-input');
  $('#btn-search-toggle').addEventListener('click', () => {
    const show = searchbar.hidden;
    searchbar.hidden = !show;
    $('#btn-search-toggle').classList.toggle('is-on', show);
    if (show) input.focus();
    else { input.value = ''; state.filter.query = ''; renderHome(); }
  });
  input.addEventListener('input', debounce(() => {
    state.filter.query = input.value.trim();
    renderHome();
  }, 180));
  $('#search-clear').addEventListener('click', () => {
    input.value = '';
    state.filter.query = '';
    input.focus();
    renderHome();
  });

  // vista e ordinamento
  $('#btn-layout').addEventListener('click', async () => {
    await saveSettings({ layout: state.settings.layout === 'grid' ? 'list' : 'grid' });
    renderHome();
  });

  $('#btn-sort').addEventListener('click', () => {
    openActionSheet('Ordina per', Object.entries(SORTS).map(([id, s]) => ({
      icon: state.settings.sort === id ? 'check' : 'sort',
      label: s.label,
      onClick: async () => { await saveSettings({ sort: id }); renderHome(); },
    })));
  });

  $('#alertbar').addEventListener('click', () => go('deadlines'));
  $('#spark').addEventListener('click', () => go('stats'));

  $('#deadlines-filter').addEventListener('click', (e) => {
    const btn = e.target.closest('[data-kind]');
    if (!btn) return;
    deadlineFilter = btn.dataset.kind;
    renderDeadlines();
  });

  $('#stats-range').addEventListener('click', (e) => {
    const btn = e.target.closest('[data-range]');
    if (!btn) return;
    statsRange = btn.dataset.range;
    renderStats();
  });

  // scorciatoie da tastiera (desktop)
  document.addEventListener('keydown', (e) => {
    if (e.target.matches('input, textarea')) return;
    if (e.key === 'n') startAdd();
    if (e.key === '/') { e.preventDefault(); $('#btn-search-toggle').click(); }
  });

  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    state.installPrompt = e;
    if (state.view === 'settings') renderSettings();
  });
}

async function promptInstall() {
  if (!state.installPrompt) return;
  state.installPrompt.prompt();
  const { outcome } = await state.installPrompt.userChoice;
  state.installPrompt = null;
  if (outcome === 'accepted') toast('App installata: ora la trovi tra le tue app', { icon: 'check' });
  renderSettings();
}

/* ═══════════════════ Service worker ═══════════════════ */

function registerServiceWorker() {
  if (!('serviceWorker' in navigator) || location.protocol === 'file:') return;

  if (isAndroidApp) {
    /*
     * Nell'app i file arrivano dall'APK: una cache non aggiunge nulla e
     * rischia di servire la versione precedente dopo un aggiornamento.
     * Rimuovo anche quello che hanno lasciato le versioni vecchie.
     */
    navigator.serviceWorker.getRegistrations?.()
      .then((registrazioni) => registrazioni.forEach((r) => r.unregister()))
      .catch(() => {});
    caches?.keys?.().then((chiavi) => chiavi.forEach((k) => caches.delete(k))).catch(() => {});
    return;
  }

  navigator.serviceWorker.register('sw.js').then((reg) => {
    reg.addEventListener('updatefound', () => {
      const sw = reg.installing;
      sw?.addEventListener('statechange', () => {
        if (sw.state === 'installed' && navigator.serviceWorker.controller) {
          toast('Nuova versione disponibile', {
            icon: 'sparkle', duration: 8000,
            action: { label: 'Ricarica', onClick: () => { sw.postMessage('skip-waiting'); location.reload(); } },
          });
        }
      });
    });
  }).catch((err) => console.warn('SW non registrato:', err));
}

/* ═══════════════════ Via ═══════════════════ */
init();
