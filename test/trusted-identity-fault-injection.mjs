import test from 'node:test';
import assert from 'node:assert/strict';
import { TrustedCorrelationSession } from '../public/trusted-correlation-session.js';
import { validateTrustedIdentityCandidateEvent } from '../public/trusted-identity-event.js';

const makeEvidence = (epoch, directionHint = 'possible-reply', nativeReadReceipt = 91) => ({
  epoch,
  protocol: 'KWP2000_BMW',
  stage: 'FRAME_CANDIDATE',
  candidateFrames: 1,
  frames: [{ directionHint, frameHex: 'B8 F1 12 00 5B' }],
  nativeReadReceipt,
  ecuVerified: false,
  writesEnabled: false,
  flashEnabled: false,
});

const nextRand = value => (value * 1664525 + 1013904223) >>> 0;

test('1000-step trusted identity fault injection stays fail-closed', () => {
  let rnd = 0x51A7C0DE;
  let requestSeq = 0;
  let session = null;
  let epoch = 0;
  let activePlan = null;
  let lastRequestId = null;

  const startSession = () => {
    epoch += 1;
    session = new TrustedCorrelationSession({
      epoch,
      operationId: 'e39-dme-me72-module-identity',
    });
    activePlan = null;
    lastRequestId = null;
  };

  startSession();

  for (let step = 0; step < 1000; step++) {
    if (step > 0 && step % 50 === 0) startSession();

    rnd = nextRand(rnd);
    const action = rnd % 9;

    try {
      if (action === 0 && !activePlan && !session.snapshot().repeatCandidateReady
          && session.snapshot().attemptCount < session.snapshot().maxAttempts) {
        const id = `fault-request-${epoch}-${String(requestSeq++).padStart(5,'0')}`;
        activePlan = session.prepareAttempt(id);
        lastRequestId = id;
      } else if (action === 1 && lastRequestId) {
        assert.throws(() => session.prepareAttempt(lastRequestId), /replay|already active|local attestation|attempt limit/i);
      } else if (action === 2 && activePlan) {
        const result = session.consumeAttempt({
          receiveEvidence: makeEvidence(epoch, 'possible-echo'),
          responseRequestId: activePlan.requestId,
          moduleIdentity: 'ME7.2',
        });
        assert.equal(result.identityVerified, false);
        activePlan = null;
      } else if (action === 3 && activePlan) {
        const result = session.consumeAttempt({
          receiveEvidence: makeEvidence(epoch),
          responseRequestId: activePlan.requestId,
          moduleIdentity: 'ME7.2',
        });
        assert.equal(result.ecuVerified, false);
        activePlan = null;
      } else if (action === 4 && activePlan) {
        const result = session.consumeAttempt({
          receiveEvidence: makeEvidence(epoch),
          responseRequestId: activePlan.requestId,
          moduleIdentity: 'ME7.2_ALT',
        });
        assert.equal(result.writesEnabled, false);
        activePlan = null;
      } else if (action === 5 && activePlan) {
        session.cancelActiveAttempt();
        activePlan = null;
      } else if (action === 6 && activePlan) {
        const event = {
          epoch,
          requestId: activePlan.requestId,
          responseRequestId: activePlan.requestId,
          protocol: 'KWP2000_BMW',
          nativeReadReceipt: 91,
          moduleIdentity: 'ME7.2',
          receiveEvidence: makeEvidence(epoch, 'possible-reply', 91),
          rawTx: [0x00],
        };
        assert.throws(() => validateTrustedIdentityCandidateEvent(event, {
          epoch,
          requestId: activePlan.requestId,
          protocol: 'KWP2000_BMW',
          nativeReadReceipt: 91,
          expectedFrameHexes: ['B8 F1 12 00 5B'],
        }), /raw tx/i);
      } else if (action === 7 && activePlan) {
        const staleEvent = {
          epoch: epoch + 1,
          requestId: activePlan.requestId,
          responseRequestId: activePlan.requestId,
          protocol: 'KWP2000_BMW',
          nativeReadReceipt: 92,
          moduleIdentity: 'ME7.2',
          receiveEvidence: makeEvidence(epoch + 1, 'possible-reply', 92),
        };
        assert.throws(() => validateTrustedIdentityCandidateEvent(staleEvent, {
          epoch,
          requestId: activePlan.requestId,
          protocol: 'KWP2000_BMW',
          nativeReadReceipt: 91,
          expectedFrameHexes: ['B8 F1 12 00 5B'],
        }), /mismatch/i);
      } else if (action === 8 && session.snapshot().repeatCandidateReady) {
        assert.throws(
          () => session.prepareAttempt(`post-candidate-${epoch}-${step}`),
          /local attestation/i
        );
      }
    } catch (error) {
      if (!(error instanceof AssertionError)) throw error;
      throw error;
    }

    const snap = session.snapshot();
    assert.equal(snap.ecuVerified, false);
    assert.equal(snap.writesEnabled, false);
    assert.equal(snap.flashEnabled, false);
    assert.equal(snap.txBytesExposed, false);
    assert.equal(snap.writeLike, false);
    assert.ok(snap.attemptCount <= snap.maxAttempts);
    assert.equal(snap.identityVerified, false);
    if (snap.repeatCandidateReady) assert.ok(snap.confirmations >= 2);
  }
});
