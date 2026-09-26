import test from 'node:test';
import assert from 'node:assert/strict';
import { webUsbAvailable, describeUsbDevice, chooseWebUsbDevice, probeWebUsbAccess } from '../public/webusb-cable-discovery.js';

const device = (extra = {}) => ({ vendorId: 0x0403, productId: 0x6001, configurations: [1], opened: false,
  async open() { this.opened = true; }, async close() { this.opened = false; }, ...extra });

test('unsupported browser cannot start USB chooser', async () => {
  assert.equal(webUsbAvailable(undefined), false);
  await assert.rejects(() => chooseWebUsbDevice(undefined), /unavailable/);
});
test('chooser only requests user permission and never enumerates or transmits', async () => {
  let count = 0; const selected = device({ serialNumber: 'PRIVATE-SERIAL' });
  const { device: actual, evidence } = await chooseWebUsbDevice({ async requestDevice(args) { count++; assert.deepEqual(args, { filters: [] }); return selected; } });
  assert.equal(count, 1); assert.equal(actual, selected);
  assert.equal(evidence.vidPid, '0403:6001');
  assert.equal(JSON.stringify(evidence).includes('PRIVATE-SERIAL'), false);
  assert.equal(evidence.portOpen, false); assert.equal(evidence.ecuVerified, false);
});
test('rejects malformed USB identities', () => {
  assert.throws(() => describeUsbDevice({vendorId: 65536, productId: 1}), /identity/);
  assert.throws(() => describeUsbDevice({vendorId: 1, productId: -1}), /identity/);
});
test('USB probe opens and closes, never sends a packet or verifies a serial driver', async () => {
  const calls = []; const selected = device({
    async open() { calls.push('open'); this.opened = true; },
    async close() { calls.push('close'); this.opened = false; },
    async claimInterface() { throw new Error('must never claim'); },
    async transferOut() { throw new Error('must never transmit'); },
  });
  const evidence = await probeWebUsbAccess(selected);
  assert.deepEqual(calls, ['open', 'close']);
  assert.equal(evidence.usbAccessVerified, true);
  assert.equal(evidence.serialDriverVerified, false);
  assert.equal(evidence.portOpen, false); assert.equal(evidence.ecuVerified, false);
  assert.equal(evidence.writesEnabled, false);
});
test('open failure cannot result in false verified access', async () => {
  let closes = 0;
  await assert.rejects(() => probeWebUsbAccess(device({ async open() { throw new Error('no USB permission'); }, async close() { closes++; } })), /permission/);
  assert.equal(closes, 0);
});
test('close failure propagates, and never returns success', async () => {
  await assert.rejects(() => probeWebUsbAccess(device({ async close() { throw new Error('cannot close'); } })), /cannot close/);
});
test('preexisting active session is not stolen', async () => {
  await assert.rejects(() => probeWebUsbAccess(device({ opened: true })), /already open/);
});
