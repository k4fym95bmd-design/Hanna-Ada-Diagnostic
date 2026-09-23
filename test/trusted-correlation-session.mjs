import test from 'node:test';
import assert from 'node:assert/strict';
import { TrustedCorrelationSession } from '../public/trusted-correlation-session.js';

const evidence = (requestId, overrides = {}) => ({
  epoch: 12,
  protocol: 'KWP2000_BMW',
  stage: 'FRAME_CANDIDATE',
  candidateFrames: 1,
  frames: [{ directionHint: 'possible-reply', frameHex: 'B8 F1 12 00 5B' }],
  ecuVerified: false,
  writesEnabled: false,
  flashEnabled: false,
  ...overrides,
});

test('correlation session allows one active token and consumes it on every attempt', () => {
  const session = new TrustedCorrelationSession({
    epoch: 12,
    operationId: 'e39-dme-me72-module-identity',
  });
  const p1 = session.prepareAttempt('corr-request-0001');
  assert.equal(p1.epoch, 12);
  assert.equal(session.snapshot().activeRequest, true);
  assert.throws(() => session.prepareAttempt('corr-request-0002'), /already active/i);

  const result = session.consumeAttempt({
    receiveEvidence: evidence(p1.requestId),
    responseRequestId: p1.requestId,
    moduleIdentity: 'ME7.2',
  });
  assert.equal(result.stage, 'IDENTITY_CONFIRMATION_REQUIRED');
  assert.equal(result.activeRequest, false);
  assert.equal(session.snapshot().confirmations, 1);
});

test('second independent token can verify identity but still not ECU/write state', () => {
  const session = new TrustedCorrelationSession({
    epoch: 12,
    operationId: 'e39-dme-me72-module-identity',
  });

  const first = session.prepareAttempt('corr-request-A');
  session.consumeAttempt({
    receiveEvidence: evidence(first.requestId),
    responseRequestId: first.requestId,
    moduleIdentity: 'ME7.2',
  });

  const second = session.prepareAttempt('corr-request-B');
  const verified = session.consumeAttempt({
    receiveEvidence: evidence(second.requestId),
    responseRequestId: second.requestId,
    moduleIdentity: 'ME7.2',
  });

  assert.equal(verified.stage, 'READ_ONLY_IDENTITY_VERIFIED');
  assert.equal(verified.identityVerified, true);
  assert.equal(verified.ecuVerified, false);
  assert.equal(verified.writesEnabled, false);
  assert.equal(verified.txBytesExposed, false);
});

test('request ids cannot be reused even after a token is consumed or cancelled', () => {
  const session = new TrustedCorrelationSession({
    epoch: 12,
    operationId: 'e39-dme-me72-module-identity',
  });

  const first = session.prepareAttempt('corr-request-replay');
  session.cancelActiveAttempt();
  assert.throws(() => session.prepareAttempt(first.requestId), /replay/i);
});

test('echo or mismatch consumes token and requires a new request id', () => {
  const session = new TrustedCorrelationSession({
    epoch: 12,
    operationId: 'e39-dme-me72-module-identity',
  });

  const first = session.prepareAttempt('corr-request-echo');
  const rejected = session.consumeAttempt({
    receiveEvidence: evidence(first.requestId, {
      frames: [{ directionHint: 'possible-echo' }],
    }),
    responseRequestId: first.requestId,
    moduleIdentity: 'ME7.2',
  });
  assert.equal(rejected.stage, 'ECHO_REJECTED');
  assert.equal(session.snapshot().activeRequest, false);
  assert.equal(session.snapshot().confirmations, 0);

  assert.throws(() => session.prepareAttempt(first.requestId), /replay/i);
  const second = session.prepareAttempt('corr-request-new');
  assert.equal(second.requestId, 'corr-request-new');
});

test('consume without an active request fails closed', () => {
  const session = new TrustedCorrelationSession({
    epoch: 12,
    operationId: 'e39-dme-me72-module-identity',
  });
  const result = session.consumeAttempt({
    receiveEvidence: evidence('none'),
    responseRequestId: 'none',
    moduleIdentity: 'ME7.2',
  });
  assert.equal(result.stage, 'NO_ACTIVE_REQUEST');
  assert.equal(result.identityVerified, false);
  assert.equal(result.writesEnabled, false);
});
