import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { request } from 'node:http';
import { brotliDecompressSync, gunzipSync } from 'node:zlib';

const port = 32000 + Math.floor(Math.random() * 10000);
const base = `http://127.0.0.1:${port}`;

async function waitForServer(child) {
  const started = Date.now();
  while (Date.now() - started < 5000) {
    if (child.exitCode !== null) throw new Error(`server exited: ${child.exitCode}`);
    try {
      const response = await fetch(`${base}/health`);
      if (response.status === 200) return;
    } catch { /* Wait until listener is ready. */ }
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  throw new Error('server did not become ready');
}

function rawRequest(path, method = 'GET', headers = {}) {
  return new Promise((resolve, reject) => {
    const req = request({ hostname: '127.0.0.1', port, path, method, headers }, response => {
      let body = '';
      response.setEncoding('utf8');
      response.on('data', chunk => { body += chunk; });
      response.on('end', () => resolve({ status: response.statusCode, headers: response.headers, body }));
      response.on('error', reject);
    });
    req.on('error', reject);
    req.end();
  });
}

function rawBufferRequest(path, method = 'GET', headers = {}) {
  return new Promise((resolve, reject) => {
    const req = request({ hostname: '127.0.0.1', port, path, method, headers }, response => {
      const chunks = [];
      response.on('data', chunk => { chunks.push(Buffer.from(chunk)); });
      response.on('end', () => resolve({
        status: response.statusCode,
        headers: response.headers,
        body: Buffer.concat(chunks),
      }));
      response.on('error', reject);
    });
    req.on('error', reject);
    req.end();
  });
}

test('read-only server confines static files and ignores untrusted Host header', async t => {
  const child = spawn(process.execPath, ['server.mjs'], {
    env: { ...process.env, PORT: String(port) },
    stdio: 'ignore',
  });
  t.after(() => child.kill('SIGTERM'));
  await waitForServer(child);

  const hostileHost = await rawRequest('/health', 'GET', { Host: 'invalid host with spaces' });
  assert.equal(hostileHost.status, 200);
  assert.equal(JSON.parse(hostileHost.body).ok, true);
  assert.equal(hostileHost.headers['x-content-type-options'], 'nosniff');

  const post = await rawRequest('/health', 'POST');
  assert.equal(post.status, 405);
  assert.equal(post.headers.allow, 'GET, HEAD');
  assert.equal(JSON.parse(post.body).error, 'method_not_allowed');

  const privateFile = await rawRequest('/server.mjs');
  assert.equal(privateFile.status, 404, 'repository files must not be served from outside public/');

  const staticFile = await rawRequest('/app.js');
  assert.equal(staticFile.status, 200);
  assert.match(staticFile.body, /Hanna & Ada ready/);

  const head = await rawRequest('/app.js', 'HEAD');
  assert.equal(head.status, 200);
  assert.equal(head.body, '');

  const catalog = await rawRequest('/api/tuning-products');
  assert.equal(catalog.status, 200);
  assert.ok(Array.isArray(JSON.parse(catalog.body).products));
});


test('static assets use conditional caching without stale HTML', async t => {
  const child = spawn(process.execPath, ['server.mjs'], {
    env: { ...process.env, PORT: String(port) },
    stdio: 'ignore',
  });
  t.after(() => child.kill('SIGTERM'));
  await waitForServer(child);

  const first = await rawRequest('/app.js');
  assert.equal(first.status, 200);
  assert.match(first.headers['cache-control'] || '', /max-age=60/);
  assert.match(first.headers.etag || '', /^W\//);

  const conditional = await rawRequest('/app.js', 'GET', { 'If-None-Match': first.headers.etag });
  assert.equal(conditional.status, 304);
  assert.equal(conditional.body, '');

  const html = await rawRequest('/');
  assert.equal(html.status, 200);
  assert.equal(html.headers['cache-control'], 'no-cache');

  const healthHead = await rawRequest('/health', 'HEAD');
  assert.equal(healthHead.status, 200);
  assert.equal(healthHead.body, '');
  assert.equal(healthHead.headers['cache-control'], 'no-store');
});

test('HEAD static response returns metadata only', async t => {
  const child = spawn(process.execPath, ['server.mjs'], {
    env: { ...process.env, PORT: String(port) },
    stdio: 'ignore',
  });
  t.after(() => child.kill('SIGTERM'));
  await waitForServer(child);

  const get = await rawRequest('/app.js');
  const head = await rawRequest('/app.js', 'HEAD');
  assert.equal(head.status, 200);
  assert.equal(head.body, '');
  assert.equal(head.headers['content-length'], String(Buffer.byteLength(get.body)));
  assert.equal(head.headers.etag, get.headers.etag);
});


test('compresses large text assets with negotiated Brotli or gzip', async t => {
  const child = spawn(process.execPath, ['server.mjs'], {
    env: { ...process.env, PORT: String(port) },
    stdio: 'ignore',
  });
  t.after(() => child.kill('SIGTERM'));
  await waitForServer(child);

  const plain = await rawBufferRequest('/app.js');
  const br = await rawBufferRequest('/app.js', 'GET', { 'Accept-Encoding': 'br, gzip' });
  assert.equal(br.status, 200);
  assert.equal(br.headers['content-encoding'], 'br');
  assert.match(br.headers.vary || '', /Accept-Encoding/i);
  assert.ok(br.body.length < plain.body.length);
  assert.match(brotliDecompressSync(br.body).toString('utf8'), /Hanna & Ada ready/);

  const gz = await rawBufferRequest('/app.js', 'GET', { 'Accept-Encoding': 'gzip' });
  assert.equal(gz.headers['content-encoding'], 'gzip');
  assert.match(gunzipSync(gz.body).toString('utf8'), /Hanna & Ada ready/);

  const head = await rawBufferRequest('/app.js', 'HEAD', { 'Accept-Encoding': 'br' });
  assert.equal(head.status, 200);
  assert.equal(head.headers['content-encoding'], 'br');
  assert.equal(head.body.length, 0);
});
