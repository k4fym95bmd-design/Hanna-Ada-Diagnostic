const forbiddenKeys = Object.freeze([
  'requestBytes',
  'txBytes',
  'payload',
  'command',
  'rawTx',
  'writeCommand',
]);

const REQUEST_ID_RE = /^[A-Za-z0-9._:-]{8,64}$/;
const FRAME_HEX_RE = /^(?:[0-9A-F]{2})(?: [0-9A-F]{2})*$/i;
const MAX_FRAMES = 16;

function rejectForbiddenKeys(value, label) {
  for (const key of forbiddenKeys) {
    if (key in value) throw new TypeError(`Raw TX material is forbidden in ${label}`);
  }
}

export function validateTrustedIdentityCandidateEvent(value, {
  epoch,
  requestId,
  protocol,
  nativeReadReceipt,
} = {}) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError('Invalid trusted identity event');
  }
  rejectForbiddenKeys(value, 'trusted identity event');

  if (!Number.isSafeInteger(epoch) || epoch < 1
      || typeof requestId !== 'string' || !REQUEST_ID_RE.test(requestId)
      || !['DS2', 'KWP2000_BMW'].includes(protocol)
      || !Number.isSafeInteger(nativeReadReceipt) || nativeReadReceipt < 1) {
    throw new TypeError('Invalid trusted identity expectation');
  }
  if (value.epoch !== epoch
      || value.requestId !== requestId
      || value.responseRequestId !== requestId
      || value.protocol !== protocol
      || value.nativeReadReceipt !== nativeReadReceipt) {
    throw new TypeError('Trusted identity event correlation mismatch');
  }
  if (typeof value.moduleIdentity !== 'string'
      || !/^[A-Za-z0-9._-]{2,64}$/.test(value.moduleIdentity.trim())) {
    throw new TypeError('Invalid trusted module identity');
  }

  const evidence = value.receiveEvidence;
  if (!evidence || typeof evidence !== 'object' || Array.isArray(evidence)) {
    throw new TypeError('Invalid trusted receive evidence');
  }
  rejectForbiddenKeys(evidence, 'trusted receive evidence');

  if (evidence.epoch !== epoch
      || evidence.protocol !== protocol
      || evidence.stage !== 'FRAME_CANDIDATE'
      || !Number.isSafeInteger(evidence.candidateFrames)
      || evidence.candidateFrames < 1
      || evidence.candidateFrames > MAX_FRAMES
      || !Array.isArray(evidence.frames)
      || evidence.frames.length !== evidence.candidateFrames
      || evidence.ecuVerified !== false
      || evidence.writesEnabled !== false
      || evidence.flashEnabled !== false
      || evidence.nativeReadReceipt !== nativeReadReceipt) {
    throw new TypeError('Invalid trusted receive evidence');
  }

  const frames = evidence.frames.map(frame => {
    if (!frame || typeof frame !== 'object' || Array.isArray(frame)) {
      throw new TypeError('Invalid trusted receive frame');
    }
    rejectForbiddenKeys(frame, 'trusted receive frame');
    if (typeof frame.frameHex !== 'string'
        || !FRAME_HEX_RE.test(frame.frameHex)
        || frame.frameHex.length > 1024) {
      throw new TypeError('Invalid trusted receive frame');
    }
    if (protocol === 'KWP2000_BMW' && frame.directionHint !== 'possible-reply') {
      throw new TypeError('Trusted KWP identity event requires reply-direction evidence');
    }
    return Object.freeze({
      frameHex: frame.frameHex.toUpperCase(),
      ...(protocol === 'KWP2000_BMW' ? { directionHint: 'possible-reply' } : {}),
      ecuVerified: false,
    });
  });

  const safeEvidence = Object.freeze({
    epoch,
    protocol,
    stage: 'FRAME_CANDIDATE',
    candidateFrames: frames.length,
    frames: Object.freeze(frames),
    nativeReadReceipt,
    ecuVerified: false,
    writesEnabled: false,
    flashEnabled: false,
  });

  return Object.freeze({
    epoch,
    requestId,
    responseRequestId: requestId,
    protocol,
    nativeReadReceipt,
    moduleIdentity: value.moduleIdentity.trim(),
    receiveEvidence: safeEvidence,
    identityVerified: false,
    ecuVerified: false,
    writesEnabled: false,
    flashEnabled: false,
  });
}
