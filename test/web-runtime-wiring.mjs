import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';

const source = async path => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('browser lazy-loads read-only terminal gate and verified DTC extension', async () => {
  const html = await source('public/index.html');
  const bootstrap = await source('public/ultra-bootstrap.js');
  assert.match(html, /src="\/ultra-bootstrap\.js"/);
  assert.match(bootstrap, /importOnce\('\/terminal-readonly-guard\.js'\)/);
  assert.match(bootstrap, /importOnce\('\/diagnostic-core-v2\.js'\)/);
  assert.doesNotMatch(html, /src="\/(?:terminal-readonly-guard|diagnostic-core-v2)\.js"/);
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


test('OBD injection is event-driven and caches live value nodes', async () => {
  const runtime = await source('public/obd-runtime.js');
  assert.match(runtime, /const valueNodeCache=new Map\(\)/);
  assert.match(runtime, /e=valueNodeCache\.get\(key\)/);
  assert.match(runtime, /e\?\.isConnected/);
  assert.match(runtime, /hannaada:module-rendered/);
  assert.match(runtime, /hannaada:obd-runtime-mounted/);
  assert.doesNotMatch(runtime, /new MutationObserver/);
  assert.match(runtime, /if\(injectFrame!==null\)return/);
});


test('verified DTC extension delegates continuous live to ultra scheduler', async () => {
  const extension = await source('public/diagnostic-core-v2.js');
  assert.match(extension, /ultraControllerReady/);
  assert.match(extension, /startUltraLive/);
  assert.match(extension, /stopUltraLive/);
  assert.doesNotMatch(extension, /setInterval\(cycle/);
  assert.doesNotMatch(extension, /new MutationObserver/);
});


test('legacy OBD runtime cannot create a second interval poller', async () => {
  const runtime = await source('public/obd-runtime.js');
  assert.match(runtime, /ULTRA scheduler jeszcze się ładuje/);
  assert.match(runtime, /HA\.startUltraLive/);
  assert.match(runtime, /HA\.isUltraLiveRunning/);
  assert.doesNotMatch(runtime, /HA\.poll=setInterval\(tick,2500\)/);
});


test('BLE runtime caps incomplete RX growth and rejects the pending command on overflow', async () => {
  const runtime = await source('public/obd-runtime.js');
  assert.match(runtime, /const MAX_RX_BUFFER=64\*1024/);
  assert.match(runtime, /HA\.buffer\.length>MAX_RX_BUFFER/);
  assert.match(runtime, /HA\.stats\.overflows\+\+/);
  assert.match(runtime, /p\.reject\(new Error\('RX buffer exceeded safe limit'\)\)/);
  assert.match(runtime, /HA\.buffer=''/);
});


test('BLE disconnect clears stale pending command state before reconnect', async () => {
  const runtime = await source('public/obd-runtime.js');
  assert.match(runtime, /function abortPending\(reason='Session closed'\)/);
  assert.match(runtime, /clearTimeout\(p\.timer\)/);
  assert.match(runtime, /p\.reject\(new Error\(reason\)\)/);
  assert.match(runtime, /disconnect\(\)\{stopLive\(\);abortPending\('BLE disconnected'\)/);
  assert.match(runtime, /HA\.buffer=''/);
});


test('BLE reconnect path is epoch-guarded and refuses duplicate connect storms', async () => {
  const runtime = await source('public/obd-runtime.js');
  assert.match(runtime, /sessionEpoch:0/);
  assert.match(runtime, /connectInFlight:false/);
  assert.match(runtime, /if\(HA\.connectInFlight\)/);
  assert.match(runtime, /const owner=\+\+HA\.sessionEpoch/);
  assert.match(runtime, /if\(owner!==HA\.sessionEpoch\)return/);
  assert.match(runtime, /const notifyHandler=ev=>onNotify\(ev,owner\)/);
  assert.match(runtime, /const disconnectHandler=\(\)=>\{if\(owner===HA\.sessionEpoch\)disconnect\(\)\}/);
});

test('old BLE timeout or write failure cannot clear a newer pending command', async () => {
  const runtime = await source('public/obd-runtime.js');
  assert.match(runtime, /pending=\{resolve,reject,timer,started,epoch:owner\}/);
  assert.match(runtime, /if\(HA\.pending!==pending\|\|owner!==HA\.sessionEpoch\)return/);
  assert.match(runtime, /if\(HA\.pending===pending\)HA\.pending=null/);
  assert.match(runtime, /HA\.pending\?\.epoch===owner/);
});

test('BLE disconnect invalidates session and detaches old listeners before reconnect', async () => {
  const runtime = await source('public/obd-runtime.js');
  assert.match(runtime, /function detachBleListeners\(\)/);
  assert.match(runtime, /removeEventListener\('characteristicvaluechanged',HA\.activeNotifyHandler\)/);
  assert.match(runtime, /removeEventListener\('gattserverdisconnected',HA\.activeDisconnectHandler\)/);
  assert.match(runtime, /function disconnect\(\)\{stopLive\(\);HA\.sessionEpoch\+\+/);
  assert.match(runtime, /HA\.server=HA\.write=HA\.notify=null/);
  assert.match(runtime, /HA\.device=null/);
});
