import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const html = readFileSync(new URL('../public/index.html', import.meta.url), 'utf8');
const ui = readFileSync(new URL('../public/cable-workbench.js', import.meta.url), 'utf8');
const bridge = readFileSync(new URL('../gateway/windows-cable-bridge.mjs', import.meta.url), 'utf8');

test('existing VCI app includes one cable workbench and its styling', () => {
  assert.equal((html.match(/src="\/cable-workbench\.js"/g) || []).length, 1);
  assert.equal((html.match(/href="\/cable-workbench\.css"/g) || []).length, 1);
  assert.match(ui, /view\.appendChild\(section\)/);
  assert.match(ui, /data-cable-mode="desktop"/);
  assert.match(ui, /data-cable-mode="bridge"/);
  assert.match(ui, /data-cable-mode="android"/);
});

test('browser UI does not provide unverified ECU command endpoint', () => {
  assert.match(ui, /validateBridgeStatus\(raw\)/);
  assert.match(ui, /data-cable-port.*addEventListener\('change'/);
  assert.doesNotMatch(ui, /bridgeRequest\(['"]\/v1\/(?:transmit|write|erase|flash)/);
  assert.doesNotMatch(bridge, /route === ['"]\/v1\/(?:transmit|write|erase|flash)/);
  assert.match(bridge, /ecuVerified: false, writesEnabled: false, flashEnabled: false/);
});
