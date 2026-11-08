// ───── utilities shared by every page ─────
import { catIcon } from '/js/icons.js';

// ───── แอป (PWA) ─────
// start_url ของแอปคือ /?source=app → จำไว้ทั้ง session เผื่อเบราว์เซอร์บางตัวไม่บอก display-mode
try {
  if (new URLSearchParams(location.search).get('source') === 'app') sessionStorage.setItem('preshop.app', '1');
} catch {}
export const isAppMode = () => {
  let flag = false;
  try {
    flag = sessionStorage.getItem('preshop.app') === '1';
  } catch {}
  return flag || matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
};
if (isAppMode()) document.documentElement.classList.add('app-mode');
if ('serviceWorker' in navigator) {
  addEventListener('load', () => navigator.serviceWorker.register('/sw.js').catch(() => {}));
}
let installEvent = null;
addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  installEvent = e;
  document.querySelectorAll('[data-install]').forEach((el) => el.classList.remove('hidden'));
});
addEventListener('appinstalled', () => {
  installEvent = null;
  document.querySelectorAll('[data-install]').forEach((el) => el.classList.add('hidden'));
  toast('ติดตั้งแอป Preshop แล้ว', 'ok');
});
const isIOS = () => /iphone|ipad|ipod/i.test(navigator.userAgent);
export async function installApp() {
  if (installEvent) {
    installEvent.prompt();
    await installEvent.userChoice.catch(() => {});
    installEvent = null;
    return;
  }
  modal({
    title: 'ติดตั้งแอป Preshop',
    body: isIOS()
      ? `<ol style="padding-left:20px;margin:0;line-height:2">
          <li>เปิดหน้านี้ใน <b>Safari</b></li>
          <li>กดปุ่ม <b>แชร์</b> (สี่เหลี่ยมมีลูกศรชี้ขึ้น) ด้านล่าง</li>
          <li>เลือก <b>“เพิ่มไปยังหน้าจอโฮม”</b></li></ol>`
      : `<ol style="padding-left:20px;margin:0;line-height:2">
          <li>เปิดหน้านี้ใน <b>Chrome</b></li>
          <li>กดเมนู <b>⋮</b> มุมขวาบน</li>
          <li>เลือก <b>“ติดตั้งแอป”</b> หรือ <b>“เพิ่มลงในหน้าจอหลัก”</b></li></ol>`,
    actions: '<button class="btn primary" data-close>เข้าใจแล้ว</button>',
  });
}

// ร้านที่กำลังจัดการ (เจ้าของหนึ่งคนมีหลายร้านได้)
const SHOP_KEY = 'preshop.currentShop';
export function currentShopId() {
  try {
    return Number(localStorage.getItem(SHOP_KEY)) || 0;
  } catch {
    return 0;
  }
}
export function setCurrentShopId(id) {
  try {
    localStorage.setItem(SHOP_KEY, String(id));
  } catch {}
}

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

export function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}

export async function api(path, { method = 'GET', body } = {}) {
  const headers = body ? { 'Content-Type': 'application/json' } : {};
  if (path.startsWith('/api/my/') && currentShopId()) headers['X-Shop-Id'] = String(currentShopId());
  const res = await fetch(path, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
    credentials: 'same-origin',
  });
  let data = {};
  try {
    data = await res.json();
  } catch {}
  if (!res.ok) {
    const err = new Error(data.error || `เกิดข้อผิดพลาด (${res.status})`);
    err.status = res.status;
    throw err;
  }
  return data;
}

export const baht = (n) => '฿' + Number(n || 0).toLocaleString('th-TH', { maximumFractionDigits: 2 });

const TH_MONTHS = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];
export const TH_DAYS = ['อาทิตย์', 'จันทร์', 'อังคาร', 'พุธ', 'พฤหัสบดี', 'ศุกร์', 'เสาร์'];
export const TH_DAYS_SHORT = ['อา', 'จ', 'อ', 'พ', 'พฤ', 'ศ', 'ส'];

