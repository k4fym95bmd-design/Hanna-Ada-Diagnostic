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


test('WebUSB reset invalidates in-flight discovery instead of accepting stale completion', () => {
  assert.match(ui, /let sessionEpoch = 0/);
  assert.match(ui, /let operationSerial = 0/);
  assert.match(ui, /let activeOperation = 0/);
  assert.match(ui, /function operationCurrent\(operation, ownerEpoch\)/);
  assert.match(ui, /sessionEpoch === ownerEpoch/);
  assert.match(ui, /function invalidateUsbSession\(\)/);
  assert.match(ui, /sessionEpoch\+\+/);
  assert.match(ui, /activeOperation = 0/);
});

test('WebUSB chooser and probe discard stale async results', () => {
  assert.match(ui, /const ownerEpoch = \+\+sessionEpoch/);
  assert.match(ui, /if \(!operationCurrent\(operation, ownerEpoch\)\) return/);
  assert.match(ui, /const device = chosenDevice/);
  assert.match(ui, /chosenDevice !== device/);
  assert.match(ui, /finally \{ finishOperation\(operation\); \}/);
});

test('WebUSB reset remains available as cancellation while an operation is pending', () => {
  assert.match(ui, /data-webusb-reset/);
  assert.match(ui, /disabled = !chosenDevice && !inProgress/);
  assert.doesNotMatch(ui, /function reset\(\) \{\s*if \(inProgress\) return/);
});

test('WebUSB physical disconnect invalidates the current discovery epoch', () => {
  assert.match(ui, /navigator\.usb\?\.addEventListener\?\.\('disconnect'/);
  assert.match(ui, /event\.device === chosenDevice/);
  assert.match(ui, /invalidateUsbSession\(\)/);
});
