import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { ROOT, UPLOAD_DIR } from './src/db.js';
import { handleApi } from './src/api.js';
import { SMS_DEV } from './src/sms.js';

const PORT = Number(process.env.PORT) || 3000;
const PUBLIC_DIR = path.join(ROOT, 'public');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.webmanifest': 'application/manifest+json',
};

function serveFile(res, baseDir, relPath, cache) {
  const decoded = decodeURIComponent(relPath);
  const filePath = path.resolve(baseDir, '.' + path.posix.normalize('/' + decoded));
  if (!filePath.startsWith(baseDir + path.sep) && filePath !== baseDir) return false;
  let stat;
  try {
    stat = fs.statSync(filePath);
  } catch {
    return false;
  }
  if (!stat.isFile()) return false;
  const ext = path.extname(filePath).toLowerCase();
  res.writeHead(200, {
    'Content-Type': MIME[ext] || 'application/octet-stream',
    'Content-Length': stat.size,
    'Cache-Control': cache,
    'X-Content-Type-Options': 'nosniff',
  });
  fs.createReadStream(filePath).pipe(res);
  return true;
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  const p = url.pathname;

  try {
    // ให้ Render/Railway เช็กว่าเว็บยังทำงาน
    if (p === '/healthz') {
      res.writeHead(200, { 'Content-Type': 'text/plain' }).end('ok');
      return;
    }
    if (p.startsWith('/api/')) {
      await handleApi(req, res, url);
      return;
    }

    if (req.method !== 'GET' && req.method !== 'HEAD') {
      res.writeHead(405).end();
      return;
    }

    if (p.startsWith('/uploads/')) {
      if (serveFile(res, UPLOAD_DIR, p.slice('/uploads'.length), 'public, max-age=31536000, immutable')) return;
    } else {
      // URL สวย: /s/<slug> → shop.html, /o/<code> → order.html
      let rel = p;
      if (rel === '/') rel = '/index.html';
      else if (/^\/s\/[^/]+\/?$/.test(rel)) rel = '/shop.html';
      else if (/^\/o\/[^/]+\/?$/.test(rel)) rel = '/order.html';
      else if (!path.extname(rel)) rel = rel.replace(/\/$/, '') + '.html';
      if (serveFile(res, PUBLIC_DIR, rel, 'no-cache')) return;
    }

    res.writeHead(404, { 'Content-Type': 'text/html; charset=utf-8' });
    fs.createReadStream(path.join(PUBLIC_DIR, '404.html')).pipe(res);
  } catch (err) {
    console.error(err);
    if (!res.headersSent) res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Server error');
  }
});

server.listen(PORT, () => {
  console.log(`Preshop พร้อมใช้งานที่ http://localhost:${PORT}`);
  if (SMS_DEV) console.log('SMS อยู่ในโหมดทดสอบ: รหัส OTP จะแสดงบนหน้าเว็บและใน console นี้');
});
