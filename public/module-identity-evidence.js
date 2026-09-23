import { validateReadOnlyRequestPlan } from './read-only-request-registry.js';

const MAX_EVIDENCE_FRAMES = 16;
const validIdentity = value =>
  typeof value === 'string'
  && /^[A-Za-z0-9._-]{2,64}$/.test(value.trim());

export function assessModuleIdentityCandidate({
  requestPlan,
  receiveEvidence,
  responseRequestId,
  moduleIdentity,
} = {}) {
  const plan = validateReadOnlyRequestPlan(requestPlan);

  if (!receiveEvidence || typeof receiveEvidence !== 'object') {
    throw new TypeError('Receive evidence required');
  }
  if (receiveEvidence.epoch !== plan.epoch) {
    return blocked('STALE_EPOCH');
  }
  if (receiveEvidence.protocol !== plan.protocol) {
    return blocked('PROTOCOL_MISMATCH');
  }
  if (receiveEvidence.ecuVerified !== false
      || receiveEvidence.writesEnabled !== false
      || receiveEvidence.flashEnabled !== false) {
    throw new TypeError('Unsafe receive evidence');
  }
  if (receiveEvidence.stage !== 'FRAME_CANDIDATE'
      || !Number.isSafeInteger(receiveEvidence.candidateFrames)
      || receiveEvidence.candidateFrames < 1
      || !Array.isArray(receiveEvidence.frames)
      || receiveEvidence.frames.length < 1
      || receiveEvidence.frames.length > MAX_EVIDENCE_FRAMES
      || receiveEvidence.candidateFrames !== receiveEvidence.frames.length
      || receiveEvidence.frames.some(frame => !frame || typeof frame !== 'object' || Array.isArray(frame))) {
    return blocked('FRAME_CANDIDATE_REQUIRED');
  }
  if (typeof responseRequestId !== 'string'
      || responseRequestId !== plan.requestId) {
    return blocked('REQUEST_CORRELATION_REQUIRED');
  }

  const frame = receiveEvidence.frames[receiveEvidence.frames.length - 1];
  if (typeof frame.frameHex !== 'string' || frame.frameHex.length < 2 || frame.frameHex.length > 1024) {
    return blocked('FRAME_METADATA_REQUIRED');
  }
  if (plan.protocol === 'KWP2000_BMW'
      && frame?.directionHint !== 'possible-reply') {
    return blocked(frame?.directionHint === 'possible-echo'
      ? 'ECHO_REJECTED'
      : 'REPLY_DIRECTION_REQUIRED');
  }

  if (!validIdentity(moduleIdentity)) {
    return Object.freeze({
      correlated: true,
      moduleIdentityEligible: false,
      stage: 'CORRELATED_NO_IDENTITY',
      moduleIdentity: null,
      ecuVerified: false,
      writesEnabled: false,
      flashEnabled: false,
    });
  }

  return Object.freeze({
    correlated: true,
    moduleIdentityEligible: true,
    stage: 'CORRELATED_IDENTITY_CANDIDATE',
    moduleIdentity: moduleIdentity.trim(),
    identitySource: 'EXTERNAL_CORRELATED_READ_ONLY',
    ecuVerified: false,
    writesEnabled: false,
    flashEnabled: false,
  });
}

function blocked(stage) {
  return Object.freeze({
    correlated: false,
    moduleIdentityEligible: false,
    stage,
    moduleIdentity: null,
    ecuVerified: false,
    writesEnabled: false,
    flashEnabled: false,
  });
}
