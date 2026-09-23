import test from 'node:test';
import assert from 'node:assert/strict';
import { validateTrustedIdentityCandidateEvent } from '../public/trusted-identity-event.js';

const base = () => ({
  epoch: 5,
  requestId: 'identity-request-5001',
  responseRequestId: 'identity-request-5001',
  protocol: 'KWP2000_BMW',
  moduleIdentity: 'ME7.2',
  receiveEvidence: {
    epoch: 5,
    protocol: 'KWP2000_BMW',
    stage: 'FRAME_CANDIDATE',
    candidateFrames: 1,
    frames: [{ directionHint: 'possible-reply' }],
    ecuVerified: false,
    writesEnabled: false,
    flashEnabled: false,
  },
});

const expected = {
  epoch: 5,
  requestId: 'identity-request-5001',
  protocol: 'KWP2000_BMW',
};

test('trusted identity event requires exact epoch/request/protocol match', () => {
  const valid = validateTrustedIdentityCandidateEvent(base(), expected);
  assert.equal(valid.moduleIdentity, 'ME7.2');

  assert.throws(() => validateTrustedIdentityCandidateEvent({
    ...base(), epoch: 6,
  }, expected), /mismatch/i);
  assert.throws(() => validateTrustedIdentityCandidateEvent({
    ...base(), requestId: 'identity-request-other',
  }, expected), /mismatch/i);
});

test('raw TX material is rejected at the event boundary', () => {
  for (const field of ['requestBytes','txBytes','payload','command','rawTx','writeCommand']) {
    assert.throws(() => validateTrustedIdentityCandidateEvent({
      ...base(), [field]: [0x01],
    }, expected), /raw tx/i);
  }
});

test('unsafe receive evidence is rejected', () => {
  assert.throws(() => validateTrustedIdentityCandidateEvent({
    ...base(),
    receiveEvidence: { ...base().receiveEvidence, ecuVerified: true },
  }, expected), /receive evidence/i);
});
