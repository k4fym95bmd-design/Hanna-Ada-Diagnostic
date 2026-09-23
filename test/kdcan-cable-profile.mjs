import test from 'node:test';
import assert from 'node:assert/strict';
import { USER_KDCAN_CABLE, assessUserKdcanCable } from '../public/kdcan-cable-profile.js';

test('photo profile records only visible facts and keeps all vehicle capabilities unverified', () => {
  assert.equal(USER_KDCAN_CABLE.visibleLabel, 'K+DCAN USB Interface (INPA Compatible)');
  assert.equal(USER_KDCAN_CABLE.selectorPresent, true);
  assert.equal(USER_KDCAN_CABLE.chipsetVerified, false);
  assert.equal(USER_KDCAN_CABLE.bmwProtocolVerified, false);
  assert.equal(USER_KDCAN_CABLE.ecuVerified, false);
  assert.equal(USER_KDCAN_CABLE.writesEnabled, false);
});

test('known FTDI VID:PID is only a chipset-family hint', () => {
  const result = assessUserKdcanCable({ vendorId: 0x0403, productId: 0x6001, portOpen: true });
  assert.equal(result.vidPid, '0403:6001');
  assert.match(result.chipsetCandidate, /FTDI/);
  assert.equal(result.usbSerialOpen, true);
  assert.equal(result.chipsetVerified, false);
  assert.equal(result.bmwProtocolVerified, false);
  assert.equal(result.ecuVerified, false);
});

test('unknown VID:PID remains unknown and never becomes BMW evidence', () => {
  const result = assessUserKdcanCable({ vendorId: 0x1234, productId: 0x5678 });
  assert.equal(result.vidPid, '1234:5678');
  assert.match(result.chipsetCandidate, /Nieznany/);
  assert.equal(result.ecuVerified, false);
});

test('selector state is recorded without assigning a BMW wiring meaning', () => {
  for (const selectorPosition of ['unknown', 'position-1', 'position-2']) {
    const result = assessUserKdcanCable({ selectorPosition });
    assert.equal(result.selectorPosition, selectorPosition);
    assert.equal(result.bmwProtocolVerified, false);
  }
  assert.throws(() => assessUserKdcanCable({ selectorPosition: 'pins-7-8' }), /selector/i);
});

test('partial or malformed USB identity is rejected', () => {
  assert.throws(() => assessUserKdcanCable({ vendorId: 0x0403 }), /together/i);
  assert.throws(() => assessUserKdcanCable({ vendorId: '0403', productId: 0x6001 }), TypeError);
});
