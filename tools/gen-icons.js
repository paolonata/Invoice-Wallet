/* Genera le icone PNG dell'app senza dipendenze esterne.
   Rendering supersampled 4x + box filter, encoder PNG via zlib. */
const zlib = require('zlib');
const fs = require('fs');
const path = require('path');

const SS = 4; // supersampling

function makeCanvas(size) {
  const w = size * SS;
  const buf = new Uint8ClampedArray(w * w * 4); // RGBA
  return { w, buf };
}

function px(c, x, y, [r, g, b, a = 255]) {
  if (x < 0 || y < 0 || x >= c.w || y >= c.w) return;
  const i = (y * c.w + x) * 4;
  const al = a / 255;
  c.buf[i]     = c.buf[i]     * (1 - al) + r * al;
  c.buf[i + 1] = c.buf[i + 1] * (1 - al) + g * al;
  c.buf[i + 2] = c.buf[i + 2] * (1 - al) + b * al;
  c.buf[i + 3] = Math.max(c.buf[i + 3], a);
}

function fillRoundRect(c, x, y, w, h, r, colorFn) {
  for (let py = Math.floor(y); py < Math.ceil(y + h); py++) {
    for (let pxx = Math.floor(x); pxx < Math.ceil(x + w); pxx++) {
      const dx = Math.max(x + r - pxx, pxx - (x + w - r), 0);
      const dy = Math.max(y + r - py, py - (y + h - r), 0);
      if (dx * dx + dy * dy > r * r) continue;
      px(c, pxx, py, typeof colorFn === 'function' ? colorFn(pxx, py) : colorFn);
    }
  }
}

function fillPolygon(c, pts, color) {
  const ys = pts.map((p) => p[1]);
  const y0 = Math.floor(Math.min(...ys));
  const y1 = Math.ceil(Math.max(...ys));
  for (let y = y0; y <= y1; y++) {
    const xs = [];
    for (let i = 0; i < pts.length; i++) {
      const [ax, ay] = pts[i];
      const [bx, by] = pts[(i + 1) % pts.length];
      if ((ay <= y && by > y) || (by <= y && ay > y)) {
        xs.push(ax + ((y - ay) / (by - ay)) * (bx - ax));
      }
    }
    xs.sort((a, b) => a - b);
    for (let k = 0; k + 1 < xs.length; k += 2) {
      for (let x = Math.round(xs[k]); x < Math.round(xs[k + 1]); x++) px(c, x, y, color);
    }
  }
}

function downsample(c, size) {
  const out = Buffer.alloc(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let r = 0, g = 0, b = 0, a = 0;
      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const i = ((y * SS + sy) * c.w + (x * SS + sx)) * 4;
          r += c.buf[i]; g += c.buf[i + 1]; b += c.buf[i + 2]; a += c.buf[i + 3];
        }
      }
      const n = SS * SS;
      const o = (y * size + x) * 4;
      out[o] = Math.round(r / n); out[o + 1] = Math.round(g / n);
      out[o + 2] = Math.round(b / n); out[o + 3] = Math.round(a / n);
    }
  }
  return out;
}

function encodePNG(rgba, size) {
  const raw = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0; // filtro "none"
    rgba.copy(raw, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4);
  }
  const chunk = (type, data) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(body) >>> 0);
    return Buffer.concat([len, body, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

const CRC_TABLE = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();
function crc32(buf) {
  let c = -1;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return c ^ -1;
}

/* ── Disegno dell'icona ── */
function drawIcon(size, { maskable = false } = {}) {
  const c = makeCanvas(size);
  const S = size * SS;
  const pad = maskable ? S * 0.16 : 0;
  const radius = maskable ? S / 2 : S * 0.22;

  // sfondo: inchiostro, appena schiarito in alto
  const top = [38, 36, 46], bot = [18, 17, 22];
  fillRoundRect(c, pad, pad, S - pad * 2, S - pad * 2, maskable ? radius : radius, (x, y) => {
    const t = (y - pad) / (S - pad * 2);
    return [
      Math.round(top[0] + (bot[0] - top[0]) * t),
      Math.round(top[1] + (bot[1] - top[1]) * t),
      Math.round(top[2] + (bot[2] - top[2]) * t),
      255,
    ];
  });

  // scontrino bianco con bordo inferiore a zigzag
  const inner = S - pad * 2;
  const rw = inner * 0.46;
  const rh = inner * 0.60;
  const rx = pad + (inner - rw) / 2;
  const ry = pad + (inner - rh) / 2 - inner * 0.02;
  const white = [255, 255, 255, 255];

  fillRoundRect(c, rx, ry, rw, rh * 0.9, inner * 0.035, white);

  const teeth = 4;
  const zig = [];
  const zigTop = ry + rh * 0.82;
  zig.push([rx, zigTop]);
  for (let i = 0; i <= teeth * 2; i++) {
    const x = rx + (rw / (teeth * 2)) * i;
    zig.push([x, zigTop + (i % 2 === 0 ? 0 : rh * 0.13)]);
  }
  zig.push([rx + rw, zigTop]);
  fillPolygon(c, zig, white);

  // righe di testo: due grigie e l'ultima blu, come una firma a penna
  const grigio = [176, 178, 190, 255];
  const penna = [47, 83, 240, 255];
  const lx = rx + rw * 0.16;
  const lw = rw * 0.68;
  const lh = rh * 0.055;
  [0.16, 0.36, 0.56].forEach((t, i) => {
    fillRoundRect(c, lx, ry + rh * t, i === 2 ? lw * 0.55 : lw, lh, lh / 2, i === 2 ? penna : grigio);
  });

  return encodePNG(downsample(c, size), size);
}

const outDir = path.resolve(process.argv[2] || 'icons');
fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, 'icon-192.png'), drawIcon(192));
fs.writeFileSync(path.join(outDir, 'icon-512.png'), drawIcon(512));
fs.writeFileSync(path.join(outDir, 'icon-maskable-512.png'), drawIcon(512, { maskable: true }));
fs.writeFileSync(path.join(outDir, 'apple-touch-icon.png'), drawIcon(180));
console.log('Icone generate in', outDir);
