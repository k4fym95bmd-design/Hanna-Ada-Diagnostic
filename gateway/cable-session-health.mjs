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

  let stage = 'NO_CABLE';
  if (status.cableDetected) stage = 'ENUMERATED';
  if (status.portOpen) stage = 'PORT_OPEN';
  if (status.portOpen && observedBytes > 0) stage = 'RX_ACTIVITY';
  if (status.portOpen && candidateFrames > 0) stage = 'FRAME_CANDIDATES';

  const flags = [];
  if (status.portOpen && !hardwareBound) flags.push('PORT_OPEN_WITHOUT_USB_BINDING');
  if (observedBytes > 0 && candidateFrames === 0) flags.push('RX_ACTIVITY_WITHOUT_VALID_FRAME');
  if (candidateFrames > 0) flags.push('FRAME_CANDIDATES_UNVERIFIED');

  const nextGate = !status.cableDetected
    ? 'ENUMERATE_USB'
    : !status.portOpen
      ? 'OPEN_SERIAL_TRANSPORT'
      : !hardwareBound
        ? 'BIND_USB_IDENTITY'
        : candidateFrames === 0
          ? 'COLLECT_PASSIVE_EVIDENCE'
          : 'MATCH_READ_ONLY_IDENTITY_RESPONSE';

  return Object.freeze({
    version: 1,
    capturedAt,
    stage,
    hardwareBound,
    portOpen: status.portOpen === true,
    observedBytes,
    ds2FrameCount,
    kwpFrameCount,
    candidateFrames,
    rejectedCandidates,
    kwpRejectedCandidates,
    flags: Object.freeze(flags),
    nextGate,
    ecuVerified: false,
    writesEnabled: false,
    flashEnabled: false,
  });
}
