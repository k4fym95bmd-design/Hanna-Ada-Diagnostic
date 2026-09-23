// Canonical cross-platform evidence contract for Hanna & Ada.
// Transport evidence is monotonic only while the same physical session remains valid.
// This module never transmits to a vehicle and cannot verify an ECU identity by itself.
export const EVIDENCE_CONTRACT_VERSION = 1;

export const EVIDENCE_STAGE = Object.freeze({
  NO_CABLE: 'NO_CABLE',
  USB_SEEN: 'USB_SEEN',
  HARDWARE_BOUND: 'HARDWARE_BOUND',
  PORT_OPEN: 'PORT_OPEN',
  RX_ACTIVITY: 'RX_ACTIVITY',
  FRAME_CANDIDATE: 'FRAME_CANDIDATE',
  READ_ONLY_IDENTITY_VERIFIED: 'READ_ONLY_IDENTITY_VERIFIED',
});

export const EVIDENCE_STAGES = Object.freeze(Object.values(EVIDENCE_STAGE));

export const EVIDENCE_GATE = Object.freeze({
  DETECT_USB: 'DETECT_USB',
  BIND_HARDWARE: 'BIND_HARDWARE',
  OPEN_PORT: 'OPEN_PORT',
  COLLECT_RX: 'COLLECT_RX',
  VALIDATE_FRAME: 'VALIDATE_FRAME',
  MATCH_READ_ONLY_IDENTITY: 'MATCH_READ_ONLY_IDENTITY',
  COMPLETE: 'COMPLETE',
});

export const EVIDENCE_GATES = Object.freeze(Object.values(EVIDENCE_GATE));
export const TRANSPORT_MAX_STAGE = EVIDENCE_STAGE.FRAME_CANDIDATE;

const nonNegativeInt = value => Number.isSafeInteger(value) && value >= 0;

export function deriveTransportEvidence({
  cableDetected = false,
  hardwareBound = false,
  portOpen = false,
  observedBytes = 0,
  candidateFrames = 0,
} = {}) {
  const detected = cableDetected === true;
  const bound = detected && hardwareBound === true;
  const observedOpen = portOpen === true;
  const opened = bound && observedOpen;
  const bytes = nonNegativeInt(observedBytes) ? observedBytes : 0;
  const frames = nonNegativeInt(candidateFrames) ? candidateFrames : 0;

  const flags = [];
  if (observedOpen && !bound) flags.push('PORT_OPEN_WITHOUT_HARDWARE_BINDING');
  if (bytes > 0 && !opened) flags.push('RX_WITHOUT_VALID_OPEN_SESSION');
  if (frames > 0 && bytes === 0) flags.push('FRAME_WITHOUT_RX_BYTES');

  let stage = EVIDENCE_STAGE.NO_CABLE;
  let nextGate = EVIDENCE_GATE.DETECT_USB;

  if (detected) {
    stage = EVIDENCE_STAGE.USB_SEEN;
    nextGate = EVIDENCE_GATE.BIND_HARDWARE;
  }
  if (bound) {
    stage = EVIDENCE_STAGE.HARDWARE_BOUND;
    nextGate = EVIDENCE_GATE.OPEN_PORT;
  }
  if (opened) {
    stage = EVIDENCE_STAGE.PORT_OPEN;
    nextGate = EVIDENCE_GATE.COLLECT_RX;
  }
  if (opened && bytes > 0) {
    stage = EVIDENCE_STAGE.RX_ACTIVITY;
    nextGate = EVIDENCE_GATE.VALIDATE_FRAME;
  }
  if (opened && bytes > 0 && frames > 0) {
    stage = EVIDENCE_STAGE.FRAME_CANDIDATE;
    nextGate = EVIDENCE_GATE.MATCH_READ_ONLY_IDENTITY;
  }

  return Object.freeze({
    contractVersion: EVIDENCE_CONTRACT_VERSION,
    stage,
    nextGate,
    flags: Object.freeze(flags),
    cableDetected: detected,
    hardwareBound: bound,
    portOpen: observedOpen,
    qualifiedPortOpen: opened,
    observedBytes: bytes,
    candidateFrames: frames,
    ecuVerified: false,
    writesEnabled: false,
    flashEnabled: false,
  });
}

export function validateTransportEvidenceEnvelope(value) {
  if (!value || typeof value !== 'object'
      || value.contractVersion !== EVIDENCE_CONTRACT_VERSION
      || !EVIDENCE_STAGES.includes(value.stage)
      || !EVIDENCE_GATES.includes(value.nextGate)
      || value.stage === EVIDENCE_STAGE.READ_ONLY_IDENTITY_VERIFIED
      || value.ecuVerified !== false
      || value.writesEnabled !== false
      || value.flashEnabled !== false) {
    throw new TypeError('Invalid transport evidence envelope');
  }
  return value;
}
