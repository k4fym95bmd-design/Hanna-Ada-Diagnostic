import assert from 'node:assert/strict';
import test from 'node:test';
import { assessAndroidUsbReadiness as assess, AndroidUsbStatus as S } from '../public/android-usb-readiness.js';

const device = { vendorId: 0x0403, productId: 0x6001, connected: true, serialNumber: 'DO-NOT-LEAK', productName: 'DO-NOT-LEAK' };
const baseline = {
  androidApiLevel: 21,
  usbHostFeature: true,
  devices: [device],
  selectedIndex: 0,
  permission: true,
  driver: 'supported',
  serialPortOpen: true,
};

function assertLocked(input, status) {
  const result = assess(input);
  assert.equal(result.status, status);
  assert.equal(result.vehicleVerified, false);
  assert.equal(result.readEnabled, false);
  assert.equal(result.writesEnabled, false);
  assert.equal(result.usbSerialVerified, false);
  return result;
}

test('Android 5 API 21 is eligible for an OS probe, unknown and older APIs are blocked', () => {
  assertLocked({ ...baseline, androidApiLevel: null }, S.OS_UNKNOWN);
  assertLocked({ ...baseline, androidApiLevel: 20 }, S.OS_UNSUPPORTED);
  assertLocked(baseline, S.SERIAL_OPEN_ONLY);
});

test('no advertised host capability never enables a USB path', () => {
  assertLocked({ ...baseline, usbHostFeature: null }, S.HOST_UNKNOWN);
  assertLocked({ ...baseline, usbHostFeature: false }, S.HOST_UNAVAILABLE);
});

test('enumeration and missing device do not imply an adapter', () => {
  assertLocked({ ...baseline, devices: null }, S.ENUMERATION_PENDING);
  assertLocked({ ...baseline, devices: [] }, S.NO_DEVICE);
  assertLocked({ ...baseline, selectedIndex: null }, S.SELECTION_REQUIRED);
  assertLocked({ ...baseline, selectedIndex: 1 }, S.SELECTION_INVALID);
});

test('invalid USB identity and a disconnected cable remain locked', () => {
  assertLocked({ ...baseline, devices: [{ vendorId: -1, productId: 2 }] }, S.SELECTION_INVALID);
  assertLocked({ ...baseline, devices: [{ vendorId: 3, productId: 0x10000 }] }, S.SELECTION_INVALID);
  assertLocked({ ...baseline, devices: [{ ...device, connected: false }] }, S.DEVICE_DISCONNECTED);
});

test('USB permission must be explicitly granted', () => {
  assertLocked({ ...baseline, permission: null }, S.PERMISSION_PENDING);
  assertLocked({ ...baseline, permission: false }, S.PERMISSION_DENIED);
});

test('driver identification and serial-port open are separate gates', () => {
  assertLocked({ ...baseline, driver: 'unknown' }, S.DRIVER_UNVERIFIED);
  assertLocked({ ...baseline, driver: 'unsupported' }, S.DRIVER_UNSUPPORTED);
  assertLocked({ ...baseline, serialPortOpen: false }, S.SERIAL_NOT_OPEN);
});

test('even a serial-open cable is NOT a confirmed ELM327 or BMW ECU session', () => {
  const result = assertLocked(baseline, S.SERIAL_OPEN_ONLY);
  assert.deepEqual(result.evidence, { vidPid: '0403:6001' });
  assert.equal(JSON.stringify(result).includes('DO-NOT-LEAK'), false);
  assert.equal('elmVerified' in result, false);
  assert.equal('bmwVerified' in result, false);
});

test('untrusted evidence cannot override the vehicle read-only policy', () => {
  const result = assertLocked({ ...baseline, vehicleVerified: true, writesEnabled: true, bmwProtocolVerified: true }, S.SERIAL_OPEN_ONLY);
  assert.equal(result.readEnabled, false);
  assert.equal(result.writesEnabled, false);
});
