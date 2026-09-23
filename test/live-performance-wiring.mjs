import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const html = readFileSync(new URL('../public/index.html', import.meta.url), 'utf8');
const bootstrap = readFileSync(new URL('../public/ultra-bootstrap.js', import.meta.url), 'utf8');
const runtime = readFileSync(new URL('../public/live-performance-runtime.js', import.meta.url), 'utf8');
const core = readFileSync(new URL('../public/live-performance-core.js', import.meta.url), 'utf8');

test('one existing application loads performance enhancement after legacy runtime', () => {
  assert.equal((bootstrap.match(/importOnce\('\/live-performance-runtime\.js'\)/g) || []).length, 1);
  assert.equal((bootstrap.match(/importOnce\('\/obd-runtime\.js'\)/g) || []).length, 1);
  assert.ok(bootstrap.indexOf("await importOnce('/obd-runtime.js')") < bootstrap.indexOf("importOnce('/live-performance-runtime.js')"));
  assert.equal((html.match(/href="\/live-performance\.css"/g) || []).length, 1);
});

test('performance code reuses one BLE session and does not offer extra transmit or write controls', () => {
  assert.match(runtime, /const obd = window\.HannaAdaOBD/);
  assert.match(runtime, /controller\.stop\(\)/);
  assert.match(runtime, /originalDtc/);
  assert.doesNotMatch(runtime + core, /(?:\.writeValue|\.transferOut|\.controlTransferOut|\bfetch\s*\()/);
  assert.match(core, /queuedCommands: 0, writesEnabled: false/);
});


test('runtime coalesces view mutation work and does not query the runtime root on every visibility check', () => {
  assert.match(runtime, /let runtimeAttached = false/);
  assert.match(runtime, /function scheduleBind\(\)/);
  assert.match(runtime, /new MutationObserver\(scheduleBind\)/);
  assert.match(runtime, /isVisible: \(\) => !document\.hidden && runtimeAttached/);
  assert.doesNotMatch(runtime, /isVisible: \(\) => !document\.hidden && !!\$\('#haRuntime'\)/);
});


test('legacy interval polling is stopped when ultra runtime takes ownership', () => {
  assert.match(runtime, /typeof obd\.stopLive === 'function'/);
  assert.match(runtime, /obd\.stopLive\(\)/);
});


test('runtime cooperatively yields to pending user input where supported', () => {
  assert.match(runtime, /navigator\.scheduling\?\.isInputPending/);
  assert.match(runtime, /shouldYield: inputPending/);
  assert.match(core, /if \(shouldYield\(\)\)/);
  assert.match(core, /schedule\(100, owner\)/);
});
