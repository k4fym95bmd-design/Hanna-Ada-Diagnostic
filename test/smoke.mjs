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
  const coreStages = catalog.products.filter(p => p.kind === 'stage');
  assert.deepEqual(coreStages.map(p => p.stage), [1, 2, 3]);

  const m5 = catalog.products.find(p => p.kind === 'premium_character');
  assert.ok(m5, 'M5 Character / Booster product is required');
  assert.equal(m5.stage ?? null, null, 'M5 product must remain separate from numbered stages');
  assert.equal(m5.price, 179);

  assert.ok(Array.isArray(catalog.advancedStages), 'advancedStages catalog is required');
  assert.deepEqual(catalog.advancedStages.map(p => p.stage), [4, 5, 6, 7]);
  assert.equal(catalog.advancedStages.every(p => p.availability === 'CUSTOM_ONLY'), true);
  assert.equal(catalog.advancedStages.every(p => p.price === null), true);
  assert.deepEqual(catalog.stagePolicy.advancedCustomStages, [4, 5, 6, 7]);
  assert.equal(catalog.stagePolicy.m5CharacterIsSeparate, true);

  const homeRes = await fetch(`${base}/`);
  assert.equal(homeRes.status, 200);
  const html = await homeRes.text();
  assert.match(html, /Hanna\s*&\s*Ada/i);
  assert.match(html, /app\.js/i);
  assert.match(html, /tuning-stage-extension\.js/i);
  assert.match(html, /app\.css/i);

  const appRes = await fetch(`${base}/app.js`);
  assert.equal(appRes.status, 200);
  const app = await appRes.text();
  for (const moduleName of [
    'HOME','SCAN','CONTROL UNITS','DTC','LIVE DATA','ACTIVE TEST','SERVICE','ADAPTATIONS',
    'CODING STUDIO','BMW EXPERT','TUNING / MAP STORE','ADVANCED / EXPERT LAB','AI MECHANIC',
    'REPORTS / HISTORY','VCI / CONNECTION','WORKSHOP LIBRARY','WIRING LAB','FLASH / RECOVERY','REMOTE GARAGE'
  ]) assert.match(app, new RegExp(moduleName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'));
  assert.match(app, /M5 Character \/ Booster is a separate premium product/i);
  assert.match(app, /Write\/flash remains locked|Flash is intentionally blocked|WRITE SAFETY/i);

  const extensionRes = await fetch(`${base}/tuning-stage-extension.js`);
  assert.equal(extensionRes.status, 200);
  const extension = await extensionRes.text();
  assert.match(extension, /Stages 1–7 \+ M5 Character/i);
  assert.match(extension, /data-advanced-stage/i);
  assert.match(extension, /Stage 4 — Custom Performance/i);
  assert.match(extension, /Stage 5 — Race \/ Track\+/i);
  assert.match(extension, /Stage 6 — Motorsport \/ FI\+/i);
  assert.match(extension, /Stage 7 — Bespoke Engineering/i);

  const cssRes = await fetch(`${base}/app.css`);
  assert.equal(cssRes.status, 200);
  assert.match(await cssRes.text(), /--blue:#158cff/i);

  console.log('Smoke tests passed.');
} finally {
  child.kill('SIGTERM');
}
