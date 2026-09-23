import test from 'node:test';
import assert from 'node:assert/strict';
import { buildCableTelemetry } from '../gateway/cable-session-health.mjs';

test('no cable reports no-cable state without raw payloads', () => {
  const r = buildCableTelemetry({ status:{ cableDetected:false, portOpen:false }, rx:{ observedBytes:0, frames:[], kwpFrames:[] }, capturedAt:1 });
  assert.equal(r.stage, 'NO_CABLE');
  assert.equal(r.nextGate, 'ENUMERATE_USB');
  assert.equal(r.ecuVerified, false);
  assert.equal('frameHex' in r, false);
});

test('port open without USB binding is explicitly flagged', () => {
  const r = buildCableTelemetry({ status:{ cableDetected:true, portOpen:true, cableBinding:null }, rx:{ observedBytes:0, frames:[], kwpFrames:[] } });
  assert.equal(r.stage, 'PORT_OPEN');
  assert.ok(r.flags.includes('PORT_OPEN_WITHOUT_USB_BINDING'));
  assert.equal(r.nextGate, 'BIND_USB_IDENTITY');
});

test('passive traffic and candidate frames remain unverified', () => {
  const r = buildCableTelemetry({
    status:{ cableDetected:true, portOpen:true, cableBinding:{ active:true, vidPid:'0403:6001' } },
    rx:{ observedBytes:42, rejectedCandidates:3, kwpRejectedCandidates:2, frames:[{frameHex:'12 04 00 16'}], kwpFrames:[{frameHex:'B8 F1 12'}] },
  });
  assert.equal(r.stage, 'FRAME_CANDIDATES');
  assert.equal(r.candidateFrames, 2);
  assert.equal(r.hardwareBound, true);
  assert.ok(r.flags.includes('FRAME_CANDIDATES_UNVERIFIED'));
  assert.equal(r.ecuVerified, false);
  assert.equal(r.writesEnabled, false);
});
