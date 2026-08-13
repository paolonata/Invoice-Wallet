/* ══════════════════════════════════════════════════════════════
   Mini scrittore ZIP (metodo "store", senza compressione).
   Serve per esportare tutte le foto in un unico file, senza librerie.
   Le foto sono già JPEG: comprimerle di nuovo non darebbe vantaggi.
   ══════════════════════════════════════════════════════════════ */

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[i] = c >>> 0;
  }
  return table;
})();

function crc32(bytes) {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function dosDateTime(date) {
  const year = Math.max(1980, date.getFullYear());
  return {
    time: (date.getHours() << 11) | (date.getMinutes() << 5) | (date.getSeconds() >> 1),
    date: ((year - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate(),
  };
}

class ZipBuilder {
  constructor() {
    this.parts = [];      // pezzi del file finale
    this.entries = [];    // metadati per la central directory
    this.offset = 0;      // posizione corrente in byte
  }

  /** @param {string} name percorso interno allo zip @param {Blob|string} content */
  async add(name, content, modified = new Date()) {
    const bytes = content instanceof Blob
      ? new Uint8Array(await content.arrayBuffer())
      : new TextEncoder().encode(String(content));

    const nameBytes = new TextEncoder().encode(name);
    const crc = crc32(bytes);
    const { time, date } = dosDateTime(modified);

    const header = new DataView(new ArrayBuffer(30));
    header.setUint32(0, 0x04034b50, true);
    header.setUint16(4, 20, true);      // versione necessaria
    header.setUint16(6, 0x0800, true);  // nomi in UTF-8
    header.setUint16(8, 0, true);       // metodo: store
    header.setUint16(10, time, true);
    header.setUint16(12, date, true);
    header.setUint32(14, crc, true);
    header.setUint32(18, bytes.length, true);
    header.setUint32(22, bytes.length, true);
    header.setUint16(26, nameBytes.length, true);
    header.setUint16(28, 0, true);

    this.parts.push(header.buffer, nameBytes, bytes);
    this.entries.push({ nameBytes, crc, size: bytes.length, time, date, offset: this.offset });
    this.offset += 30 + nameBytes.length + bytes.length;
  }

  build() {
    const cdParts = [];
    let cdSize = 0;

    for (const e of this.entries) {
      const h = new DataView(new ArrayBuffer(46));
      h.setUint32(0, 0x02014b50, true);
      h.setUint16(4, 20, true);          // versione di creazione
      h.setUint16(6, 20, true);          // versione necessaria
      h.setUint16(8, 0x0800, true);
      h.setUint16(10, 0, true);
      h.setUint16(12, e.time, true);
      h.setUint16(14, e.date, true);
      h.setUint32(16, e.crc, true);
      h.setUint32(20, e.size, true);
      h.setUint32(24, e.size, true);
      h.setUint16(28, e.nameBytes.length, true);
      h.setUint16(30, 0, true);          // extra
      h.setUint16(32, 0, true);          // commento
      h.setUint16(34, 0, true);          // disco
      h.setUint16(36, 0, true);          // attributi interni
      h.setUint32(38, 0, true);          // attributi esterni
      h.setUint32(42, e.offset, true);
      cdParts.push(h.buffer, e.nameBytes);
      cdSize += 46 + e.nameBytes.length;
    }

    const end = new DataView(new ArrayBuffer(22));
    end.setUint32(0, 0x06054b50, true);
    end.setUint16(4, 0, true);
    end.setUint16(6, 0, true);
    end.setUint16(8, this.entries.length, true);
    end.setUint16(10, this.entries.length, true);
    end.setUint32(12, cdSize, true);
    end.setUint32(16, this.offset, true);
    end.setUint16(20, 0, true);

    return new Blob([...this.parts, ...cdParts, end.buffer], { type: 'application/zip' });
  }
}

/** Testo CSV con le virgolette gestite come si deve. */
function toCSV(rows) {
  const cell = (v) => {
    const s = String(v ?? '');
    return /[";\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  // BOM: così Excel apre gli accenti correttamente
  return '\uFEFF' + rows.map((r) => r.map(cell).join(';')).join('\r\n');
}

/* ══════════════════════════════════════════════════════════════
   Lettura ZIP: serve per ripristinare un backup creato dall'app
   (o rigenerato a mano con qualunque programma di archiviazione).
   ══════════════════════════════════════════════════════════════ */

async function readZip(blob) {
  const size = blob.size;
  // La "end of central directory" sta in fondo, dopo un eventuale commento.
  const tailSize = Math.min(size, 66000);
  const tail = new DataView(await blob.slice(size - tailSize).arrayBuffer());

  let eocd = -1;
  for (let i = tail.byteLength - 22; i >= 0; i--) {
    if (tail.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error('File ZIP non valido');

  const total = tail.getUint16(eocd + 10, true);
  const cdSize = tail.getUint32(eocd + 12, true);
  const cdOffset = tail.getUint32(eocd + 16, true);

  const cd = new DataView(await blob.slice(cdOffset, cdOffset + cdSize).arrayBuffer());
  const decoder = new TextDecoder();
  const files = new Map();
  let pos = 0;

  for (let i = 0; i < total && pos + 46 <= cd.byteLength; i++) {
    if (cd.getUint32(pos, true) !== 0x02014b50) break;
    const method = cd.getUint16(pos + 10, true);
    const compSize = cd.getUint32(pos + 20, true);
    const nameLen = cd.getUint16(pos + 28, true);
    const extraLen = cd.getUint16(pos + 30, true);
    const commentLen = cd.getUint16(pos + 32, true);
    const localOffset = cd.getUint32(pos + 42, true);
    const name = decoder.decode(new Uint8Array(cd.buffer, pos + 46, nameLen));
    pos += 46 + nameLen + extraLen + commentLen;

    if (name.endsWith('/')) continue; // cartella

    // Il local header ha lunghezze di nome/extra proprie: vanno rilette.
    const lh = new DataView(await blob.slice(localOffset, localOffset + 30).arrayBuffer());
    if (lh.getUint32(0, true) !== 0x04034b50) continue;
    const dataStart = localOffset + 30 + lh.getUint16(26, true) + lh.getUint16(28, true);
    let part = blob.slice(dataStart, dataStart + compSize);

    if (method === 8) {
      if (typeof DecompressionStream !== 'function') {
        throw new Error('Questo browser non sa leggere archivi compressi: usa un backup creato dall\'app.');
      }
      part = await new Response(part.stream().pipeThrough(new DecompressionStream('deflate-raw'))).blob();
    } else if (method !== 0) {
      throw new Error(`Metodo di compressione non supportato (${method})`);
    }
    files.set(name, part);
  }
  return files;
}
