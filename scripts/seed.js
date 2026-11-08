// สร้างข้อมูลตัวอย่างสำหรับทดลองระบบ: node scripts/seed.js
import { db, nowIso } from '../src/db.js';

const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Bangkok' });
const addDays = (d, n) => {
  const x = new Date(d + 'T00:00:00Z');
  x.setUTCDate(x.getUTCDate() + n);
  return x.toISOString().slice(0, 10);
};

// ร้านเพิ่มเติม: เจ้าของเดิมเปิดร้านที่ 2 + ร้านของคนอื่น ให้ตัวกรองหมวดมีของ
function extraShops() {
  const owner = user('0800000001', 'แม่มาลี');
  const other = user('0800000003', 'ป้าจันทร์', { line: 'pajan' });
  db.prepare(`UPDATE shops SET category = 'dessert', delivery_fee_base = 20, delivery_base_km = 2, delivery_fee_per_km = 8, free_delivery_min = 1000, free_delivery_max_km = 3 WHERE slug = 'baan-mae'`).run();
  const mk = (ownerId, slug, name, category, desc, lat, lng, items, extra = {}) => {
    if (db.prepare('SELECT 1 FROM shops WHERE slug = ?').get(slug)) return;
    const id = db
      .prepare(
        `INSERT INTO shops (owner_id, slug, name, category, description, phone, address, lat, lng, default_radius_km, delivery_fee_base, delivery_base_km, delivery_fee_per_km,
          free_delivery_min, free_delivery_max_km, min_lead_days, open_time, close_time, is_open, promptpay_id, created_at)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`
      )
      .run(ownerId, slug, name, category, desc, '0800000001', extra.address || 'ซอยพหลโยธิน 52 เขตสายไหม', lat, lng, extra.radius ?? 6, 25, 2, 8, extra.freeMin ?? 1000, extra.freeKm ?? 3,
        extra.lead ?? 1, '08:00', '18:00', extra.open ?? 1, '0800000001', nowIso()).lastInsertRowid;
    const P = db.prepare('INSERT INTO products (shop_id, name, description, category, price, unit, min_qty, created_at) VALUES (?,?,?,?,?,?,?,?)');
    for (const it of items) P.run(id, ...it, nowIso());
  };
  mk(owner, 'baan-mae-kitchen', 'ข้าวกล่องบ้านแม่', 'food', 'ข้าวกล่องสำหรับงานประชุม งานบุญ สั่งขั้นต่ำ 10 กล่อง', 13.8879, 100.6151, [
    ['ข้าวกะเพราไก่ไข่ดาว', 'กะเพราแท้ เผ็ดกลาง', 'ข้าวกล่อง', 55, 'กล่อง', 10],
    ['ข้าวผัดหมู', 'ข้าวหอมมะลิ ผัดไฟแรง', 'ข้าวกล่อง', 50, 'กล่อง', 10],
    ['ข้าวมันไก่', 'น้ำจิ้มเต้าเจี้ยวสูตรบ้าน', 'ข้าวกล่อง', 50, 'กล่อง', 10],
  ]);
  mk(other, 'pajan-sangkhathan', 'ชุดสังฆทานป้าจันทร์', 'merit', 'จัดชุดสังฆทาน ถวายพระ ของใช้จำเป็นครบชุด', 13.8722, 100.5968, [
    ['ชุดสังฆทานมาตรฐาน', 'ของใช้จำเป็น 12 รายการ', 'สังฆทาน', 299, 'ชุด', 1],
    ['ชุดสังฆทานยา', 'ยาสามัญประจำบ้าน', 'สังฆทาน', 399, 'ชุด', 1],
  ], { lead: 2, radius: 10 });
  mk(other, 'pajan-bakery', 'ขนมปังโฮมเมดป้าจันทร์', 'bakery', 'ขนมปังสังขยา บัตเตอร์เค้ก อบใหม่ทุกวัน', 13.8731, 100.5973, [
    ['ขนมปังสังขยาใบเตย', 'แป้งนุ่ม สังขยาหอม', 'ขนมปัง', 45, 'ชิ้น', 1],
    ['บัตเตอร์เค้ก', 'เนยสดแท้', 'เค้ก', 180, 'ปอนด์', 1],
  ], { open: 0 });
  const loc = db.prepare(`UPDATE shops SET province = ?, district = ? WHERE slug = ? AND province = ''`);
  for (const [slug, d] of [['baan-mae', 'สายไหม'], ['baan-mae-kitchen', 'สายไหม'], ['pajan-sangkhathan', 'บางเขน'], ['pajan-bakery', 'บางเขน']]) loc.run('กรุงเทพมหานคร', d, slug);
}

