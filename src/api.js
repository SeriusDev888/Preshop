import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { db, tx, nowIso, UPLOAD_DIR } from './db.js';
import { sendSms, SMS_DEV } from './sms.js';

// ───────────────────────── helpers ─────────────────────────

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}
const bad = (msg) => new HttpError(400, msg);

const SESSION_COOKIE = 'ps_session';
const SESSION_DAYS = 30;
// ขึ้นระบบจริง (NODE_ENV=production) → ส่ง cookie เฉพาะผ่าน HTTPS
const COOKIE_SECURE = process.env.NODE_ENV === 'production' ? '; Secure' : '';
const ADMIN_PHONES = (process.env.ADMIN_PHONES || '').split(',').map((s) => s.trim()).filter(Boolean);

const sha256 = (s) => crypto.createHash('sha256').update(s).digest('hex');

// วันที่ปัจจุบันตามเวลาไทย (YYYY-MM-DD)
const todayTH = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Bangkok' });
function addDays(dateStr, n) {
  const d = new Date(dateStr + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
const isDate = (s) => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && !isNaN(Date.parse(s + 'T00:00:00Z'));
const isTime = (s) => typeof s === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(s);
const weekday = (dateStr) => new Date(dateStr + 'T00:00:00Z').getUTCDay();

export function normalizePhone(input) {
  let d = String(input || '').replace(/\D/g, '');
  if (d.startsWith('66') && d.length === 11) d = '0' + d.slice(2);
  return d;
}
const isMobile = (p) => /^0[689]\d{8}$/.test(p);
const isPhone = (p) => /^0\d{8,9}$/.test(p);

function str(v, { max = 500, required = false, label = 'ข้อมูล' } = {}) {
  const s = v == null ? '' : String(v).trim();
  if (required && !s) throw bad(`กรุณากรอก${label}`);
  if (s.length > max) throw bad(`${label}ยาวเกิน ${max} ตัวอักษร`);
  return s;
}
function num(v, { min = 0, max = 1e9, label = 'ตัวเลข', nullable = false } = {}) {
  if (nullable && (v === null || v === undefined || v === '')) return null;
  const n = Number(v);
  if (!Number.isFinite(n) || n < min || n > max) throw bad(`${label}ต้องอยู่ระหว่าง ${min}–${max}`);
  return n;
}
const int = (v, o = {}) => {
  const n = num(v, o);
  return n === null ? null : Math.round(n);
};
const bool = (v) => (v === true || v === 1 || v === '1' || v === 'true' ? 1 : 0);
const csvList = (s) => String(s || '').split(',').map((x) => x.trim()).filter(Boolean);

function parseJson(s, fallback) {
  try {
    return JSON.parse(s);
  } catch {
    return fallback;
  }
}

const CONTACT_KEYS = ['facebook', 'line', 'instagram', 'tiktok', 'website', 'other'];
function cleanContacts(obj) {
  const out = {};
  if (obj && typeof obj === 'object') {
    for (const k of CONTACT_KEYS) {
      const v = str(obj[k], { max: 200, label: 'ช่องทางติดต่อ' });
      if (v) out[k] = v;
    }
  }
  return JSON.stringify(out);
}

function haversineKm(lat1, lng1, lat2, lng2) {
  const R = 6371;
  const toRad = (x) => (x * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

function parseCookies(header) {
  const out = {};
  for (const part of (header || '').split(';')) {
    const i = part.indexOf('=');
    if (i > 0) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}

async function readBody(req, limit = 8 * 1024 * 1024) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > limit) throw new HttpError(413, 'ไฟล์หรือข้อมูลใหญ่เกินไป');
    chunks.push(chunk);
  }
  if (!size) return {};
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    throw bad('รูปแบบข้อมูลไม่ถูกต้อง');
  }
}

// ───────────────────────── images ─────────────────────────

function saveImage(dataUrl) {
  const m = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/.exec(String(dataUrl || ''));
  if (!m) throw bad('รองรับเฉพาะรูป JPG, PNG หรือ WEBP');
  const buf = Buffer.from(m[2], 'base64');
  if (buf.length > 4 * 1024 * 1024) throw bad('รูปใหญ่เกิน 4MB');
  let ext;
  if (buf[0] === 0xff && buf[1] === 0xd8) ext = '.jpg';
  else if (buf.slice(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) ext = '.png';
  else if (buf.slice(0, 4).toString() === 'RIFF' && buf.slice(8, 12).toString() === 'WEBP') ext = '.webp';
  else throw bad('ไฟล์รูปไม่ถูกต้อง');
  const name = crypto.randomBytes(12).toString('hex') + ext;
  fs.writeFileSync(path.join(UPLOAD_DIR, name), buf);
  return '/uploads/' + name;
}
const isUploadUrl = (s) => typeof s === 'string' && /^\/uploads\/[a-f0-9]{24}\.(jpg|png|webp)$/.test(s);

// ───────────────────────── serializers ─────────────────────────

function userJson(u) {
  if (!u) return null;
  return {
    id: u.id,
    phone: u.phone,
    name: u.name,
    contacts: parseJson(u.contacts, {}),
    isAdmin: ADMIN_PHONES.includes(u.phone),
    location: u.lat != null ? { lat: u.lat, lng: u.lng, address: u.address, province: u.province, district: u.district } : null,
  };
}

// ระยะ/ค่าส่งจากที่อยู่ของผู้ใช้ไปยังร้าน
function forMe(shop, loc) {
  if (!loc || loc.lat == null || shop.lat == null) return null;
  const km = Math.round(haversineKm(loc.lat, loc.lng, shop.lat, shop.lng) * 10) / 10;
  const inRange = !!shop.delivery_enabled && km <= shop.default_radius_km;
  return { distanceKm: km, inRange, fee: inRange ? deliveryFee(shop, km).fee : null };
}

function shopJson(s, { full = false } = {}) {
  if (!s) return null;
  const out = {
    id: s.id,
    slug: s.slug,
    name: s.name,
    category: s.category,
    province: s.province,
    district: s.district,
    description: s.description,
    phone: s.phone,
    address: s.address,
    lat: s.lat,
    lng: s.lng,
    coverImage: s.cover_image,
    contacts: parseJson(s.contacts, {}),
    isOpen: !!s.is_open,
    closedMessage: s.closed_message,
    pickupEnabled: !!s.pickup_enabled,
    deliveryEnabled: !!s.delivery_enabled,
    defaultRadiusKm: s.default_radius_km,
    deliveryFeeBase: s.delivery_fee_base,
    deliveryBaseKm: s.delivery_base_km,
    deliveryFeePerKm: s.delivery_fee_per_km,
    freeDeliveryMin: s.free_delivery_min,
    freeDeliveryMaxKm: s.free_delivery_max_km,
    areas: csvList(s.areas),
    minOrderAmount: s.min_order_amount,
    minLeadDays: s.min_lead_days,
    maxAdvanceDays: s.max_advance_days,
    openTime: s.open_time,
    closeTime: s.close_time,
    closedWeekdays: csvList(s.closed_weekdays).map(Number),
    closedDates: csvList(s.closed_dates),
    transferEnabled: !!s.transfer_enabled,
    codEnabled: !!s.cod_enabled,
    promptpayId: s.promptpay_id,
    bankInfo: s.bank_info,
  };
  const acc = acceptingNow(s);
  out.orderCutoffTime = s.order_cutoff_time;
  out.pausedUntil = s.paused_until > todayTH() ? s.paused_until : '';
  out.fullDates = csvList(s.full_dates).filter((d) => d >= todayTH());
  out.dailyOrderLimit = s.daily_order_limit;
  out.accepting = acc.ok;
  out.statusMode = acc.mode;
  out.statusReason = acc.reason;
  out.suspended = !!s.suspended;
  out.suspendedReason = s.suspended_reason;
  out.orderBaseDate = orderBaseDate(s);
  out.pastCutoff = out.orderBaseDate !== todayTH();
  out.minReceiveDate = minReceiveDate(s);
  if (full) out.ownerId = s.owner_id;
  return out;
}

function productJson(p) {
  return {
    id: p.id,
    name: p.name,
    description: p.description,
    category: p.category,
    price: p.price,
    unit: p.unit,
    image: p.image,
    isActive: !!p.is_active,
    minQty: p.min_qty,
    dailyLimit: p.daily_limit,
    leadDays: p.lead_days,
    deliveryAllowed: !!p.delivery_allowed,
    pickupAllowed: !!p.pickup_allowed,
    deliveryRadiusKm: p.delivery_radius_km,
    allowedAreas: csvList(p.allowed_areas),
    sort: p.sort,
  };
}

function orderJson(o, { items, events, shop, buyer } = {}) {
  const out = {
    code: o.code,
    status: o.status,
    fulfillment: o.fulfillment,
    receiveDate: o.receive_date,
    receiveTime: o.receive_time,
    purpose: o.purpose,
    recipientName: o.recipient_name,
    recipientPhone: o.recipient_phone,
    address: o.address,
    area: o.area,
    lat: o.lat,
    lng: o.lng,
    distanceKm: o.distance_km,
    subtotal: o.subtotal,
    deliveryFee: o.delivery_fee,
    total: o.total,
    paymentMethod: o.payment_method,
    paymentStatus: o.payment_status,
    slipImage: o.slip_image,
    paidAt: o.paid_at,
    buyerNote: o.buyer_note,
    cancelReason: o.cancel_reason,
    createdAt: o.created_at,
    updatedAt: o.updated_at,
  };
  if (items) out.items = items.map((i) => ({ productId: i.product_id, name: i.name, unit: i.unit, price: i.price, qty: i.qty, note: i.note }));
  if (events) out.events = events.map((e) => ({ actor: e.actor, kind: e.kind, message: e.message, createdAt: e.created_at }));
  if (shop) out.shop = shop;
  if (buyer) out.buyer = buyer;
  return out;
}

function itemsFor(orderIds) {
  if (!orderIds.length) return new Map();
  const rows = db.prepare(`SELECT * FROM order_items WHERE order_id IN (${orderIds.map(() => '?').join(',')}) ORDER BY id`).all(...orderIds);
  const map = new Map();
  for (const r of rows) {
    if (!map.has(r.order_id)) map.set(r.order_id, []);
    map.get(r.order_id).push(r);
  }
  return map;
}

// ───────────────────────── auth ─────────────────────────

function currentUser(req) {
  const token = parseCookies(req.headers.cookie)[SESSION_COOKIE];
  if (!token) return null;
  return (
    db
      .prepare('SELECT u.* FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token_hash = ? AND s.expires_at > ? AND u.banned = 0 AND u.deleted_at IS NULL')
      .get(sha256(token), Date.now()) || null
  );
}

function needUser(ctx) {
  if (!ctx.user) throw new HttpError(401, 'กรุณาเข้าสู่ระบบก่อน');
  return ctx.user;
}
// เจ้าของหนึ่งคนมีได้หลายร้าน: เลือกร้านด้วย header X-Shop-Id (หรือ ?shop= สำหรับลิงก์ดาวน์โหลด)
function needShop(ctx) {
  const u = needUser(ctx);
  const id = Number(ctx.req.headers['x-shop-id'] || ctx.query.shop) || 0;
  let shop = id ? db.prepare('SELECT * FROM shops WHERE id = ? AND owner_id = ?').get(id, u.id) : null;
  if (!shop) shop = db.prepare('SELECT * FROM shops WHERE owner_id = ? ORDER BY id LIMIT 1').get(u.id);
  if (!shop) throw new HttpError(403, 'คุณยังไม่ได้เปิดร้าน');
  return shop;
}
const myShops = (userId) => db.prepare('SELECT * FROM shops WHERE owner_id = ? AND deleted_at IS NULL ORDER BY id').all(userId);

const CATEGORY_KEYS = ['dessert', 'food', 'bakery', 'drink', 'merit', 'goods', 'other'];

// ค่าส่งตามระยะ: ส่งฟรีภายใน X กม. (ร้านตั้ง ค่าเริ่มต้น 3)
// เกินระยะฟรี → ค่าส่งเริ่มต้น + กม.ละ ... นับเฉพาะกิโลที่เกินระยะฟรี
function deliveryFee(shop, distanceKm) {
  const freeKm = shop.free_delivery_max_km || 0;
  if (distanceKm <= freeKm) return { fee: 0, free: true, extraKm: 0, freeKm };
  const extraKm = Math.max(1, Math.ceil(Math.round((distanceKm - freeKm) * 10) / 10));
  // ค่าเริ่มต้นครอบคลุมกิโลแรกที่เกินระยะฟรี กิโลต่อๆ ไปคิดเพิ่ม
  const fee = Math.round(shop.delivery_fee_base + shop.delivery_fee_per_km * (extraKm - 1));
  return { fee, free: false, extraKm, freeKm };
}

// ── เวลา/คิวรับออเดอร์ ──
const nowTimeTH = () => new Date().toLocaleTimeString('en-GB', { timeZone: 'Asia/Bangkok', hour: '2-digit', minute: '2-digit', hour12: false });
// สั่งหลังเวลาปิดรับของวัน → นับว่าสั่งวันถัดไป
function orderBaseDate(shop) {
  const today = todayTH();
  return nowTimeTH() >= shop.order_cutoff_time ? addDays(today, 1) : today;
}
function acceptingNow(shop) {
  if (shop.suspended) return { ok: false, mode: 'suspended', reason: 'ร้านนี้ถูกระงับโดยผู้ดูแลระบบ' };
  if (!shop.is_open) return { ok: false, mode: 'closed', reason: shop.closed_message || 'ร้านปิดรับออเดอร์ชั่วคราว' };
  if (shop.paused_until && shop.paused_until > todayTH()) return { ok: false, mode: 'today', reason: `ร้านปิดรับออเดอร์วันนี้ เปิดรับอีกครั้ง ${fmtDateTH(shop.paused_until)}` };
  return { ok: true, mode: 'open', reason: '' };
}
function minReceiveDate(shop, leadDays = shop.min_lead_days) {
  return addDays(orderBaseDate(shop), leadDays);
}
const orderCountOn = (shopId, date) =>
  db.prepare(`SELECT COUNT(*) c FROM orders WHERE shop_id = ? AND receive_date = ? AND status != 'cancelled'`).get(shopId, date).c;
// สถานะของวันรับ: open / full / closed / soon (เร็วเกิน) / far (ไกลเกิน)
function dateStatus(shop, date, count = orderCountOn(shop.id, date), minDate = minReceiveDate(shop)) {
  if (csvList(shop.closed_weekdays).map(Number).includes(weekday(date)) || csvList(shop.closed_dates).includes(date)) return 'closed';
  if (date < minDate) return 'soon';
  if (date > addDays(todayTH(), shop.max_advance_days)) return 'far';
  if (csvList(shop.full_dates).includes(date)) return 'full';
  if (shop.daily_order_limit && count >= shop.daily_order_limit) return 'full';
  return 'open';
}

// ───────────────────────── router ─────────────────────────

const routes = [];
function route(method, pattern, handler) {
  const keys = [];
  const re = new RegExp('^' + pattern.replace(/:(\w+)/g, (_, k) => (keys.push(k), '([^/]+)')) + '$');
  routes.push({ method, re, keys, handler });
}

export async function handleApi(req, res, url) {
  const send = (status, data, headers = {}) => {
    res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...headers });
    res.end(JSON.stringify(data));
  };
  try {
    // ป้องกัน CSRF: request ที่แก้ข้อมูลต้องมาจาก origin เดียวกัน
    if (req.method !== 'GET') {
      const origin = req.headers.origin;
      if (origin && new URL(origin).host !== req.headers.host) throw new HttpError(403, 'Forbidden');
    }
    const match = routes.find((r) => r.method === req.method && r.re.test(url.pathname));
    if (!match) throw new HttpError(404, 'ไม่พบ API นี้');
    const m = match.re.exec(url.pathname);
    const params = Object.fromEntries(match.keys.map((k, i) => [k, decodeURIComponent(m[i + 1])]));
    const body = req.method === 'POST' || req.method === 'PUT' ? await readBody(req) : {};
    const ctx = { req, res, params, query: Object.fromEntries(url.searchParams), body, user: currentUser(req), headers: {} };
    const result = await match.handler(ctx);
    if (res.writableEnded) return;
    send(200, result ?? { ok: true }, ctx.headers);
  } catch (err) {
    if (err instanceof HttpError) return send(err.status, { error: err.message });
    console.error(err);
    send(500, { error: 'เกิดข้อผิดพลาดในระบบ ลองใหม่อีกครั้ง' });
  }
}

