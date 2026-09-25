import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const sw = readFileSync(new URL('../public/sw.js', import.meta.url), 'utf8');
const mobile = readFileSync(new URL('../public/mobile-shell.js', import.meta.url), 'utf8');
const app = readFileSync(new URL('../public/app.js', import.meta.url), 'utf8');
const css = readFileSync(new URL('../public/app.css', import.meta.url), 'utf8');
const html = readFileSync(new URL('../public/index.html', import.meta.url), 'utf8');
const bootstrap = readFileSync(new URL('../public/ultra-bootstrap.js', import.meta.url), 'utf8');

test('mobile shell registers one local service worker after initial load', () => {
  assert.match(mobile, /serviceWorker\s*\.register\('\/sw\.js', \{ updateViaCache: 'none' \}\)/);
  assert.match(mobile, /window\.addEventListener\('load'/);
  assert.match(mobile, /requestIdleCallback/);
});

test('service worker caches only explicit same-origin GET shell assets', () => {
  assert.match(sw, /request\.method !== 'GET'/);
  assert.match(sw, /url\.origin !== self\.location\.origin/);
  assert.match(sw, /PRECACHE\.includes\(url\.pathname\)/);
  assert.match(sw, /RUNTIME\.has\(url\.pathname\)/);
  assert.match(sw, /Promise\.allSettled/);
  assert.match(sw, /CACHE_PREFIX/);
});

test('dynamic APIs catalog health and cross-origin bridge traffic are excluded from cache', () => {
  assert.match(sw, /url\.pathname\.startsWith\('\/api\/'\)/);
  assert.match(sw, /url\.pathname === '\/health'/);
  assert.match(sw, /url\.pathname\.startsWith\('\/config\/'\)/);
  assert.match(sw, /url\.origin !== self\.location\.origin/);
  assert.doesNotMatch(sw, /\/v1\/transmit|writeValue|transferOut|controlTransferOut/);
});

test('navigation is network-first while static shell assets use stale-while-revalidate', () => {
  assert.match(sw, /request\.mode === 'navigate'/);
  assert.match(sw, /const cached = await caches\.match\(request\)/);
  assert.match(sw, /event\.waitUntil\(updateStatic\(request\)/);
});

test('main shell avoids rebuilding navigation on every render and drops stale async renders', () => {
  assert.match(app, /if\(!navReady\)/);
  assert.match(app, /root\.addEventListener\('click'/);
  assert.match(app, /if\(lastNavModule!==state\.module\)/);
  assert.match(app, /const owner=\+\+renderEpoch/);
  assert.match(app, /if\(owner!==renderEpoch\)return/);
  assert.match(app, /function bindViewEvents\(\)/);
  assert.match(app, /hannaada:module-rendered/);
  assert.doesNotMatch(app, /root\.querySelectorAll\('\[data-jump\]'\)/);
});


test('navigation preload is enabled when the browser supports it', () => {
  assert.match(sw, /registration\.navigationPreload/);
  assert.match(sw, /navigationPreload\.enable\(\)/);
  assert.match(sw, /event\.preloadResponse/);
});


test('offscreen panels use content-visibility and mobile drops expensive backdrop/shadows', () => {
  assert.match(css, /content-visibility:auto/);
  assert.match(css, /contain-intrinsic-size:1px 180px/);
  assert.match(css, /@media\(max-width:700px\)[\s\S]*backdrop-filter:none/);
  assert.match(css, /@media\(max-width:700px\)[\s\S]*box-shadow:none/);
});

test('index contains no literal escaped newline between module scripts', () => {
  assert.doesNotMatch(html, /<\/script>\\n\s*<script/);
});


test('critical shell is small and heavy modules are staged after first paint', () => {
  assert.match(html, /src="\/ultra-bootstrap\.js"/);
  assert.doesNotMatch(html, /src="\/(?:obd-runtime|cable-workbench|desktop-pro-panel|webusb-workbench-extension|live-performance-runtime)\.js"/);
  assert.match(bootstrap, /afterFirstPaint/);
  assert.match(bootstrap, /async function loadObdStack\(\)/);
  assert.match(bootstrap, /async function loadCableStack\(\)/);
  assert.match(bootstrap, /await loadForModule\(initialModule\)/);
  assert.match(bootstrap, /await idle\(\)/);
  assert.match(bootstrap, /window\.__TAURI_INTERNALS__/);
  assert.match(bootstrap, /'usb' in navigator/);
});


test('background startup waits for visibility and optional prefetch respects save-data', () => {
  assert.match(bootstrap, /const waitForVisible = \(\) =>/);
  assert.match(bootstrap, /await waitForVisible\(\)/);
  assert.match(bootstrap, /connection\?\.saveData/);
  assert.match(bootstrap, /\['slow-2g','2g'\]\.includes/);
  assert.match(bootstrap, /relList\?\.supports\?\.\('prefetch'\)/);
  assert.match(bootstrap, /cache: 'force-cache'/);
});

test('service worker runtime cache is an explicit diagnostic dependency allowlist', () => {
  assert.match(sw, /'\/live-performance-core\.js'/);
  assert.match(sw, /'\/cable-connection-model\.js'/);
  assert.match(sw, /'\/desktop-receive-evidence\.js'/);
  assert.doesNotMatch(sw, /request\.destination === 'script'/);
  assert.doesNotMatch(sw, /request\.destination === 'style'/);
  assert.match(sw, /url\.pathname\.startsWith\('\/api\/'\)/);
  assert.match(sw, /url\.pathname\.startsWith\('\/config\/'\)/);
});


test('hot diagnostic panels use explicit app events instead of subtree observers', () => {
  const files = [
    '../public/obd-runtime.js',
    '../public/live-performance-runtime.js',
    '../public/diagnostic-core-v2.js',
    '../public/cable-workbench.js',
    '../public/cable-rx-panel.js',
    '../public/kdcan-cable-panel.js',
    '../public/universal-platform-panel.js',
    '../public/oem-icom-panel.js',
    '../public/webusb-workbench-extension.js',
    '../public/tuning-analysis-panel.js',
  ].map(path => readFileSync(new URL(path, import.meta.url), 'utf8'));
  for (const source of files) assert.doesNotMatch(source, /new MutationObserver/);
  assert.match(files.join('\n'), /hannaada:module-rendered/);
  assert.match(files.join('\n'), /hannaada:cable-workbench-mounted/);
  assert.match(files.join('\n'), /hannaada:cable-workbench-state/);
});


test('module intent prewarms likely stacks without executing unrelated stacks', () => {
  assert.match(bootstrap, /function warmForModule\(module\)/);
  assert.match(bootstrap, /pointerover/);
  assert.match(bootstrap, /focusin/);
  assert.match(bootstrap, /if \(module === 'vci'\)/);
  assert.match(bootstrap, /if \(module === 'bmw-expert'\)/);
  assert.match(bootstrap, /if \(module === 'tuning'\)/);
  assert.doesNotMatch(bootstrap, /await loadObdStack\(\);\s*await loadCableStack\(\);\s*await loadTuning\(\)/);
});


test('bootstrap uses intent modulepreload and caps idle prefetch concurrency', () => {
  assert.match(bootstrap, /modulepreload/);
  assert.match(bootstrap, /PREFETCH_CONCURRENCY/);
  assert.match(bootstrap, /BACKGROUND_PREFETCH_LIMIT/);
  assert.match(bootstrap, /prefetchQueue/);
  assert.match(bootstrap, /scheduler\?\.postTask/);
  assert.match(bootstrap, /priority: 'background'/);
  assert.match(bootstrap, /warmForModule\(module\)[\s\S]*modulePreload/);
  assert.doesNotMatch(bootstrap, /\[\.\.\.TUNING_MODULES, \.\.\.OBD_MODULES, \.\.\.CABLE_MODULES\]\.forEach\(prefetchModule\)/);
});


test('idle warmup is deliberately tiny while intent warms dependency graphs', () => {
  assert.match(bootstrap, /prefetchModule\('\/obd-runtime\.js'\)/);
  assert.match(bootstrap, /prefetchModule\('\/cable-workbench\.js'\)/);
  assert.match(bootstrap, /pointerdown/);
  assert.match(bootstrap, /'\/live-performance-core\.js'/);
  assert.match(bootstrap, /'\/cable-connection-model\.js'/);
  assert.doesNotMatch(bootstrap, /\[\.\.\.TUNING_MODULES, \.\.\.OBD_MODULES, \.\.\.CABLE_MODULES\]\.forEach\(prefetchModule\)/);
});

test('tuning catalog has one in-flight request and no service-worker cache ambiguity', () => {
  assert.match(app, /let tuningRequest=null/);
  assert.match(app, /if\(!tuningRequest\)tuningRequest=fetch/);
  assert.match(app, /cache:'no-store'/);
  assert.match(app, /finally\(\(\)=>\{tuningRequest=null\}\)/);
});


test('route ownership is carried as data instead of rescanning rendered headings', () => {
  const obd = readFileSync(new URL('../public/obd-runtime.js', import.meta.url), 'utf8');
  const cable = readFileSync(new URL('../public/cable-workbench.js', import.meta.url), 'utf8');
  const tuning = readFileSync(new URL('../public/tuning-analysis-panel.js', import.meta.url), 'utf8');
  assert.match(app, /root\.dataset\.module=state\.module/);
  assert.match(obd, /view\.dataset\.module!==['"]vci['"]/);
  assert.match(cable, /view\.dataset\.module !== 'vci'/);
  assert.match(tuning, /view\.dataset\.module !== 'tuning'/);
  assert.doesNotMatch(obd, /querySelectorAll\('\.hero h1'\)/);
  assert.doesNotMatch(cable, /querySelectorAll\('\.hero h1'\)/);
});


test('modern background scheduling and intent modulepreload stay capability-gated', () => {
  assert.match(bootstrap, /scheduler\?\.postTask/);
  assert.match(bootstrap, /priority: 'background'/);
  assert.match(bootstrap, /relList\?\.supports\?\.\('modulepreload'\)/);
  assert.match(bootstrap, /probe\.rel = 'modulepreload'/);
  assert.match(bootstrap, /fetchPriority = 'high'/);
  assert.match(bootstrap, /navigator\.deviceMemory/);
  assert.match(bootstrap, /navigator\.hardwareConcurrency/);
  assert.match(bootstrap, /warmForModule\(button\.dataset\.module, true\)/);
});


test('main diagnostic trace keeps a fixed memory budget', () => {
  assert.match(app, /const TRACE_LIMIT=160/);
  assert.match(app, /function appendTrace\(\.\.\.entries\)/);
  assert.match(app, /state\.trace\.length>TRACE_LIMIT/);
  assert.match(app, /state\.trace\.splice\(0,state\.trace\.length-TRACE_LIMIT\)/);
  assert.match(app, /appendTrace\('SYS  UI simulation only/);
});


test('tuning card renderer is split out of the critical app bundle', () => {
  const tuningView = readFileSync(new URL('../public/tuning-view.js', import.meta.url), 'utf8');
  assert.match(app, /import\('\/tuning-view\.js'\)/);
  assert.match(bootstrap, /'\/tuning-view\.js'/);
  assert.match(sw, /'\/tuning-view\.js'/);
  assert.match(tuningView, /export function renderTuningBody/);
  assert.match(tuningView, /IDENTIFY ECU FIRST/);
  assert.doesNotMatch(app, /<article class="product/);
});


test('transport runtime update rotates the static cache generation', () => {
  assert.match(sw, /CACHE_NAME = CACHE_PREFIX \+ 'ultra-v8'/);
  assert.match(sw, /'\/obd-runtime\.js'/);
  assert.match(sw, /'\/webusb-workbench-extension\.js'/);
  assert.match(sw, /name\.startsWith\(CACHE_PREFIX\) && name !== CACHE_NAME/);
});
