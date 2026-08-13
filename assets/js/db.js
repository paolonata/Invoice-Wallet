/* ══════════════════════════════════════════════════════════════
   Archivio locale (IndexedDB). Nessun dato lascia il dispositivo.

   receipts : { id, title, amount, currency, date, category, note,
                photoIds[], thumb(Blob), favorite, warrantyUntil,
                createdAt, updatedAt, deletedAt }
   photos   : { id, receiptId, blob, width, height, createdAt }
   meta     : { key, value }
   ══════════════════════════════════════════════════════════════ */

const DB_NAME = 'invoice-wallet';
const DB_VERSION = 1;

let _dbPromise = null;

function openDB() {
  if (_dbPromise) return _dbPromise;
  _dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains('receipts')) {
        const s = db.createObjectStore('receipts', { keyPath: 'id' });
        s.createIndex('date', 'date');
        s.createIndex('createdAt', 'createdAt');
      }
      if (!db.objectStoreNames.contains('photos')) {
        const s = db.createObjectStore('photos', { keyPath: 'id' });
        s.createIndex('receiptId', 'receiptId');
      }
      if (!db.objectStoreNames.contains('meta')) {
        db.createObjectStore('meta', { keyPath: 'key' });
      }
    };
    req.onsuccess = () => {
      req.result.onversionchange = () => req.result.close();
      resolve(req.result);
    };
    req.onerror = () => reject(req.error);
    req.onblocked = () => reject(new Error('Database bloccato da un altra scheda aperta.'));
  });
  return _dbPromise;
}

function tx(db, stores, mode) {
  const t = db.transaction(stores, mode);
  const done = new Promise((resolve, reject) => {
    t.oncomplete = () => resolve();
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error || new Error('Transazione annullata'));
  });
  return { t, done };
}

const asPromise = (req) => new Promise((resolve, reject) => {
  req.onsuccess = () => resolve(req.result);
  req.onerror = () => reject(req.error);
});

/* ── Scontrini ───────────────────────────────────────────────── */
const DB = {
  async allReceipts() {
    const db = await openDB();
    const { t } = tx(db, ['receipts'], 'readonly');
    return asPromise(t.objectStore('receipts').getAll());
  },

  async getReceipt(id) {
    const db = await openDB();
    const { t } = tx(db, ['receipts'], 'readonly');
    return asPromise(t.objectStore('receipts').get(id));
  },

  async putReceipt(receipt) {
    const db = await openDB();
    const { t, done } = tx(db, ['receipts'], 'readwrite');
    t.objectStore('receipts').put(receipt);
    await done;
    return receipt;
  },

  /** Salva scontrino + foto in un'unica transazione atomica. */
  async saveReceiptWithPhotos(receipt, photos) {
    const db = await openDB();
    const { t, done } = tx(db, ['receipts', 'photos'], 'readwrite');
    const pStore = t.objectStore('photos');
    photos.forEach((p) => pStore.put(p));
    t.objectStore('receipts').put(receipt);
    await done;
    return receipt;
  },

  /** Cestino: marca come eliminato senza cancellare nulla. */
  async trashReceipt(id) {
    const r = await DB.getReceipt(id);
    if (!r) return null;
    r.deletedAt = Date.now();
    r.updatedAt = Date.now();
    return DB.putReceipt(r);
  },

  async restoreReceipt(id) {
    const r = await DB.getReceipt(id);
    if (!r) return null;
    delete r.deletedAt;
    r.updatedAt = Date.now();
    return DB.putReceipt(r);
  },

  /** Cancellazione definitiva: record + tutte le sue foto. */
  async purgeReceipt(id) {
    const db = await openDB();
    const receipt = await DB.getReceipt(id);
    const { t, done } = tx(db, ['receipts', 'photos'], 'readwrite');
    (receipt?.photoIds || []).forEach((pid) => t.objectStore('photos').delete(pid));
    t.objectStore('receipts').delete(id);
    await done;
  },

  /* ── Foto ──────────────────────────────────────────────────── */
  async getPhoto(id) {
    const db = await openDB();
    const { t } = tx(db, ['photos'], 'readonly');
    return asPromise(t.objectStore('photos').get(id));
  },

  async getPhotos(ids) {
    const db = await openDB();
    const { t } = tx(db, ['photos'], 'readonly');
    const store = t.objectStore('photos');
    const out = await Promise.all(ids.map((id) => asPromise(store.get(id))));
    return out.filter(Boolean);
  },

  async allPhotos() {
    const db = await openDB();
    const { t } = tx(db, ['photos'], 'readonly');
    return asPromise(t.objectStore('photos').getAll());
  },

  async putPhoto(photo) {
    const db = await openDB();
    const { t, done } = tx(db, ['photos'], 'readwrite');
    t.objectStore('photos').put(photo);
    await done;
    return photo;
  },

  async deletePhotos(ids) {
    if (!ids.length) return;
    const db = await openDB();
    const { t, done } = tx(db, ['photos'], 'readwrite');
    ids.forEach((id) => t.objectStore('photos').delete(id));
    await done;
  },

  /* ── Impostazioni ──────────────────────────────────────────── */
  async getMeta(key, fallback = null) {
    const db = await openDB();
    const { t } = tx(db, ['meta'], 'readonly');
    const row = await asPromise(t.objectStore('meta').get(key));
    return row ? row.value : fallback;
  },

  async setMeta(key, value) {
    const db = await openDB();
    const { t, done } = tx(db, ['meta'], 'readwrite');
    t.objectStore('meta').put({ key, value });
    await done;
    return value;
  },

  /* ── Manutenzione ──────────────────────────────────────────── */
  async wipeAll() {
    const db = await openDB();
    const { t, done } = tx(db, ['receipts', 'photos'], 'readwrite');
    t.objectStore('receipts').clear();
    t.objectStore('photos').clear();
    await done;
  },

  /** Elimina definitivamente gli scontrini nel cestino da oltre N giorni. */
  async purgeExpiredTrash(days = 30) {
    const all = await DB.allReceipts();
    const limit = Date.now() - days * 86400000;
    const expired = all.filter((r) => r.deletedAt && r.deletedAt < limit);
    for (const r of expired) await DB.purgeReceipt(r.id);
    return expired.length;
  },

  /** Rimuove foto rimaste orfane (es. import interrotto). */
  async purgeOrphanPhotos() {
    const [receipts, photos] = await Promise.all([DB.allReceipts(), DB.allPhotos()]);
    const alive = new Set(receipts.flatMap((r) => r.photoIds || []));
    const orphans = photos.filter((p) => !alive.has(p.id)).map((p) => p.id);
    await DB.deletePhotos(orphans);
    return orphans.length;
  },
};

/* ── Spazio occupato ─────────────────────────────────────────── */
async function storageEstimate() {
  try {
    const est = await navigator.storage?.estimate?.();
    return { usage: est?.usage || 0, quota: est?.quota || 0 };
  } catch {
    return { usage: 0, quota: 0 };
  }
}

/** Chiede al browser di non svuotare i dati sotto pressione di spazio. */
async function requestPersistence() {
  try {
    if (!navigator.storage?.persist) return false;
    if (await navigator.storage.persisted()) return true;
    return await navigator.storage.persist();
  } catch {
    return false;
  }
}

async function isPersisted() {
  try { return (await navigator.storage?.persisted?.()) || false; } catch { return false; }
}