// ═════════════════════════ AUTH ═════════════════════════

route('POST', '/api/auth/request-otp', async ({ body }) => {
  const phone = normalizePhone(body.phone);
  if (!isMobile(phone)) throw bad('กรุณากรอกเบอร์มือถือ 10 หลัก เช่น 0812345678');
  const now = Date.now();
  const last = db.prepare('SELECT created_at FROM otps WHERE phone = ? ORDER BY created_at DESC LIMIT 1').get(phone);
  if (last && now - last.created_at < 60_000) {
    const wait = Math.ceil((60_000 - (now - last.created_at)) / 1000);
    throw new HttpError(429, `ขอรหัสใหม่ได้ใน ${wait} วินาที`);
  }
  const hourly = db.prepare('SELECT COUNT(*) c FROM otps WHERE phone = ? AND created_at > ?').get(phone, now - 3600_000).c;
  if (hourly >= 5) throw new HttpError(429, 'ขอรหัสบ่อยเกินไป กรุณารอ 1 ชั่วโมง');

  const code = String(crypto.randomInt(0, 1_000_000)).padStart(6, '0');
  db.prepare('INSERT INTO otps (phone, code_hash, expires_at, created_at) VALUES (?, ?, ?, ?)').run(phone, sha256(phone + ':' + code), now + 5 * 60_000, now);
  await sendSms(phone, `รหัสยืนยัน Preshop ของคุณคือ ${code} (ใช้ได้ 5 นาที)`);
  return { ok: true, phone, devCode: SMS_DEV ? code : undefined };
});

route('POST', '/api/auth/verify-otp', ({ body, headers }) => {
  const phone = normalizePhone(body.phone);
  const code = String(body.code || '').trim();
  const otp = db.prepare('SELECT * FROM otps WHERE phone = ? AND used = 0 ORDER BY created_at DESC LIMIT 1').get(phone);
  if (!otp || otp.expires_at < Date.now()) throw bad('รหัสหมดอายุ กรุณาขอรหัสใหม่');
  if (otp.attempts >= 5) throw bad('กรอกรหัสผิดเกินจำนวนครั้ง กรุณาขอรหัสใหม่');
  if (otp.code_hash !== sha256(phone + ':' + code)) {
    db.prepare('UPDATE otps SET attempts = attempts + 1 WHERE id = ?').run(otp.id);
    throw bad('รหัสไม่ถูกต้อง');
  }
  db.prepare('UPDATE otps SET used = 1 WHERE id = ?').run(otp.id);

  let user = db.prepare('SELECT * FROM users WHERE phone = ?').get(phone);
  if (user?.banned) throw new HttpError(403, `บัญชีนี้ถูกระงับการใช้งาน${user.banned_reason ? `: ${user.banned_reason}` : ''} ติดต่อผู้ดูแลระบบ`);
  if (!user) {
    const r = db.prepare('INSERT INTO users (phone, created_at) VALUES (?, ?)').run(phone, nowIso());
    user = db.prepare('SELECT * FROM users WHERE id = ?').get(r.lastInsertRowid);
  }
  db.prepare('UPDATE users SET last_login_at = ? WHERE id = ?').run(nowIso(), user.id);

  const token = crypto.randomBytes(32).toString('base64url');
  db.prepare('INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?, ?, ?)').run(sha256(token), user.id, Date.now() + SESSION_DAYS * 86400_000);
  db.prepare('DELETE FROM sessions WHERE expires_at < ?').run(Date.now());
  headers['Set-Cookie'] = `${SESSION_COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${SESSION_DAYS * 86400}${COOKIE_SECURE}`;
  return { user: userJson(user), needsProfile: !user.name };
});

route('POST', '/api/auth/logout', ({ req, headers }) => {
  const token = parseCookies(req.headers.cookie)[SESSION_COOKIE];
  if (token) db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(sha256(token));
  headers['Set-Cookie'] = `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${COOKIE_SECURE}`;
  return { ok: true };
});

route('GET', '/api/me', ({ user }) => {
  if (!user) return { user: null, shop: null, shops: [] };
  const shops = myShops(user.id).map((s) => shopJson(s));
  return { user: userJson(user), shop: shops[0] || null, shops, chatUnread: chatUnread(user.id) };
});

// ที่อยู่หลักของผู้ใช้ (ปักหมุดตอนเข้าสู่ระบบ)
route('PUT', '/api/me/location', (ctx) => {
  const u = needUser(ctx);
  const b = ctx.body;
  if (b.clear) {
    db.prepare(`UPDATE users SET lat = NULL, lng = NULL, address = '', province = '', district = '' WHERE id = ?`).run(u.id);
  } else {
    const lat = num(b.lat, { min: -90, max: 90, label: 'ตำแหน่ง' });
    const lng = num(b.lng, { min: -180, max: 180, label: 'ตำแหน่ง' });
    db.prepare('UPDATE users SET lat = ?, lng = ?, address = ?, province = ?, district = ? WHERE id = ?').run(
      lat, lng,
      str(b.address, { max: 500, label: 'ที่อยู่' }),
      str(b.province, { max: 60, label: 'จังหวัด' }),
      str(b.district, { max: 60, label: 'อำเภอ/เขต' }),
      u.id
    );
  }
  return { user: userJson(db.prepare('SELECT * FROM users WHERE id = ?').get(u.id)) };
});

// จังหวัด/อำเภอที่มีร้าน ใช้ทำตัวกรอง
route('GET', '/api/locations', () => {
  const rows = db.prepare(`SELECT province, district, COUNT(*) c FROM shops WHERE province != '' AND deleted_at IS NULL AND suspended = 0 GROUP BY province, district ORDER BY province, district`).all();
  const map = {};
  for (const r of rows) {
    map[r.province] ??= { province: r.province, count: 0, districts: [] };
    map[r.province].count += r.c;
    if (r.district) map[r.province].districts.push({ name: r.district, count: r.c });
  }
  return { provinces: Object.values(map) };
});

route('PUT', '/api/me', (ctx) => {
  const u = needUser(ctx);
  const name = str(ctx.body.name, { max: 80, required: true, label: 'ชื่อ' });
  const contacts = cleanContacts(ctx.body.contacts);
  db.prepare('UPDATE users SET name = ?, contacts = ? WHERE id = ?').run(name, contacts, u.id);
  return { user: userJson(db.prepare('SELECT * FROM users WHERE id = ?').get(u.id)) };
});

// ═════════════════════════ UPLOADS ═════════════════════════

route('POST', '/api/uploads', (ctx) => {
  needUser(ctx);
  return { url: saveImage(ctx.body.data) };
});

// ═════════════════════════ SHOPS (public) ═════════════════════════

const SHOP_STATS = `
  (SELECT COUNT(*) FROM products p WHERE p.shop_id = s.id AND p.is_active = 1 AND p.archived = 0) AS product_count,
  (SELECT ROUND(AVG(rating), 1) FROM feedback f WHERE f.shop_id = s.id AND f.kind = 'review') AS rating,
  (SELECT COUNT(*) FROM feedback f WHERE f.shop_id = s.id AND f.kind = 'review') AS review_count,
  (SELECT COUNT(*) FROM orders o WHERE o.shop_id = s.id AND o.status != 'cancelled') AS order_count`;
const shopListJson = (s, extra = {}) => ({
  ...shopJson(s),
  productCount: s.product_count,
  rating: s.rating,
  reviewCount: s.review_count,
  orderCount: s.order_count,
  ...extra,
});

route('GET', '/api/shops', ({ query, user }) => {
  const q = str(query.q, { max: 80 });
  const cat = CATEGORY_KEYS.includes(query.category) ? query.category : '';
  const extra = [];
  if (cat) extra.push(`s.category = '${cat}'`);
  if (query.open === '1') extra.push('s.is_open = 1');
  if (query.delivery === '1') extra.push('s.delivery_enabled = 1');
  if (query.pickup === '1') extra.push('s.pickup_enabled = 1');
  if (query.free === '1') extra.push('s.delivery_enabled = 1 AND s.free_delivery_max_km > 0');
  const province = str(query.province, { max: 60 });
  const district = str(query.district, { max: 60 });
  const minRating = Number(query.minRating) || 0;
  let rows = db
    .prepare(
      `SELECT s.*, ${SHOP_STATS}
       FROM shops s
       WHERE s.deleted_at IS NULL AND s.suspended = 0
         AND (? = '' OR s.name LIKE ? OR s.description LIKE ? OR s.areas LIKE ? OR s.district LIKE ? OR s.province LIKE ?
              OR EXISTS (SELECT 1 FROM products p WHERE p.shop_id = s.id AND p.archived = 0 AND p.name LIKE ?))
         AND (? = '' OR s.province = ?) AND (? = '' OR s.district = ?)
       ${extra.map((e) => 'AND ' + e).join(' ')}
       LIMIT 300`
    )
    .all(q, `%${q}%`, `%${q}%`, `%${q}%`, `%${q}%`, `%${q}%`, `%${q}%`, province, province, district, district);
  if (minRating) rows = rows.filter((s) => (s.rating || 0) >= minRating);

  // ระยะ/ค่าส่ง จากตำแหน่งที่ส่งมา หรือที่อยู่ที่ผู้ใช้บันทึกไว้
  const lat = Number(query.lat);
  const lng = Number(query.lng);
  const loc = query.lat !== undefined && Number.isFinite(lat) && Number.isFinite(lng) ? { lat, lng } : user?.lat != null ? { lat: user.lat, lng: user.lng } : null;
  for (const s of rows) {
    s.me = forMe(s, loc);
    s.dist = s.me ? s.me.distanceKm : null;
  }
  if (query.inRange === '1' && loc) rows = rows.filter((s) => s.me?.inRange || s.pickup_enabled);

  const open = (s) => (acceptingNow(s).ok ? 1 : 0);
  const sorters = {
    popular: (a, b) => b.order_count - a.order_count || (b.rating || 0) - (a.rating || 0),
    rating: (a, b) => (b.rating || 0) - (a.rating || 0) || b.review_count - a.review_count,
    new: (a, b) => (b.created_at > a.created_at ? 1 : -1),
    near: (a, b) => (a.dist ?? 1e9) - (b.dist ?? 1e9),
  };
  const sorter = sorters[query.sort] || sorters.popular;
  rows.sort((a, b) => open(b) - open(a) || sorter(a, b));
  return { shops: rows.slice(0, 100).map((s) => shopListJson(s, { distanceKm: s.dist, forMe: s.me })), usingLocation: !!loc };
});

