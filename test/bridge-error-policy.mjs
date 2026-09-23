import test from 'node:test';
import assert from 'node:assert/strict';
import { classifyBridgeFailure } from '../public/bridge-error-policy.js';

test('409 busy means bridge is reachable and physical state should be preserved', () => {
  const r = classifyBridgeFailure({ httpStatus:409 });
  assert.equal(r.bridgeReachable, true);
  assert.equal(r.preservePhysicalState, true);
  assert.equal(r.transportUnknown, false);
});

test('404 invalid port still proves the bridge answered', () => {
  const r = classifyBridgeFailure({ httpStatus:404 });
  assert.equal(r.bridgeReachable, true);
  assert.equal(r.authorizationRejected, false);
});

test('401 and 403 do not count as usable bridge reachability', () => {
  assert.equal(classifyBridgeFailure({ httpStatus:401 }).bridgeReachable, false);
  assert.equal(classifyBridgeFailure({ httpStatus:403 }).bridgeReachable, false);
  assert.equal(classifyBridgeFailure({ httpStatus:401 }).authorizationRejected, true);
});

test('network and server-side failures make transport state unknown', () => {
  assert.equal(classifyBridgeFailure({}).transportUnknown, true);
  assert.equal(classifyBridgeFailure({ httpStatus:503 }).transportUnknown, true);
});