if (db.prepare('SELECT 1 FROM shops WHERE slug = ?').get('baan-mae')) {
  extraShops();
  console.log('อัปเดตข้อมูลตัวอย่างแล้ว');
  process.exit(0);
}

function user(phone, name, contacts = {}) {
  const u = db.prepare('SELECT id FROM users WHERE phone = ?').get(phone);
  if (u) return u.id;
  return db.prepare('INSERT INTO users (phone, name, contacts, created_at) VALUES (?,?,?,?)').run(phone, name, JSON.stringify(contacts), nowIso()).lastInsertRowid;
}

const sellerId = user('0800000001', 'แม่มาลี', { facebook: 'ขนมไทยบ้านแม่', line: 'baanmae' });
const buyerId = user('0800000002', 'สมชาย ใจดี', { line: 'somchai.j' });

const shopId = db
  .prepare(
    `INSERT INTO shops (owner_id, slug, name, description, phone, address, lat, lng, contacts, default_radius_km, delivery_fee_base, delivery_fee_per_km,
      free_delivery_min, areas, min_lead_days, open_time, close_time, closed_weekdays, promptpay_id, bank_info, created_at)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`
  )
  .run(
    sellerId, 'baan-mae', 'ขนมไทยบ้านแม่',
    'ขนมไทยทำสดใหม่ทุกเช้า ไม่ใส่สารกันบูด รับจัดชุดถวายพระ งานบุญ งานเลี้ยง สั่งล่วงหน้าอย่างน้อย 1 วัน',
    '0800000001', '99/9 ซอยพหลโยธิน 52 แขวงคลองถนน เขตสายไหม (ตรงข้ามเซเว่น)', 13.8885, 100.6145,
    JSON.stringify({ facebook: 'ขนมไทยบ้านแม่', line: 'baanmae' }),
    8, 20, 5, 500, 'สายไหม,บางเขน,ดอนเมือง,ลาดพร้าว', 1, '07:00', '17:00', '1', '0800000001', 'กสิกรไทย 012-3-45678-9 มาลี ใจงาม', nowIso()
  ).lastInsertRowid;

const P = db.prepare(
  `INSERT INTO products (shop_id, name, description, category, price, unit, min_qty, daily_limit, lead_days, delivery_allowed, pickup_allowed, delivery_radius_km, allowed_areas, sort, created_at)
   VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`
);
const products = [
  ['บัวลอยไข่หวาน', 'บัวลอยแป้งนุ่ม 3 สี กะทิสด ไข่หวานฟอง', 'ขนมน้ำ', 25, 'ถ้วย', 5, 150, null, 1, 1, 5, 'สายไหม,บางเขน', 1],
  ['ลอดช่องน้ำกะทิ', 'ลอดช่องใบเตยแท้ น้ำกะทิหอมควันเทียน', 'ขนมน้ำ', 20, 'ถ้วย', 5, 150, null, 1, 1, 5, '', 2],
  ['ทับทิมกรอบ', 'แห้วสด กรอบนอกนุ่มใน แยกน้ำกะทิ', 'ขนมน้ำ', 25, 'ถ้วย', 5, 100, null, 1, 1, null, '', 3],
  ['ขนมชั้น', 'ขนมชั้นใบเตย 9 ชั้น ตัดชิ้นพอดีคำ', 'ขนมแห้ง', 120, 'ถาด', 1, 20, 2, 1, 1, null, '', 4],
  ['ข้าวเหนียวมูนสังขยา', 'ข้าวเหนียวเขี้ยวงู สังขยาไข่เป็ด', 'ขนมแห้ง', 35, 'กล่อง', 1, 80, null, 1, 1, null, '', 5],
  ['ชุดถวายพระ 9 อย่าง', 'ทองหยิบ ทองหยอด ฝอยทอง เม็ดขนุน ขนมชั้น ถ้วยฟู ทองเอก จ่ามงกุฎ เสน่ห์จันทร์', 'ชุดงานบุญ', 390, 'ชุด', 1, 10, 3, 1, 1, null, '', 6],
  ['ขนมเบื้องไทย (รับเองเท่านั้น)', 'ทำสดตอนรับ กรอบต้องทานทันที', 'ขนมแห้ง', 60, 'กล่อง', 1, 30, null, 0, 1, null, '', 7],
];
const pid = {};
for (const p of products) pid[p[0]] = P.run(shopId, ...p, nowIso()).lastInsertRowid;

