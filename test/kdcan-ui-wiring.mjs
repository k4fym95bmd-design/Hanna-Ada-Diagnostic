import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const html = readFileSync(new URL('../public/index.html', import.meta.url), 'utf8');
const bootstrap = readFileSync(new URL('../public/ultra-bootstrap.js', import.meta.url), 'utf8');
const workbench = readFileSync(new URL('../public/cable-workbench.js', import.meta.url), 'utf8');
const panel = readFileSync(new URL('../public/kdcan-cable-panel.js', import.meta.url), 'utf8');
const webusb = readFileSync(new URL('../public/webusb-workbench-extension.js', import.meta.url), 'utf8');

test('K+DCAN UI modules are wired once and contain no literal escaped newlines in script markup', () => {
  assert.equal((bootstrap.match(/importOnce\('\/kdcan-cable-panel\.js'\)/g) || []).length, 1);
  assert.doesNotMatch(html, /<\/script>\\n\s*<script/);
  assert.doesNotMatch(workbench, /;\\nconst /);
});

test('K+DCAN panel imports only current profile exports', async () => {
  await import('../public/kdcan-cable-profile.js');
  await import('../public/kdcan-cable-panel.js');
  assert.match(panel, /KDCAN_INPA_SWITCH_TARGET/);
  assert.match(panel, /kdcanRuntimeStatus/);
  assert.doesNotMatch(panel, /USER_KDCAN_CABLE|assessUserKdcanCable/);
});

test('USB identity evidence is isolated by desktop bridge and Android modes', () => {
  assert.match(workbench, /directUsbVendorId/);
  assert.match(workbench, /bridgeUsbVendorId/);
  assert.match(webusb, /webUsbVendorId/);
  assert.match(panel, /mode === 'desktop'/);
  assert.match(panel, /mode === 'bridge'/);
  assert.match(panel, /mode === 'android'/);
});

test('K+DCAN UI remains read-only and does not add a transmit route', () => {
  assert.doesNotMatch(workbench, /bridgeRequest\(['"]\/v1\/(?:transmit|write|erase|flash)/);
  assert.match(panel, /ECU, zapis, kodowanie i flash pozostają zablokowane/);
});
