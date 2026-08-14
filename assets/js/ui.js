/* ══════════════════════════════════════════════════════════════
   Componenti di interfaccia: toast, bottom sheet, conferme,
   visualizzatore foto a schermo intero.
   ══════════════════════════════════════════════════════════════ */

const $  = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

function el(html) {
  const tpl = document.createElement('template');
  tpl.innerHTML = html.trim();
  const node = tpl.content.firstElementChild;
  hydrateIcons(node);
  return node;
}

/* ══════════════════════════════════════════════════════════════
   Pila delle sovrapposizioni (foto a schermo intero, schede, conferme).

   Su un telefono il tasto Indietro deve chiudere quello che è aperto, non
   uscire dalla schermata. L'app Android chiede a questa pila prima di
   gestire il tasto; nel browser ci pensa la cronologia.
   ══════════════════════════════════════════════════════════════ */

const sovrapposizioni = [];

/** Registra una sovrapposizione. Restituisce come toglierla dalla pila. */
function registraSovrapposizione(chiudi) {
  const voce = { chiudi };
  sovrapposizioni.push(voce);
  return () => {
    const i = sovrapposizioni.indexOf(voce);
    if (i >= 0) sovrapposizioni.splice(i, 1);
  };
}

/**
 * Chiude quella più in alto.
 * @returns {boolean} true se c'era qualcosa da chiudere.
 * Chiamata anche da Android: il nome deve restare questo.
 */
function chiudiSovrapposizione() {
  const voce = sovrapposizioni.pop();
  if (!voce) return false;
  voce.chiudi();
  return true;
}
window.chiudiSovrapposizione = chiudiSovrapposizione;

/** C'è qualcosa di aperto sopra la pagina? */
function sovrapposizioniAperte() {
  return sovrapposizioni.length > 0;
}

/* ── Toast ───────────────────────────────────────────────────── */
function toast(message, opts = {}) {
  const { icon: iconName = 'check', action, duration = 3200, type = '' } = opts;
  const node = el(`
    <div class="toast ${type === 'error' ? 'toast--err' : ''}">
      ${icon(iconName)}
      <p>${esc(message)}</p>
      ${action ? `<button type="button">${esc(action.label)}</button>` : ''}
    </div>`);

  let timer;
  const close = () => {
    clearTimeout(timer);
    node.classList.add('is-out');
    setTimeout(() => node.remove(), 220);
  };

  node.querySelector('button')?.addEventListener('click', () => {
    close();
    action.onClick?.();
  });

  $('#toast-root').appendChild(node);
  timer = setTimeout(close, duration);
  return close;
}

const toastError = (msg) => toast(msg, { icon: 'warn', type: 'error', duration: 5000 });

/* ── Bottom sheet ────────────────────────────────────────────── */
let openSheets = 0;

function openSheet({ title = '', body = '', footer = '', onMount, onClose, closable = true }) {
  const backdrop = el(`
    <div class="sheet-backdrop">
      <section class="sheet" role="dialog" aria-modal="true" aria-label="${esc(title)}">
        <div class="sheet__grip"></div>
        ${title ? `<header class="sheet__head">
            <h2>${esc(title)}</h2>
            ${closable ? `<button class="iconbtn iconbtn--sm" data-close aria-label="Chiudi">${icon('close')}</button>` : ''}
          </header>` : ''}
        <div class="sheet__body">${body}</div>
        ${footer ? `<footer class="sheet__foot">${footer}</footer>` : ''}
      </section>
    </div>`);

  hydrateIcons(backdrop);
  let closed = false;
  let togliDallaPila = () => {};

  const close = (result) => {
    if (closed) return;
    closed = true;
    togliDallaPila();
    backdrop.classList.add('is-closing');
    setTimeout(() => {
      backdrop.remove();
      if (--openSheets === 0) document.body.style.overflow = '';
    }, 220);
    onClose?.(result);
  };

  if (closable) {
    backdrop.addEventListener('click', (e) => { if (e.target === backdrop) close(); });
    backdrop.querySelector('[data-close]')?.addEventListener('click', () => close());
  }

  openSheets++;
  document.body.style.overflow = 'hidden';
  togliDallaPila = registraSovrapposizione(() => close());
  $('#sheet-root').appendChild(backdrop);
  onMount?.(backdrop.querySelector('.sheet'), close);
  return close;
}

/* ── Menu di azioni ──────────────────────────────────────────── */
function openActionSheet(title, actions) {
  const body = `<div class="actions">${actions.map((a, i) => `
      <button class="action ${a.danger ? 'action--danger' : ''}" data-idx="${i}">
        ${icon(a.icon || 'chevron')}
        <span><b>${esc(a.label)}</b>${a.hint ? `<small>${esc(a.hint)}</small>` : ''}</span>
      </button>`).join('')}</div>`;

  const close = openSheet({
    title,
    body,
    onMount(sheet) {
      sheet.querySelectorAll('[data-idx]').forEach((btn) => {
        btn.addEventListener('click', () => {
          const action = actions[Number(btn.dataset.idx)];
          close();
          setTimeout(() => action.onClick?.(), 180);
        });
      });
    },
  });
  return close;
}

