import http from 'node:http';
import { readFile } from 'node:fs/promises';
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
  '.svg': 'image/svg+xml'
};

function sendError(res, status, error) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
  res.end(JSON.stringify({ error }));
}

async function sendFile(res, path) {
  try {
    const body = await readFile(path);
    res.writeHead(200, { 'Content-Type': contentTypes[extname(path)] || 'application/octet-stream', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
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
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
    res.end(JSON.stringify({ ok: true, service: 'hanna-ada-diagnostics', mode: 'safe-catalog' }));
    return;
  }

  if (url.pathname === '/api/tuning-products') {
    await sendFile(res, join(root, 'config', 'tuning-products.json'));
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
  await sendFile(res, file);
});

server.listen(port, '0.0.0.0', () => {
  console.log(`Hanna & Ada Diagnostics listening on ${port}`);
});
