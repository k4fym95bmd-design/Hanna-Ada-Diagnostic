import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';

const port = 31337;
const base = `http://127.0.0.1:${port}`;
const child = spawn(process.execPath, ['server.mjs'], {
  env: { ...process.env, PORT: String(port) },
  stdio: ['ignore', 'pipe', 'pipe']
});

let stderr = '';
child.stderr.on('data', chunk => { stderr += chunk.toString(); });

async function waitForServer(timeoutMs = 5000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    try {
      const res = await fetch(`${base}/health`);
      if (res.ok) return;
    } catch {}
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  throw new Error(`server did not become ready: ${stderr}`);
}

try {
  await waitForServer();

  const healthRes = await fetch(`${base}/health`);
  assert.equal(healthRes.status, 200);
  const health = await healthRes.json();
  assert.equal(health.ok, true);
  assert.equal(health.service, 'hanna-ada-diagnostics');

  const catalogRes = await fetch(`${base}/api/tuning-products`);
  assert.equal(catalogRes.status, 200);
  const catalog = await catalogRes.json();
  assert.equal(catalog.products.length, 4);

  const numberedStages = catalog.products.filter(p => p.kind === 'stage');
  assert.deepEqual(numberedStages.map(p => p.stage), [1, 2, 3]);

  const m5 = catalog.products.find(p => p.kind === 'premium_character');
  assert.ok(m5, 'M5 Character / Booster product is required');
  assert.equal(m5.stage ?? null, null, 'M5 product must not be Stage 4');
  assert.equal(m5.price, 179);

  const homeRes = await fetch(`${base}/`);
  assert.equal(homeRes.status, 200);
  const html = await homeRes.text();
  assert.match(html, /Hanna\s*&\s*Ada/i);
  assert.match(html, /3 Stages \+ M5 Character/i);
  assert.match(html, /M5 Character \/ Booster is a separate premium product/i);

  console.log('Smoke tests passed.');
} finally {
  child.kill('SIGTERM');
}
