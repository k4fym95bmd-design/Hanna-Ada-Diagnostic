import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const html = readFileSync(new URL('../public/index.html', import.meta.url), 'utf8');
const runtime = readFileSync(new URL('../public/live-performance-runtime.js', import.meta.url), 'utf8');
const core = readFileSync(new URL('../public/live-performance-core.js', import.meta.url), 'utf8');

test('one existing application loads performance enhancement after legacy runtime', () => {
  assert.equal((html.match(/src="\/live-performance-runtime\.js"/g) || []).length, 1);
  assert.equal((html.match(/src="\/obd-runtime\.js"/g) || []).length, 1);
  assert.ok(html.indexOf('/obd-runtime.js') < html.indexOf('/live-performance-runtime.js'));
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
