/* Icone SVG inline (nessuna dipendenza esterna, funziona offline). */
const ICONS = (() => {
  const s = (d, extra = '') =>
    `<svg viewBox="0 0 24 24" fill="none" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${d}${extra}</svg>`;
  return {
    camera:   s('<path d="M3 8.5A2.5 2.5 0 0 1 5.5 6h1.9a1 1 0 0 0 .83-.45l.94-1.4A1 1 0 0 1 10 3.7h4a1 1 0 0 1 .83.45l.94 1.4a1 1 0 0 0 .83.45h1.9A2.5 2.5 0 0 1 21 8.5v9a2.5 2.5 0 0 1-2.5 2.5h-13A2.5 2.5 0 0 1 3 17.5Z"/><circle cx="12" cy="13" r="3.6"/>'),
    image:    s('<rect x="3" y="4.5" width="18" height="15" rx="2.6"/><circle cx="8.5" cy="10" r="1.6"/><path d="m3.5 17 4.6-4.2a2 2 0 0 1 2.7 0l3.2 3 1.7-1.5a2 2 0 0 1 2.7.1l2 2"/>'),
    plus:     s('<path d="M12 5v14M5 12h14" stroke-width="2.2"/>'),
    search:   s('<circle cx="11" cy="11" r="6.5"/><path d="m16 16 4.5 4.5"/>'),
    close:    s('<path d="M6 6l12 12M18 6 6 18" stroke-width="2"/>'),
    back:     s('<path d="M15 5 8 12l7 7" stroke-width="2"/>'),
    chevron:  s('<path d="m9 5 7 7-7 7"/>'),
    star:     s('<path d="m12 3.6 2.6 5.3 5.8.85-4.2 4.1 1 5.8-5.2-2.73-5.2 2.73 1-5.8-4.2-4.1 5.8-.85Z"/>'),
    starOn:   s('<path d="m12 3.6 2.6 5.3 5.8.85-4.2 4.1 1 5.8-5.2-2.73-5.2 2.73 1-5.8-4.2-4.1 5.8-.85Z" fill="currentColor"/>'),
    trash:    s('<path d="M4 7h16M9.5 7V5.2a1 1 0 0 1 1-1h3a1 1 0 0 1 1 1V7M6.5 7l.8 11.4a2 2 0 0 0 2 1.85h5.4a2 2 0 0 0 2-1.85L17.5 7M10.5 11v5.5M13.5 11v5.5"/>'),
    edit:     s('<path d="M4 20h4.2l9.4-9.4a2.1 2.1 0 0 0 0-3l-1.2-1.2a2.1 2.1 0 0 0-3 0L4 15.8Z"/><path d="m14.5 6.5 3 3"/>'),
    share:    s('<path d="M12 3.5v11M12 3.5 8.5 7M12 3.5 15.5 7"/><path d="M5.5 12.5v6a2 2 0 0 0 2 2h9a2 2 0 0 0 2-2v-6"/>'),
    download: s('<path d="M12 3.5v11M12 14.5 8.5 11M12 14.5 15.5 11"/><path d="M5.5 15v3.5a2 2 0 0 0 2 2h9a2 2 0 0 0 2-2V15"/>'),
    upload:   s('<path d="M12 20.5v-11M12 9.5 8.5 13M12 9.5 15.5 13"/><path d="M5.5 9V5.5a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2V9"/>'),
    settings: s('<circle cx="12" cy="12" r="3"/><path d="M19.4 14.6a1.5 1.5 0 0 0 .3 1.65l.06.06a1.8 1.8 0 1 1-2.55 2.55l-.06-.06a1.5 1.5 0 0 0-2.55 1.06V20a1.8 1.8 0 0 1-3.6 0v-.1a1.5 1.5 0 0 0-2.6-1.02l-.06.06a1.8 1.8 0 1 1-2.55-2.55l.06-.06A1.5 1.5 0 0 0 4 13.8H4a1.8 1.8 0 0 1 0-3.6h.1a1.5 1.5 0 0 0 1.02-2.6l-.06-.06A1.8 1.8 0 1 1 7.6 5l.06.06a1.5 1.5 0 0 0 2.55-1.06V4a1.8 1.8 0 0 1 3.6 0v.1a1.5 1.5 0 0 0 2.6 1.02l.06-.06A1.8 1.8 0 1 1 19 7.6l-.06.06a1.5 1.5 0 0 0-.3 1.65v.07a1.5 1.5 0 0 0 1.36.82H20a1.8 1.8 0 0 1 0 3.6h-.1a1.5 1.5 0 0 0-1.37.82Z"/>'),
    chart:    s('<path d="M4 20h16"/><rect x="5.5" y="11" width="3.6" height="6" rx="1.2"/><rect x="10.2" y="6.5" width="3.6" height="10.5" rx="1.2"/><rect x="14.9" y="9" width="3.6" height="8" rx="1.2"/>'),
    receipt:  s('<path d="M6 3.2h12a1 1 0 0 1 1 1v16.3l-2.6-1.5-2.6 1.5-2.6-1.5-2.6 1.5L5 20.5V4.2a1 1 0 0 1 1-1Z"/><path d="M9 8h6M9 12h6M9 16h3.5"/>'),
    check:    s('<path d="m5 12.5 4.5 4.5L19 7.5" stroke-width="2.2"/>'),
    grid:     s('<rect x="4" y="4" width="7" height="7" rx="1.8"/><rect x="13" y="4" width="7" height="7" rx="1.8"/><rect x="4" y="13" width="7" height="7" rx="1.8"/><rect x="13" y="13" width="7" height="7" rx="1.8"/>'),
    list:     s('<path d="M4.5 6.5h15M4.5 12h15M4.5 17.5h15" stroke-width="2"/>'),
    sort:     s('<path d="M7 4.5v15M7 19.5 4 16.5M7 19.5l3-3M17 19.5v-15M17 4.5 14 7.5M17 4.5l3 3"/>'),
    calendar: s('<rect x="3.5" y="5" width="17" height="15.5" rx="2.5"/><path d="M3.5 9.8h17M8.5 3.5v3M15.5 3.5v3"/>'),
    tag:      s('<path d="M11.6 3.5H19a1.5 1.5 0 0 1 1.5 1.5v7.4a2 2 0 0 1-.6 1.4l-6.6 6.6a2 2 0 0 1-2.8 0L3.6 13.5a2 2 0 0 1 0-2.8l6.6-6.6a2 2 0 0 1 1.4-.6Z"/><circle cx="16" cy="8" r="1.5" fill="currentColor" stroke="none"/>'),
    note:     s('<path d="M5.5 4.5h13a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1h-13a1 1 0 0 1-1-1v-13a1 1 0 0 1 1-1Z"/><path d="M8.5 9h7M8.5 12.5h7M8.5 16h4"/>'),
    shield:   s('<path d="M12 3.2 5 6v5.6c0 4 2.9 7.6 7 9.2 4.1-1.6 7-5.2 7-9.2V6Z"/><path d="m9 12 2.2 2.2L15.2 10"/>'),
    folder:   s('<path d="M3.5 7.2a2 2 0 0 1 2-2h3.4a2 2 0 0 1 1.5.7l1 1.1h7.1a2 2 0 0 1 2 2v8.6a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2Z"/>'),
    sun:      s('<circle cx="12" cy="12" r="4"/><path d="M12 2.8v2M12 19.2v2M2.8 12h2M19.2 12h2M5.5 5.5 6.9 6.9M17.1 17.1l1.4 1.4M18.5 5.5l-1.4 1.4M6.9 17.1l-1.4 1.4"/>'),
    moon:     s('<path d="M20 14.2A8.2 8.2 0 0 1 9.8 4a8.2 8.2 0 1 0 10.2 10.2Z"/>'),
    auto:     s('<circle cx="12" cy="12" r="8.2"/><path d="M12 3.8v16.4" /><path d="M12 3.8a8.2 8.2 0 0 1 0 16.4Z" fill="currentColor" stroke="none"/>'),
    euro:     s('<path d="M17 6.5A6.5 6.5 0 0 0 7.5 12a6.5 6.5 0 0 0 9.5 5.5"/><path d="M4.5 10.5h8M4.5 13.5h8"/>'),
    restore:  s('<path d="M4 12a8 8 0 1 0 2.5-5.8"/><path d="M4 4.5V9h4.5"/>'),
    lock:     s('<rect x="5" y="10.5" width="14" height="10" rx="2.4"/><path d="M8.5 10.5V7.8a3.5 3.5 0 1 1 7 0v2.7"/>'),
    sparkle:  s('<path d="M12 3.5 13.7 9 19 10.7 13.7 12.4 12 18l-1.7-5.6L5 10.7 10.3 9Z"/><path d="M18.5 15.5 19.3 18l2.2.8-2.2.8-.8 2.4-.8-2.4-2.2-.8 2.2-.8Z"/>'),
    info:     s('<circle cx="12" cy="12" r="8.5"/><path d="M12 11v5.5M12 7.8v.6"/>'),
    warn:     s('<path d="M10.3 4.3 2.9 17.2a2 2 0 0 0 1.7 3h14.8a2 2 0 0 0 1.7-3L13.7 4.3a2 2 0 0 0-3.4 0Z"/><path d="M12 9.5v4M12 16.8v.4"/>'),
    zoom:     s('<circle cx="11" cy="11" r="6.5"/><path d="m16 16 4.5 4.5M8.5 11h5M11 8.5v5"/>'),
    more:     s('<circle cx="5.5" cy="12" r="1.7" fill="currentColor" stroke="none"/><circle cx="12" cy="12" r="1.7" fill="currentColor" stroke="none"/><circle cx="18.5" cy="12" r="1.7" fill="currentColor" stroke="none"/>'),
    copy:     s('<rect x="8.5" y="8.5" width="11.5" height="11.5" rx="2.2"/><path d="M15.5 5.8V5a1.5 1.5 0 0 0-1.5-1.5H5.5A1.5 1.5 0 0 0 4 5v8.5A1.5 1.5 0 0 0 5.5 15h.8"/>'),
    wallet:   s('<path d="M3.5 8.2A2.7 2.7 0 0 1 6.2 5.5h11.6a2.7 2.7 0 0 1 2.7 2.7v9.1a2.7 2.7 0 0 1-2.7 2.7H6.2a2.7 2.7 0 0 1-2.7-2.7Z"/><path d="M20.5 11h-4a1.8 1.8 0 0 0 0 3.6h4"/>'),
  };
})();

/** Sostituisce ogni <span data-icon="nome"> con l'SVG corrispondente. */
function hydrateIcons(root = document) {
  root.querySelectorAll('[data-icon]').forEach((el) => {
    const name = el.getAttribute('data-icon');
    if (!name || el.dataset.iconDone === name) return;
    el.innerHTML = ICONS[name] || '';
    el.dataset.iconDone = name;
  });
}

/** Restituisce il markup di un'icona da usare dentro i template. */
function icon(name, cls = '') {
  return `<span data-icon="${name}"${cls ? ` class="${cls}"` : ''}></span>`;
}
