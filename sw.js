/* ══════════════════════════════════════════════════════════════
   Service worker.

   Nella versione web tiene l'app utilizzabile senza rete.
   Dentro l'app Android invece è dannoso: i file stanno già nell'APK, e una
   copia in cache continuerebbe a servire la versione precedente dopo un
   aggiornamento. Lì il service worker si toglie di mezzo da solo.

   Le foto non passano mai da qui: vivono in IndexedDB.
   ══════════════════════════════════════════════════════════════ */

// Dentro l'APK la pagina è servita da questo dominio finto.
const DENTRO_APP_ANDROID = self.location.hostname === 'appassets.androidplatform.net';

const CACHE = 'invoice-wallet-v5';

const SHELL = [
  './',
  'index.html',
  'manifest.webmanifest',
  'assets/css/styles.css',
  'assets/js/icons.js',
  'assets/js/util.js',
  'assets/js/db.js',
  'assets/js/media.js',
  'assets/js/zip.js',
  'assets/js/ocr.js',
  'assets/js/ui.js',
  'assets/js/app.js',
  'icons/favicon.svg',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/apple-touch-icon.png',
];

if (DENTRO_APP_ANDROID) {
  /*
   * Pulizia e ritiro: svuoto le cache, cancello la registrazione e ricarico
   * la pagina, che da quel momento legge i file veri dentro l'APK. Così un
   * aggiornamento dell'app è attivo subito, senza riaperture a vuoto.
   */
  self.addEventListener('install', () => self.skipWaiting());

  self.addEventListener('activate', (event) => {
    event.waitUntil((async () => {
      for (const chiave of await caches.keys()) await caches.delete(chiave);
      await self.registration.unregister();
      for (const finestra of await self.clients.matchAll({ type: 'window' })) {
        finestra.navigate(finestra.url);
      }
    })());
  });
} else {

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE)
      .then((cache) => cache.addAll(SHELL))
      .catch((err) => console.warn('Pre-cache parziale:', err)),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('message', (event) => {
  if (event.data === 'skip-waiting') self.skipWaiting();
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // Navigazioni: rete se c'è, altrimenti la copia in cache.
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put('index.html', copy));
          return res;
        })
        .catch(() => caches.match('index.html').then((r) => r || caches.match('./'))),
    );
    return;
  }

  // Risorse statiche: prima la cache (avvio immediato), poi aggiorno in background.
  event.respondWith(
    caches.match(request).then((cached) => {
      const network = fetch(request)
        .then((res) => {
          if (res.ok) {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(request, copy));
          }
          return res;
        })
        .catch(() => cached);
      return cached || network;
    }),
  );
});

}
