import test from 'node:test';
import assert from 'node:assert/strict';
import { KdcanReadonlySession } from '../gateway/kdcan-readonly-session.mjs';

const sessionId = 'kdcan-session-1234567890123456';

test('known USB identity binds to one session but never verifies BMW or ECU', () => {
  const s = new KdcanReadonlySession();
  const state = s.begin({ sessionId, vendorId: 0x0403, productId: 0x6001, portPath: 'COM7' });
  assert.equal(state.active, true);
  assert.equal(state.vidPid, '0403:6001');
  assert.match(state.chipsetCandidate, /FTDI/);
  assert.equal(state.stage, 'USB_FAMILY_HINT');
  assert.equal(state.serialDriverVerified, false);
  assert.equal(state.bmwProtocolVerified, false);
  assert.equal(state.ecuVerified, false);
  assert.equal(state.writesEnabled, false);
});

test('opening the COM port advances transport state only', () => {
  const s = new KdcanReadonlySession();
  s.begin({ sessionId, vendorId: 0x0403, productId: 0x6001, portPath: 'COM7' });
  const open = s.markPortOpen({ sessionId });
  assert.equal(open.stage, 'PORT_OPEN');
  assert.equal(open.portOpen, true);
  assert.equal(open.ecuVerified, false);
  assert.equal(open.writesEnabled, false);
  const closed = s.markPortClosed({ sessionId });
  assert.equal(closed.portOpen, false);
  assert.equal(closed.ecuVerified, false);
});

test('a different USB device cannot replace the active cable session', () => {
  const s = new KdcanReadonlySession();
  s.begin({ sessionId, vendorId: 0x0403, productId: 0x6001, portPath: 'COM7' });
  assert.throws(() => s.markPresent({ sessionId, vendorId: 0x10C4, productId: 0xEA60, portPath: 'COM7' }), /Different USB device/);
  assert.equal(s.snapshot().vidPid, '0403:6001');
});

test('stale session id is rejected', () => {
  const s = new KdcanReadonlySession();
  s.begin({ sessionId, vendorId: 0x0403, productId: 0x6001 });
  assert.throws(() => s.markPortOpen({ sessionId: 'wrong-session-123456789012' }), /session/i);
  assert.equal(s.snapshot().ecuVerified, false);
});

test('selector position is metadata only and never becomes BMW protocol evidence', () => {
  const s = new KdcanReadonlySession();
  const state = s.begin({ sessionId, vendorId: 0x1234, productId: 0x5678, selectorPosition: 'position-2' });
  assert.equal(state.selectorPosition, 'B');
  assert.equal(state.stage, 'USB_BOUND');
  assert.equal(state.bmwProtocolVerified, false);
});

test('expired session drops all active evidence', () => {
  let now = 1000;
  const s = new KdcanReadonlySession({ ttlMs: 1000, clock: () => now });
  s.begin({ sessionId, vendorId: 0x0403, productId: 0x6001 });
  now = 2001;
  const state = s.snapshot();
  assert.equal(state.active, false);
  assert.equal(state.stage, 'SESSION_EXPIRED');
  assert.equal(state.ecuVerified, false);
  assert.equal(state.writesEnabled, false);
});

test('ending the session purges cable binding', () => {
  const s = new KdcanReadonlySession();
  s.begin({ sessionId, vendorId: 0x0403, productId: 0x6001 });
  const state = s.end({ sessionId });
  assert.equal(state.active, false);
  assert.equal(state.stage, 'NO_SESSION');
});


test('invalid selector metadata is rejected instead of being guessed', () => {
  const s = new KdcanReadonlySession();
  assert.throws(() => s.begin({ sessionId, vendorId: 0x0403, productId: 0x6001, selectorPosition: 'pins-7-8' }), /selector/i);
});
