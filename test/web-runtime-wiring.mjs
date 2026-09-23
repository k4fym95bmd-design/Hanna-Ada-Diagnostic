import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';

const source = async path => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('browser loads read-only terminal gate and verified DTC extension', async () => {
  const html = await source('public/index.html');
  assert.match(html, /src="\/terminal-readonly-guard\.js"/);
  assert.match(html, /src="\/diagnostic-core-v2\.js"/);
  const extension = await source('public/diagnostic-core-v2.js');
  assert.match(extension, /import\s*\{[^}]*decodeStoredDTCs[^}]*\}\s*from\s*['"]\.\/diagnostic-core\.js['"]/);
  assert.match(extension, /decodeStoredDTCs\(raw, protocol\)/);
  assert.doesNotMatch(extension, /h\.parseDtc\(/);
  assert.match(extension, /Niezweryfikowany odczyt DTC/);
});

test('browser terminal only exposes the read-only allowlist', async () => {
  const guard = await source('public/terminal-readonly-guard.js');
  assert.match(guard, /isReadOnlyELMCommand\(command\)/);
  assert.match(guard, /stopImmediatePropagation/);
});


test('OBD console and counters batch DOM work instead of repainting per BLE fragment', async () => {
  const runtime = await source('public/obd-runtime.js');
  assert.match(runtime, /scheduleUi=fn=>typeof requestAnimationFrame/);
  assert.match(runtime, /createDocumentFragment\(\)/);
  assert.match(runtime, /logQueue\.length>96/);
  assert.match(runtime, /while\(box\.children\.length>160\)/);
  assert.match(runtime, /if\(statsFrame!==null\)return/);
  assert.match(runtime, /HA_DEBUG_OBD===true/);
  assert.doesNotMatch(runtime, /console\.log\('\[H&A OBD\]',kind,msg\)\}/);
  assert.match(runtime, /stopLive,parseDtc/);
});


test('OBD injection observes only view replacement and caches live value nodes', async () => {
  const runtime = await source('public/obd-runtime.js');
  assert.match(runtime, /const valueNodeCache=new Map\(\)/);
  assert.match(runtime, /e=valueNodeCache\.get\(key\)/);
  assert.match(runtime, /e\?\.isConnected/);
  assert.match(runtime, /new MutationObserver\(scheduleInject\)\.observe\(runtimeView,\{childList:true\}\)/);
  assert.doesNotMatch(runtime, /MutationObserver\([^\n]+\)\.observe\([^\n]+subtree:true/);
  assert.match(runtime, /if\(injectFrame!==null\)return/);
});
