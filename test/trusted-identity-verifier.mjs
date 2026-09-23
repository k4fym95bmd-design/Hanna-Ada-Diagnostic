import test from 'node:test';
import assert from 'node:assert/strict';
import { instantiateReadOnlyRequest } from '../public/read-only-request-registry.js';
import { TrustedIdentityVerifier } from '../public/trusted-identity-verifier.js';

const evidence = ({
  epoch = 7,
  protocol = 'KWP2000_BMW',
  directionHint = 'possible-reply',
  nativeReadReceipt = 100,
} = {}) => ({
  epoch,
  protocol,
  stage: 'FRAME_CANDIDATE',
  candidateFrames: 1,
  frames: [{ directionHint, frameHex: 'B8 F1 12 00 5B' }],
  nativeReadReceipt,
  ecuVerified: false,
  writesEnabled: false,
  flashEnabled: false,
});

const plan = requestId => instantiateReadOnlyRequest('e39-dme-me72-module-identity', {
  epoch: 7,
  requestId,
});

test('two independent matching attempts produce only a repeated correlated candidate', () => {
  const verifier = new TrustedIdentityVerifier({
    epoch: 7,
    operationId: 'e39-dme-me72-module-identity',
    protocol: 'KWP2000_BMW',
    moduleFamily: 'DME_ME72',
  });

  const first = verifier.recordAttempt({
    requestPlan: plan('identity-request-A'),
    receiveEvidence: evidence({ nativeReadReceipt: 101 }),
    responseRequestId: 'identity-request-A',
    moduleIdentity: 'ME7.2',
  });
  assert.equal(first.stage, 'IDENTITY_CONFIRMATION_REQUIRED');
  assert.equal(first.confirmations, 1);
  assert.equal(first.identityVerified, false);

  const second = verifier.recordAttempt({
    requestPlan: plan('identity-request-B'),
    receiveEvidence: evidence({ nativeReadReceipt: 102 }),
    responseRequestId: 'identity-request-B',
    moduleIdentity: 'ME7.2',
  });
  assert.equal(second.stage, 'REPEATED_CORRELATED_IDENTITY_CANDIDATE');
  assert.equal(second.confirmations, 2);
  assert.equal(second.repeatCandidateReady, true);
  assert.equal(second.localAttestationRequired, true);
  assert.equal(second.identityVerified, false);
  assert.equal(second.ecuVerified, false);
  assert.equal(second.writesEnabled, false);
  assert.deepEqual(second.confirmedRequestIds, ['identity-request-A','identity-request-B']);
  assert.deepEqual(second.confirmedNativeReceipts, [101,102]);
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
    receiveEvidence: evidence({ nativeReadReceipt: 121 }),
    responseRequestId: 'identity-request-C',
    moduleIdentity: 'ME7.2',
  });
  const conflict = verifier.recordAttempt({
    requestPlan: plan('identity-request-D'),
    receiveEvidence: evidence({ nativeReadReceipt: 122 }),
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


test('browser-side verifier can never emit the canonical verified stage', () => {
  const verifier = new TrustedIdentityVerifier({
    epoch:7,
    operationId:'e39-dme-me72-module-identity',
    protocol:'KWP2000_BMW',
    moduleFamily:'DME_ME72',
  });
  let last;
  for (const [index, id] of ['identity-safe-0001','identity-safe-0002','identity-safe-0003'].entries()) {
    last = verifier.recordAttempt({
      requestPlan:plan(id),
      receiveEvidence:evidence({ nativeReadReceipt: 200 + index }),
      responseRequestId:id,
      moduleIdentity:'ME7.2',
    });
    assert.notEqual(last.stage, 'READ_ONLY_IDENTITY_VERIFIED');
    assert.equal(last.identityVerified, false);
    assert.equal(last.ecuVerified, false);
  }
  assert.equal(last.stage, 'LOCAL_ATTESTATION_REQUIRED');
  assert.equal(last.repeatCandidateReady, true);
  assert.equal(verifier.snapshot().identityVerified, false);
});


test('verifier attempt memory is bounded when correlation never succeeds', () => {
  const verifier = new TrustedIdentityVerifier({
    epoch:7,
    operationId:'e39-dme-me72-module-identity',
    protocol:'KWP2000_BMW',
    moduleFamily:'DME_ME72',
  });
  for (let i=0; i<32; i++) {
    const id = `identity-noise-${String(i).padStart(2,'0')}`;
    const result = verifier.recordAttempt({
      requestPlan:plan(id),
      receiveEvidence:evidence({ directionHint:'possible-echo' }),
      responseRequestId:id,
      moduleIdentity:'ME7.2',
    });
    assert.equal(result.identityVerified, false);
  }
  const overflow = verifier.recordAttempt({
    requestPlan:plan('identity-noise-overflow'),
    receiveEvidence:evidence({ directionHint:'possible-echo' }),
    responseRequestId:'identity-noise-overflow',
    moduleIdentity:'ME7.2',
  });
  assert.equal(overflow.stage, 'ATTEMPT_LIMIT_REACHED');
  assert.equal(verifier.snapshot().attemptCount, 32);
});


test('native receipt replay cannot produce a second confirmation', () => {
  const verifier = new TrustedIdentityVerifier({
    epoch:7,
    operationId:'e39-dme-me72-module-identity',
    protocol:'KWP2000_BMW',
    moduleFamily:'DME_ME72',
  });
  verifier.recordAttempt({
    requestPlan:plan('identity-receipt-0001'),
    receiveEvidence:evidence({ nativeReadReceipt: 901 }),
    responseRequestId:'identity-receipt-0001',
    moduleIdentity:'ME7.2',
  });
  const replay = verifier.recordAttempt({
    requestPlan:plan('identity-receipt-0002'),
    receiveEvidence:evidence({ nativeReadReceipt: 901 }),
    responseRequestId:'identity-receipt-0002',
    moduleIdentity:'ME7.2',
  });
  assert.equal(replay.stage, 'NATIVE_RECEIPT_REPLAY_REJECTED');
  assert.equal(verifier.snapshot().confirmations, 1);
});
