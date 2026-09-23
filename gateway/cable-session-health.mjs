import { deriveTransportEvidence } from '../public/evidence-contract.js';
// Privacy-preserving cable telemetry for Hanna & Ada.
// Counts and state only: no raw diagnostic bytes, no module identity, no TX.
export function buildCableTelemetry({ status, rx, capturedAt = Date.now() } = {}) {
  if (!status || typeof status !== 'object') throw new TypeError('status required');
  if (!rx || typeof rx !== 'object') throw new TypeError('rx required');

  const observedBytes = Number.isInteger(rx.observedBytes) && rx.observedBytes >= 0 ? rx.observedBytes : 0;
  const ds2FrameCount = Array.isArray(rx.frames) ? rx.frames.length : 0;
  const kwpFrameCount = Array.isArray(rx.kwpFrames) ? rx.kwpFrames.length : 0;
  const rejectedCandidates = Number.isInteger(rx.rejectedCandidates) && rx.rejectedCandidates >= 0 ? rx.rejectedCandidates : 0;
  const kwpRejectedCandidates = Number.isInteger(rx.kwpRejectedCandidates) && rx.kwpRejectedCandidates >= 0 ? rx.kwpRejectedCandidates : 0;
  const candidateFrames = ds2FrameCount + kwpFrameCount;
  const hardwareBound = !!status.cableBinding?.active && typeof status.cableBinding?.vidPid === 'string';

  const evidence = deriveTransportEvidence({
    cableDetected: status.cableDetected === true,
    hardwareBound,
    portOpen: status.portOpen === true,
    observedBytes,
    candidateFrames,
  });

  const flags = [...evidence.flags];
  if (observedBytes > 0 && candidateFrames === 0 && status.portOpen) flags.push('RX_ACTIVITY_WITHOUT_VALID_FRAME');
  if (candidateFrames > 0) flags.push('FRAME_CANDIDATES_UNVERIFIED');

  return Object.freeze({
    version: 1,
    contractVersion: evidence.contractVersion,
    capturedAt,
    stage: evidence.stage,
    hardwareBound: evidence.hardwareBound,
    portOpen: evidence.portOpen,
    observedBytes,
    ds2FrameCount,
    kwpFrameCount,
    candidateFrames,
    rejectedCandidates,
    kwpRejectedCandidates,
    flags: Object.freeze(flags),
    nextGate: evidence.nextGate,
    ecuVerified: false,
    writesEnabled: false,
    flashEnabled: false,
  });
}
