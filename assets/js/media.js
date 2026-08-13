/* ══════════════════════════════════════════════════════════════
   Elaborazione immagini: ridimensiona e comprime prima di salvare,
   così mille scontrini stanno in pochi MB.
   ══════════════════════════════════════════════════════════════ */

const QUALITY_PRESETS = {
  alta:  { maxSide: 2400, quality: 0.86, label: 'Alta',  hint: 'massima leggibilità, file più grandi' },
  media: { maxSide: 1800, quality: 0.80, label: 'Media', hint: 'consigliata: ottimo compromesso' },
  bassa: { maxSide: 1280, quality: 0.70, label: 'Bassa', hint: 'risparmia spazio al massimo' },
};

const THUMB = { maxSide: 460, quality: 0.72 };

/** Decodifica un file/blob rispettando l'orientamento EXIF. */
async function decodeImage(source) {
  if (typeof createImageBitmap === 'function') {
    try {
      return await createImageBitmap(source, { imageOrientation: 'from-image' });
    } catch {
      try { return await createImageBitmap(source); } catch { /* fallback sotto */ }
    }
  }
  const url = URL.createObjectURL(source);
  try {
    const img = new Image();
    img.decoding = 'async';
    await new Promise((resolve, reject) => {
      img.onload = resolve;
      img.onerror = () => reject(new Error('Immagine non leggibile'));
      img.src = url;
    });
    return img;
  } finally {
    setTimeout(() => URL.revokeObjectURL(url), 4000);
  }
}

function drawScaled(bitmap, maxSide) {
  const w = bitmap.width || bitmap.naturalWidth;
  const h = bitmap.height || bitmap.naturalHeight;
  const scale = Math.min(1, maxSide / Math.max(w, h));
  const cw = Math.max(1, Math.round(w * scale));
  const ch = Math.max(1, Math.round(h * scale));
  const canvas = document.createElement('canvas');
  canvas.width = cw;
  canvas.height = ch;
  const ctx = canvas.getContext('2d', { alpha: false });
  ctx.imageSmoothingQuality = 'high';
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, cw, ch);
  ctx.drawImage(bitmap, 0, 0, cw, ch);
  return { canvas, width: cw, height: ch };
}

function canvasToBlob(canvas, quality) {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('Conversione immagine fallita'))),
      'image/jpeg',
      quality,
    );
  });
}

/**
 * Da file della fotocamera a coppia { photo, thumb } pronta da salvare.
 * @returns {Promise<{blob: Blob, thumb: Blob, width: number, height: number}>}
 */
async function processPicture(file, presetName = 'media') {
  const preset = QUALITY_PRESETS[presetName] || QUALITY_PRESETS.media;
  const bitmap = await decodeImage(file);
  try {
    const full = drawScaled(bitmap, preset.maxSide);
    const blob = await canvasToBlob(full.canvas, preset.quality);
    const small = drawScaled(bitmap, THUMB.maxSide);
    const thumb = await canvasToBlob(small.canvas, THUMB.quality);
    return { blob, thumb, width: full.width, height: full.height };
  } finally {
    bitmap.close?.();
  }
}

/** Genera solo la miniatura a partire da una foto già salvata. */
async function makeThumb(blob) {
  const bitmap = await decodeImage(blob);
  try {
    const { canvas } = drawScaled(bitmap, THUMB.maxSide);
    return await canvasToBlob(canvas, THUMB.quality);
  } finally {
    bitmap.close?.();
  }
}

/* ── Object URL con cache, per non ricreare mille URL ────────── */
const _urlCache = new Map();

function blobURL(key, blob) {
  const cached = _urlCache.get(key);
  if (cached) return cached;
  const url = URL.createObjectURL(blob);
  _urlCache.set(key, url);
  return url;
}

function releaseURL(key) {
  const url = _urlCache.get(key);
  if (url) {
    URL.revokeObjectURL(url);
    _urlCache.delete(key);
  }
}

/* ── Conversioni ─────────────────────────────────────────────── */
function blobToDataURL(blob) {
  return new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = () => resolve(fr.result);
    fr.onerror = () => reject(fr.error);
    fr.readAsDataURL(blob);
  });
}

async function dataURLToBlob(dataURL) {
  const res = await fetch(dataURL);
  return res.blob();
}

/* ══════════════════════════════════════════════════════════════
   Uscita dei file.
   Nel browser: link di download o condivisione di sistema.
   Dentro l'app Android i "blob:" non sono scaricabili, quindi il file
   viene passato a pezzi al contenitore nativo, che lo scrive davvero.
   ══════════════════════════════════════════════════════════════ */

const androidHost = (() => {
  try {
    return (typeof AndroidHost !== 'undefined' && AndroidHost.platform() === 'android') ? AndroidHost : null;
  } catch {
    return null;
  }
})();

const isAndroidApp = !!androidHost;

function androidVersion() {
  try { return androidHost ? androidHost.versionName() : ''; } catch { return ''; }
}

async function blobToBase64(blob) {
  const dataURL = await blobToDataURL(blob);
  return dataURL.slice(dataURL.indexOf(',') + 1);
}

/** @param mode 'save' (cartella Download) oppure 'share' (menu condivisione). */
async function hostSaveFile(blob, filename, mode = 'save') {
  const token = androidHost.fileBegin(filename, blob.type || 'application/octet-stream');
  if (!token) throw new Error('Salvataggio non disponibile');
  const CHUNK = 768 * 1024;
  try {
    for (let offset = 0; offset < blob.size; offset += CHUNK) {
      const chunk = await blobToBase64(blob.slice(offset, offset + CHUNK));
      if (!androidHost.fileChunk(token, chunk)) throw new Error('Scrittura interrotta');
    }
    return androidHost.fileEnd(token, mode) || '';
  } catch (err) {
    try { androidHost.fileAbort(token); } catch { /* già chiuso */ }
    throw err;
  }
}

function downloadBlobInBrowser(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}

/** Fa uscire il file dall'app. Restituisce dove è finito ('' nel browser). */
async function downloadBlob(blob, filename) {
  if (androidHost) return hostSaveFile(blob, filename, 'save');
  downloadBlobInBrowser(blob, filename);
  return '';
}

function canShareFiles(files) {
  return !!(navigator.canShare && navigator.share && navigator.canShare({ files }));
}

/**
 * Condivide oppure salva, a seconda di cosa sa fare il dispositivo.
 * @returns {Promise<{mode: 'shared'|'saved'|'downloaded'|'cancelled', where?: string}>}
 */
async function shareOrDownload(blob, filename, title) {
  if (androidHost) {
    const where = await hostSaveFile(blob, filename, 'save');
    return { mode: 'saved', where };
  }
  const file = new File([blob], filename, { type: blob.type || 'application/octet-stream' });
  if (canShareFiles([file])) {
    try {
      await navigator.share({ files: [file], title });
      return { mode: 'shared' };
    } catch (err) {
      if (err?.name === 'AbortError') return { mode: 'cancelled' };
    }
  }
  downloadBlobInBrowser(blob, filename);
  return { mode: 'downloaded' };
}
