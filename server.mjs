import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('.', import.meta.url));
const port = Number(process.env.PORT || 3000);
const contentTypes = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml'
};

async function sendFile(res, path) {
  try {
    const body = await readFile(path);
    res.writeHead(200, { 'Content-Type': contentTypes[extname(path)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    res.end(body);
  } catch {
    res.writeHead(404, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ error: 'not_found' }));
  }
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);

  if (url.pathname === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ ok: true, service: 'hanna-ada-diagnostics', mode: 'safe-catalog' }));
    return;
  }

  if (url.pathname === '/api/tuning-products') {
    await sendFile(res, join(root, 'config', 'tuning-products.json'));
    return;
  }

  const relative = url.pathname === '/' ? 'index.html' : url.pathname.replace(/^\/+/, '');
  const safe = normalize(relative).replace(/^(\.\.(\/|\\|$))+/, '');
  const file = join(root, 'public', safe);
  if (!file.startsWith(join(root, 'public'))) {
    res.writeHead(403).end();
    return;
  }
  await sendFile(res, file);
});

server.listen(port, '0.0.0.0', () => {
  console.log(`Hanna & Ada Diagnostics listening on ${port}`);
});