// ร้านยอดนิยม สำหรับสไลด์หน้าแรก
route('GET', '/api/shops/featured', () => {
  const rows = db.prepare(`SELECT s.*, ${SHOP_STATS} FROM shops s WHERE s.is_open = 1 AND s.suspended = 0 AND s.deleted_at IS NULL`).all().filter((s) => s.product_count > 0);
  rows.sort((a, b) => b.order_count + (b.rating || 0) * 3 - (a.order_count + (a.rating || 0) * 3));
  return { shops: rows.slice(0, 5).map((s) => shopListJson(s)) };
});

// ปฏิทินคิว: วันไหนรับได้ / เต็ม / หยุด
route('GET', '/api/shops/:slug/calendar', ({ params, query }) => {
  const s = db.prepare('SELECT * FROM shops WHERE slug = ?').get(params.slug);
  if (!s) throw new HttpError(404, 'ไม่พบร้านนี้');
  const lead = Math.max(s.min_lead_days, int(query.lead ?? s.min_lead_days, { min: 0, max: 60, label: 'วันล่วงหน้า' }));
  const minDate = minReceiveDate(s, lead);
  const days = Math.min(60, s.max_advance_days + 1);
  const out = [];
  const today = todayTH();
  for (let i = 0; i < days; i++) {
    const d = addDays(today, i);
    out.push({ date: d, status: dateStatus(s, d, undefined, minDate) });
  }
  return { minDate, days: out, accepting: acceptingNow(s), cutoff: s.order_cutoff_time, pastCutoff: orderBaseDate(s) !== today };
});

route('GET', '/api/shops/:slug', ({ params, user }) => {
  const s = db.prepare('SELECT * FROM shops WHERE slug = ? AND deleted_at IS NULL').get(params.slug);
  if (!s) throw new HttpError(404, 'ไม่พบร้านนี้');
  if (s.suspended && s.owner_id !== user?.id && !isAdmin(user)) throw new HttpError(404, 'ร้านนี้ถูกระงับชั่วคราว');
  const products = db.prepare('SELECT * FROM products WHERE shop_id = ? AND is_active = 1 AND archived = 0 ORDER BY sort, id').all(s.id);
  const rating = db.prepare(`SELECT ROUND(AVG(rating),1) avg, COUNT(*) c FROM feedback WHERE shop_id = ? AND kind = 'review'`).get(s.id);
  return {
    shop: { ...shopJson(s), rating: rating.avg, reviewCount: rating.c, forMe: forMe(s, user) },
    products: products.map(productJson),
    today: todayTH(),
  };
});

// จำนวนที่ยังรับได้ต่อเมนูในวันที่เลือก
function usedQty(productId, date) {
  return db
    .prepare(
      `SELECT COALESCE(SUM(i.qty),0) q FROM order_items i JOIN orders o ON o.id = i.order_id
       WHERE i.product_id = ? AND o.receive_date = ? AND o.status != 'cancelled'`
    )
    .get(productId, date).q;
}

route('GET', '/api/shops/:slug/availability', ({ params, query }) => {
  const s = db.prepare('SELECT * FROM shops WHERE slug = ?').get(params.slug);
  if (!s) throw new HttpError(404, 'ไม่พบร้านนี้');
  if (!isDate(query.date)) throw bad('วันที่ไม่ถูกต้อง');
  const products = db.prepare('SELECT id, daily_limit FROM products WHERE shop_id = ? AND archived = 0 AND daily_limit IS NOT NULL').all(s.id);
  const remaining = {};
  for (const p of products) remaining[p.id] = Math.max(0, p.daily_limit - usedQty(p.id, query.date));
  return { date: query.date, remaining };
});

route('GET', '/api/shops/:slug/reviews', ({ params }) => {
  const s = db.prepare('SELECT id FROM shops WHERE slug = ?').get(params.slug);
  if (!s) throw new HttpError(404, 'ไม่พบร้านนี้');
  const rows = db
    .prepare(
      `SELECT f.*, u.name AS user_name,
        EXISTS (SELECT 1 FROM orders o WHERE o.buyer_id = f.user_id AND o.shop_id = f.shop_id AND o.status = 'completed') AS verified
       FROM feedback f JOIN users u ON u.id = f.user_id
       WHERE f.shop_id = ? AND f.kind = 'review' ORDER BY f.created_at DESC LIMIT 50`
    )
    .all(s.id);
  return {
    reviews: rows.map((r) => ({
      id: r.id,
      rating: r.rating,
      message: r.message,
      reply: r.reply,
      userName: maskName(r.user_name),
      verified: !!r.verified,
      createdAt: r.created_at,
    })),
  };
});

function maskName(name) {
  const n = String(name || 'ลูกค้า').trim();
  const parts = n.split(/\s+/);
  return parts.length > 1 ? `${parts[0]} ${parts[1][0]}.` : parts[0];
}

// ═════════════════════════ MY SHOP (seller) ═════════════════════════

function genSlug() {
  for (;;) {
    const s = 'shop-' + crypto.randomBytes(3).toString('hex');
    if (!db.prepare('SELECT 1 FROM shops WHERE slug = ?').get(s)) return s;
  }
}

function readSlug(v, exceptShopId) {
  const slug = String(v || '').trim().toLowerCase();
  if (!/^[a-z0-9](?:[a-z0-9-]{1,28}[a-z0-9])$/.test(slug)) throw bad('ลิงก์ร้านใช้ได้เฉพาะ a-z, 0-9 และ - ยาว 3–30 ตัว');
  const taken = db.prepare('SELECT id FROM shops WHERE slug = ?').get(slug);
  if (taken && taken.id !== exceptShopId) throw bad('ลิงก์ร้านนี้มีคนใช้แล้ว');
  return slug;
}

