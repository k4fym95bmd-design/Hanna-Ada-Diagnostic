import http from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { brotliCompress, constants as zlibConstants, gzip } from 'node:zlib';

const root = fileURLToPath(new URL('.', import.meta.url));
const publicRoot = resolve(root, 'public');
const port = Number(process.env.PORT || 3000);
const brotliAsync = promisify(brotliCompress);
const gzipAsync = promisify(gzip);
const BODY_CACHE_LIMIT = 32;
const COMPRESSION_CACHE_LIMIT = 64;
const bodyCache = new Map();
const compressionCache = new Map();
const compressibleExtensions = new Set(['.html','.js','.css','.json','.svg','.webmanifest']);
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

function remember(map, key, value, limit) {
  if (map.has(key)) map.delete(key);
  map.set(key, value);
  while (map.size > limit) map.delete(map.keys().next().value);
  return value;
}

function quality(header, encoding) {
  for (const part of String(header || '').toLowerCase().split(',')) {
    const [name, ...params] = part.trim().split(';');
    if (name !== encoding && name !== '*') continue;
    const q = params
      .map(item => item.trim())
      .find(item => item.startsWith('q='));
    if (!q) return 1;
    const value = Number(q.slice(2));
    return Number.isFinite(value) ? value : 0;
  }
  return 0;
}

function selectEncoding(req, extension, size) {
  if (size < 1024 || !compressibleExtensions.has(extension)) return null;
  const header = req.headers['accept-encoding'];
  const br = quality(header, 'br');
  const gz = quality(header, 'gzip');
  if (br <= 0 && gz <= 0) return null;
  return br >= gz ? 'br' : 'gzip';
}

async function cachedBody(path, etag) {
  const cached = bodyCache.get(path);
  if (cached?.etag === etag) {
    bodyCache.delete(path);
    bodyCache.set(path, cached);
    return cached.body;
  }
  const body = await readFile(path);
  return remember(bodyCache, path, { etag, body }, BODY_CACHE_LIMIT).body;
}

async function encodedBody(path, etag, encoding, body) {
  if (!encoding) return body;
  const key = `${path}|${etag}|${encoding}`;
  const cached = compressionCache.get(key);
  if (cached) {
    compressionCache.delete(key);
    compressionCache.set(key, cached);
    return cached;
  }
  const compressed = encoding === 'br'
    ? await brotliAsync(body, {
        params: {
          [zlibConstants.BROTLI_PARAM_QUALITY]: 4,
          [zlibConstants.BROTLI_PARAM_SIZE_HINT]: body.length,
        },
      })
    : await gzipAsync(body, { level: 6 });
  return remember(compressionCache, key, compressed, COMPRESSION_CACHE_LIMIT);
}

async function sendFile(req, res, path, { cacheControl = 'public, max-age=60, must-revalidate' } = {}) {
  try {
    const info = await stat(path);
    if (!info.isFile()) {
      sendError(res, 404, 'not_found');
      return;
    }

    const extension = extname(path);
    const etag = weakEtag(info);
    const vary = compressibleExtensions.has(extension) ? 'Accept-Encoding' : undefined;
    const baseHeaders = securityHeaders({
      'Content-Type': contentTypes[extension] || 'application/octet-stream',
      'Cache-Control': cacheControl,
      ETag: etag,
      'Last-Modified': info.mtime.toUTCString(),
      ...(vary ? { Vary: vary } : {}),
    });

    if (req.headers['if-none-match'] === etag) {
      res.writeHead(304, baseHeaders);
      res.end();
      return;
    }

    const body = await cachedBody(path, etag);
    const requestedEncoding = selectEncoding(req, extension, body.length);
    const compressed = await encodedBody(path, etag, requestedEncoding, body);
    const encoding = requestedEncoding && compressed.length + 32 < body.length ? requestedEncoding : null;
    const output = encoding ? compressed : body;
    const headers = {
      ...baseHeaders,
      'Content-Length': String(output.length),
      ...(encoding ? { 'Content-Encoding': encoding } : {}),
    };

    res.writeHead(200, headers);
    if (req.method === 'HEAD') res.end();
    else res.end(output);
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
