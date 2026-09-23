import test from 'node:test';
import assert from 'node:assert/strict';
import { scoreCablePort, assessCablePlugReadiness } from '../public/cable-plug-readiness.js';

test('known FTDI-like K+DCAN port is ranked but never verifies ECU', () => {
  const r = scoreCablePort({ path: 'COM7', manufacturer: 'FTDI USB Serial', vendorId: '0403', productId: '6001' });
  assert.equal(r.path, 'COM7');
  assert.equal(r.vidPid, '0403:6001');
  assert.ok(r.score >= 80);
  assert.equal(r.ecuVerified, false);
  assert.equal(r.writesEnabled, false);
});

test('single strong candidate is recommended for selection only', () => {
  const r = assessCablePlugReadiness([{ path: 'COM7', manufacturer: 'FTDI', vendorId: '0403', productId: '6001' }]);
  assert.equal(r.recommendedPath, 'COM7');
  assert.equal(r.readyToSelect, true);
  assert.equal(r.readyToOpen, true);
  assert.equal(r.ecuVerified, false);
});

test('ambiguous equal candidates require manual selection', () => {
  const r = assessCablePlugReadiness([
    { path: 'COM5', manufacturer: 'USB Serial', vendorId: '0403', productId: '6001' },
    { path: 'COM7', manufacturer: 'USB Serial', vendorId: '0403', productId: '6001' },
  ]);
  assert.equal(r.recommendedPath, null);
  assert.equal(r.readyToSelect, false);
});

test('empty list remains safe and gives plug-in guidance', () => {
  const r = assessCablePlugReadiness([]);
  assert.equal(r.detectedCount, 0);
  assert.match(r.message, /Podłącz kabel USB/);
  assert.equal(r.writesEnabled, false);
});


test('unknown VID PID alone is not strong enough for automatic selection', () => {
  const r = assessCablePlugReadiness([
    { path: 'COM9', manufacturer: 'Unknown Device', vendorId: '1234', productId: '5678' },
  ]);
  assert.equal(r.detectedCount, 1);
  assert.equal(r.recommendedPath, null);
  assert.equal(r.readyToSelect, false);
  assert.equal(r.ecuVerified, false);
});
