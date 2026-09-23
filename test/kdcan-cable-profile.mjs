import test from 'node:test';
import assert from 'node:assert/strict';
import {
  KDCAN_INPA_SWITCH_TARGET,
  usbIdentity,
  resolveSwitchEvidence,
  resolveE39Connector,
  kdcanRuntimeStatus,
} from '../public/kdcan-cable-profile.js';

test('exact target cable remains write locked', () => {
  assert.equal(KDCAN_INPA_SWITCH_TARGET.label, 'K+DCAN USB Interface (INPA Compatible)');
  assert.equal(KDCAN_INPA_SWITCH_TARGET.physicalSwitch, true);
  const s = kdcanRuntimeStatus({});
  assert.equal(s.ecuVerified, false);
  assert.equal(s.writesEnabled, false);
  assert.equal(s.codingEnabled, false);
  assert.equal(s.flashEnabled, false);
});

test('USB identity is evidence only when VID and PID are valid integers', () => {
  assert.equal(usbIdentity({ vendorId: 0x0403, productId: 0x6001 }).vidPid, '0403:6001');
  assert.equal(usbIdentity({ vendorId: null, productId: 0x6001 }).verified, false);
});

test('switch semantics are never guessed from physical position', () => {
  const unknown = resolveSwitchEvidence({ position: 'A' });
  assert.equal(unknown.meaningVerified, false);
  assert.equal(unknown.pin78Continuity, null);
  const measured = resolveSwitchEvidence({ position: 'B', pin78Continuity: true });
  assert.equal(measured.meaningVerified, true);
  assert.equal(measured.pin78Continuity, true);
});

test('E39 connector choice is explicit and fail-closed', () => {
  assert.equal(resolveE39Connector({ round20Present: true }).adapterNeeded, true);
  assert.equal(resolveE39Connector({ round20Present: false }).adapterNeeded, false);
  assert.equal(resolveE39Connector({}).mode, 'VERIFY_ON_VEHICLE');
});