// '2026-11-08' → 'ส. 8 พ.ย. 69'
export function fmtDate(d, { weekday = true, year = true } = {}) {
  if (!d) return '';
  const [y, m, day] = d.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, day));
  const w = weekday ? TH_DAYS_SHORT[dt.getUTCDay()] + '. ' : '';
  const yy = year ? ' ' + String((y + 543) % 100).padStart(2, '0') : '';
  return `${w}${day} ${TH_MONTHS[m - 1]}${yy}`;
}
export function fmtDateTime(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  return d.toLocaleString('th-TH', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Bangkok' });
}
export const todayTH = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Bangkok' });
export function addDays(d, n) {
  const x = new Date(d + 'T00:00:00Z');
  x.setUTCDate(x.getUTCDate() + n);
  return x.toISOString().slice(0, 10);
}
export function relDay(d) {
  const t = todayTH();
  if (d === t) return 'วันนี้';
  if (d === addDays(t, 1)) return 'พรุ่งนี้';
  if (d === addDays(t, 2)) return 'มะรืนนี้';
  return '';
}

export const STATUS = {
  pending: { th: 'รอร้านยืนยัน', cls: 'warn' },
  confirmed: { th: 'ร้านรับออเดอร์แล้ว', cls: 'info' },
  preparing: { th: 'กำลังทำ', cls: 'info' },
  ready: { th: 'ทำเสร็จแล้ว', cls: 'ok' },
  delivering: { th: 'กำลังไปส่ง', cls: 'info' },
  completed: { th: 'สำเร็จ', cls: 'ok' },
  cancelled: { th: 'ยกเลิก', cls: 'bad' },
};
export const PAY = {
  unpaid: { th: 'ยังไม่ชำระ', cls: 'warn' },
  pending_review: { th: 'รอตรวจสลิป', cls: 'info' },
  paid: { th: 'ชำระแล้ว', cls: 'ok' },
  refunded: { th: 'คืนเงินแล้ว', cls: 'grey' },
};
export const statusPill = (s) => `<span class="pill ${STATUS[s]?.cls || 'grey'}">${esc(STATUS[s]?.th || s)}</span>`;
export const payPill = (s, method) =>
  `<span class="pill ${PAY[s]?.cls || 'grey'}">${esc(PAY[s]?.th || s)}${s !== 'paid' && method === 'cod' ? ' · ปลายทาง' : ''}</span>`;
export const fulfillPill = (f) => (f === 'delivery' ? '<span class="pill">จัดส่ง</span>' : '<span class="pill grey">มารับเอง</span>');

export const CONTACTS = {
  facebook: { th: 'Facebook', url: (v) => (/^https?:\/\//.test(v) ? v : `https://facebook.com/${v}`) },
  line: { th: 'LINE', url: (v) => (/^https?:\/\//.test(v) ? v : `https://line.me/ti/p/~${v.replace(/^@/, '')}`) },
  instagram: { th: 'Instagram', url: (v) => (/^https?:\/\//.test(v) ? v : `https://instagram.com/${v.replace(/^@/, '')}`) },
  tiktok: { th: 'TikTok', url: (v) => (/^https?:\/\//.test(v) ? v : `https://tiktok.com/@${v.replace(/^@/, '')}`) },
  website: { th: 'เว็บไซต์', url: (v) => (/^https?:\/\//.test(v) ? v : `https://${v}`) },
  other: { th: 'อื่นๆ', url: null },
};
export function contactLinks(contacts = {}, phone) {
  const parts = [];
  if (phone) parts.push(`<a href="tel:${esc(phone)}">โทร ${esc(fmtPhone(phone))}</a>`);
  for (const [k, def] of Object.entries(CONTACTS)) {
    const v = contacts[k];
    if (!v) continue;
    const url = def.url ? def.url(v) : null;
    parts.push(url ? `<a href="${esc(url)}" target="_blank" rel="noopener">${def.th}: ${esc(v)}</a>` : `<span>${def.th}: ${esc(v)}</span>`);
  }
  return parts.join('');
}
export const fmtPhone = (p) => String(p || '').replace(/^(\d{3})(\d{3})(\d{3,4})$/, '$1-$2-$3');

export function initial(name) {
  return esc([...String(name || '?').trim()][0] || '?');
}
// ไม่มีรูป → ใช้ภาพประกอบตามหมวดร้านแทนตัวอักษร
export function imgOrPh(src, name, cls, category = 'other') {
  return src ? `<img class="${cls}" src="${esc(src)}" alt="" loading="lazy">` : `<div class="${cls} ph-art" aria-hidden="true">${catIcon(category)}</div>`;
}

// ───── แผนที่ & ที่อยู่ของฉัน ─────
let leafletP;
export function ensureLeaflet() {
  if (window.L) return Promise.resolve();
  leafletP ??= new Promise((resolve, reject) => {
    const css = document.createElement('link');
    css.rel = 'stylesheet';
    css.href = 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.css';
    document.head.append(css);
    const s = document.createElement('script');
    s.src = 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.js';
    s.onload = resolve;
    s.onerror = () => reject(new Error('โหลดแผนที่ไม่ได้'));
    document.head.append(s);
  });
  return leafletP;
}

// หน้าต่างปักหมุดที่อยู่ของฉัน → บันทึกลงบัญชี ใช้คำนวณระยะ/ค่าส่งทุกร้าน
export async function pickMyLocation({ skippable = false, intro = '' } = {}) {
  const [{ PROVINCES, reverseGeocode, areaLabel }] = await Promise.all([import('/js/thai.js'), ensureLeaflet()]);
  const me = await getMe();
  const cur = me.user?.location;
  return new Promise((resolve) => {
    const d = modal({
      title: 'ที่อยู่สำหรับจัดส่ง',
      body: `
        <p class="muted" style="margin-top:0">${esc(intro || 'ปักหมุดที่อยู่ที่มักให้ร้านส่ง ระบบจะบอกระยะทางและค่าส่งของแต่ละร้านให้ทันที (แก้ภายหลังได้)')}</p>
        <div class="row between" style="margin-bottom:8px"><span class="field-label" style="margin:0">แตะบนแผนที่หรือลากหมุด</span><button type="button" class="btn sm dark" id="lmGps">ใช้ตำแหน่งปัจจุบัน</button></div>
        <div id="lmMap" class="map" style="height:300px"></div>
        <p class="field-hint" id="lmInfo">${cur ? '' : 'ยังไม่ได้ปักหมุด'}</p>
        <div class="grid-2" style="margin-top:10px">
          <label class="field"><span>จังหวัด</span><select id="lmProv"><option value="">เลือกจังหวัด</option>${PROVINCES.map((p) => `<option ${cur?.province === p ? 'selected' : ''}>${p}</option>`).join('')}</select></label>
          <label class="field"><span>อำเภอ / เขต</span><input type="text" id="lmDist" maxlength="60" value="${esc(cur?.district || '')}" placeholder="เช่น สายไหม"></label>
        </div>
        <label class="field" style="margin-top:10px"><span>ที่อยู่ / จุดสังเกต (ไม่บังคับ)</span><textarea id="lmAddr" maxlength="500" style="min-height:64px" placeholder="บ้านเลขที่ ซอย หมู่บ้าน">${esc(cur?.address || '')}</textarea></label>`,
      actions: `${skippable ? '<button class="btn ghost" data-close>ข้ามไปก่อน</button>' : '<button class="btn" data-close>ยกเลิก</button>'}<button class="btn primary" id="lmSave">บันทึกที่อยู่</button>`,
    });
    let pin = cur ? { lat: cur.lat, lng: cur.lng } : null;
    let saved = null;
    const map = L.map(d.querySelector('#lmMap')).setView(pin ? [pin.lat, pin.lng] : [13.7563, 100.5018], pin ? 15 : 11);
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '© OpenStreetMap' }).addTo(map);
    let marker;
    const setPin = async (lat, lng, fly) => {
      pin = { lat, lng };
      if (!marker) {
        marker = L.marker([lat, lng], { draggable: true }).addTo(map);
        marker.on('dragend', () => { const p = marker.getLatLng(); setPin(p.lat, p.lng); });
      } else marker.setLatLng([lat, lng]);
      if (fly) map.setView([lat, lng], 16);
      d.querySelector('#lmInfo').textContent = 'กำลังหาชื่อพื้นที่…';
      const g = await reverseGeocode(lat, lng);
      if (g) {
        if (g.province) d.querySelector('#lmProv').value = g.province;
        if (g.district) d.querySelector('#lmDist').value = g.district;
      }
      d.querySelector('#lmInfo').textContent = g ? `ปักที่ ${areaLabel(g.province, g.district) || 'ตำแหน่งนี้'}${g.hint ? ' · ' + g.hint : ''}` : 'ปักหมุดแล้ว (เลือกจังหวัด/อำเภอเองด้านล่าง)';
    };
    if (pin) setPin(pin.lat, pin.lng);
    map.on('click', (e) => setPin(e.latlng.lat, e.latlng.lng));
    setTimeout(() => map.invalidateSize(), 80);
    d.querySelector('#lmGps').onclick = () =>
      navigator.geolocation
        ? navigator.geolocation.getCurrentPosition((p) => setPin(p.coords.latitude, p.coords.longitude, true), () => toast('หาตำแหน่งไม่ได้ กรุณาแตะบนแผนที่', 'error'), { enableHighAccuracy: true, timeout: 10000 })
        : toast('อุปกรณ์นี้หาตำแหน่งไม่ได้', 'error');
    d.querySelector('#lmSave').onclick = (e) => {
      if (!pin) return toast('กรุณาปักหมุดบนแผนที่ก่อน', 'error');
      busy(e.currentTarget, async () => {
        const r = await api('/api/me/location', {
          method: 'PUT',
          body: { ...pin, province: d.querySelector('#lmProv').value, district: d.querySelector('#lmDist').value, address: d.querySelector('#lmAddr').value },
        });
        saved = r.user.location;
        getMe(true);
        toast('บันทึกที่อยู่แล้ว', 'ok');
        d.close();
      }).catch(toastErr);
    };
    d.addEventListener('close', () => resolve(saved));
  });
}

// เปิดห้องแชทกับร้าน / จากออเดอร์
export async function openChat(target) {
  const me = await getMe();
  if (!me.user) {
    location.href = '/login?next=' + encodeURIComponent(location.pathname + location.search);
    return;
  }
  try {
    const { id } = await api('/api/chat/open', { method: 'POST', body: target });
    location.href = '/chat?c=' + id;
  } catch (e) {
    toastErr(e);
  }
}

// เล่นแอนิเมชันซ้ำบน element (เช่น กดเพิ่มลงตะกร้า)
export function animate(el, cls = 'pop') {
  if (!el) return;
  el.classList.remove(cls);
  void el.offsetWidth;
  el.classList.add(cls);
}

// ค่อยๆ โผล่เมื่อเลื่อนมาถึง
export function revealOnScroll(root = document) {
  const els = [...root.querySelectorAll('.reveal:not(.in)')];
  if (!('IntersectionObserver' in window)) return els.forEach((e) => e.classList.add('in'));
  const io = new IntersectionObserver(
    (entries) => entries.forEach((en) => {
      if (en.isIntersecting) {
        en.target.classList.add('in');
        io.unobserve(en.target);
      }
    }),
    { rootMargin: '0px 0px -8% 0px' }
  );
  els.forEach((e) => io.observe(e));
}

// ค่าส่ง: อธิบายเป็นภาษาคน
// ส่งฟรีภายใน X กม. เกินจากนั้น ค่าเริ่มต้น + กม.ละ ... (ตรงกับ deliveryFee ฝั่งเซิร์ฟเวอร์)
export function feeRule(shop) {
  const per = shop.deliveryFeePerKm ? ` + ${baht(shop.deliveryFeePerKm)}/กม.` : '';
  return shop.freeDeliveryMaxKm > 0
    ? `ส่งฟรี ${shop.freeDeliveryMaxKm} กม.แรก · เกินจากนั้น ${baht(shop.deliveryFeeBase)}${per}`
    : `${baht(shop.deliveryFeeBase)}${per}`;
}
export function freeRule(shop) {
  return shop.freeDeliveryMaxKm > 0 ? `ส่งฟรีในระยะ ${shop.freeDeliveryMaxKm} กม. จากร้าน` : '';
}
export function feeAt(shop, km) {
  const freeKm = shop.freeDeliveryMaxKm || 0;
  if (km <= freeKm) return 0;
  const extra = Math.max(1, Math.ceil(Math.round((km - freeKm) * 10) / 10));
  return Math.round(shop.deliveryFeeBase + shop.deliveryFeePerKm * (extra - 1));
}

export function toast(msg, type = '') {
  let box = $('.toasts');
  if (!box) {
    box = document.createElement('div');
    box.className = 'toasts';
    box.setAttribute('role', 'status');
    document.body.append(box);
  }
  const t = document.createElement('div');
  t.className = 'toast ' + type;
  t.textContent = msg;
  box.append(t);
  setTimeout(() => t.remove(), type === 'error' ? 5000 : 3000);
}
export const toastErr = (e) => toast(e.message || String(e), 'error');

// ปุ่ม loading
export async function busy(btn, fn) {
  if (btn.disabled) return;
  const old = btn.innerHTML;
  btn.disabled = true;
  btn.innerHTML = 'กำลังทำงาน…';
  try {
    return await fn();
  } finally {
    btn.disabled = false;
    btn.innerHTML = old;
  }
}

// ย่อรูปก่อนอัปโหลด (ลดเน็ตและพื้นที่)
export function fileToDataUrl(file, maxSide = 1280) {
  return new Promise((resolve, reject) => {
    if (!file.type.startsWith('image/')) return reject(new Error('กรุณาเลือกไฟล์รูปภาพ'));
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      const scale = Math.min(1, maxSide / Math.max(img.width, img.height));
      const c = document.createElement('canvas');
      c.width = Math.round(img.width * scale);
      c.height = Math.round(img.height * scale);
      const ctx = c.getContext('2d');
      ctx.fillStyle = '#fff';
      ctx.fillRect(0, 0, c.width, c.height);
      ctx.drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(url);
      resolve(c.toDataURL('image/jpeg', 0.85));
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('เปิดรูปไม่ได้'));
    };
    img.src = url;
  });
}
export async function uploadImage(file, maxSide) {
  const data = await fileToDataUrl(file, maxSide);
  return (await api('/api/uploads', { method: 'POST', body: { data } })).url;
}

export function haversineKm(lat1, lng1, lat2, lng2) {
  const R = 6371;
  const r = (x) => (x * Math.PI) / 180;
  const a = Math.sin(r(lat2 - lat1) / 2) ** 2 + Math.cos(r(lat1)) * Math.cos(r(lat2)) * Math.sin(r(lng2 - lng1) / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}
export const mapsLink = (lat, lng) => `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`;

// ───── PromptPay QR (มาตรฐาน EMVCo / BOT) ─────
function crc16(s) {
  let crc = 0xffff;
  for (let i = 0; i < s.length; i++) {
    crc ^= s.charCodeAt(i) << 8;
    for (let j = 0; j < 8; j++) crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
  }
  return crc.toString(16).toUpperCase().padStart(4, '0');
}
export function promptpayPayload(id, amount) {
  const f = (tag, v) => tag + String(v.length).padStart(2, '0') + v;
  const t = String(id).replace(/\D/g, '');
  let acc;
  if (t.length === 15) acc = f('03', t);
  else if (t.length === 13) acc = f('02', t);
  else acc = f('01', ('0000000000000' + '66' + t.replace(/^0/, '')).slice(-13));
  let p = f('00', '01') + f('01', amount ? '12' : '11') + f('29', f('00', 'A000000677010111') + acc) + f('53', '764');
  if (amount) p += f('54', Number(amount).toFixed(2));
  p += f('58', 'TH') + '6304';
  return p + crc16(p);
}
export function qrImg(text, cell = 6) {
  // ต้องโหลด qrcode-generator ก่อน
  const qr = window.qrcode(0, 'M');
  qr.addData(text);
  qr.make();
  return qr.createImgTag(cell, 8);
}

// ───── modal helper ─────
export function modal({ title, body, actions = '' }) {
  const d = document.createElement('dialog');
  d.className = 'modal';
  d.innerHTML = `<div class="mh"><h2>${esc(title)}</h2><button class="btn ghost sm" data-close aria-label="ปิด">✕</button></div>
    <div class="mb">${body}</div>${actions ? `<div class="mf">${actions}</div>` : ''}`;
  document.body.append(d);
  d.addEventListener('click', (e) => {
    if (e.target === d || e.target.closest('[data-close]')) d.close();
  });
  d.addEventListener('close', () => d.remove());
  d.showModal();
  return d;
}
export function confirmBox(title, text, okLabel = 'ยืนยัน', danger = false) {
  return new Promise((resolve) => {
    const d = modal({
      title,
      body: `<p>${esc(text)}</p>`,
      actions: `<button class="btn" data-close>ไม่ใช่</button><button class="btn ${danger ? 'danger' : 'primary'}" data-ok>${esc(okLabel)}</button>`,
    });
    let ok = false;
    d.querySelector('[data-ok]').onclick = () => {
      ok = true;
      d.close();
    };
    d.addEventListener('close', () => resolve(ok));
  });
}
export function promptBox(title, label, { okLabel = 'ตกลง', danger = false, placeholder = '' } = {}) {
  return new Promise((resolve) => {
    const d = modal({
      title,
      body: `<label class="field"><span>${esc(label)}</span><textarea maxlength="200" placeholder="${esc(placeholder)}"></textarea></label>`,
      actions: `<button class="btn" data-close>ย้อนกลับ</button><button class="btn ${danger ? 'danger' : 'primary'}" data-ok>${esc(okLabel)}</button>`,
    });
    let val = null;
    d.querySelector('[data-ok]').onclick = () => {
      val = d.querySelector('textarea').value.trim();
      d.close();
    };
    d.addEventListener('close', () => resolve(val));
  });
}

// ───── session + header ─────
let mePromise;
export function getMe(force = false) {
  if (!mePromise || force) mePromise = api('/api/me').catch(() => ({ user: null, shop: null }));
  return mePromise;
}
export async function requireLogin() {
  const me = await getMe();
  if (!me.user) {
    location.href = '/login?next=' + encodeURIComponent(location.pathname + location.search);
    return new Promise(() => {});
  }
  return me;
}

export async function renderChrome(active = '') {
  const header = document.createElement('header');
  header.className = 'topbar';
  header.innerHTML = `<div class="wrap">
      <a class="logo" href="/" aria-label="Preshop หน้าแรก"><img src="/img/logo.webp" alt="Preshop" width="102" height="34"></a>
      <button class="nav-toggle" aria-label="เมนู" aria-expanded="false">เมนู</button>
      <nav class="nav" id="nav"></nav>
    </div>`;
  document.body.prepend(header);
  const footer = document.createElement('footer');
  footer.className = 'site';
  footer.innerHTML = `<div class="wrap row between">
      <span>Preshop — ระบบรับสั่งขนมและอาหารล่วงหน้า</span>
      <span class="row" style="gap:16px"><a href="#" data-install class="${isAppMode() ? 'hidden' : ''}" id="footInstall">ติดตั้งแอป</a><a href="/feedback">ส่งข้อเสนอแนะถึงเรา</a><a href="/account">บัญชีของฉัน</a></span>
    </div>`;
  document.body.append(footer);

  $('#footInstall', footer).onclick = (e) => {
    e.preventDefault();
    installApp();
  };
  const btn = $('.nav-toggle', header);
  btn.onclick = () => {
    const open = $('#nav').classList.toggle('open');
    btn.setAttribute('aria-expanded', open);
  };

  const me = await getMe();
  const shops = me.shops || [];
  const link = (href, label, key) => `<a href="${href}" class="${active === key ? 'active' : ''}">${label}</a>`;
  let html = link('/', 'ร้านทั้งหมด', 'home');
  if (me.user) {
    html += link('/orders', 'ออเดอร์ของฉัน', 'orders');
    html += link('/chat', `แชท<span class="badge-dot ${me.chatUnread ? '' : 'hidden'}" id="chatBadge">${me.chatUnread || ''}</span>`, 'chat');
  }

  // เมนูสำหรับร้านค้า แบบ dropdown
  const openHref = me.user ? '/account#open-shop' : '/login?next=/account%23open-shop';
  html += `<div class="dd" id="partnerDd">
      <button type="button" aria-expanded="false" class="${active === 'seller' ? 'active' : ''}">${shops.length ? 'ร้านของฉัน' : 'สำหรับร้านค้า'}<span class="badge-dot hidden" id="pendingBadge"></span> <span class="chev">▼</span></button>
      <div class="dd-menu">
        ${shops.map((s) => `<a href="/seller" data-shop="${s.id}"><b>${esc(s.name)}</b><small>${s.isOpen ? 'เปิดรับออเดอร์' : 'ปิดชั่วคราว'} · จัดการร้าน</small></a>`).join('')}
        ${shops.length ? '<hr>' : ''}
        <a href="${openHref}"><b>${shops.length ? '+ เปิดร้านใหม่' : 'เปิดร้านกับ Preshop'}</b><small>ฟรี เปิดได้หลายร้านในบัญชีเดียว</small></a>
        <a href="/#for-shops"><b>ร้านค้าใช้อะไรได้บ้าง</b><small>รับออเดอร์ล่วงหน้า สรุปของที่ต้องทำ ฯลฯ</small></a>
      </div>
    </div>`;
  if (me.user?.isAdmin) html += link('/admin', 'แอดมิน', 'admin');
  if (me.user) html += link('/account', esc(me.user.name || 'บัญชี'), 'account');
  else html += `<a class="btn primary sm" href="/login?next=${encodeURIComponent(location.pathname + location.search)}">เข้าสู่ระบบ</a>`;
  if (!isAppMode()) html += `<a href="#" class="btn sm dark ${installEvent ? '' : 'hidden'}" data-install id="navInstall">ติดตั้งแอป</a>`;
  $('#nav').innerHTML = html;
  $('#navInstall')?.addEventListener('click', (e) => {
    e.preventDefault();
    installApp();
  });

  // โหมดแอป: แถบเมนูด้านล่างแบบแอปมือถือ
  if (isAppMode()) {
    const tab = (href, key, label, icon, badge = '') =>
      `<a href="${href}" class="${active === key ? 'on' : ''}">${icon}<span>${label}</span>${badge}</a>`;
    const I = {
      home: '<svg viewBox="0 0 24 24"><path d="M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"/></svg>',
      orders: '<svg viewBox="0 0 24 24"><path d="M6 3h12a1 1 0 0 1 1 1v17l-3-2-2 2-2-2-2 2-2-2-3 2V4a1 1 0 0 1 1-1zm3 5h6M9 12h6"/></svg>',
      chat: '<svg viewBox="0 0 24 24"><path d="M4 5h16a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1h-9l-5 4v-4H4a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1z"/></svg>',
      shop: '<svg viewBox="0 0 24 24"><path d="M4 9l2-5h12l2 5M4 9v11h16V9M4 9h16M10 20v-6h4v6"/></svg>',
      me: '<svg viewBox="0 0 24 24"><circle cx="12" cy="8" r="4"/><path d="M4 21c1-4 4-6 8-6s7 2 8 6"/></svg>',
    };
    const nav = document.createElement('nav');
    nav.className = 'appnav';
    nav.setAttribute('aria-label', 'เมนูหลัก');
    nav.innerHTML =
      tab('/', 'home', 'หน้าแรก', I.home) +
      tab(me.user ? '/orders' : '/login?next=/orders', 'orders', 'ออเดอร์', I.orders) +
      tab(me.user ? '/chat' : '/login?next=/chat', 'chat', 'แชท', I.chat, `<i class="badge-dot ${me.chatUnread ? '' : 'hidden'}">${me.chatUnread || ''}</i>`) +
      (shops.length ? tab('/seller', 'seller', 'ร้านของฉัน', I.shop) : '') +
      tab(me.user ? '/account' : '/login', 'account', 'บัญชี', I.me);
    document.body.append(nav);
  }

  const dd = $('#partnerDd');
  const ddBtn = dd.querySelector('button');
  ddBtn.onclick = (e) => {
    e.stopPropagation();
    const open = dd.classList.toggle('open');
    ddBtn.setAttribute('aria-expanded', open);
  };
  document.addEventListener('click', (e) => {
    if (!dd.contains(e.target)) dd.classList.remove('open');
  });
  dd.addEventListener('click', (e) => {
    const a = e.target.closest('a[data-shop]');
    if (a) setCurrentShopId(a.dataset.shop);
  });

  // เช็กข้อความแชทใหม่ทุก 20 วินาที
  if (me.user && active !== 'chat') {
    setInterval(async () => {
      if (document.hidden) return;
      try {
        const { chatUnread } = await api('/api/me');
        const b = $('#chatBadge');
        if (b) {
          if (chatUnread > (Number(b.textContent) || 0)) animate(b, 'bump');
          b.textContent = chatUnread || '';
          b.classList.toggle('hidden', !chatUnread);
        }
      } catch {}
    }, 20000);
  }
  return me;
}
