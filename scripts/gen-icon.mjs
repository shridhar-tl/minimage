// Generates a 1024x1024 source PNG app icon (no external deps — uses Node's zlib).
// `tauri icon` then derives every platform icon (ico/icns/png) from it.
import { deflateSync } from 'node:zlib';
import { writeFileSync } from 'node:fs';

const S = 1024;
const buf = Buffer.alloc(S * S * 4);

// ---- helpers -------------------------------------------------------------
const clamp = (v) => (v < 0 ? 0 : v > 255 ? 255 : v | 0);
const lerp = (a, b, t) => a + (b - a) * t;
function mix(base, over) {
  // over: [r,g,b,a] with a in 0..1 ; base: [r,g,b] opaque
  const a = over[3];
  return [
    clamp(lerp(base[0], over[0], a)),
    clamp(lerp(base[1], over[1], a)),
    clamp(lerp(base[2], over[2], a)),
  ];
}
function inTriangle(px, py, ax, ay, bx, by, cx, cy) {
  const d1 = (px - bx) * (ay - by) - (ax - bx) * (py - by);
  const d2 = (px - cx) * (by - cy) - (bx - cx) * (py - cy);
  const d3 = (px - ax) * (cy - ay) - (cx - ax) * (py - ay);
  const neg = d1 < 0 || d2 < 0 || d3 < 0;
  const pos = d1 > 0 || d2 > 0 || d3 > 0;
  return !(neg && pos);
}

// gradient stops (indigo -> violet -> pink)
const c0 = [99, 102, 241];
const c1 = [139, 92, 246];
const c2 = [236, 72, 153];
const radius = 196;

for (let y = 0; y < S; y++) {
  for (let x = 0; x < S; x++) {
    const i = (y * S + x) * 4;

    // rounded-rect mask (anti-aliased edge)
    let alpha = 1;
    const rx = Math.max(radius - x, x - (S - radius), 0);
    const ry = Math.max(radius - y, y - (S - radius), 0);
    if (rx > 0 && ry > 0) {
      const d = Math.sqrt(rx * rx + ry * ry);
      alpha = clamp((radius - d) * 255 / 1.5) / 255 > 0 ? Math.min(1, Math.max(0, (radius - d) / 1.5)) : 0;
    }

    // diagonal gradient background
    const t = (x / S) * 0.35 + (y / S) * 0.65;
    let col = t < 0.5 ? [lerp(c0[0], c1[0], t * 2), lerp(c0[1], c1[1], t * 2), lerp(c0[2], c1[2], t * 2)]
                      : [lerp(c1[0], c2[0], (t - 0.5) * 2), lerp(c1[1], c2[1], (t - 0.5) * 2), lerp(c1[2], c2[2], (t - 0.5) * 2)];

    // sun
    const sdx = x - 712, sdy = y - 320;
    const sd = Math.sqrt(sdx * sdx + sdy * sdy);
    if (sd < 122) col = mix(col, [255, 255, 255, 0.9 * Math.min(1, (122 - sd) / 8)]);

    // back mountain
    if (inTriangle(x, y, 250, 760, 660, 380, 980, 760)) col = mix(col, [255, 255, 255, 0.32]);
    // front mountain
    if (inTriangle(x, y, 60, 800, 430, 470, 760, 800)) col = mix(col, [255, 255, 255, 0.6]);

    // bottom frame bar (gives a "photo" feel)
    if (y > 792 && y < 824) col = mix(col, [255, 255, 255, 0.18]);

    buf[i] = clamp(col[0]);
    buf[i + 1] = clamp(col[1]);
    buf[i + 2] = clamp(col[2]);
    buf[i + 3] = clamp(alpha * 255);
  }
}

// ---- minimal PNG encoder -------------------------------------------------
function crc32(data) {
  let c = ~0;
  for (let n = 0; n < data.length; n++) {
    c ^= data[n];
    for (let k = 0; k < 8; k++) c = c & 1 ? (c >>> 1) ^ 0xedb88320 : c >>> 1;
  }
  return (~c) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, 'ascii');
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([len, typeBuf, data, crcBuf]);
}

// add filter byte (0) at the start of each scanline
const raw = Buffer.alloc(S * (S * 4 + 1));
for (let y = 0; y < S; y++) {
  raw[y * (S * 4 + 1)] = 0;
  buf.copy(raw, y * (S * 4 + 1) + 1, y * S * 4, (y + 1) * S * 4);
}

const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(S, 0);
ihdr.writeUInt32BE(S, 4);
ihdr[8] = 8;   // bit depth
ihdr[9] = 6;   // color type RGBA
ihdr[10] = 0;
ihdr[11] = 0;
ihdr[12] = 0;

const png = Buffer.concat([
  Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
  chunk('IHDR', ihdr),
  chunk('IDAT', deflateSync(raw, { level: 9 })),
  chunk('IEND', Buffer.alloc(0)),
]);

writeFileSync(new URL('../app-icon.png', import.meta.url), png);
console.log('Wrote app-icon.png (1024x1024)');
