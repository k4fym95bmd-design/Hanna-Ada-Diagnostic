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
  assert.match(html, /app\.js/i);
  assert.match(html, /app\.css/i);

  const appRes = await fetch(`${base}/app.js`);
  assert.equal(appRes.status, 200);
  const app = await appRes.text();
  for (const moduleName of [
    'HOME','SCAN','CONTROL UNITS','DTC','LIVE DATA','ACTIVE TEST','SERVICE','ADAPTATIONS',
    'CODING STUDIO','BMW EXPERT','TUNING / MAP STORE','ADVANCED / EXPERT LAB','AI MECHANIC',
    'REPORTS / HISTORY','VCI / CONNECTION','WORKSHOP LIBRARY','WIRING LAB','FLASH / RECOVERY','REMOTE GARAGE'
  ]) assert.match(app, new RegExp(moduleName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'));
  assert.match(app, /3 Stages \+ M5 Character/i);
  assert.match(app, /M5 Character \/ Booster is a separate premium product/i);
  assert.match(app, /Write\/flash remains locked|Flash is intentionally blocked|WRITE SAFETY/i);
  assert.doesNotMatch(app, /Stage 4/i);

  const cssRes = await fetch(`${base}/app.css`);
  assert.equal(cssRes.status, 200);
  assert.match(await cssRes.text(), /--blue:#158cff/i);

  console.log('Smoke tests passed.');
} finally {
  child.kill('SIGTERM');
}
