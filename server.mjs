import http from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('.', import.meta.url));
const publicRoot = resolve(root, 'public');
const port = Number(process.env.PORT || 3000);
const contentTypes = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
};

function securityHeaders(extra = {}) {
  return {
    'X-Content-Type-Options': 'nosniff',
    'Cross-Origin-Resource-Policy': 'same-origin',
    ...extra,
  };
}

function sendError(res, status, error) {
  res.writeHead(status, securityHeaders({
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
  }));
  res.end(JSON.stringify({ error }));
}

function weakEtag(info) {
  return `W/"${info.size.toString(16)}-${Math.trunc(info.mtimeMs).toString(16)}"`;
}

async function sendFile(req, res, path, { cacheControl = 'public, max-age=60, must-revalidate' } = {}) {
  try {
    const info = await stat(path);
    if (!info.isFile()) {
      sendError(res, 404, 'not_found');
      return;
    }

    const etag = weakEtag(info);
    const headers = securityHeaders({
      'Content-Type': contentTypes[extname(path)] || 'application/octet-stream',
      'Content-Length': String(info.size),
      'Cache-Control': cacheControl,
      ETag: etag,
      'Last-Modified': info.mtime.toUTCString(),
    });

    if (req.headers['if-none-match'] === etag) {
      res.writeHead(304, securityHeaders({
        'Cache-Control': cacheControl,
        ETag: etag,
        'Last-Modified': info.mtime.toUTCString(),
      }));
      res.end();
      return;
    }

    if (req.method === 'HEAD') {
      res.writeHead(200, headers);
      res.end();
      return;
    }

    const body = await readFile(path);
    res.writeHead(200, headers);
    res.end(body);
  } catch {
    sendError(res, 404, 'not_found');
  }
}

const server = http.createServer(async (req, res) => {
  // The HTTP Host header is untrusted and must not be part of URL parsing.
  let url;
  try {
    url = new URL(req.url || '/', 'http://localhost');
  } catch {
    sendError(res, 400, 'invalid_url');
    return;
  }

  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.setHeader('Allow', 'GET, HEAD');
    sendError(res, 405, 'method_not_allowed');
    return;
  }

  if (url.pathname === '/health') {
    const body = JSON.stringify({ ok: true, service: 'hanna-ada-diagnostics', mode: 'safe-catalog' });
    res.writeHead(200, securityHeaders({
      'Content-Type': 'application/json; charset=utf-8',
      'Content-Length': String(Buffer.byteLength(body)),
      'Cache-Control': 'no-store',
    }));
    if (req.method === 'HEAD') res.end();
    else res.end(body);
    return;
  }

  if (url.pathname === '/api/tuning-products') {
    await sendFile(req, res, join(root, 'config', 'tuning-products.json'), { cacheControl: 'no-store' });
    return;
  }

  const requested = url.pathname === '/' ? 'index.html' : url.pathname.replace(/^\/+/, '');
  const file = resolve(publicRoot, requested);
  const childPath = relative(publicRoot, file);
  // A string prefix check would also accept a sibling named public-other.
  if (childPath === '..' || childPath.startsWith(`..${sep}`) || isAbsolute(childPath)) {
    sendError(res, 403, 'forbidden');
    return;
  }

  const cacheControl = requested === 'index.html'
    ? 'no-cache'
    : 'public, max-age=60, must-revalidate';
  await sendFile(req, res, file, { cacheControl });
});

server.listen(port, '0.0.0.0', () => {
  console.log(`Hanna & Ada Diagnostics listening on ${port}`);
});