function order(code, dayOffset, status, payment, ful, items, extra = {}) {
  const date = addDays(today, dayOffset);
  const subtotal = items.reduce((s, [n, q]) => s + products.find((p) => p[0] === n)[3] * q, 0);
  const fee = ful === 'delivery' ? (subtotal >= 500 ? 0 : 35) : 0;
  const now = nowIso();
  const id = db
    .prepare(
      `INSERT INTO orders (code, shop_id, buyer_id, status, fulfillment, receive_date, receive_time, purpose, recipient_name, recipient_phone, address, area, lat, lng, distance_km,
        subtotal, delivery_fee, total, payment_method, payment_status, buyer_note, created_at, updated_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`
    )
    .run(code, shopId, buyerId, status, ful, date, extra.time || '09:00', extra.purpose || '', 'สมชาย ใจดี', '0800000002',
      ful === 'delivery' ? '12/3 หมู่บ้านสุขใจ ซอย 7 ถ.สายไหม' : '', ful === 'delivery' ? 'สายไหม' : '',
      ful === 'delivery' ? 13.9002 : null, ful === 'delivery' ? 100.6301 : null, ful === 'delivery' ? 2.12 : null,
      subtotal, fee, subtotal + fee, payment === 'cod' ? 'cod' : 'transfer', payment === 'cod' ? 'unpaid' : payment, extra.note || '', now, now).lastInsertRowid;
  const I = db.prepare('INSERT INTO order_items (order_id, product_id, name, unit, price, qty, note) VALUES (?,?,?,?,?,?,?)');
  for (const [n, q, note] of items) {
    const p = products.find((x) => x[0] === n);
    I.run(id, pid[n], n, p[4], p[3], q, note || '');
  }
  db.prepare('INSERT INTO order_events (order_id, actor, kind, message, created_at) VALUES (?,?,?,?,?)').run(id, 'buyer', 'created', 'สร้างคำสั่งซื้อ', now);
}

order('PSDEMO-A001', 1, 'pending', 'unpaid', 'delivery', [['บัวลอยไข่หวาน', 30, 'หวานน้อย'], ['ลอดช่องน้ำกะทิ', 20]], { purpose: 'ทำบุญ / ถวายพระ', time: '07:30', note: 'ส่งที่ศาลาวัด ฝากไว้กับลุงยาม' });
order('PSDEMO-A002', 1, 'confirmed', 'paid', 'pickup', [['ขนมชั้น', 2], ['ข้าวเหนียวมูนสังขยา', 10]], { purpose: 'งานเลี้ยง / ประชุม', time: '10:00' });
order('PSDEMO-A003', 0, 'preparing', 'cod', 'delivery', [['ทับทิมกรอบ', 15]], { time: '14:00' });
order('PSDEMO-A004', 3, 'confirmed', 'pending_review', 'delivery', [['ชุดถวายพระ 9 อย่าง', 2], ['บัวลอยไข่หวาน', 10]], { purpose: 'งานบวช', time: '08:00' });

db.prepare('INSERT INTO feedback (shop_id, user_id, kind, rating, message, created_at) VALUES (?,?,?,?,?,?)').run(shopId, buyerId, 'review', 5, 'บัวลอยนุ่มมาก กะทิหอม ส่งตรงเวลา', nowIso());
db.prepare('INSERT INTO feedback (shop_id, user_id, kind, rating, message, created_at) VALUES (?,?,?,?,?,?)').run(shopId, buyerId, 'request', null, 'อยากให้มีขนมถ้วยกับขนมกล้วยด้วยครับ', nowIso());

extraShops();
console.log('สร้างข้อมูลตัวอย่างแล้ว');
console.log('  ร้าน:   /s/baan-mae  (ผู้ขาย 0800000001)');
console.log('  ผู้ซื้อ: 0800000002');
