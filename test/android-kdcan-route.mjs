import test from 'node:test';
import assert from 'node:assert/strict';
import { AndroidKdcanStage as S, assessAndroidKdcanRoute as assess } from '../public/android-kdcan-route.js';

test('unknown chipset or closed serial stays blocked', () => {
  assert.equal(assess({driverFamily:'FTDI', serialPortOpen:false}).stage, S.USB_UNKNOWN);
  assert.equal(assess({driverFamily:'mystery', serialPortOpen:true}).protocolProbeAllowed, false);
});

test('non-FTDI serial is not promoted to reference-compatible K+DCAN', () => {
  const r=assess({driverFamily:'CH34X', serialPortOpen:true});
  assert.equal(r.stage, S.USB_SERIAL_ONLY);
  assert.equal(r.referenceCompatible, false);
  assert.equal(r.writesEnabled, false);
});

test('FTDI still requires verified legacy pin route', () => {
  const r=assess({driverFamily:'FTDI', serialPortOpen:true});
  assert.equal(r.stage, S.LEGACY_WIRING_PENDING);
  assert.equal(r.protocolProbeAllowed, false);
});

test('round 20-pin E39 requires explicit adapter evidence', () => {
  const r=assess({driverFamily:'FTDI', serialPortOpen:true, pin78RouteVerified:true, round20Present:true});
  assert.equal(r.stage, S.ADAPTER_20PIN_PENDING);
  assert.equal(r.protocolProbeAllowed, false);
});

test('only fully evidenced route reaches read-only probe readiness', () => {
  const r=assess({
    driverFamily:'FTDI',
    serialPortOpen:true,
    pin78RouteVerified:true,
    round20Present:true,
    adapter20PinVerified:true,
  });
  assert.equal(r.stage, S.READONLY_PROBE_READY);
  assert.equal(r.protocolProbeAllowed, true);
  assert.equal(r.ecuVerified, false);
  assert.equal(r.writesEnabled, false);
});
