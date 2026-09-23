import test from 'node:test';
import assert from 'node:assert/strict';
import { BMW_OEM_VCI, e39OemPath, assessIcomEvidence } from '../public/oem-icom-profile.js';

test('BMW OEM profile keeps all write capabilities locked', () => {
  assert.equal(BMW_OEM_VCI.family, 'ICOM Next');
  assert.equal(BMW_OEM_VCI.primaryInterface, 'ICOM Next A');
  assert.equal(BMW_OEM_VCI.legacyVehicleAdapter, 'ICOM Next C');
  assert.equal(BMW_OEM_VCI.writesEnabled, false);
  assert.equal(BMW_OEM_VCI.flashEnabled, false);
});

test('1999 E39 maps to the legacy 20-pin OEM hardware path without claiming ECU', () => {
  const result = e39OemPath({ productionYear: 1999, productionMonth: 6, hasEngineBay20Pin: true });
  assert.equal(result.legacy20PinExpected, true);
  assert.deepEqual(result.recommendedHardware, ['ICOM Next A', 'ICOM Next C']);
  assert.equal(result.ecuVerified, false);
});

test('ICOM reachability alone never verifies the ECU', () => {
  const result = assessIcomEvidence({ icomReachable: true, adapterKnown: true, sessionId: 'session-1234567890123456' });
  assert.equal(result.stage, 'ICOM_REACHABLE');
  assert.equal(result.ecuVerified, false);
  assert.equal(result.writesEnabled, false);
});

test('only matched read-only identity evidence can advance ECU verification', () => {
  const sessionId = 'session-1234567890123456';
  const result = assessIcomEvidence({
    icomReachable: true,
    adapterKnown: true,
    sessionId,
    readOnlyIdentityEvidence: { verified: true, sessionId, moduleId: 'DME', identity: 'Bosch ME7.2' },
  });
  assert.equal(result.stage, 'ECU_VERIFIED');
  assert.equal(result.ecuVerified, true);
  assert.equal(result.writesEnabled, false);
  assert.equal(result.flashEnabled, false);
});


test('invalid production month never infers a legacy connector', () => {
  const result = e39OemPath({ productionYear: 1999, productionMonth: 13, hasEngineBay20Pin: false });
  assert.equal(result.legacy20PinExpected, false);
  assert.deepEqual(result.recommendedHardware, ['ICOM Next A']);
});

test('explicit observed 20-pin overrides missing production date without verifying ECU', () => {
  const result = e39OemPath({ hasEngineBay20Pin: true });
  assert.equal(result.legacy20PinExpected, true);
  assert.deepEqual(result.recommendedHardware, ['ICOM Next A', 'ICOM Next C']);
  assert.equal(result.ecuVerified, false);
});
