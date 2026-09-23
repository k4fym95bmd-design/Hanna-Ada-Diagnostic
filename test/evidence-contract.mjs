import test from 'node:test';
import assert from 'node:assert/strict';
import {
  EVIDENCE_CONTRACT_VERSION,
  EVIDENCE_STAGE,
  TRANSPORT_MAX_STAGE,
  deriveTransportEvidence,
  validateTransportEvidenceEnvelope,
} from '../public/evidence-contract.js';

test('transport evidence cannot skip hardware binding', () => {
  const r = deriveTransportEvidence({ cableDetected:true, hardwareBound:false, portOpen:true, observedBytes:50, candidateFrames:2 });
  assert.equal(r.stage, EVIDENCE_STAGE.USB_SEEN);
  assert.ok(r.flags.includes('PORT_OPEN_WITHOUT_HARDWARE_BINDING'));
  assert.equal(r.ecuVerified, false);
});

test('transport evidence advances in strict prerequisite order', () => {
  assert.equal(deriveTransportEvidence({}).stage, EVIDENCE_STAGE.NO_CABLE);
  assert.equal(deriveTransportEvidence({ cableDetected:true }).stage, EVIDENCE_STAGE.USB_SEEN);
  assert.equal(deriveTransportEvidence({ cableDetected:true, hardwareBound:true }).stage, EVIDENCE_STAGE.HARDWARE_BOUND);
  assert.equal(deriveTransportEvidence({ cableDetected:true, hardwareBound:true, portOpen:true }).stage, EVIDENCE_STAGE.PORT_OPEN);
  assert.equal(deriveTransportEvidence({ cableDetected:true, hardwareBound:true, portOpen:true, observedBytes:1 }).stage, EVIDENCE_STAGE.RX_ACTIVITY);
  assert.equal(deriveTransportEvidence({ cableDetected:true, hardwareBound:true, portOpen:true, observedBytes:10, candidateFrames:1 }).stage, EVIDENCE_STAGE.FRAME_CANDIDATE);
});

test('generic transport layer can never produce READ_ONLY_IDENTITY_VERIFIED', () => {
  const r = deriveTransportEvidence({ cableDetected:true, hardwareBound:true, portOpen:true, observedBytes:100, candidateFrames:10 });
  assert.equal(r.stage, TRANSPORT_MAX_STAGE);
  assert.notEqual(r.stage, EVIDENCE_STAGE.READ_ONLY_IDENTITY_VERIFIED);
  assert.equal(r.ecuVerified, false);
});

test('transport envelope validator rejects forged identity verification', () => {
  const valid = deriveTransportEvidence({ cableDetected:true, hardwareBound:true, portOpen:true });
  assert.equal(validateTransportEvidenceEnvelope(valid), valid);
  assert.throws(() => validateTransportEvidenceEnvelope({
    ...valid,
    contractVersion:EVIDENCE_CONTRACT_VERSION,
    stage:EVIDENCE_STAGE.READ_ONLY_IDENTITY_VERIFIED,
    ecuVerified:true,
  }), /Invalid transport evidence/);
});