/* ── Conferma ────────────────────────────────────────────────── */
function confirmDialog({ title, text, confirmLabel = 'Conferma', cancelLabel = 'Annulla', danger = false }) {
  return new Promise((resolve) => {
    const backdrop = el(`
      <div class="modal-backdrop">
        <div class="modal" role="alertdialog" aria-modal="true">
          <h3>${esc(title)}</h3>
          <p>${esc(text)}</p>
          <div class="modal__row">
            <button class="btn" data-no>${esc(cancelLabel)}</button>
            <button class="btn ${danger ? 'btn--danger' : 'btn--primary'}" data-yes>${esc(confirmLabel)}</button>
          </div>
        </div>
      </div>`);

    let togliDallaPila = () => {};
    const finish = (value) => { togliDallaPila(); backdrop.remove(); resolve(value); };
    backdrop.querySelector('[data-no]').addEventListener('click', () => finish(false));
    backdrop.querySelector('[data-yes]').addEventListener('click', () => finish(true));
    backdrop.addEventListener('click', (e) => { if (e.target === backdrop) finish(false); });
    togliDallaPila = registraSovrapposizione(() => finish(false));
    $('#modal-root').appendChild(backdrop);
    backdrop.querySelector('[data-yes]').focus();
  });
}

/* ── Visualizzatore foto (pinch + doppio tap) ────────────────── */
function openViewer(src, alt = 'Scontrino') {
  const node = el(`
    <div class="viewer">
      <button class="viewer__close" aria-label="Chiudi">${icon('close')}</button>
      <img src="${src}" alt="${esc(alt)}" draggable="false" />
      <div class="viewer__hint">Doppio tap o pizzica per ingrandire</div>
    </div>`);

  const img = node.querySelector('img');
  const hint = node.querySelector('.viewer__hint');
  let scale = 1, x = 0, y = 0;
  let start = null, pinch = null;

  const apply = () => { img.style.transform = `translate(${x}px, ${y}px) scale(${scale})`; };
  const reset = () => { scale = 1; x = 0; y = 0; apply(); };

  const clampPan = () => {
    const r = img.getBoundingClientRect();
    const limitX = Math.max(0, (r.width - window.innerWidth) / 2 + 20);
    const limitY = Math.max(0, (r.height - window.innerHeight) / 2 + 20);
    x = Math.min(limitX, Math.max(-limitX, x));
    y = Math.min(limitY, Math.max(-limitY, y));
  };

  let togliDallaPila = () => {};
  const close = () => { togliDallaPila(); node.remove(); document.body.style.overflow = ''; };
  node.querySelector('.viewer__close').addEventListener('click', close);

  // doppio tap
  let lastTap = 0;
  img.addEventListener('click', () => {
    const now = Date.now();
    if (now - lastTap < 300) {
      scale = scale > 1.2 ? 1 : 2.5;
      if (scale === 1) { x = 0; y = 0; }
      apply();
      hint?.remove();
    }
    lastTap = now;
  });

  const touches = new Map();
  const dist = () => {
    const [a, b] = [...touches.values()];
    return Math.hypot(a.x - b.x, a.y - b.y);
  };

  // I gesti stanno sull'immagine, non sul contenitore: così il pointer capture
  // non ruba il click al pulsante di chiusura.
  img.addEventListener('pointerdown', (e) => {
    img.setPointerCapture?.(e.pointerId);
    touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (touches.size === 2) {
      pinch = { d: dist(), scale };
      start = null;
    } else if (scale > 1) {
      start = { x: e.clientX - x, y: e.clientY - y };
      node.classList.add('is-panning');
    }
  });

  img.addEventListener('pointermove', (e) => {
    if (!touches.has(e.pointerId)) return;
    touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pinch && touches.size === 2) {
      scale = Math.min(5, Math.max(1, (pinch.scale * dist()) / pinch.d));
      if (scale === 1) { x = 0; y = 0; }
      clampPan();
      apply();
      hint?.remove();
    } else if (start) {
      x = e.clientX - start.x;
      y = e.clientY - start.y;
      clampPan();
      apply();
    }
  });

  const release = (e) => {
    touches.delete(e.pointerId);
    if (touches.size < 2) pinch = null;
    if (touches.size === 0) { start = null; node.classList.remove('is-panning'); }
  };
  img.addEventListener('pointerup', release);
  img.addEventListener('pointercancel', release);

  node.addEventListener('wheel', (e) => {
    e.preventDefault();
    scale = Math.min(5, Math.max(1, scale - e.deltaY * 0.0016));
    if (scale === 1) { x = 0; y = 0; }
    clampPan();
    apply();
  }, { passive: false });

  document.addEventListener('keydown', function onKey(e) {
    if (!document.body.contains(node)) { document.removeEventListener('keydown', onKey); return; }
    if (e.key === 'Escape') { close(); document.removeEventListener('keydown', onKey); }
    if (e.key === '0') reset();
  });

  document.body.style.overflow = 'hidden';
  togliDallaPila = registraSovrapposizione(close);
  $('#viewer-root').appendChild(node);
  setTimeout(() => hint?.remove(), 3200);
  return close;
}

/* ── Indicatore di attesa dentro un bottone ──────────────────── */
function withBusy(button, label = 'Attendere…') {
  const original = button.innerHTML;
  button.disabled = true;
  button.innerHTML = `<span class="spinner"></span> ${esc(label)}`;
  return () => { button.disabled = false; button.innerHTML = original; };
}