route('POST', '/api/my/shop', (ctx) => {
  const u = needUser(ctx);
  if (!u.name) throw bad('กรุณาตั้งชื่อในหน้าบัญชีก่อนเปิดร้าน');
  if (myShops(u.id).length >= 10) throw bad('เปิดได้สูงสุด 10 ร้านต่อบัญชี');
  const name = str(ctx.body.name, { max: 80, required: true, label: 'ชื่อร้าน' });
  const slug = ctx.body.slug ? readSlug(ctx.body.slug) : genSlug();
  const category = CATEGORY_KEYS.includes(ctx.body.category) ? ctx.body.category : 'other';
  const r = db
    .prepare('INSERT INTO shops (owner_id, slug, name, category, phone, contacts, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
    .run(u.id, slug, name, category, u.phone, u.contacts, nowIso());
  return { shop: shopJson(db.prepare('SELECT * FROM shops WHERE id = ?').get(r.lastInsertRowid)) };
});

route('GET', '/api/my/shop', (ctx) => ({ shop: shopJson(needShop(ctx)) }));

route('PUT', '/api/my/shop', (ctx) => {
  const shop = needShop(ctx);
  const b = ctx.body;
  const f = {};
  const has = (k) => Object.prototype.hasOwnProperty.call(b, k);

  if (has('name')) f.name = str(b.name, { max: 80, required: true, label: 'ชื่อร้าน' });
  if (has('slug')) f.slug = readSlug(b.slug, shop.id);
  if (has('category')) {
    if (!CATEGORY_KEYS.includes(b.category)) throw bad('ประเภทร้านไม่ถูกต้อง');
    f.category = b.category;
  }
  if (has('description')) f.description = str(b.description, { max: 1000, label: 'คำอธิบายร้าน' });
  if (has('phone')) {
    const p = normalizePhone(b.phone);
    if (p && !isPhone(p)) throw bad('เบอร์โทรร้านไม่ถูกต้อง');
    f.phone = p;
  }
  if (has('address')) f.address = str(b.address, { max: 500, label: 'ที่อยู่ร้าน' });
  if (has('province')) f.province = str(b.province, { max: 60, label: 'จังหวัด' });
  if (has('district')) f.district = str(b.district, { max: 60, label: 'อำเภอ/เขต' });
  if (has('lat') || has('lng')) {
    f.lat = num(b.lat, { min: -90, max: 90, label: 'ละติจูด', nullable: true });
    f.lng = num(b.lng, { min: -180, max: 180, label: 'ลองจิจูด', nullable: true });
  }
  if (has('coverImage')) {
    if (b.coverImage && !isUploadUrl(b.coverImage)) throw bad('รูปปกไม่ถูกต้อง');
    f.cover_image = b.coverImage || null;
  }
  if (has('contacts')) f.contacts = cleanContacts(b.contacts);
  if (has('isOpen')) f.is_open = bool(b.isOpen);
  if (has('closedMessage')) f.closed_message = str(b.closedMessage, { max: 200, label: 'ข้อความตอนปิดร้าน' });
  if (has('pickupEnabled')) f.pickup_enabled = bool(b.pickupEnabled);
  if (has('deliveryEnabled')) f.delivery_enabled = bool(b.deliveryEnabled);
  if (has('defaultRadiusKm')) f.default_radius_km = num(b.defaultRadiusKm, { min: 0, max: 500, label: 'ระยะส่ง' });
  if (has('deliveryFeeBase')) f.delivery_fee_base = num(b.deliveryFeeBase, { min: 0, max: 100000, label: 'ค่าส่งเริ่มต้น' });
  if (has('deliveryFeePerKm')) f.delivery_fee_per_km = num(b.deliveryFeePerKm, { min: 0, max: 10000, label: 'ค่าส่งต่อกม.' });
  if (has('deliveryBaseKm')) f.delivery_base_km = num(b.deliveryBaseKm, { min: 0, max: 100, label: 'ระยะที่รวมในค่าส่งเริ่มต้น' });
  if (has('freeDeliveryMin')) f.free_delivery_min = num(b.freeDeliveryMin, { min: 0, max: 1e7, label: 'ยอดส่งฟรี' });
  if (has('freeDeliveryMaxKm')) f.free_delivery_max_km = num(b.freeDeliveryMaxKm, { min: 0, max: 500, label: 'ระยะส่งฟรี' });
  if (has('orderCutoffTime')) {
    if (!isTime(b.orderCutoffTime)) throw bad('เวลาปิดรับออเดอร์ของวันไม่ถูกต้อง');
    f.order_cutoff_time = b.orderCutoffTime;
  }
  if (has('dailyOrderLimit')) f.daily_order_limit = int(b.dailyOrderLimit, { min: 1, max: 100000, label: 'ออเดอร์สูงสุดต่อวัน', nullable: true });
  if (has('areas')) f.areas = (Array.isArray(b.areas) ? b.areas : csvList(b.areas)).map((a) => str(a, { max: 60, label: 'ชื่อพื้นที่' })).filter(Boolean).join(',');
  if (has('minOrderAmount')) f.min_order_amount = num(b.minOrderAmount, { min: 0, max: 1e7, label: 'ยอดสั่งขั้นต่ำ' });
  if (has('minLeadDays')) f.min_lead_days = int(b.minLeadDays, { min: 0, max: 60, label: 'จำนวนวันสั่งล่วงหน้า' });
  if (has('maxAdvanceDays')) f.max_advance_days = int(b.maxAdvanceDays, { min: 1, max: 365, label: 'สั่งล่วงหน้าได้สูงสุด' });
  if (has('openTime')) {
    if (!isTime(b.openTime)) throw bad('เวลาเปิดไม่ถูกต้อง');
    f.open_time = b.openTime;
  }
  if (has('closeTime')) {
    if (!isTime(b.closeTime)) throw bad('เวลาปิดไม่ถูกต้อง');
    f.close_time = b.closeTime;
  }
  if (has('closedWeekdays')) {
    const days = (Array.isArray(b.closedWeekdays) ? b.closedWeekdays : csvList(b.closedWeekdays)).map(Number).filter((d) => Number.isInteger(d) && d >= 0 && d <= 6);
    f.closed_weekdays = [...new Set(days)].sort().join(',');
  }
  if (has('closedDates')) {
    const dates = (Array.isArray(b.closedDates) ? b.closedDates : csvList(b.closedDates)).filter(isDate);
    f.closed_dates = [...new Set(dates)].sort().join(',');
  }
  if (has('transferEnabled')) f.transfer_enabled = bool(b.transferEnabled);
  if (has('codEnabled')) f.cod_enabled = bool(b.codEnabled);
  if (has('promptpayId')) {
    const pp = String(b.promptpayId || '').replace(/\D/g, '');
    if (pp && ![10, 13, 15].includes(pp.length)) throw bad('พร้อมเพย์ต้องเป็นเบอร์มือถือ 10 หลัก, เลขบัตร/ผู้เสียภาษี 13 หลัก หรือ e-Wallet 15 หลัก');
    f.promptpay_id = pp;
  }
  if (has('bankInfo')) f.bank_info = str(b.bankInfo, { max: 300, label: 'ข้อมูลบัญชี' });

  const merged = { ...shop, ...f };
  if (merged.open_time >= merged.close_time) throw bad('เวลาปิดต้องหลังเวลาเปิด');
  if (!merged.pickup_enabled && !merged.delivery_enabled) throw bad('ต้องเปิดอย่างน้อย 1 วิธีรับสินค้า (ส่ง หรือ มารับเอง)');
  if (!merged.transfer_enabled && !merged.cod_enabled) throw bad('ต้องเปิดอย่างน้อย 1 วิธีชำระเงิน');
  if (merged.transfer_enabled && !merged.promptpay_id && !merged.bank_info) throw bad('เปิดรับโอนต้องใส่พร้อมเพย์หรือเลขบัญชี');

  const keys = Object.keys(f);
  if (keys.length) db.prepare(`UPDATE shops SET ${keys.map((k) => `${k} = ?`).join(', ')} WHERE id = ?`).run(...keys.map((k) => f[k]), shop.id);
  return { shop: shopJson(db.prepare('SELECT * FROM shops WHERE id = ?').get(shop.id)) };
});

// สถานะร้านแบบกดปุ่มเดียว: เปิดรับ / ปิดรับวันนี้ (เปิดเองพรุ่งนี้) / ปิดชั่วคราว
route('POST', '/api/my/shop/status', (ctx) => {
  const shop = needShop(ctx);
  const mode = ctx.body.mode;
  if (mode === 'open') db.prepare(`UPDATE shops SET is_open = 1, paused_until = '' WHERE id = ?`).run(shop.id);
  else if (mode === 'today') db.prepare(`UPDATE shops SET is_open = 1, paused_until = ? WHERE id = ?`).run(addDays(todayTH(), 1), shop.id);
  else if (mode === 'closed') {
    const msg = ctx.body.message === undefined ? shop.closed_message : str(ctx.body.message, { max: 200, label: 'ข้อความ' });
    db.prepare(`UPDATE shops SET is_open = 0, paused_until = '', closed_message = ? WHERE id = ?`).run(msg, shop.id);
  } else throw bad('สถานะไม่ถูกต้อง');
  return { shop: shopJson(db.prepare('SELECT * FROM shops WHERE id = ?').get(shop.id)) };
});

// ปฏิทินคิวของร้าน: จำนวนออเดอร์ต่อวัน + กดตั้ง "เต็ม" / "หยุด" รายวัน
route('GET', '/api/my/calendar', (ctx) => {
  const shop = needShop(ctx);
  const today = todayTH();
  const days = Math.min(45, shop.max_advance_days + 1);
  const counts = new Map(
    db.prepare(`SELECT receive_date d, COUNT(*) c, SUM(total) t FROM orders WHERE shop_id = ? AND status != 'cancelled' AND receive_date >= ? GROUP BY receive_date`)
      .all(shop.id, today).map((r) => [r.d, r])
  );
  const out = [];
  for (let i = 0; i < days; i++) {
    const d = addDays(today, i);
    const c = counts.get(d);
    out.push({
      date: d,
      orders: c?.c || 0,
      total: c?.t || 0,
      status: dateStatus(shop, d, c?.c || 0),
      manualFull: csvList(shop.full_dates).includes(d),
      holiday: csvList(shop.closed_dates).includes(d),
      weeklyOff: csvList(shop.closed_weekdays).map(Number).includes(weekday(d)),
    });
  }
  return { days: out, limit: shop.daily_order_limit, minDate: minReceiveDate(shop), cutoff: shop.order_cutoff_time };
});

route('POST', '/api/my/calendar/day', (ctx) => {
  const shop = needShop(ctx);
  const { date, action } = ctx.body;
  if (!isDate(date)) throw bad('วันที่ไม่ถูกต้อง');
  const toggle = (list, on) => {
    const set = new Set(csvList(list).filter((d) => d >= todayTH()));
    on ? set.add(date) : set.delete(date);
    return [...set].sort().join(',');
  };
  if (action === 'full') db.prepare('UPDATE shops SET full_dates = ? WHERE id = ?').run(toggle(shop.full_dates, true), shop.id);
  else if (action === 'unfull') db.prepare('UPDATE shops SET full_dates = ? WHERE id = ?').run(toggle(shop.full_dates, false), shop.id);
  else if (action === 'holiday') db.prepare('UPDATE shops SET closed_dates = ? WHERE id = ?').run(toggle(shop.closed_dates, true), shop.id);
  else if (action === 'unholiday') db.prepare('UPDATE shops SET closed_dates = ? WHERE id = ?').run(toggle(shop.closed_dates, false), shop.id);
  else throw bad('คำสั่งไม่ถูกต้อง');
  return { ok: true };
});

// ─── products ───

route('GET', '/api/my/products', (ctx) => {
  const shop = needShop(ctx);
  const rows = db.prepare('SELECT * FROM products WHERE shop_id = ? AND archived = 0 ORDER BY sort, id').all(shop.id);
  return { products: rows.map(productJson) };
});

function readProduct(b) {
  if (b.image && !isUploadUrl(b.image)) throw bad('รูปเมนูไม่ถูกต้อง');
  return {
    name: str(b.name, { max: 80, required: true, label: 'ชื่อเมนู' }),
    description: str(b.description, { max: 500, label: 'คำอธิบาย' }),
    category: str(b.category, { max: 40, label: 'หมวด' }),
    price: num(b.price, { min: 0, max: 1e6, label: 'ราคา' }),
    unit: str(b.unit, { max: 20, label: 'หน่วย' }) || 'ถ้วย',
    image: b.image || null,
    is_active: b.isActive === undefined ? 1 : bool(b.isActive),
    min_qty: int(b.minQty ?? 1, { min: 1, max: 10000, label: 'จำนวนขั้นต่ำ' }),
    daily_limit: int(b.dailyLimit, { min: 1, max: 100000, label: 'รับได้ต่อวัน', nullable: true }),
    lead_days: int(b.leadDays, { min: 0, max: 60, label: 'สั่งล่วงหน้า', nullable: true }),
    delivery_allowed: b.deliveryAllowed === undefined ? 1 : bool(b.deliveryAllowed),
    pickup_allowed: b.pickupAllowed === undefined ? 1 : bool(b.pickupAllowed),
    delivery_radius_km: num(b.deliveryRadiusKm, { min: 0, max: 500, label: 'ระยะส่ง', nullable: true }),
    allowed_areas: (Array.isArray(b.allowedAreas) ? b.allowedAreas : csvList(b.allowedAreas)).map((a) => str(a, { max: 60 })).filter(Boolean).join(','),
    sort: int(b.sort ?? 0, { min: -1e6, max: 1e6, label: 'ลำดับ' }),
  };
}

route('POST', '/api/my/products', (ctx) => {
  const shop = needShop(ctx);
  const p = readProduct(ctx.body);
  if (!p.delivery_allowed && !p.pickup_allowed) throw bad('เมนูต้องส่งได้หรือมารับเองได้อย่างน้อย 1 แบบ');
  const keys = Object.keys(p);
  const r = db
    .prepare(`INSERT INTO products (shop_id, ${keys.join(', ')}, created_at) VALUES (?, ${keys.map(() => '?').join(', ')}, ?)`)
    .run(shop.id, ...keys.map((k) => p[k]), nowIso());
  return { product: productJson(db.prepare('SELECT * FROM products WHERE id = ?').get(r.lastInsertRowid)) };
});

route('PUT', '/api/my/products/:id', (ctx) => {
  const shop = needShop(ctx);
  const existing = db.prepare('SELECT * FROM products WHERE id = ? AND shop_id = ? AND archived = 0').get(Number(ctx.params.id), shop.id);
  if (!existing) throw new HttpError(404, 'ไม่พบเมนูนี้');
  const p = readProduct({ ...productJson(existing), ...ctx.body });
  if (!p.delivery_allowed && !p.pickup_allowed) throw bad('เมนูต้องส่งได้หรือมารับเองได้อย่างน้อย 1 แบบ');
  const keys = Object.keys(p);
  db.prepare(`UPDATE products SET ${keys.map((k) => `${k} = ?`).join(', ')} WHERE id = ?`).run(...keys.map((k) => p[k]), existing.id);
  return { product: productJson(db.prepare('SELECT * FROM products WHERE id = ?').get(existing.id)) };
});

route('DELETE', '/api/my/products/:id', (ctx) => {
  const shop = needShop(ctx);
  const id = Number(ctx.params.id);
  const p = db.prepare('SELECT id FROM products WHERE id = ? AND shop_id = ?').get(id, shop.id);
  if (!p) throw new HttpError(404, 'ไม่พบเมนูนี้');
  const used = db.prepare('SELECT 1 FROM order_items WHERE product_id = ? LIMIT 1').get(id);
  // เมนูที่เคยมีคนสั่ง เก็บไว้ในประวัติแต่ซ่อนจากหน้าร้าน
  if (used) db.prepare('UPDATE products SET archived = 1, is_active = 0 WHERE id = ?').run(id);
  else db.prepare('DELETE FROM products WHERE id = ?').run(id);
  return { ok: true };
});

// ═════════════════════════ ORDERS ═════════════════════════

const STATUSES = ['pending', 'confirmed', 'preparing', 'ready', 'delivering', 'completed', 'cancelled'];
const NEXT = {
  pending: ['confirmed', 'cancelled'],
  confirmed: ['preparing', 'cancelled'],
  preparing: ['ready', 'cancelled'],
  ready: ['delivering', 'completed', 'cancelled'],
  delivering: ['completed'],
  completed: [],
  cancelled: [],
};
const STATUS_TH = {
  pending: 'รอร้านยืนยัน',
  confirmed: 'ร้านรับออเดอร์แล้ว',
  preparing: 'กำลังทำ',
  ready: 'ทำเสร็จแล้ว',
  delivering: 'กำลังไปส่ง',
  completed: 'สำเร็จ',
  cancelled: 'ยกเลิก',
};
const PAY_STATUSES = ['unpaid', 'pending_review', 'paid', 'refunded'];
const PAY_TH = { unpaid: 'ยังไม่ชำระ', pending_review: 'รอตรวจสลิป', paid: 'ชำระแล้ว', refunded: 'คืนเงินแล้ว' };

function addEvent(orderId, actor, kind, message = '') {
  db.prepare('INSERT INTO order_events (order_id, actor, kind, message, created_at) VALUES (?, ?, ?, ?, ?)').run(orderId, actor, kind, message, nowIso());
}

function genOrderCode() {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const d = todayTH().slice(2).replace(/-/g, '');
  for (;;) {
    let r = '';
    for (let i = 0; i < 4; i++) r += alphabet[crypto.randomInt(alphabet.length)];
    const code = `PS${d}-${r}`;
    if (!db.prepare('SELECT 1 FROM orders WHERE code = ?').get(code)) return code;
  }
}

const fmtDateTH = (d) => new Date(d + 'T00:00:00Z').toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });

