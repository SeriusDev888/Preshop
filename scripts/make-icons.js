// สร้างไอคอนแอป (PNG) จากรูปทรงโลโก้ Preshop: ถุงช้อปปิ้ง + เครื่องหมายถูก บนพื้นแดง
// ใช้: node scripts/make-icons.js   (ไม่ต้องติดตั้งอะไรเพิ่ม)
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';

const OUT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'public', 'icons');
fs.mkdirSync(OUT, { recursive: true });

const RED = [214, 40, 40];
const WHITE = [255, 255, 255];
const DARK = [17, 17, 17];

// ── signed distance functions (หน่วย: พิกัดบนผืน 0..1) ──
const sdRoundRect = (x, y, cx, cy, hw, hh, r) => {
  const qx = Math.abs(x - cx) - hw + r;
  const qy = Math.abs(y - cy) - hh + r;
  return Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - r;
};
const sdSegment = (x, y, ax, ay, bx, by, r) => {
  const px = x - ax, py = y - ay, dx = bx - ax, dy = by - ay;
  const h = Math.max(0, Math.min(1, (px * dx + py * dy) / (dx * dx + dy * dy)));
  return Math.hypot(px - dx * h, py - dy * h) - r;
};
// ถุงทรงคางหมู: กว้างล่างกว่าบนเล็กน้อย มุมมน
const sdBag = (x, y) => {
  const top = 0.37, bottom = 0.8;
  const t = Math.max(0, Math.min(1, (y - top) / (bottom - top)));
  const hw = 0.22 + 0.035 * t;
  return sdRoundRect(x, y, 0.5, (top + bottom) / 2, hw, (bottom - top) / 2, 0.06);
};
const sdHandle = (x, y) => {
  // ครึ่งวงแหวนด้านบนของถุง
  if (y > 0.37) return 1;
  return Math.abs(Math.hypot(x - 0.5, y - 0.37) - 0.13) - 0.035;
};

// วาดตามลำดับชั้น: [sdf, สี]
function layers(maskable) {
  // maskable: ย่อเนื้อหาเข้าในวงกลมปลอดภัย 80%
  const s = maskable ? 0.78 : 0.92;
  const tf = (f) => (x, y) => f((x - 0.5) / s + 0.5, (y - 0.5) / s + 0.5) * s;
  return [
    [tf(sdHandle), WHITE],
    [tf(sdBag), WHITE],
    // เครื่องหมายถูกสีแดงในถุง
    [tf((x, y) => Math.min(sdSegment(x, y, 0.405, 0.6, 0.47, 0.665, 0.032), sdSegment(x, y, 0.47, 0.665, 0.6, 0.53, 0.032))), RED],
    // ขีดปฏิทินด้านบนในถุง
    [tf((x, y) => sdSegment(x, y, 0.4, 0.46, 0.6, 0.46, 0.014)), RED],
  ];
}

function render(size, { maskable = false, rounded = false } = {}) {
  const px = Buffer.alloc(size * size * 4);
  const L = layers(maskable);
  const SS = 4;
  for (let j = 0; j < size; j++) {
    for (let i = 0; i < size; i++) {
      let r = 0, g = 0, b = 0, a = 0;
      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const x = (i + (sx + 0.5) / SS) / size;
          const y = (j + (sy + 0.5) / SS) / size;
          // พื้นหลัง: เต็มผืน (maskable) หรือสี่เหลี่ยมมุมมน
          const inBg = !rounded || sdRoundRect(x, y, 0.5, 0.5, 0.5, 0.5, 0.22) <= 0;
          if (!inBg) continue;
          let c = RED;
          for (const [f, col] of L) if (f(x, y) <= 0) c = col;
          r += c[0]; g += c[1]; b += c[2]; a += 255;
        }
      }
      const n = SS * SS;
      const o = (j * size + i) * 4;
      const cov = a / 255;
      px[o] = cov ? Math.round(r / cov) : 0;
      px[o + 1] = cov ? Math.round(g / cov) : 0;
      px[o + 2] = cov ? Math.round(b / cov) : 0;
      px[o + 3] = Math.round(a / n);
    }
  }
  return encodePng(size, size, px);
}

// ── PNG encoder ──
const CRC = new Int32Array(256).map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c;
});
const crc32 = (buf) => {
  let c = -1;
  for (const v of buf) c = CRC[(c ^ v) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
};
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
function encodePng(w, h, rgba) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  const raw = Buffer.alloc((w * 4 + 1) * h);
  for (let y = 0; y < h; y++) {
    raw[y * (w * 4 + 1)] = 0;
    rgba.copy(raw, y * (w * 4 + 1) + 1, y * w * 4, (y + 1) * w * 4);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

const files = {
  'icon-192.png': render(192, { rounded: true }),
  'icon-512.png': render(512, { rounded: true }),
  'maskable-192.png': render(192, { maskable: true }),
  'maskable-512.png': render(512, { maskable: true }),
  'apple-touch-icon.png': render(180),
};
for (const [name, buf] of Object.entries(files)) {
  fs.writeFileSync(path.join(OUT, name), buf);
  console.log('สร้าง', name, buf.length, 'bytes');
}
void DARK;
