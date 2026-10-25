'use strict';

/**
 * Jernih — server lokal tanpa dependensi.
 *
 * Menyajikan index.html dan menerima pendaftaran di POST /api/signup.
 * Data disimpan sebagai NDJSON (satu objek JSON per baris) di data/signups.ndjson.
 */

const http = require('node:http');
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');

const HOST = process.env.HOST || '127.0.0.1';
const PORT = Number(process.env.PORT) || 4173;
const ROOT = __dirname;
const DATA_DIR = path.join(ROOT, 'data');
const DATA_FILE = path.join(DATA_DIR, 'signups.ndjson');

const MAX_BODY_BYTES = 16 * 1024;
const RATE_WINDOW_MS = 10 * 60 * 1000;
const RATE_MAX = 8;
const ALLOWED_PLANS = new Set(['trial', 'free', 'pro']);
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

fs.mkdirSync(DATA_DIR, { recursive: true, mode: 0o700 });

/* ---------------------------------------------------------------
   Rate limit sederhana per alamat IP (in-memory, cukup untuk lokal)
   --------------------------------------------------------------- */

const buckets = new Map();

function takeRateLimit(ip) {
  const now = Date.now();
  let hits = buckets.get(ip);

  if (!hits) {
    hits = [];
    buckets.set(ip, hits);
  }

  while (hits.length > 0 && now - hits[0] > RATE_WINDOW_MS) {
    hits.shift();
  }

  if (hits.length >= RATE_MAX) {
    return {
      allowed: false,
      retryAfter: Math.max(1, Math.ceil((RATE_WINDOW_MS - (now - hits[0])) / 1000))
    };
  }

  hits.push(now);
  return { allowed: true, retryAfter: 0 };
}

const cleanupTimer = setInterval(() => {
  const now = Date.now();
  for (const [ip, hits] of buckets) {
    while (hits.length > 0 && now - hits[0] > RATE_WINDOW_MS) hits.shift();
    if (hits.length === 0) buckets.delete(ip);
  }
}, 60 * 1000);
cleanupTimer.unref();

/* ---------------------------------------------------------------
   Utilitas HTTP
   --------------------------------------------------------------- */

function isAllowedOrigin(origin) {
  if (!origin) return true;
  if (origin === 'null') return true; // halaman dibuka lewat file://

  try {
    const url = new URL(origin);
    if (url.protocol !== 'http:') return false;
    return url.hostname === 'localhost' ||
      url.hostname === '127.0.0.1' ||
      url.hostname === '[::1]';
  } catch {
    return false;
  }
}

function applyCors(req, res) {
  const origin = req.headers.origin;
  if (!origin) return true;
  if (!isAllowedOrigin(origin)) return false;

  res.setHeader('Access-Control-Allow-Origin', origin);
  res.setHeader('Vary', 'Origin');
  return true;
}

function sendJson(res, status, payload, extraHeaders) {
  const body = JSON.stringify(payload);
  res.writeHead(status, Object.assign({
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff'
  }, extraHeaders));
  res.end(body);
}

function httpError(status, message) {
  const error = new Error(message);
  error.status = status;
  return error;
}

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    let tooLarge = false;

    req.on('data', (chunk) => {
      if (tooLarge) return;
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        tooLarge = true;
        return;
      }
      chunks.push(chunk);
    });

    req.on('end', () => {
      if (tooLarge) {
        reject(httpError(413, 'Data yang dikirim terlalu besar.'));
        return;
      }

      const raw = Buffer.concat(chunks).toString('utf8').trim();
      if (!raw) {
        reject(httpError(400, 'Data pendaftaran tidak ditemukan.'));
        return;
      }

      try {
        const parsed = JSON.parse(raw);
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
          reject(httpError(400, 'Format data pendaftaran tidak valid.'));
          return;
        }
        resolve(parsed);
      } catch {
        reject(httpError(400, 'Format data pendaftaran tidak valid.'));
      }
    });

    req.on('error', () => reject(httpError(400, 'Koneksi terputus saat mengirim data.')));
  });
}

function text(value, maxLength) {
  return typeof value === 'string' ? value.trim().slice(0, maxLength) : '';
}

function clientIp(req) {
  const address = req.socket.remoteAddress || '';
  return address.startsWith('::ffff:') ? address.slice(7) : address;
}

/* ---------------------------------------------------------------
   POST /api/signup
   --------------------------------------------------------------- */

