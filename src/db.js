import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const DATA_DIR = path.resolve(process.env.DATA_DIR || path.join(ROOT, 'data'));
export const UPLOAD_DIR = path.join(DATA_DIR, 'uploads');
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

export const db = new DatabaseSync(path.join(DATA_DIR, 'preshop.db'));
db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;');

db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY,
  phone TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL DEFAULT '',
  contacts TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL,
  last_login_at TEXT
);

CREATE TABLE IF NOT EXISTS otps (
  id INTEGER PRIMARY KEY,
  phone TEXT NOT NULL,
  code_hash TEXT NOT NULL,
  expires_at INTEGER NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  used INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_otps_phone ON otps(phone, created_at);

CREATE TABLE IF NOT EXISTS sessions (
  token_hash TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS shops (
  id INTEGER PRIMARY KEY,
  owner_id INTEGER NOT NULL REFERENCES users(id),
  slug TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'other',
  description TEXT NOT NULL DEFAULT '',
  phone TEXT NOT NULL DEFAULT '',
  address TEXT NOT NULL DEFAULT '',
  lat REAL,
  lng REAL,
  cover_image TEXT,
  contacts TEXT NOT NULL DEFAULT '{}',
  is_open INTEGER NOT NULL DEFAULT 1,
  closed_message TEXT NOT NULL DEFAULT '',
  pickup_enabled INTEGER NOT NULL DEFAULT 1,
  delivery_enabled INTEGER NOT NULL DEFAULT 1,
  default_radius_km REAL NOT NULL DEFAULT 5,
  delivery_fee_base REAL NOT NULL DEFAULT 20,
  delivery_base_km REAL NOT NULL DEFAULT 2,
  delivery_fee_per_km REAL NOT NULL DEFAULT 8,
  free_delivery_min REAL NOT NULL DEFAULT 0,
  free_delivery_max_km REAL NOT NULL DEFAULT 3,
  areas TEXT NOT NULL DEFAULT '',
  min_order_amount REAL NOT NULL DEFAULT 0,
  min_lead_days INTEGER NOT NULL DEFAULT 1,
  max_advance_days INTEGER NOT NULL DEFAULT 60,
  open_time TEXT NOT NULL DEFAULT '08:00',
  close_time TEXT NOT NULL DEFAULT '18:00',
  closed_weekdays TEXT NOT NULL DEFAULT '',
  closed_dates TEXT NOT NULL DEFAULT '',
  transfer_enabled INTEGER NOT NULL DEFAULT 1,
  cod_enabled INTEGER NOT NULL DEFAULT 1,
  promptpay_id TEXT NOT NULL DEFAULT '',
  bank_info TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS products (
  id INTEGER PRIMARY KEY,
  shop_id INTEGER NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  category TEXT NOT NULL DEFAULT '',
  price REAL NOT NULL,
  unit TEXT NOT NULL DEFAULT 'ถ้วย',
  image TEXT,
  is_active INTEGER NOT NULL DEFAULT 1,
  archived INTEGER NOT NULL DEFAULT 0,
  min_qty INTEGER NOT NULL DEFAULT 1,
  daily_limit INTEGER,
  lead_days INTEGER,
  delivery_allowed INTEGER NOT NULL DEFAULT 1,
  pickup_allowed INTEGER NOT NULL DEFAULT 1,
  delivery_radius_km REAL,
  allowed_areas TEXT NOT NULL DEFAULT '',
  sort INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_products_shop ON products(shop_id);

CREATE TABLE IF NOT EXISTS orders (
  id INTEGER PRIMARY KEY,
  code TEXT UNIQUE NOT NULL,
  shop_id INTEGER NOT NULL REFERENCES shops(id),
  buyer_id INTEGER NOT NULL REFERENCES users(id),
  status TEXT NOT NULL DEFAULT 'pending',
  fulfillment TEXT NOT NULL,
  receive_date TEXT NOT NULL,
  receive_time TEXT NOT NULL,
  purpose TEXT NOT NULL DEFAULT '',
  recipient_name TEXT NOT NULL,
  recipient_phone TEXT NOT NULL,
  address TEXT NOT NULL DEFAULT '',
  area TEXT NOT NULL DEFAULT '',
  lat REAL,
  lng REAL,
  distance_km REAL,
  subtotal REAL NOT NULL,
  delivery_fee REAL NOT NULL DEFAULT 0,
  total REAL NOT NULL,
  payment_method TEXT NOT NULL,
  payment_status TEXT NOT NULL DEFAULT 'unpaid',
  slip_image TEXT,
  paid_at TEXT,
  buyer_note TEXT NOT NULL DEFAULT '',
  seller_note TEXT NOT NULL DEFAULT '',
  cancel_reason TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_orders_shop_date ON orders(shop_id, receive_date);
CREATE INDEX IF NOT EXISTS idx_orders_buyer ON orders(buyer_id);

CREATE TABLE IF NOT EXISTS order_items (
  id INTEGER PRIMARY KEY,
  order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  product_id INTEGER NOT NULL,
  name TEXT NOT NULL,
  unit TEXT NOT NULL,
  price REAL NOT NULL,
  qty INTEGER NOT NULL,
  note TEXT NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS idx_items_order ON order_items(order_id);
CREATE INDEX IF NOT EXISTS idx_items_product ON order_items(product_id);

CREATE TABLE IF NOT EXISTS order_events (
  id INTEGER PRIMARY KEY,
  order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  actor TEXT NOT NULL,
  kind TEXT NOT NULL,
  message TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_events_order ON order_events(order_id);

CREATE TABLE IF NOT EXISTS feedback (
  id INTEGER PRIMARY KEY,
  shop_id INTEGER REFERENCES shops(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id),
  kind TEXT NOT NULL,
  rating INTEGER,
  message TEXT NOT NULL,
  reply TEXT NOT NULL DEFAULT '',
  replied_at TEXT,
  status TEXT NOT NULL DEFAULT 'open',
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_feedback_shop ON feedback(shop_id);
`);

// ── migrations สำหรับฐานข้อมูลเวอร์ชันก่อน ──
{
  const ddl = db.prepare(`SELECT sql FROM sqlite_master WHERE type='table' AND name='shops'`).get().sql;
  // v1: เพิ่มคอลัมน์ใหม่
  const cols = new Set(db.prepare('PRAGMA table_info(shops)').all().map((c) => c.name));
  const add = {
    category: `TEXT NOT NULL DEFAULT 'other'`,
    delivery_base_km: 'REAL NOT NULL DEFAULT 2',
    free_delivery_max_km: 'REAL NOT NULL DEFAULT 0',
  };
  for (const [c, def] of Object.entries(add)) if (!cols.has(c)) db.exec(`ALTER TABLE shops ADD COLUMN ${c} ${def}`);
  // v1: เจ้าของหนึ่งคนเปิดได้หลายร้าน → ถอด UNIQUE ออกจาก owner_id
  if (/owner_id INTEGER UNIQUE/.test(ddl)) {
    const newDdl = db.prepare(`SELECT sql FROM sqlite_master WHERE type='table' AND name='shops'`).get().sql
      .replace('owner_id INTEGER UNIQUE NOT NULL', 'owner_id INTEGER NOT NULL')
      .replace(/CREATE TABLE "?shops"?/, 'CREATE TABLE shops_new');
    const all = db.prepare('PRAGMA table_info(shops)').all().map((c) => c.name).join(', ');
    db.exec('PRAGMA foreign_keys = OFF');
    db.exec('BEGIN');
    db.exec(newDdl);
    db.exec(`INSERT INTO shops_new (${all}) SELECT ${all} FROM shops`);
    db.exec('DROP TABLE shops');
    db.exec('ALTER TABLE shops_new RENAME TO shops');
    db.exec('COMMIT');
    db.exec('PRAGMA foreign_keys = ON');
  }
  db.exec('CREATE INDEX IF NOT EXISTS idx_shops_owner ON shops(owner_id)');

  // v2: เวลาปิดรับออเดอร์ของวัน, ปิดรับวันนี้, วันที่คิวเต็ม, จำกัดออเดอร์ต่อวัน
  const cols2 = new Set(db.prepare('PRAGMA table_info(shops)').all().map((c) => c.name));
  const add2 = {
    order_cutoff_time: `TEXT NOT NULL DEFAULT '18:00'`,
    paused_until: `TEXT NOT NULL DEFAULT ''`,
    full_dates: `TEXT NOT NULL DEFAULT ''`,
    daily_order_limit: 'INTEGER',
  };
  for (const [c, def] of Object.entries(add2)) if (!cols2.has(c)) db.exec(`ALTER TABLE shops ADD COLUMN ${c} ${def}`);

  // v3: จังหวัด/อำเภอของร้าน + ที่อยู่หลักของผู้ใช้ (ใช้คำนวณระยะ/ค่าส่ง)
  for (const [c, def] of Object.entries({ province: `TEXT NOT NULL DEFAULT ''`, district: `TEXT NOT NULL DEFAULT ''` })) {
    if (!cols2.has(c)) db.exec(`ALTER TABLE shops ADD COLUMN ${c} ${def}`);
  }
  const ucols = new Set(db.prepare('PRAGMA table_info(users)').all().map((c) => c.name));
  for (const [c, def] of Object.entries({ lat: 'REAL', lng: 'REAL', address: `TEXT NOT NULL DEFAULT ''`, province: `TEXT NOT NULL DEFAULT ''`, district: `TEXT NOT NULL DEFAULT ''` })) {
    if (!ucols.has(c)) db.exec(`ALTER TABLE users ADD COLUMN ${c} ${def}`);
  }

  // v4: ระงับ/ลบร้าน, แบน/ลบบัญชี
  const cols4 = new Set(db.prepare('PRAGMA table_info(shops)').all().map((c) => c.name));
  for (const [c, def] of Object.entries({ suspended: 'INTEGER NOT NULL DEFAULT 0', suspended_reason: `TEXT NOT NULL DEFAULT ''`, deleted_at: 'TEXT' })) {
    if (!cols4.has(c)) db.exec(`ALTER TABLE shops ADD COLUMN ${c} ${def}`);
  }
  const ucols4 = new Set(db.prepare('PRAGMA table_info(users)').all().map((c) => c.name));
  for (const [c, def] of Object.entries({ banned: 'INTEGER NOT NULL DEFAULT 0', banned_reason: `TEXT NOT NULL DEFAULT ''`, deleted_at: 'TEXT' })) {
    if (!ucols4.has(c)) db.exec(`ALTER TABLE users ADD COLUMN ${c} ${def}`);
  }

  const version = db.prepare('PRAGMA user_version').get().user_version;
  if (version < 2) {
    // ส่งฟรีในระยะ 3 กม. (ไม่มีเงื่อนไขยอดสั่งแล้ว)
    db.exec(`UPDATE shops SET free_delivery_max_km = 3, free_delivery_min = 0`);
    db.exec('PRAGMA user_version = 2');
  }
}

db.exec(`
CREATE TABLE IF NOT EXISTS conversations (
  id INTEGER PRIMARY KEY,
  shop_id INTEGER NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
  buyer_id INTEGER NOT NULL REFERENCES users(id),
  last_message_at TEXT,
  last_message TEXT NOT NULL DEFAULT '',
  buyer_unread INTEGER NOT NULL DEFAULT 0,
  shop_unread INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  UNIQUE (shop_id, buyer_id)
);
CREATE INDEX IF NOT EXISTS idx_conv_buyer ON conversations(buyer_id);
CREATE TABLE IF NOT EXISTS messages (
  id INTEGER PRIMARY KEY,
  conversation_id INTEGER NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  sender TEXT NOT NULL,
  body TEXT NOT NULL,
  order_code TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_msg_conv ON messages(conversation_id, id);
`);

export function tx(fn) {
  db.exec('BEGIN IMMEDIATE');
  try {
    const out = fn();
    db.exec('COMMIT');
    return out;
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
}

export const nowIso = () => new Date().toISOString();
