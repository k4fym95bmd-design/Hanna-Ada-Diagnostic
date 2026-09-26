import test from 'node:test';
import assert from 'node:assert/strict';
import { validateTrustedIdentityCandidateEvent } from '../public/trusted-identity-event.js';

const base = () => ({
  epoch: 5,
  requestId: 'identity-request-5001',
  responseRequestId: 'identity-request-5001',
  protocol: 'KWP2000_BMW',
  nativeReadReceipt: 41,
  moduleIdentity: 'PN7506366-HW0F-CI01-DIA8-BI60-BW08-BY00-SP001021',
  receiveEvidence: {
    epoch: 5,
    protocol: 'KWP2000_BMW',
    stage: 'FRAME_CANDIDATE',
    candidateFrames: 1,
    frames: [{ directionHint: 'possible-reply', frameHex: 'B8 F1 12 00 5B' }],
    nativeReadReceipt: 41,
    ecuVerified: false,
    writesEnabled: false,
    flashEnabled: false,
  },
});

const expected = {
  epoch: 5,
  requestId: 'identity-request-5001',
  protocol: 'KWP2000_BMW',
  nativeReadReceipt: 41,
  expectedFrameHexes: ['B8 F1 12 00 5B'],
  expectedModuleIdentity: 'PN7506366-HW0F-CI01-DIA8-BI60-BW08-BY00-SP001021',
};

test('trusted identity event requires exact epoch/request/protocol match', () => {
  const valid = validateTrustedIdentityCandidateEvent(base(), expected);
  assert.equal(valid.moduleIdentity, 'PN7506366-HW0F-CI01-DIA8-BI60-BW08-BY00-SP001021');
  assert.equal(valid.identityVerified, false);

  assert.throws(() => validateTrustedIdentityCandidateEvent({
    ...base(), epoch: 6,
  }, expected), /mismatch/i);
  assert.throws(() => validateTrustedIdentityCandidateEvent({
    ...base(), requestId: 'identity-request-other',
  }, expected), /mismatch/i);
});

test('raw TX material is rejected at top-level nested evidence and frame boundaries', () => {
  for (const field of ['requestBytes','txBytes','payload','command','rawTx','writeCommand']) {
    assert.throws(() => validateTrustedIdentityCandidateEvent({
      ...base(), [field]: [0x01],
    }, expected), /raw tx/i);

    assert.throws(() => validateTrustedIdentityCandidateEvent({
      ...base(),
      receiveEvidence: { ...base().receiveEvidence, [field]: [0x01] },
    }, expected), /raw tx/i);

    assert.throws(() => validateTrustedIdentityCandidateEvent({
      ...base(),
      receiveEvidence: {
        ...base().receiveEvidence,
        frames: [{ ...base().receiveEvidence.frames[0], [field]: [0x01] }],
      },
    }, expected), /raw tx/i);
  }
});

test('unsafe or structurally inconsistent receive evidence is rejected', () => {
  assert.throws(() => validateTrustedIdentityCandidateEvent({
    ...base(),
    receiveEvidence: { ...base().receiveEvidence, ecuVerified: true },
  }, expected), /receive evidence/i);

  assert.throws(() => validateTrustedIdentityCandidateEvent({
    ...base(),
    receiveEvidence: { ...base().receiveEvidence, candidateFrames: 2 },
  }, expected), /receive evidence/i);

  assert.throws(() => validateTrustedIdentityCandidateEvent({
    ...base(),
    receiveEvidence: {
      ...base().receiveEvidence,
      frames: [{ directionHint:'possible-echo', frameHex:'B8 F1 12 00 5B' }],
    },
  }, expected), /reply-direction/i);
});

test('validated event owns frozen sanitized evidence instead of caller references', () => {
  const source = base();
  const valid = validateTrustedIdentityCandidateEvent(source, expected);
  source.receiveEvidence.frames[0].frameHex = '00';
  assert.equal(valid.receiveEvidence.frames[0].frameHex, 'B8 F1 12 00 5B');
  assert.equal(Object.isFrozen(valid.receiveEvidence), true);
  assert.equal(Object.isFrozen(valid.receiveEvidence.frames), true);
  assert.equal(Object.isFrozen(valid.receiveEvidence.frames[0]), true);
});


test('receipt or frame provenance mismatch is rejected', () => {
  assert.throws(() => validateTrustedIdentityCandidateEvent({
    ...base(),
    nativeReadReceipt: 42,
  }, expected), /mismatch/i);

  assert.throws(() => validateTrustedIdentityCandidateEvent({
    ...base(),
    receiveEvidence: { ...base().receiveEvidence, nativeReadReceipt: 42 },
  }, expected), /receive evidence/i);

  assert.throws(() => validateTrustedIdentityCandidateEvent(base(), {
    ...expected,
    expectedFrameHexes: ['B8 F1 12 00 00'],
  }), /provenance/i);
});


test('parser-derived identity mismatch is rejected', () => {
  assert.throws(() => validateTrustedIdentityCandidateEvent({
    ...base(),
    moduleIdentity: 'PN0000000-HW00-CI00-DI00-BI00-BW00-BY00-SP000000',
  }, expected), /parser-derived identity/i);
});