async function handleSignup(req, res) {
  if (!applyCors(req, res)) {
    sendJson(res, 403, { ok: false, error: 'Origin tidak diizinkan.' });
    return;
  }

  const contentType = String(req.headers['content-type'] || '').toLowerCase();
  if (!contentType.startsWith('application/json')) {
    sendJson(res, 415, { ok: false, error: 'Gunakan Content-Type: application/json.' });
    return;
  }

  let body;
  try {
    body = await readJsonBody(req);
  } catch (error) {
    const status = error.status || 400;
    sendJson(res, status, { ok: false, error: error.message || 'Permintaan tidak valid.' });
    return;
  }

  // Honeypot: bot yang mengisi field tersembunyi mendapat respons sukses palsu.
  if (text(body._gotcha, 200) !== '') {
    sendJson(res, 200, { ok: true });
    return;
  }

  const name = text(body.name, 81);
  const email = text(body.email, 255);
  const team = text(body.team, 61);
  const plan = ALLOWED_PLANS.has(body.plan) ? body.plan : 'trial';

  if (name.length < 2 || name.length > 80) {
    sendJson(res, 400, {
      ok: false,
      field: 'name',
      error: 'Nama harus terdiri dari 2–80 karakter.'
    });
    return;
  }

  if (email.length > 254 || !EMAIL_RE.test(email)) {
    sendJson(res, 400, {
      ok: false,
      field: 'email',
      error: 'Masukkan alamat email yang valid.'
    });
    return;
  }

  if (team.length > 60) {
    sendJson(res, 400, {
      ok: false,
      field: 'team',
      error: 'Nama tim maksimal 60 karakter.'
    });
    return;
  }

  const limit = takeRateLimit(clientIp(req));
  if (!limit.allowed) {
    sendJson(res, 429, {
      ok: false,
      error: 'Terlalu banyak percobaan. Tunggu beberapa menit lalu coba lagi.'
    }, { 'Retry-After': String(limit.retryAfter) });
    return;
  }

  const record = {
    id: crypto.randomUUID(),
    receivedAt: new Date().toISOString(),
    name,
    email,
    team: team || null,
    plan,
    source: 'jernih-landing',
    userAgent: text(req.headers['user-agent'], 300)
  };

  try {
    await fsp.appendFile(DATA_FILE, JSON.stringify(record) + '\n', { encoding: 'utf8', mode: 0o600 });
  } catch (error) {
    console.error('Gagal menyimpan pendaftaran:', error.message);
    sendJson(res, 500, {
      ok: false,
      error: 'Pendaftaran belum dapat disimpan. Coba lagi sebentar lagi.'
    });
    return;
  }

  console.log(`[signup] ${record.receivedAt} · ${record.email} · ${record.plan}`);
  sendJson(res, 201, { ok: true, id: record.id });
}

/* ---------------------------------------------------------------
   Halaman statis
   --------------------------------------------------------------- */

const HTML_HEADERS = {
  'Content-Type': 'text/html; charset=utf-8',
  'Cache-Control': 'no-store',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'X-Frame-Options': 'DENY',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
  'Content-Security-Policy': [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline'",
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' https://fonts.gstatic.com",
    "img-src 'self' data:",
    "connect-src 'self' http://127.0.0.1:* http://localhost:* https://formspree.io",
    "form-action 'self' https://formspree.io",
    "base-uri 'self'",
    "object-src 'none'",
    "frame-ancestors 'none'"
  ].join('; ')
};

async function serveIndex(req, res) {
  try {
    const html = await fsp.readFile(path.join(ROOT, 'index.html'));
    const headers = Object.assign({}, HTML_HEADERS, {
      'Content-Length': html.length
    });
    res.writeHead(200, headers);
    res.end(req.method === 'HEAD' ? undefined : html);
  } catch (error) {
    console.error('Gagal membaca index.html:', error.message);
    sendJson(res, 500, { ok: false, error: 'index.html tidak dapat dibaca.' });
  }
}

/* ---------------------------------------------------------------
   Router
   --------------------------------------------------------------- */

async function handleRequest(req, res) {
  const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);

  if (req.method === 'OPTIONS') {
    if (!applyCors(req, res)) {
      sendJson(res, 403, { ok: false, error: 'Origin tidak diizinkan.' });
      return;
    }
    res.writeHead(204, {
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Accept',
      'Access-Control-Max-Age': '600',
      'Access-Control-Allow-Private-Network': 'true',
      'Vary': 'Origin, Access-Control-Request-Headers',
      'Content-Length': '0'
    });
    res.end();
    return;
  }

  if (url.pathname === '/api/signup') {
    if (req.method !== 'POST') {
      sendJson(res, 405, { ok: false, error: 'Metode tidak diizinkan.' }, { Allow: 'POST, OPTIONS' });
      return;
    }
    await handleSignup(req, res);
    return;
  }

  if (url.pathname === '/api/health') {
    sendJson(res, 200, { ok: true, service: 'jernih-signup' });
    return;
  }

  if (url.pathname === '/' || url.pathname === '/index.html') {
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      sendJson(res, 405, { ok: false, error: 'Metode tidak diizinkan.' }, { Allow: 'GET, HEAD' });
      return;
    }
    await serveIndex(req, res);
    return;
  }

  if (url.pathname === '/favicon.ico') {
    res.writeHead(204);
    res.end();
    return;
  }

  sendJson(res, 404, { ok: false, error: 'Halaman tidak ditemukan.' });
}

const server = http.createServer((req, res) => {
  handleRequest(req, res).catch((error) => {
    console.error('Kesalahan tak terduga:', error);
    if (!res.headersSent) {
      sendJson(res, 500, { ok: false, error: 'Terjadi kesalahan di server.' });
    } else {
      res.end();
    }
  });
});

server.on('error', (error) => {
  if (error.code === 'EADDRINUSE') {
    console.error(`\nPort ${PORT} sudah dipakai. Hentikan proses lain atau jalankan dengan PORT lain:`);
    console.error(`  set PORT=4174 && node server.js\n`);
    process.exit(1);
  }
  console.error('Server gagal berjalan:', error);
  process.exit(1);
});

server.listen(PORT, HOST, () => {
  console.log('');
  console.log('  Jernih berjalan di http://' + HOST + ':' + PORT);
  console.log('  Data pendaftaran: data\\signups.ndjson');
  console.log('  Tekan Ctrl+C untuk berhenti.');
  console.log('');
});

function shutdown() {
  console.log('\nMenghentikan server...');
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 1500).unref();
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
