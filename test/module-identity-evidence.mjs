import test from 'node:test';
import assert from 'node:assert/strict';
import { instantiateReadOnlyRequest } from '../public/read-only-request-registry.js';
import { assessModuleIdentityCandidate } from '../public/module-identity-evidence.js';

const baseEvidence = (overrides = {}) => ({
  epoch: 3,
  protocol: 'KWP2000_BMW',
  stage: 'FRAME_CANDIDATE',
  candidateFrames: 1,
  frames: [{ directionHint: 'possible-reply', frameHex: 'B8 F1 12 00 5B' }],
  ecuVerified: false,
  writesEnabled: false,
  flashEnabled: false,
  ...overrides,
});

test('correlated module identity remains only a candidate', () => {
  const plan = instantiateReadOnlyRequest('e39-dme-me72-module-identity', {
    epoch: 3,
    requestId: 'identity-request-0001',
  });
  const result = assessModuleIdentityCandidate({
    requestPlan: plan,
    receiveEvidence: baseEvidence(),
    responseRequestId: 'identity-request-0001',
    moduleIdentity: 'ME7.2',
  });
  assert.equal(result.correlated, true);
  assert.equal(result.moduleIdentityEligible, true);
  assert.equal(result.stage, 'CORRELATED_IDENTITY_CANDIDATE');
  assert.equal(result.ecuVerified, false);
  assert.equal(result.writesEnabled, false);
});

test('echo, stale epoch and request mismatch are rejected', () => {
  const plan = instantiateReadOnlyRequest('e39-dme-me72-module-identity', {
    epoch: 3,
    requestId: 'identity-request-0002',
  });

  assert.equal(assessModuleIdentityCandidate({
    requestPlan: plan,
    receiveEvidence: baseEvidence({ frames: [{ directionHint: 'possible-echo' }] }),
    responseRequestId: 'identity-request-0002',
    moduleIdentity: 'ME7.2',
  }).stage, 'ECHO_REJECTED');

  assert.equal(assessModuleIdentityCandidate({
    requestPlan: plan,
    receiveEvidence: baseEvidence({ epoch: 4 }),
    responseRequestId: 'identity-request-0002',
    moduleIdentity: 'ME7.2',
  }).stage, 'STALE_EPOCH');

  assert.equal(assessModuleIdentityCandidate({
    requestPlan: plan,
    receiveEvidence: baseEvidence(),
    responseRequestId: 'wrong-request',
    moduleIdentity: 'ME7.2',
  }).stage, 'REQUEST_CORRELATION_REQUIRED');
});

test('invalid identity never becomes eligible', () => {
  const plan = instantiateReadOnlyRequest('e39-dme-me72-module-identity', {
    epoch: 3,
    requestId: 'identity-request-0003',
  });
  const result = assessModuleIdentityCandidate({
    requestPlan: plan,
    receiveEvidence: baseEvidence(),
    responseRequestId: 'identity-request-0003',
    moduleIdentity: 'ME7.2<script>',
  });
  assert.equal(result.correlated, true);
  assert.equal(result.moduleIdentityEligible, false);
  assert.equal(result.ecuVerified, false);
});
