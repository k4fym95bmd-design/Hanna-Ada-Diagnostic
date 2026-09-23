import test from 'node:test';
import assert from 'node:assert/strict';
import { TransportRoute, chooseTransportRoute, assessWindowsGateway } from '../public/universal-transport-router.js';

test('iOS always uses the laptop gateway when available', () => {
  const r = chooseTransportRoute({ platform: 'ios', bridgeReachable: true, webUsb: true, webSerial: true, secureContext: true });
  assert.equal(r.route, TransportRoute.IOS_BRIDGE);
  assert.equal(r.directUsb, false);
  assert.equal(r.writesEnabled, false);
});

test('Android prefers native USB Host over browser discovery', () => {
  const r = chooseTransportRoute({ platform: 'android', nativeUsbHost: true, webUsb: true, secureContext: true, bridgeReachable: true });
  assert.equal(r.route, TransportRoute.ANDROID_NATIVE);
  assert.equal(r.readOnly, true);
});

test('Android can fall back to WebUSB discovery or Windows bridge', () => {
  assert.equal(chooseTransportRoute({ platform: 'android', webUsb: true, secureContext: true }).route, TransportRoute.ANDROID_WEBUSB);
  assert.equal(chooseTransportRoute({ platform: 'android', bridgeReachable: true }).route, TransportRoute.WINDOWS_BRIDGE);
});

test('Windows prefers direct Web Serial when available', () => {
  const r = chooseTransportRoute({ platform: 'windows', webSerial: true, secureContext: true, bridgeReachable: true });
  assert.equal(r.route, TransportRoute.WINDOWS_DIRECT);
  assert.equal(r.writesEnabled, false);
});

test('12 GB Windows laptop is sufficient for gateway memory without claiming hardware readiness', () => {
  const r = assessWindowsGateway({ ramGb: 12, nodeMajor: 24, bridgeReachable: false, usbIdentityKnown: false });
  assert.equal(r.memoryReady, true);
  assert.equal(r.runtimeReady, true);
  assert.equal(r.gatewayCoreReady, true);
  assert.equal(r.hardwareEvidenceReady, false);
  assert.equal(r.writesEnabled, false);
});

test('unknown client remains offline without a bridge', () => {
  assert.equal(chooseTransportRoute({ platform: 'other' }).route, TransportRoute.OFFLINE);
});