// คำนวณและตรวจสอบตะกร้า ใช้ทั้งตอน quote และตอนสั่งจริง
function priceOrder(shop, b) {
  const acc = acceptingNow(shop);
  if (!acc.ok) throw bad(acc.reason);

  // ── รายการ ──
  if (!Array.isArray(b.items) || !b.items.length) throw bad('ยังไม่ได้เลือกเมนู');
  if (b.items.length > 50) throw bad('รายการเยอะเกินไป');
  const productRows = db.prepare('SELECT * FROM products WHERE shop_id = ? AND is_active = 1 AND archived = 0').all(shop.id);
  const byId = new Map(productRows.map((p) => [p.id, p]));
  const lines = [];
  const qtyByProduct = new Map();
  for (const it of b.items) {
    const p = byId.get(Number(it.productId));
    if (!p) throw bad('มีเมนูที่ร้านปิดขายไปแล้ว กรุณาเลือกใหม่');
    const qty = int(it.qty, { min: 1, max: 100000, label: `จำนวน ${p.name} ` });
    const note = str(it.note, { max: 200, label: 'หมายเหตุเมนู' });
    lines.push({ p, qty, note });
    qtyByProduct.set(p.id, (qtyByProduct.get(p.id) || 0) + qty);
  }
  for (const [pid, q] of qtyByProduct) {
    const p = byId.get(pid);
    if (q < p.min_qty) throw bad(`${p.name} สั่งขั้นต่ำ ${p.min_qty} ${p.unit}`);
  }

  // ── วันเวลา ──
  const today = todayTH();
  if (!isDate(b.receiveDate)) throw bad('กรุณาเลือกวันที่ต้องการรับ');
  const lead = Math.max(shop.min_lead_days, ...lines.map((l) => l.p.lead_days ?? shop.min_lead_days));
  const minDate = minReceiveDate(shop, lead);
  const late = orderBaseDate(shop) !== today;
  if (b.receiveDate < minDate) {
    throw bad(late
      ? `เลยเวลารับออเดอร์ของวันนี้แล้ว (${shop.order_cutoff_time} น.) นับเป็นสั่งพรุ่งนี้ รับได้ตั้งแต่ ${fmtDateTH(minDate)}`
      : `ต้องสั่งล่วงหน้าอย่างน้อย ${lead} วัน (รับได้ตั้งแต่ ${fmtDateTH(minDate)})`);
  }
  const ds = dateStatus(shop, b.receiveDate, undefined, minDate);
  if (ds === 'far') throw bad(`สั่งล่วงหน้าได้ไม่เกิน ${shop.max_advance_days} วัน`);
  if (ds === 'closed') throw bad('ร้านหยุดวันที่เลือก กรุณาเลือกวันอื่น');
  if (ds === 'full') throw bad(`คิววันที่ ${fmtDateTH(b.receiveDate)} เต็มแล้ว กรุณาเลือกวันอื่น`);
  if (!isTime(b.receiveTime)) throw bad('กรุณาเลือกเวลาที่ต้องการรับ');
  if (b.receiveTime < shop.open_time || b.receiveTime > shop.close_time) throw bad(`เวลารับต้องอยู่ระหว่าง ${shop.open_time}–${shop.close_time} น.`);

  // ── รับเอง / จัดส่ง ──
  const fulfillment = b.fulfillment;
  if (fulfillment !== 'delivery' && fulfillment !== 'pickup') throw bad('กรุณาเลือกวิธีรับสินค้า');
  let distance = null;
  let fee = 0;
  let area = '';
  let address = str(b.address, { max: 500, label: 'ที่อยู่' });
  let lat = null;
  let lng = null;
  if (fulfillment === 'pickup') {
    if (!shop.pickup_enabled) throw bad('ร้านนี้ไม่รับให้มารับเอง');
    const no = lines.filter((l) => !l.p.pickup_allowed).map((l) => l.p.name);
    if (no.length) throw bad(`${no.join(', ')} ต้องจัดส่งเท่านั้น`);
    address = '';
  } else {
    if (!shop.delivery_enabled) throw bad('ร้านนี้ไม่มีบริการจัดส่ง เลือกมารับเองได้');
    const no = lines.filter((l) => !l.p.delivery_allowed).map((l) => l.p.name);
    if (no.length) throw bad(`${no.join(', ')} ไม่มีบริการส่ง ต้องมารับเองที่ร้าน`);
    if (shop.lat == null || shop.lng == null) throw bad('ร้านยังไม่ได้ตั้งตำแหน่ง จึงยังคำนวณระยะส่งไม่ได้');
    lat = num(b.lat, { min: -90, max: 90, label: 'ตำแหน่ง', nullable: true });
    lng = num(b.lng, { min: -180, max: 180, label: 'ตำแหน่ง', nullable: true });
    if (lat === null || lng === null) throw bad('กรุณาปักหมุดตำแหน่งจัดส่งบนแผนที่');
    if (address.length < 5) throw bad('กรุณากรอกที่อยู่จัดส่งให้ครบ');
    distance = Math.round(haversineKm(shop.lat, shop.lng, lat, lng) * 100) / 100;

    for (const { p } of lines) {
      const radius = p.delivery_radius_km ?? shop.default_radius_km;
      if (distance > radius) throw bad(`${p.name} ส่งได้ในระยะไม่เกิน ${radius} กม. จากร้าน (ตำแหน่งของคุณห่าง ${distance.toFixed(1)} กม.) เลือกมารับเองได้`);
    }
    const shopAreas = csvList(shop.areas);
    const needArea = shopAreas.length || lines.some((l) => csvList(l.p.allowed_areas).length);
    area = str(b.area, { max: 60, label: 'พื้นที่' });
    if (needArea) {
      if (!area) throw bad('กรุณาเลือกพื้นที่จัดส่ง');
      if (shopAreas.length && !shopAreas.includes(area)) throw bad('ร้านไม่ส่งในพื้นที่นี้');
      for (const { p } of lines) {
        const allowed = csvList(p.allowed_areas);
        if (allowed.length && !allowed.includes(area)) throw bad(`${p.name} ส่งได้เฉพาะ ${allowed.join(', ')}`);
      }
    }
  }

  const subtotal = lines.reduce((s, l) => s + l.p.price * l.qty, 0);
  if (subtotal < shop.min_order_amount) throw bad(`ยอดสั่งขั้นต่ำ ${shop.min_order_amount} บาท`);
  let feeInfo = null;
  if (fulfillment === 'delivery') {
    feeInfo = deliveryFee(shop, distance);
    fee = feeInfo.fee;
  }

  return { lines, qtyByProduct, fulfillment, distance, fee, feeInfo, area, address, lat, lng, subtotal, total: subtotal + fee };
}

function checkCapacity(shop, qtyByProduct, date, byName) {
  for (const [pid, q] of qtyByProduct) {
    const p = byName.get(pid);
    if (p.daily_limit == null) continue;
    const left = p.daily_limit - usedQty(pid, date);
    if (q > left) {
      throw bad(left <= 0 ? `${p.name} สำหรับวันที่ ${fmtDateTH(date)} เต็มแล้ว` : `${p.name} วันที่ ${fmtDateTH(date)} รับได้อีก ${left} ${p.unit}`);
    }
  }
}

// คำนวณราคา/ค่าส่งให้ลูกค้าดูก่อนกดยืนยัน
route('POST', '/api/orders/quote', ({ body }) => {
  const shop = db.prepare('SELECT * FROM shops WHERE slug = ?').get(String(body.shopSlug || ''));
  if (!shop) throw new HttpError(404, 'ไม่พบร้านนี้');
  const q = priceOrder(shop, body);
  checkCapacity(shop, q.qtyByProduct, body.receiveDate, new Map(q.lines.map((l) => [l.p.id, l.p])));
  return { subtotal: q.subtotal, deliveryFee: q.fee, total: q.total, distanceKm: q.distance, fee: q.feeInfo };
});

route('POST', '/api/orders', (ctx) => {
  const u = needUser(ctx);
  const b = ctx.body;
  const shop = db.prepare('SELECT * FROM shops WHERE slug = ?').get(String(b.shopSlug || ''));
  if (!shop) throw new HttpError(404, 'ไม่พบร้านนี้');

  const q = priceOrder(shop, b);
  const recipientName = str(b.recipientName, { max: 80, required: true, label: 'ชื่อผู้รับ' });
  const recipientPhone = normalizePhone(b.recipientPhone);
  if (!isPhone(recipientPhone)) throw bad('เบอร์ผู้รับไม่ถูกต้อง');
  const purpose = str(b.purpose, { max: 60, label: 'โอกาส' });
  const buyerNote = str(b.buyerNote, { max: 500, label: 'หมายเหตุ' });
  const pm = b.paymentMethod;
  if (pm === 'transfer' && !shop.transfer_enabled) throw bad('ร้านไม่รับโอน');
  if (pm === 'cod' && !shop.cod_enabled) throw bad('ร้านไม่รับชำระปลายทาง');
  if (pm !== 'transfer' && pm !== 'cod') throw bad('กรุณาเลือกวิธีชำระเงิน');

  const code = tx(() => {
    checkCapacity(shop, q.qtyByProduct, b.receiveDate, new Map(q.lines.map((l) => [l.p.id, l.p])));
    if (shop.daily_order_limit && orderCountOn(shop.id, b.receiveDate) >= shop.daily_order_limit) throw bad('คิววันนี้เพิ่งเต็ม กรุณาเลือกวันอื่น');
    const code = genOrderCode();
    const now = nowIso();
    const r = db
      .prepare(
        `INSERT INTO orders (code, shop_id, buyer_id, fulfillment, receive_date, receive_time, purpose, recipient_name, recipient_phone,
          address, area, lat, lng, distance_km, subtotal, delivery_fee, total, payment_method, buyer_note, created_at, updated_at)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`
      )
      .run(code, shop.id, u.id, q.fulfillment, b.receiveDate, b.receiveTime, purpose, recipientName, recipientPhone,
        q.address, q.area, q.lat, q.lng, q.distance, q.subtotal, q.fee, q.total, pm, buyerNote, now, now);
    const ins = db.prepare('INSERT INTO order_items (order_id, product_id, name, unit, price, qty, note) VALUES (?,?,?,?,?,?,?)');
    for (const l of q.lines) ins.run(r.lastInsertRowid, l.p.id, l.p.name, l.p.unit, l.p.price, l.qty, l.note);
    addEvent(r.lastInsertRowid, 'buyer', 'created', 'สร้างคำสั่งซื้อ');
    return code;
  });

  if (!u.name) db.prepare('UPDATE users SET name = ? WHERE id = ?').run(recipientName, u.id);
  return { code };
});

route('GET', '/api/orders/mine', (ctx) => {
  const u = needUser(ctx);
  const rows = db
    .prepare(`SELECT o.*, s.name AS shop_name, s.slug AS shop_slug FROM orders o JOIN shops s ON s.id = o.shop_id WHERE o.buyer_id = ? ORDER BY o.created_at DESC LIMIT 200`)
    .all(u.id);
  const items = itemsFor(rows.map((r) => r.id));
  return { orders: rows.map((o) => orderJson(o, { items: items.get(o.id) || [], shop: { name: o.shop_name, slug: o.shop_slug } })) };
});

function loadOrderFor(ctx) {
  const u = needUser(ctx);
  const o = db.prepare('SELECT * FROM orders WHERE code = ?').get(ctx.params.code);
  if (!o) throw new HttpError(404, 'ไม่พบคำสั่งซื้อ');
  const shop = db.prepare('SELECT * FROM shops WHERE id = ?').get(o.shop_id);
  const role = o.buyer_id === u.id ? 'buyer' : shop.owner_id === u.id ? 'seller' : null;
  if (!role) throw new HttpError(404, 'ไม่พบคำสั่งซื้อ');
  return { u, o, shop, role };
}

function fullOrder(o, shop, role) {
  const items = db.prepare('SELECT * FROM order_items WHERE order_id = ? ORDER BY id').all(o.id);
  const events = db.prepare('SELECT * FROM order_events WHERE order_id = ? ORDER BY id').all(o.id);
  const buyer = db.prepare('SELECT * FROM users WHERE id = ?').get(o.buyer_id);
  const out = orderJson(o, { items, events, shop: shopJson(shop), buyer: { name: buyer.name, phone: buyer.phone, contacts: parseJson(buyer.contacts, {}) } });
  out.role = role;
  if (role === 'seller') {
    out.sellerNote = o.seller_note;
    out.nextStatuses = NEXT[o.status].filter((s) => s !== 'delivering' || o.fulfillment === 'delivery');
  }
  return out;
}

route('GET', '/api/orders/:code', (ctx) => {
  const { o, shop, role } = loadOrderFor(ctx);
  return { order: fullOrder(o, shop, role) };
});

route('POST', '/api/orders/:code/cancel', (ctx) => {
  const { o, role } = loadOrderFor(ctx);
  if (role !== 'buyer') throw new HttpError(403, 'ใช้หน้าจัดการร้านเพื่อยกเลิก');
  if (o.status !== 'pending') throw bad('ร้านรับออเดอร์แล้ว ยกเลิกเองไม่ได้ กรุณาติดต่อร้าน');
  const reason = str(ctx.body.reason, { max: 200, label: 'เหตุผล' });
  db.prepare(`UPDATE orders SET status = 'cancelled', cancel_reason = ?, updated_at = ? WHERE id = ?`).run(reason, nowIso(), o.id);
  addEvent(o.id, 'buyer', 'cancelled', reason ? `ลูกค้ายกเลิก: ${reason}` : 'ลูกค้ายกเลิก');
  return { ok: true };
});

