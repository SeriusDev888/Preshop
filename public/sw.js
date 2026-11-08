// Service worker ของ Preshop
// - หน้าเว็บ: ดึงจากเน็ตก่อน (ข้อมูลสดเสมอ) ถ้าออฟไลน์ใช้ของที่เคยเปิด หรือหน้า offline
// - CSS/JS/ไอคอน/ฟอนต์: ใช้ของในเครื่องก่อนแล้วอัปเดตเบื้องหลัง (เปิดเร็ว)
// - /api/: ไม่เก็บเลย ออเดอร์/แชทต้องสดเสมอ
const VERSION = 'preshop-v1';
const SHELL = ['/offline.html', '/css/style.css', '/css/v2.css', '/css/v3.css', '/js/common.js', '/js/icons.js', '/js/thai.js', '/img/logo.webp', '/favicon.svg', '/icons/icon-192.png'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  // API และแผนที่: ไม่แตะ
  if (url.origin === location.origin && url.pathname.startsWith('/api/')) return;
  if (url.hostname.endsWith('openstreetmap.org')) return;

  // เปิดหน้าเว็บ
  if (req.mode === 'navigate') {
    e.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(VERSION).then((c) => c.put(req, copy));
          return res;
        })
        .catch(async () => (await caches.match(req)) || caches.match('/offline.html'))
    );
    return;
  }

  // ไฟล์ static ของเว็บ + ฟอนต์ + ไลบรารีจาก CDN
  const isStatic =
    (url.origin === location.origin && /^\/(css|js|img|icons|uploads)\/|^\/favicon\.svg$/.test(url.pathname)) ||
    /fonts\.(googleapis|gstatic)\.com$/.test(url.hostname) ||
    url.hostname === 'cdnjs.cloudflare.com';
  if (isStatic) {
    e.respondWith(
      caches.open(VERSION).then(async (c) => {
        const hit = await c.match(req);
        const fresh = fetch(req)
          .then((res) => {
            if (res.ok || res.type === 'opaque') c.put(req, res.clone());
            return res;
          })
          .catch(() => hit);
        return hit || fresh;
      })
    );
  }
});
