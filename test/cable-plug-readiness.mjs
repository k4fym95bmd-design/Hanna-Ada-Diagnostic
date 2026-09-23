import test from 'node:test';
import assert from 'node:assert/strict';
import { scoreCablePort, assessCablePlugReadiness, cablePortEvidenceKey, findNewCablePorts } from '../public/cable-plug-readiness.js';

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


test('hotplug diff ignores pre-existing serial ports and detects a newly appeared cable', () => {
  const before = [
    { path:'COM1', manufacturer:'Built-in serial', vendorId:null, productId:null },
    { path:'COM5', manufacturer:'Bluetooth serial', vendorId:null, productId:null },
  ];
  const after = [
    ...before,
    { path:'COM7', manufacturer:'FTDI USB Serial', vendorId:'0403', productId:'6001' },
  ];
  const appeared = findNewCablePorts(before, after);
  assert.equal(appeared.length, 1);
  assert.equal(appeared[0].path, 'COM7');
  assert.equal(assessCablePlugReadiness(appeared).recommendedPath, 'COM7');
});

test('same COM with changed USB identity is treated as new hardware evidence', () => {
  const before = [{ path:'COM7', manufacturer:'USB Serial', vendorId:'0403', productId:'6001' }];
  const after = [{ path:'COM7', manufacturer:'USB Serial', vendorId:'0403', productId:'6010' }];
  const appeared = findNewCablePorts(before, after);
  assert.equal(appeared.length, 1);
  assert.notEqual(cablePortEvidenceKey(before[0]), cablePortEvidenceKey(after[0]));
});

test('unchanged port evidence does not look like a new cable', () => {
  const ports = [{ path:'COM7', manufacturer:'FTDI', vendorId:'0403', productId:'6001' }];
  assert.deepEqual(findNewCablePorts(ports, ports), []);
});


test('same COM and VID PID with changed hashed hardware fingerprint is new evidence', () => {
  const before = [{
    path:'COM7', manufacturer:'FTDI', vendorId:'0403', productId:'6001',
    hardwareFingerprint:'111111111111111111111111'
  }];
  const after = [{
    path:'COM7', manufacturer:'FTDI', vendorId:'0403', productId:'6001',
    hardwareFingerprint:'222222222222222222222222'
  }];
  const appeared = findNewCablePorts(before, after);
  assert.equal(appeared.length, 1);
  assert.notEqual(cablePortEvidenceKey(before[0]), cablePortEvidenceKey(after[0]));
});
