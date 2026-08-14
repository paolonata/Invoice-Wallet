/* ══════════════════════════════════════════════════════════════
   Il mirino.

   Scattare è il gesto principale dell'app, quindi non deve uscire
   dall'app: niente passaggio all'app fotocamera, niente conferma,
   niente modulo. Si inquadra, si tocca, è salvato.

   Se il flusso video non è disponibile — permesso negato, WebView
   vecchia, browser che non lo supporta — si ripiega sulla fotocamera
   del telefono, che resta comunque raggiungibile a mano: su certi
   scontrini sbiaditi la sua messa a fuoco fa la differenza.
   ══════════════════════════════════════════════════════════════ */

const Mirino = (() => {
  let flusso = null;
  let video = null;
  let pronto = false;

  const supportato = () => !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia);

  /**
   * Accende il mirino.
   * @returns {Promise<{ok: boolean, motivo?: string}>}
   */
  async function accendi() {
    video = $('#cam-video');
    if (!supportato()) return { ok: false, motivo: 'non-supportato' };
    if (flusso) { pronto = true; return { ok: true }; }

    try {
      flusso = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: 'environment' },
          // Lo scontrino è fatto di testo piccolo: più risoluzione
          // significa lettura automatica più affidabile.
          width: { ideal: 2560 },
          height: { ideal: 1440 },
        },
        audio: false,
      });
    } catch (err) {
      const negato = err?.name === 'NotAllowedError' || err?.name === 'SecurityError';
      return { ok: false, motivo: negato ? 'negato' : 'errore' };
    }

    video.srcObject = flusso;
    try { await video.play(); } catch { /* alcune WebView partono da sole */ }
    pronto = true;
    return { ok: true };
  }

  /** Spegne la fotocamera: la spia accesa a vuoto è sciatta e consuma. */
  function spegni() {
    pronto = false;
    if (!flusso) return;
    flusso.getTracks().forEach((t) => t.stop());
    flusso = null;
    if (video) video.srcObject = null;
  }

  /** Fotogramma corrente come JPEG, alla risoluzione piena del flusso. */
  async function scatta() {
    if (!pronto || !video || !video.videoWidth) throw new Error('mirino non pronto');
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d', { alpha: false });
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    return new Promise((risolvi, rifiuta) => {
      canvas.toBlob(
        (blob) => (blob ? risolvi(blob) : rifiuta(new Error('scatto non riuscito'))),
        'image/jpeg',
        0.92,
      );
    });
  }

  const acceso = () => pronto;

  return { accendi, spegni, scatta, acceso, supportato };
})();
