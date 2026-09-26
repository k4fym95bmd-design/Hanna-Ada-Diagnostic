import test from 'node:test';
import assert from 'node:assert/strict';
import { buildCableTelemetry } from '../gateway/cable-session-health.mjs';

test('no cable reports canonical no-cable state without raw payloads', () => {
  const r = buildCableTelemetry({
    status:{ cableDetected:false, portOpen:false, sessionEpoch:null, stateRevision:0 },
    rx:{ observedBytes:0, frames:[], kwpFrames:[] },
    capturedAt:1,
  });
  assert.equal(r.contractVersion, 1);
  assert.equal(r.stage, 'NO_CABLE');
  assert.equal(r.nextGate, 'DETECT_USB');
  assert.equal(r.ecuVerified, false);
  assert.equal('frameHex' in r, false);
});

test('physical port open without hardware binding cannot skip USB_SEEN', () => {
  const r = buildCableTelemetry({
    status:{ cableDetected:true, portOpen:true, cableBinding:null, sessionEpoch:1, stateRevision:2 },
    rx:{ observedBytes:0, frames:[], kwpFrames:[] },
  });
  assert.equal(r.stage, 'USB_SEEN');
  assert.equal(r.portOpen, true);
  assert.equal(r.hardwareBound, false);
  assert.ok(r.flags.includes('PORT_OPEN_WITHOUT_HARDWARE_BINDING'));
  assert.equal(r.nextGate, 'BIND_HARDWARE');
  assert.equal(r.sessionEpoch, 1);
  assert.equal(r.stateRevision, 2);
});

test('bound passive traffic and candidate frames remain unverified', () => {
  const r = buildCableTelemetry({
    status:{
      cableDetected:true,
      portOpen:true,
      sessionEpoch:3,
      stateRevision:9,
      cableBinding:{ active:true, vidPid:'0403:6001' },
    },
    rx:{
      observedBytes:42,
      rejectedCandidates:3,
      kwpRejectedCandidates:2,
      frames:[{frameHex:'12 04 00 16'}],
      kwpFrames:[{frameHex:'B8 F1 12'}],
    },
  });
  assert.equal(r.stage, 'FRAME_CANDIDATE');
  assert.equal(r.nextGate, 'MATCH_READ_ONLY_IDENTITY');
  assert.equal(r.candidateFrames, 2);
  assert.equal(r.hardwareBound, true);
  assert.ok(r.flags.includes('FRAME_CANDIDATES_UNVERIFIED'));
  assert.equal(r.ecuVerified, false);
  assert.equal(r.writesEnabled, false);
});
