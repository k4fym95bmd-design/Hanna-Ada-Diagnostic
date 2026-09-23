import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = name => readFileSync(new URL(`../public/${name}`, import.meta.url), 'utf8');
const html = source('index.html');
const bootstrap = source('ultra-bootstrap.js');
const bridge = source('webusb-cable-discovery.js');
const ui = source('webusb-workbench-extension.js');

test('existing Hanna Ada page retains BLE/VCI and mounts WebUSB extension only once', () => {
  assert.equal((bootstrap.match(/importOnce\('\/webusb-workbench-extension\.js'\)/g) || []).length, 1);
  assert.equal((bootstrap.match(/importOnce\('\/cable-workbench\.js'\)/g) || []).length, 1);
  assert.equal((bootstrap.match(/importOnce\('\/obd-runtime\.js'\)/g) || []).length, 1);
  assert.match(bootstrap, /'usb' in navigator/);
  assert.match(ui, /#haCableWorkbench \[data-cable-panel="android"\]/);
  assert.match(ui, /data-webusb-select/);
  assert.match(ui, /data-webusb-probe/);
});

test('WebUSB discovery uses a user click and never sends a USB or ECU command', () => {
  assert.match(bridge, /usb\.requestDevice\(\{ filters: \[\] \}\)/);
  assert.match(ui, /addEventListener\('click', choose\)/);
  assert.match(bridge, /await device\.open\(\)/);
  assert.match(bridge, /await device\.close\(\)/);
  for (const module of [bridge, ui]) {
    assert.doesNotMatch(module, /\.transfer(?:In|Out)\s*\(/);
    assert.doesNotMatch(module, /\.controlTransfer(?:In|Out)\s*\(/);
    assert.doesNotMatch(module, /\.claimInterface\s*\(/);
  }
});