route('POST', '/api/orders/:code/slip', (ctx) => {
  const { o, role } = loadOrderFor(ctx);
  if (role !== 'buyer') throw new HttpError(403, 'เฉพาะผู้สั่ง');
  if (o.status === 'cancelled') throw bad('คำสั่งซื้อนี้ถูกยกเลิกแล้ว');
  if (o.payment_status === 'paid') throw bad('ร้านยืนยันการชำระเงินแล้ว');
  const url = saveImage(ctx.body.image);
  db.prepare(`UPDATE orders SET slip_image = ?, payment_status = 'pending_review', payment_method = 'transfer', updated_at = ? WHERE id = ?`).run(url, nowIso(), o.id);
  addEvent(o.id, 'buyer', 'slip', 'แนบสลิปโอนเงิน');
  return { ok: true, slipImage: url };
});

// ─── seller order management ───

route('GET', '/api/my/orders', (ctx) => {
  const shop = needShop(ctx);
  const q = ctx.query;
  const where = ['o.shop_id = ?'];
  const args = [shop.id];
  if (q.status === 'active') where.push(`o.status NOT IN ('completed','cancelled')`);
  else if (q.status && STATUSES.includes(q.status)) (where.push('o.status = ?'), args.push(q.status));
  if (q.payment && PAY_STATUSES.includes(q.payment)) (where.push('o.payment_status = ?'), args.push(q.payment));
  if (q.fulfillment === 'delivery' || q.fulfillment === 'pickup') (where.push('o.fulfillment = ?'), args.push(q.fulfillment));
  if (isDate(q.date)) (where.push('o.receive_date = ?'), args.push(q.date));
  if (isDate(q.from)) (where.push('o.receive_date >= ?'), args.push(q.from));
  if (isDate(q.to)) (where.push('o.receive_date <= ?'), args.push(q.to));
  if (q.q) {
    const s = `%${str(q.q, { max: 60 })}%`;
    where.push('(o.code LIKE ? OR o.recipient_name LIKE ? OR o.recipient_phone LIKE ?)');
    args.push(s, s, s);
  }
  const order = q.sort === 'created' ? 'o.created_at DESC' : 'o.receive_date ASC, o.receive_time ASC';
  const rows = db.prepare(`SELECT o.* FROM orders o WHERE ${where.join(' AND ')} ORDER BY ${order} LIMIT 500`).all(...args);
  const items = itemsFor(rows.map((r) => r.id));
  return {
    orders: rows.map((o) => {
      const j = orderJson(o, { items: items.get(o.id) || [] });
      j.sellerNote = o.seller_note;
      j.nextStatuses = NEXT[o.status].filter((s) => s !== 'delivering' || o.fulfillment === 'delivery');
      return j;
    }),
  };
});

