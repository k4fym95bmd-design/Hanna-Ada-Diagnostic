import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const sw = readFileSync(new URL('../public/sw.js', import.meta.url), 'utf8');
const mobile = readFileSync(new URL('../public/mobile-shell.js', import.meta.url), 'utf8');
const app = readFileSync(new URL('../public/app.js', import.meta.url), 'utf8');
const css = readFileSync(new URL('../public/app.css', import.meta.url), 'utf8');
const html = readFileSync(new URL('../public/index.html', import.meta.url), 'utf8');

test('mobile shell registers one local service worker after initial load', () => {
  assert.match(mobile, /serviceWorker\s*\.register\('\/sw\.js', \{ updateViaCache: 'none' \}\)/);
  assert.match(mobile, /window\.addEventListener\('load'/);
  assert.match(mobile, /requestIdleCallback/);
});

test('service worker caches only explicit same-origin GET shell assets', () => {
  assert.match(sw, /request\.method !== 'GET'/);
  assert.match(sw, /url\.origin !== self\.location\.origin/);
  assert.match(sw, /CORE\.includes\(url\.pathname\)/);
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
  assert.doesNotMatch(app, /root\.querySelectorAll\('button'\)\.forEach\(b=>b\.onclick/);
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
