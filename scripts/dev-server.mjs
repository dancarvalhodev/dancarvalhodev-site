#!/usr/bin/env node
/**
 * Dev server: static files + save API → data/content.json
 * Usage: npm run dev   (then open http://127.0.0.1:8080/admin/)
 */
import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const CONTENT_PATH = path.join(ROOT, 'data', 'content.json');
const PORT = parseInt(process.argv[2] || '8080', 10);
const HOST = process.env.HOST || '0.0.0.0';

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.xml': 'application/xml',
  '.ico': 'image/x-icon',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.woff2': 'font/woff2',
};

function cors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, PUT, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

function sendJson(res, status, body) {
  cors(res);
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(body));
}

function pathname(req) {
  return new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`).pathname;
}

function safePath(urlPath) {
  const decoded = decodeURIComponent(urlPath.split('?')[0]);
  const rel = decoded === '/' ? '/index.html' : decoded;
  const resolved = path.normalize(path.join(ROOT, rel));
  if (!resolved.startsWith(ROOT)) return null;
  return resolved;
}

function writeContentJson(body) {
  const parsed = JSON.parse(body);
  fs.writeFileSync(CONTENT_PATH, JSON.stringify(parsed, null, 2) + '\n', 'utf8');
  return parsed;
}

const SAVE_PATHS = new Set(['/api/content', '/data/content.json']);

const server = http.createServer((req, res) => {
  const p = pathname(req);

  if (req.method === 'OPTIONS') {
    cors(res);
    res.writeHead(204);
    res.end();
    return;
  }

  if (req.method === 'GET' && p === '/api/health') {
    sendJson(res, 200, { ok: true, canSave: true, contentPath: 'data/content.json' });
    return;
  }

  if (req.method === 'PUT' && SAVE_PATHS.has(p)) {
    let body = '';
    req.on('data', (chunk) => { body += chunk; });
    req.on('end', () => {
      try {
        writeContentJson(body);
        sendJson(res, 200, { ok: true, path: 'data/content.json' });
        console.log('[save] data/content.json updated');
      } catch (e) {
        sendJson(res, 400, { error: e.message });
      }
    });
    return;
  }

  const filePath = safePath(req.url || '/');
  if (!filePath || !fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
    const notFound = path.join(ROOT, '404.html');
    if (fs.existsSync(notFound)) {
      cors(res);
      res.writeHead(404, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(fs.readFileSync(notFound));
    } else {
      res.writeHead(404);
      res.end('Not found');
    }
    return;
  }

  const ext = path.extname(filePath);
  cors(res);
  res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
  res.end(fs.readFileSync(filePath));
});

server.listen(PORT, HOST, () => {
  console.log(`bydan dev server → http://127.0.0.1:${PORT}`);
  console.log(`Admin           → http://127.0.0.1:${PORT}/admin/`);
  console.log(`Save API        → PUT /api/content → ${CONTENT_PATH}`);
});
