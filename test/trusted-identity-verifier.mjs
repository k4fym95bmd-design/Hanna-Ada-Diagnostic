import test from 'node:test';
import assert from 'node:assert/strict';
import { instantiateReadOnlyRequest } from '../public/read-only-request-registry.js';
import { TrustedIdentityVerifier } from '../public/trusted-identity-verifier.js';

const evidence = ({ epoch = 7, protocol = 'KWP2000_BMW', directionHint = 'possible-reply' } = {}) => ({
  epoch,
  protocol,
  stage: 'FRAME_CANDIDATE',
  candidateFrames: 1,
  frames: [{ directionHint, frameHex: 'B8 F1 12 00 5B' }],
  ecuVerified: false,
  writesEnabled: false,
  flashEnabled: false,
});

const plan = requestId => instantiateReadOnlyRequest('e39-dme-me72-module-identity', {
  epoch: 7,
  requestId,
});

test('two independent matching attempts are required for read-only identity verification', () => {
  const verifier = new TrustedIdentityVerifier({
    epoch: 7,
    operationId: 'e39-dme-me72-module-identity',
    protocol: 'KWP2000_BMW',
    moduleFamily: 'DME_ME72',
  });

  const first = verifier.recordAttempt({
    requestPlan: plan('identity-request-A'),
    receiveEvidence: evidence(),
    responseRequestId: 'identity-request-A',
    moduleIdentity: 'ME7.2',
  });
  assert.equal(first.stage, 'IDENTITY_CONFIRMATION_REQUIRED');
  assert.equal(first.confirmations, 1);
  assert.equal(first.identityVerified, false);

  const second = verifier.recordAttempt({
    requestPlan: plan('identity-request-B'),
    receiveEvidence: evidence(),
    responseRequestId: 'identity-request-B',
    moduleIdentity: 'ME7.2',
  });
  assert.equal(second.stage, 'READ_ONLY_IDENTITY_VERIFIED');
  assert.equal(second.confirmations, 2);
  assert.equal(second.identityVerified, true);
  assert.equal(second.ecuVerified, false);
  assert.equal(second.writesEnabled, false);
});

test('replay of the same request id is rejected', () => {
  const verifier = new TrustedIdentityVerifier({
    epoch: 7,
    operationId: 'e39-dme-me72-module-identity',
    protocol: 'KWP2000_BMW',
    moduleFamily: 'DME_ME72',
  });
  const p = plan('identity-request-replay');
  verifier.recordAttempt({
    requestPlan: p,
    receiveEvidence: evidence(),
    responseRequestId: p.requestId,
    moduleIdentity: 'ME7.2',
  });
  const replay = verifier.recordAttempt({
    requestPlan: p,
    receiveEvidence: evidence(),
    responseRequestId: p.requestId,
    moduleIdentity: 'ME7.2',
  });
  assert.equal(replay.stage, 'REPLAY_REJECTED');
  assert.equal(replay.identityVerified, false);
});

test('identity conflict resets confirmation state', () => {
  const verifier = new TrustedIdentityVerifier({
    epoch: 7,
    operationId: 'e39-dme-me72-module-identity',
    protocol: 'KWP2000_BMW',
    moduleFamily: 'DME_ME72',
  });
  verifier.recordAttempt({
    requestPlan: plan('identity-request-C'),
    receiveEvidence: evidence(),
    responseRequestId: 'identity-request-C',
    moduleIdentity: 'ME7.2',
  });
  const conflict = verifier.recordAttempt({
    requestPlan: plan('identity-request-D'),
    receiveEvidence: evidence(),
    responseRequestId: 'identity-request-D',
    moduleIdentity: 'ME7.2_ALT',
  });
  assert.equal(conflict.stage, 'IDENTITY_CONFLICT_RESET');
  assert.equal(conflict.confirmations, 0);
  assert.equal(verifier.snapshot().identityVerified, false);
});

test('echo or stale epoch can never contribute a confirmation', () => {
  const verifier = new TrustedIdentityVerifier({
    epoch: 7,
    operationId: 'e39-dme-me72-module-identity',
    protocol: 'KWP2000_BMW',
    moduleFamily: 'DME_ME72',
  });

  const echo = verifier.recordAttempt({
    requestPlan: plan('identity-request-echo'),
    receiveEvidence: evidence({ directionHint: 'possible-echo' }),
    responseRequestId: 'identity-request-echo',
    moduleIdentity: 'ME7.2',
  });
  assert.equal(echo.stage, 'ECHO_REJECTED');
  assert.equal(echo.confirmations, 0);

  const stalePlan = instantiateReadOnlyRequest('e39-dme-me72-module-identity', {
    epoch: 8,
    requestId: 'identity-request-stale',
  });
  const stale = verifier.recordAttempt({
    requestPlan: stalePlan,
    receiveEvidence: evidence({ epoch: 8 }),
    responseRequestId: 'identity-request-stale',
    moduleIdentity: 'ME7.2',
  });
  assert.equal(stale.stage, 'STALE_EPOCH');
  assert.equal(stale.confirmations, 0);
});