route('GET', '/api/my/orders.csv', (ctx) => {
  const shop = needShop(ctx);
  const from = isDate(ctx.query.from) ? ctx.query.from : '0000-01-01';
  const to = isDate(ctx.query.to) ? ctx.query.to : '9999-12-31';
  const rows = db.prepare('SELECT * FROM orders WHERE shop_id = ? AND receive_date BETWEEN ? AND ? ORDER BY receive_date, receive_time').all(shop.id, from, to);
  const items = itemsFor(rows.map((r) => r.id));
  const esc = (v) => {
    const s = String(v ?? '');
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const head = ['รหัส', 'วันที่รับ', 'เวลา', 'สถานะ', 'วิธีรับ', 'ผู้รับ', 'เบอร์', 'ที่อยู่', 'พื้นที่', 'ระยะ(กม.)', 'รายการ', 'ยอดสินค้า', 'ค่าส่ง', 'รวม', 'วิธีชำระ', 'สถานะชำระ', 'โอกาส', 'หมายเหตุลูกค้า', 'โน้ตร้าน', 'สั่งเมื่อ'];
  const lines = [head.join(',')];
  for (const o of rows) {
    const its = (items.get(o.id) || []).map((i) => `${i.name} x${i.qty}${i.note ? ` (${i.note})` : ''}`).join('; ');
    lines.push(
      [o.code, o.receive_date, o.receive_time, STATUS_TH[o.status], o.fulfillment === 'delivery' ? 'จัดส่ง' : 'รับเอง', o.recipient_name, o.recipient_phone, o.address, o.area, o.distance_km ?? '', its,
        o.subtotal, o.delivery_fee, o.total, o.payment_method === 'cod' ? 'ปลายทาง' : 'โอน', PAY_TH[o.payment_status], o.purpose, o.buyer_note, o.seller_note, o.created_at]
        .map(esc)
        .join(',')
    );
  }
  ctx.res.writeHead(200, {
    'Content-Type': 'text/csv; charset=utf-8',
    'Content-Disposition': `attachment; filename="preshop-orders-${from}-${to}.csv"`.replace(/0000-01-01|9999-12-31/g, 'all'),
  });
  ctx.res.end('﻿' + lines.join('\r\n'));
});

function sellerOrder(ctx) {
  const shop = needShop(ctx);
  const o = db.prepare('SELECT * FROM orders WHERE code = ? AND shop_id = ?').get(ctx.params.code, shop.id);
  if (!o) throw new HttpError(404, 'ไม่พบคำสั่งซื้อ');
  return { shop, o };
}

route('POST', '/api/my/orders/:code/status', (ctx) => {
  const { shop, o } = sellerOrder(ctx);
  const to = ctx.body.status;
  const allowed = NEXT[o.status].filter((s) => s !== 'delivering' || o.fulfillment === 'delivery');
  if (!allowed.includes(to)) throw bad(`เปลี่ยนจาก "${STATUS_TH[o.status]}" เป็น "${STATUS_TH[to] || to}" ไม่ได้`);
  const note = str(ctx.body.note, { max: 200, label: 'ข้อความ' });
  db.prepare('UPDATE orders SET status = ?, cancel_reason = CASE WHEN ? = \'cancelled\' THEN ? ELSE cancel_reason END, updated_at = ? WHERE id = ?').run(to, to, note, nowIso(), o.id);
  addEvent(o.id, 'seller', to, note ? `${STATUS_TH[to]}: ${note}` : STATUS_TH[to]);
  return { order: fullOrder(db.prepare('SELECT * FROM orders WHERE id = ?').get(o.id), shop, 'seller') };
});

route('POST', '/api/my/orders/:code/payment', (ctx) => {
  const { shop, o } = sellerOrder(ctx);
  const to = ctx.body.paymentStatus;
  if (!PAY_STATUSES.includes(to)) throw bad('สถานะการชำระไม่ถูกต้อง');
  db.prepare('UPDATE orders SET payment_status = ?, paid_at = ?, updated_at = ? WHERE id = ?').run(to, to === 'paid' ? nowIso() : null, nowIso(), o.id);
  addEvent(o.id, 'seller', 'payment', `การชำระเงิน: ${PAY_TH[to]}`);
  return { order: fullOrder(db.prepare('SELECT * FROM orders WHERE id = ?').get(o.id), shop, 'seller') };
});

route('PUT', '/api/my/orders/:code/note', (ctx) => {
  const { o } = sellerOrder(ctx);
  db.prepare('UPDATE orders SET seller_note = ?, updated_at = ? WHERE id = ?').run(str(ctx.body.note, { max: 500, label: 'โน้ต' }), nowIso(), o.id);
  return { ok: true };
});

// ─── seller reports ───

route('GET', '/api/my/summary', (ctx) => {
  const shop = needShop(ctx);
  const today = todayTH();
  const monthStart = today.slice(0, 8) + '01';
  const g = (sql, ...a) => db.prepare(sql).get(shop.id, ...a);

  const pending = g(`SELECT COUNT(*) c FROM orders WHERE shop_id = ? AND status = 'pending'`).c;
  const slips = g(`SELECT COUNT(*) c FROM orders WHERE shop_id = ? AND payment_status = 'pending_review' AND status != 'cancelled'`).c;
  const todayRow = g(`SELECT COUNT(*) c, COALESCE(SUM(total),0) t FROM orders WHERE shop_id = ? AND receive_date = ? AND status != 'cancelled'`, today);
  const tomorrowRow = g(`SELECT COUNT(*) c FROM orders WHERE shop_id = ? AND receive_date = ? AND status != 'cancelled'`, addDays(today, 1));
  const unpaid = g(`SELECT COUNT(*) c, COALESCE(SUM(total),0) t FROM orders WHERE shop_id = ? AND status != 'cancelled' AND payment_status IN ('unpaid','pending_review')`);
  const month = g(`SELECT COUNT(*) c, COALESCE(SUM(total),0) t, COALESCE(SUM(CASE WHEN payment_status='paid' THEN total END),0) paid
                   FROM orders WHERE shop_id = ? AND status != 'cancelled' AND receive_date >= ? AND receive_date <= ?`, monthStart, addDays(monthStart, 31).slice(0, 8) + '00');
  const allTime = g(`SELECT COUNT(*) c, COALESCE(SUM(total),0) t FROM orders WHERE shop_id = ? AND status = 'completed'`);

  const days = [];
  for (let i = 0; i < 14; i++) {
    const d = addDays(today, i);
    const r = g(`SELECT COUNT(*) c, COALESCE(SUM(total),0) t FROM orders WHERE shop_id = ? AND receive_date = ? AND status != 'cancelled'`, d);
    days.push({ date: d, orders: r.c, total: r.t });
  }
  const top = db
    .prepare(
      `SELECT i.name, i.unit, SUM(i.qty) qty, SUM(i.qty * i.price) amount FROM order_items i JOIN orders o ON o.id = i.order_id
       WHERE o.shop_id = ? AND o.status != 'cancelled' AND o.receive_date >= ? GROUP BY i.product_id ORDER BY qty DESC LIMIT 8`
    )
    .all(shop.id, monthStart);

  return {
    today,
    pending,
    slipsToReview: slips,
    todayOrders: todayRow.c,
    todayTotal: todayRow.t,
    tomorrowOrders: tomorrowRow.c,
    unpaidCount: unpaid.c,
    unpaidTotal: unpaid.t,
    monthOrders: month.c,
    monthTotal: month.t,
    monthPaid: month.paid,
    completedOrders: allTime.c,
    completedTotal: allTime.t,
    days,
    topProducts: top,
    latestOrderAt: g('SELECT MAX(created_at) m FROM orders WHERE shop_id = ?').m,
  };
});

// สรุปของที่ต้องทำในวันที่เลือก
route('GET', '/api/my/production', (ctx) => {
  const shop = needShop(ctx);
  const date = isDate(ctx.query.date) ? ctx.query.date : todayTH();
  const rows = db
    .prepare(
      `SELECT i.product_id, i.name, i.unit, i.qty, i.note, o.code, o.receive_time, o.fulfillment, o.recipient_name, o.status
       FROM order_items i JOIN orders o ON o.id = i.order_id
       WHERE o.shop_id = ? AND o.receive_date = ? AND o.status != 'cancelled'
       ORDER BY o.receive_time, o.code`
    )
    .all(shop.id, date);
  const map = new Map();
  for (const r of rows) {
    if (!map.has(r.product_id)) map.set(r.product_id, { productId: r.product_id, name: r.name, unit: r.unit, total: 0, done: 0, orders: [] });
    const g = map.get(r.product_id);
    g.total += r.qty;
    if (['ready', 'delivering', 'completed'].includes(r.status)) g.done += r.qty;
    g.orders.push({ code: r.code, qty: r.qty, note: r.note, time: r.receive_time, fulfillment: r.fulfillment, name: r.recipient_name, status: r.status });
  }
  return { date, products: [...map.values()].sort((a, b) => b.total - a.total) };
});

// ═════════════════════════ CHAT ═════════════════════════
// ห้องแชท 1 ห้องต่อ (ร้าน, ผู้ซื้อ) ใช้ร่วมกันทุกออเดอร์

function chatUnread(userId) {
  const b = db.prepare('SELECT COALESCE(SUM(buyer_unread), 0) n FROM conversations WHERE buyer_id = ?').get(userId).n;
  const s = db.prepare('SELECT COALESCE(SUM(c.shop_unread), 0) n FROM conversations c JOIN shops s ON s.id = c.shop_id WHERE s.owner_id = ?').get(userId).n;
  return b + s;
}

function getConv(shopId, buyerId) {
  db.prepare('INSERT OR IGNORE INTO conversations (shop_id, buyer_id, created_at) VALUES (?, ?, ?)').run(shopId, buyerId, nowIso());
  return db.prepare('SELECT id FROM conversations WHERE shop_id = ? AND buyer_id = ?').get(shopId, buyerId).id;
}

function convFor(ctx) {
  const u = needUser(ctx);
  const c = db
    .prepare(
      `SELECT c.*, s.owner_id, s.name shop_name, s.slug shop_slug, s.category shop_category, s.cover_image shop_cover, s.phone shop_phone,
         u.name buyer_name, u.phone buyer_phone, u.contacts buyer_contacts
       FROM conversations c JOIN shops s ON s.id = c.shop_id JOIN users u ON u.id = c.buyer_id WHERE c.id = ?`
    )
    .get(Number(ctx.params.id));
  if (!c) throw new HttpError(404, 'ไม่พบห้องแชท');
  const role = c.buyer_id === u.id ? 'buyer' : c.owner_id === u.id ? 'shop' : null;
  if (!role) throw new HttpError(404, 'ไม่พบห้องแชท');
  return { u, c, role };
}

function convJson(c, role) {
  return {
    id: c.id,
    role,
    shop: { name: c.shop_name, slug: c.shop_slug, category: c.shop_category, coverImage: c.shop_cover, phone: c.shop_phone },
    buyer: { name: c.buyer_name, phone: role === 'shop' ? c.buyer_phone : undefined, contacts: role === 'shop' ? parseJson(c.buyer_contacts, {}) : undefined },
    title: role === 'buyer' ? c.shop_name : c.buyer_name || 'ลูกค้า',
    subtitle: role === 'buyer' ? 'ร้านค้า' : `ลูกค้าของ ${c.shop_name}`,
    lastMessage: c.last_message,
    lastMessageAt: c.last_message_at,
    unread: role === 'buyer' ? c.buyer_unread : c.shop_unread,
  };
}

// เปิดห้องแชท: ผู้ซื้อทักร้าน (shopSlug) หรือเปิดจากออเดอร์ (orderCode) ได้ทั้งสองฝั่ง
route('POST', '/api/chat/open', (ctx) => {
  const u = needUser(ctx);
  if (ctx.body.orderCode) {
    const o = db.prepare('SELECT o.*, s.owner_id FROM orders o JOIN shops s ON s.id = o.shop_id WHERE o.code = ?').get(String(ctx.body.orderCode));
    if (!o || (o.buyer_id !== u.id && o.owner_id !== u.id)) throw new HttpError(404, 'ไม่พบคำสั่งซื้อ');
    return { id: getConv(o.shop_id, o.buyer_id) };
  }
  const s = db.prepare('SELECT id, owner_id FROM shops WHERE slug = ?').get(String(ctx.body.shopSlug || ''));
  if (!s) throw new HttpError(404, 'ไม่พบร้านนี้');
  if (s.owner_id === u.id) throw bad('นี่คือร้านของคุณเอง');
  return { id: getConv(s.id, u.id) };
});

route('GET', '/api/chat', (ctx) => {
  const u = needUser(ctx);
  const rows = db
    .prepare(
      `SELECT c.*, s.owner_id, s.name shop_name, s.slug shop_slug, s.category shop_category, s.cover_image shop_cover, s.phone shop_phone,
         u.name buyer_name, u.phone buyer_phone, u.contacts buyer_contacts
       FROM conversations c JOIN shops s ON s.id = c.shop_id JOIN users u ON u.id = c.buyer_id
       WHERE c.buyer_id = ? OR s.owner_id = ?
       ORDER BY COALESCE(c.last_message_at, c.created_at) DESC LIMIT 200`
    )
    .all(u.id, u.id);
  return { conversations: rows.map((c) => convJson(c, c.buyer_id === u.id ? 'buyer' : 'shop')), unread: chatUnread(u.id) };
});

route('GET', '/api/chat/:id/messages', (ctx) => {
  const { c, role } = convFor(ctx);
  const after = Number(ctx.query.after) || 0;
  const msgs = db.prepare('SELECT * FROM messages WHERE conversation_id = ? AND id > ? ORDER BY id DESC LIMIT 200').all(c.id, after).reverse();
  if ((role === 'buyer' ? c.buyer_unread : c.shop_unread) > 0) {
    db.prepare(`UPDATE conversations SET ${role === 'buyer' ? 'buyer_unread' : 'shop_unread'} = 0 WHERE id = ?`).run(c.id);
  }
  // ออเดอร์ล่าสุดระหว่างร้านกับลูกค้าคนนี้ ไว้แนบอ้างอิงในแชท
  const orders = db
    .prepare(`SELECT code, receive_date, status, total FROM orders WHERE shop_id = ? AND buyer_id = ? ORDER BY created_at DESC LIMIT 10`)
    .all(c.shop_id, c.buyer_id)
    .map((o) => ({ code: o.code, receiveDate: o.receive_date, status: o.status, total: o.total }));
  return {
    conversation: convJson({ ...c, buyer_unread: 0, shop_unread: 0 }, role),
    messages: msgs.map((m) => ({ id: m.id, mine: m.sender === role, sender: m.sender, body: m.body, orderCode: m.order_code, createdAt: m.created_at })),
    orders,
  };
});

route('POST', '/api/chat/:id/messages', (ctx) => {
  const { c, role } = convFor(ctx);
  const body = str(ctx.body.body, { max: 1000, required: true, label: 'ข้อความ' });
  let orderCode = null;
  if (ctx.body.orderCode) {
    const o = db.prepare('SELECT code FROM orders WHERE code = ? AND shop_id = ? AND buyer_id = ?').get(String(ctx.body.orderCode), c.shop_id, c.buyer_id);
    orderCode = o?.code || null;
  }
  const now = nowIso();
  const r = db.prepare('INSERT INTO messages (conversation_id, sender, body, order_code, created_at) VALUES (?,?,?,?,?)').run(c.id, role, body, orderCode, now);
  const other = role === 'buyer' ? 'shop_unread' : 'buyer_unread';
  db.prepare(`UPDATE conversations SET last_message = ?, last_message_at = ?, ${other} = ${other} + 1 WHERE id = ?`).run(body.slice(0, 120), now, c.id);
  return { id: Number(r.lastInsertRowid) };
});

// ═════════════════════════ FEEDBACK ═════════════════════════

const FEEDBACK_KINDS = ['review', 'suggestion', 'request', 'problem'];

route('POST', '/api/feedback', (ctx) => {
  const u = needUser(ctx);
  const b = ctx.body;
  if (!FEEDBACK_KINDS.includes(b.kind)) throw bad('กรุณาเลือกประเภท');
  let shopId = null;
  if (b.shopSlug) {
    const s = db.prepare('SELECT id, owner_id FROM shops WHERE slug = ?').get(String(b.shopSlug));
    if (!s) throw new HttpError(404, 'ไม่พบร้านนี้');
    if (s.owner_id === u.id && b.kind === 'review') throw bad('รีวิวร้านตัวเองไม่ได้');
    shopId = s.id;
  }
  let rating = null;
  if (b.kind === 'review') {
    if (!shopId) throw bad('รีวิวต้องระบุร้าน');
    rating = int(b.rating, { min: 1, max: 5, label: 'คะแนน' });
    const recent = db.prepare(`SELECT 1 FROM feedback WHERE user_id = ? AND shop_id = ? AND kind = 'review' AND created_at > ?`).get(u.id, shopId, new Date(Date.now() - 86400_000).toISOString());
    if (recent) throw bad('รีวิวร้านนี้ได้วันละครั้ง');
  }
  const message = str(b.message, { max: 1000, required: true, label: 'ข้อความ' });
  if (message.length < 3) throw bad('ข้อความสั้นเกินไป');
  db.prepare('INSERT INTO feedback (shop_id, user_id, kind, rating, message, created_at) VALUES (?,?,?,?,?,?)').run(shopId, u.id, b.kind, rating, message, nowIso());
  return { ok: true };
});

function feedbackRow(r) {
  return {
    id: r.id,
    kind: r.kind,
    rating: r.rating,
    message: r.message,
    reply: r.reply,
    repliedAt: r.replied_at,
    status: r.status,
    createdAt: r.created_at,
    shopName: r.shop_name,
    userName: r.user_name,
    userPhone: r.user_phone,
  };
}

route('GET', '/api/feedback/mine', (ctx) => {
  const u = needUser(ctx);
  const rows = db
    .prepare(`SELECT f.*, s.name shop_name FROM feedback f LEFT JOIN shops s ON s.id = f.shop_id WHERE f.user_id = ? ORDER BY f.created_at DESC LIMIT 100`)
    .all(u.id);
  return { feedback: rows.map(feedbackRow) };
});

route('GET', '/api/my/feedback', (ctx) => {
  const shop = needShop(ctx);
  const rows = db
    .prepare(`SELECT f.*, u.name user_name, u.phone user_phone FROM feedback f JOIN users u ON u.id = f.user_id WHERE f.shop_id = ? ORDER BY f.status = 'done', f.created_at DESC LIMIT 300`)
    .all(shop.id);
  return { feedback: rows.map(feedbackRow) };
});

function replyFeedback(row, body) {
  const reply = str(body.reply, { max: 1000, label: 'คำตอบ' });
  const status = body.status === 'done' ? 'done' : 'open';
  db.prepare('UPDATE feedback SET reply = ?, replied_at = ?, status = ? WHERE id = ?').run(reply, reply ? nowIso() : null, status, row.id);
  return { ok: true };
}

route('POST', '/api/my/feedback/:id/reply', (ctx) => {
  const shop = needShop(ctx);
  const row = db.prepare('SELECT * FROM feedback WHERE id = ? AND shop_id = ?').get(Number(ctx.params.id), shop.id);
  if (!row) throw new HttpError(404, 'ไม่พบข้อความ');
  return replyFeedback(row, ctx.body);
});

// ข้อเสนอแนะถึงทีม Preshop (ไม่ระบุร้าน) — ดูได้เฉพาะผู้ดูแลระบบที่ตั้งใน ADMIN_PHONES
function needAdmin(ctx) {
  const u = needUser(ctx);
  if (!ADMIN_PHONES.includes(u.phone)) throw new HttpError(403, 'เฉพาะผู้ดูแลระบบ');
}

route('GET', '/api/admin/feedback', (ctx) => {
  needAdmin(ctx);
  const rows = db
    .prepare(`SELECT f.*, u.name user_name, u.phone user_phone FROM feedback f JOIN users u ON u.id = f.user_id WHERE f.shop_id IS NULL ORDER BY f.status = 'done', f.created_at DESC LIMIT 500`)
    .all();
  return { feedback: rows.map(feedbackRow) };
});

route('POST', '/api/admin/feedback/:id/reply', (ctx) => {
  needAdmin(ctx);
  const row = db.prepare('SELECT * FROM feedback WHERE id = ? AND shop_id IS NULL').get(Number(ctx.params.id));
  if (!row) throw new HttpError(404, 'ไม่พบข้อความ');
  return replyFeedback(row, ctx.body);
});

// ═════════════════════════ ลบ / ระงับ / แบน ═════════════════════════

function isAdmin(u) {
  return !!u && ADMIN_PHONES.includes(u.phone);
}
const ACTIVE_ORDER = `status NOT IN ('completed','cancelled')`;
const randTag = () => crypto.randomBytes(3).toString('hex');

// ยกเลิกออเดอร์ที่ยังค้าง (ใช้ตอนแอดมินบังคับลบ)
function cancelActive(where, args, actor, reason) {
  const rows = db.prepare(`SELECT id FROM orders WHERE ${where} AND ${ACTIVE_ORDER}`).all(...args);
  for (const o of rows) {
    db.prepare(`UPDATE orders SET status = 'cancelled', cancel_reason = ?, updated_at = ? WHERE id = ?`).run(reason, nowIso(), o.id);
    addEvent(o.id, actor, 'cancelled', reason);
  }
  return rows.length;
}

// ลบร้าน: ซ่อนถาวร คืนลิงก์ร้านให้คนอื่นใช้ได้ ประวัติออเดอร์ยังอยู่ (ต้องเรียกภายใน tx)
function removeShop(shopId, actor, reason) {
  cancelActive('shop_id = ?', [shopId], actor, reason);
  db.prepare(`UPDATE shops SET deleted_at = ?, is_open = 0, suspended = 0, slug = ? WHERE id = ?`).run(nowIso(), `deleted-${shopId}-${randTag()}`, shopId);
  db.prepare('UPDATE products SET archived = 1, is_active = 0 WHERE shop_id = ?').run(shopId);
  db.prepare('DELETE FROM feedback WHERE shop_id = ?').run(shopId);
  db.prepare('DELETE FROM conversations WHERE shop_id = ?').run(shopId);
}

// ลบบัญชี: ลบร้านของผู้ใช้ ลบข้อมูลส่วนตัว (ชื่อ เบอร์ ที่อยู่ ช่องทางติดต่อ รีวิว แชท)
// ออเดอร์เก่ายังอยู่ให้ร้านดูยอดได้ แต่ลบข้อมูลผู้รับออก (ต้องเรียกภายใน tx)
function removeUser(userId, actor, reason) {
  for (const s of myShops(userId)) removeShop(s.id, actor, reason);
  cancelActive('buyer_id = ?', [userId], actor, reason);
  db.prepare(`UPDATE orders SET recipient_name = 'ผู้ใช้ที่ลบบัญชี', recipient_phone = '-', address = '', lat = NULL, lng = NULL, slip_image = NULL WHERE buyer_id = ?`).run(userId);
  db.prepare('DELETE FROM feedback WHERE user_id = ?').run(userId);
  db.prepare('DELETE FROM conversations WHERE buyer_id = ?').run(userId);
  db.prepare('DELETE FROM sessions WHERE user_id = ?').run(userId);
  db.prepare(
    `UPDATE users SET name = 'ผู้ใช้ที่ลบบัญชี', phone = ?, contacts = '{}', lat = NULL, lng = NULL, address = '', province = '', district = '', deleted_at = ? WHERE id = ?`
  ).run(`deleted-${userId}-${randTag()}`, nowIso(), userId);
}

const activeOrdersOfShop = (shopId) => db.prepare(`SELECT COUNT(*) c FROM orders WHERE shop_id = ? AND ${ACTIVE_ORDER}`).get(shopId).c;
const activeOrdersAsBuyer = (userId) => db.prepare(`SELECT COUNT(*) c FROM orders WHERE buyer_id = ? AND ${ACTIVE_ORDER}`).get(userId).c;

// ── เจ้าของร้านลบร้านตัวเอง ──
route('DELETE', '/api/my/shop', (ctx) => {
  const shop = needShop(ctx);
  if (String(ctx.query.confirm || '').trim() !== shop.name) throw bad('พิมพ์ชื่อร้านให้ตรงเพื่อยืนยันการลบ');
  const n = activeOrdersOfShop(shop.id);
  if (n) throw bad(`ยังมีออเดอร์ที่ยังไม่เสร็จ ${n} รายการ กรุณาส่งให้เสร็จหรือยกเลิกก่อนลบร้าน`);
  tx(() => removeShop(shop.id, 'seller', 'ร้านปิดกิจการ'));
  return { ok: true };
});

// ── ผู้ใช้ลบบัญชีตัวเอง ──
route('DELETE', '/api/me', (ctx) => {
  const u = needUser(ctx);
  if (String(ctx.query.confirm || '').trim() !== 'ลบบัญชี') throw bad('พิมพ์คำว่า "ลบบัญชี" เพื่อยืนยัน');
  const asBuyer = activeOrdersAsBuyer(u.id);
  if (asBuyer) throw bad(`คุณยังมีออเดอร์ที่ยังไม่เสร็จ ${asBuyer} รายการ รอรับของหรือยกเลิกก่อนลบบัญชี`);
  for (const s of myShops(u.id)) {
    const n = activeOrdersOfShop(s.id);
    if (n) throw bad(`ร้าน "${s.name}" ยังมีออเดอร์ค้าง ${n} รายการ กรุณาจัดการให้เสร็จก่อนลบบัญชี`);
  }
  tx(() => removeUser(u.id, 'buyer', 'ลูกค้าลบบัญชี'));
  ctx.headers['Set-Cookie'] = `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${COOKIE_SECURE}`;
  return { ok: true };
});

// ═════════════════════════ ADMIN ═════════════════════════

route('GET', '/api/admin/stats', (ctx) => {
  needAdmin(ctx);
  const one = (sql, ...a) => db.prepare(sql).get(...a);
  const today = todayTH();
  return {
    users: one('SELECT COUNT(*) c FROM users WHERE deleted_at IS NULL').c,
    bannedUsers: one('SELECT COUNT(*) c FROM users WHERE banned = 1 AND deleted_at IS NULL').c,
    shops: one('SELECT COUNT(*) c FROM shops WHERE deleted_at IS NULL').c,
    suspendedShops: one('SELECT COUNT(*) c FROM shops WHERE suspended = 1 AND deleted_at IS NULL').c,
    openShops: one('SELECT COUNT(*) c FROM shops WHERE is_open = 1 AND suspended = 0 AND deleted_at IS NULL').c,
    orders: one('SELECT COUNT(*) c FROM orders').c,
    ordersToday: one('SELECT COUNT(*) c FROM orders WHERE substr(created_at, 1, 10) = ?', today).c,
    activeOrders: one(`SELECT COUNT(*) c FROM orders WHERE ${ACTIVE_ORDER}`).c,
    gmvMonth: one(`SELECT COALESCE(SUM(total), 0) t FROM orders WHERE status != 'cancelled' AND receive_date >= ?`, today.slice(0, 8) + '01').t,
    reviews: one(`SELECT COUNT(*) c FROM feedback WHERE kind = 'review'`).c,
    openFeedback: one(`SELECT COUNT(*) c FROM feedback WHERE shop_id IS NULL AND status = 'open'`).c,
  };
});

route('GET', '/api/admin/shops', (ctx) => {
  needAdmin(ctx);
  const q = `%${str(ctx.query.q, { max: 60 })}%`;
  const filter = ctx.query.filter === 'suspended' ? 'AND s.suspended = 1' : ctx.query.filter === 'closed' ? 'AND s.is_open = 0' : '';
  const rows = db
    .prepare(
      `SELECT s.*, u.name owner_name, u.phone owner_phone,
         (SELECT COUNT(*) FROM orders o WHERE o.shop_id = s.id) order_count,
         (SELECT COUNT(*) FROM orders o WHERE o.shop_id = s.id AND o.${ACTIVE_ORDER}) active_count,
         (SELECT COUNT(*) FROM products p WHERE p.shop_id = s.id AND p.archived = 0) product_count,
         (SELECT ROUND(AVG(rating), 1) FROM feedback f WHERE f.shop_id = s.id AND f.kind = 'review') rating
       FROM shops s JOIN users u ON u.id = s.owner_id
       WHERE s.deleted_at IS NULL ${filter} AND (s.name LIKE ? OR s.slug LIKE ? OR u.name LIKE ? OR u.phone LIKE ?)
       ORDER BY s.suspended DESC, s.created_at DESC LIMIT 300`
    )
    .all(q, q, q, q);
  return {
    shops: rows.map((s) => ({
      id: s.id, slug: s.slug, name: s.name, category: s.category, province: s.province, district: s.district,
      isOpen: !!s.is_open, suspended: !!s.suspended, suspendedReason: s.suspended_reason, createdAt: s.created_at,
      owner: { id: s.owner_id, name: s.owner_name, phone: s.owner_phone },
      orderCount: s.order_count, activeCount: s.active_count, productCount: s.product_count, rating: s.rating,
    })),
  };
});

function adminShop(ctx) {
  const s = db.prepare('SELECT * FROM shops WHERE id = ? AND deleted_at IS NULL').get(Number(ctx.params.id));
  if (!s) throw new HttpError(404, 'ไม่พบร้าน');
  return s;
}
route('POST', '/api/admin/shops/:id/suspend', (ctx) => {
  needAdmin(ctx);
  const s = adminShop(ctx);
  db.prepare('UPDATE shops SET suspended = 1, suspended_reason = ? WHERE id = ?').run(str(ctx.body.reason, { max: 200, label: 'เหตุผล' }), s.id);
  return { ok: true };
});
route('POST', '/api/admin/shops/:id/unsuspend', (ctx) => {
  needAdmin(ctx);
  const s = adminShop(ctx);
  db.prepare(`UPDATE shops SET suspended = 0, suspended_reason = '' WHERE id = ?`).run(s.id);
  return { ok: true };
});
route('DELETE', '/api/admin/shops/:id', (ctx) => {
  needAdmin(ctx);
  const s = adminShop(ctx);
  const reason = str(ctx.query.reason, { max: 200 }) || 'ร้านถูกปิดโดยผู้ดูแลระบบ';
  tx(() => removeShop(s.id, 'admin', `ยกเลิกโดยระบบ: ${reason}`));
  return { ok: true };
});

route('GET', '/api/admin/users', (ctx) => {
  needAdmin(ctx);
  const raw = str(ctx.query.q, { max: 60 });
  const q = `%${/^[\d\s-]+$/.test(raw) && raw ? normalizePhone(raw) : raw}%`;
  const filter = ctx.query.filter === 'banned' ? 'AND u.banned = 1' : ctx.query.filter === 'sellers' ? 'AND EXISTS (SELECT 1 FROM shops s WHERE s.owner_id = u.id AND s.deleted_at IS NULL)' : '';
  const rows = db
    .prepare(
      `SELECT u.*,
         (SELECT COUNT(*) FROM shops s WHERE s.owner_id = u.id AND s.deleted_at IS NULL) shop_count,
         (SELECT COUNT(*) FROM orders o WHERE o.buyer_id = u.id) order_count
       FROM users u WHERE u.deleted_at IS NULL ${filter} AND (u.name LIKE ? OR u.phone LIKE ?)
       ORDER BY u.banned DESC, u.created_at DESC LIMIT 300`
    )
    .all(q, q);
  return {
    users: rows.map((u) => ({
      id: u.id, name: u.name, phone: u.phone, createdAt: u.created_at, lastLoginAt: u.last_login_at,
      banned: !!u.banned, bannedReason: u.banned_reason, isAdmin: ADMIN_PHONES.includes(u.phone),
      shopCount: u.shop_count, orderCount: u.order_count, area: [u.district, u.province].filter(Boolean).join(' '),
    })),
  };
});

function adminTargetUser(ctx) {
  const me = needUser(ctx);
  const u = db.prepare('SELECT * FROM users WHERE id = ? AND deleted_at IS NULL').get(Number(ctx.params.id));
  if (!u) throw new HttpError(404, 'ไม่พบผู้ใช้');
  if (u.id === me.id) throw bad('จัดการบัญชีตัวเองจากหน้านี้ไม่ได้');
  if (ADMIN_PHONES.includes(u.phone)) throw bad('จัดการบัญชีผู้ดูแลระบบคนอื่นไม่ได้');
  return u;
}
route('POST', '/api/admin/users/:id/ban', (ctx) => {
  needAdmin(ctx);
  const u = adminTargetUser(ctx);
  tx(() => {
    db.prepare('UPDATE users SET banned = 1, banned_reason = ? WHERE id = ?').run(str(ctx.body.reason, { max: 200, label: 'เหตุผล' }), u.id);
    db.prepare('DELETE FROM sessions WHERE user_id = ?').run(u.id);
    // ร้านของคนที่ถูกแบน ระงับไปด้วย
    db.prepare(`UPDATE shops SET suspended = 1, suspended_reason = 'เจ้าของบัญชีถูกระงับ' WHERE owner_id = ? AND deleted_at IS NULL`).run(u.id);
  });
  return { ok: true };
});
route('POST', '/api/admin/users/:id/unban', (ctx) => {
  needAdmin(ctx);
  const u = adminTargetUser(ctx);
  tx(() => {
    db.prepare(`UPDATE users SET banned = 0, banned_reason = '' WHERE id = ?`).run(u.id);
    db.prepare(`UPDATE shops SET suspended = 0, suspended_reason = '' WHERE owner_id = ? AND suspended_reason = 'เจ้าของบัญชีถูกระงับ'`).run(u.id);
  });
  return { ok: true };
});
route('DELETE', '/api/admin/users/:id', (ctx) => {
  needAdmin(ctx);
  const u = adminTargetUser(ctx);
  tx(() => removeUser(u.id, 'admin', 'ยกเลิกโดยระบบ: บัญชีถูกลบโดยผู้ดูแลระบบ'));
  return { ok: true };
});

// รีวิว/ข้อความทั้งหมด (ทั้งถึงร้านและถึงทีม)
route('GET', '/api/admin/reviews', (ctx) => {
  needAdmin(ctx);
  const q = `%${str(ctx.query.q, { max: 60 })}%`;
  const kind = FEEDBACK_KINDS.includes(ctx.query.kind) ? ctx.query.kind : '';
  const rows = db
    .prepare(
      `SELECT f.*, u.name user_name, u.phone user_phone, s.name shop_name, s.slug shop_slug
       FROM feedback f JOIN users u ON u.id = f.user_id LEFT JOIN shops s ON s.id = f.shop_id
       WHERE (? = '' OR f.kind = ?) AND (f.message LIKE ? OR u.name LIKE ? OR COALESCE(s.name, '') LIKE ?)
       ORDER BY f.created_at DESC LIMIT 300`
    )
    .all(kind, kind, q, q, q);
  return { feedback: rows.map((r) => ({ ...feedbackRow(r), shopSlug: r.shop_slug })) };
});
route('DELETE', '/api/admin/feedback/:id', (ctx) => {
  needAdmin(ctx);
  const r = db.prepare('DELETE FROM feedback WHERE id = ?').run(Number(ctx.params.id));
  if (!r.changes) throw new HttpError(404, 'ไม่พบข้อความ');
  return { ok: true };
});
