import test from 'node:test';
import assert from 'node:assert/strict';
import { DesktopReceiveEvidenceSession } from '../public/desktop-receive-evidence.js';

const read = (
  protocol,
  epoch,
  bytes,
  stage = bytes.length ? 'READ_BYTES' : 'READ_TIMEOUT',
  nativeRequestReceipt = null
) => ({
  version: 1,
  evidenceContractVersion: 1,
  stage,
  evidenceStage: stage === 'READ_BYTES' ? 'RX_ACTIVITY' : 'PORT_OPEN',
  epoch,
  protocol,
  receivedBytes: bytes.length,
  bytes,
  nativeRequestReceipt,
  ecuVerified: false,
  writesEnabled: false,
});

test('desktop DS2 evidence assembles fragmented reads but never verifies ECU', () => {
  const session = new DesktopReceiveEvidenceSession({ epoch: 9, protocol: 'DS2' });
  let snap = session.ingest(read('DS2', 9, [0x12, 0x04], 'READ_BYTES', 77));
  assert.equal(snap.candidateFrames, 0);
  snap = session.ingest(read('DS2', 9, [0x00, 0x16], 'READ_BYTES', 77));
  assert.equal(snap.candidateFrames, 1);
  assert.equal(snap.stage, 'FRAME_CANDIDATE');
  assert.equal(snap.frames[0].frameHex, '12 04 00 16');
  assert.equal(snap.nativeReadReceipt, 77);
  assert.equal(snap.ecuVerified, false);
  assert.equal(snap.writesEnabled, false);
});

test('desktop KWP echo remains only a structural frame candidate', () => {
  const session = new DesktopReceiveEvidenceSession({ epoch: 4, protocol: 'KWP2000_BMW' });
  const bytes = [0xB8, 0x12, 0xF1, 0x01, 0xA2, 0xF8];
  const snap = session.ingest(read('KWP2000_BMW', 4, bytes));
  assert.equal(snap.candidateFrames, 1);
  assert.equal(snap.frames[0].directionHint, 'possible-echo');
  assert.equal(snap.ecuVerified, false);
});

test('timeout preserves open transport evidence without inventing RX', () => {
  const session = new DesktopReceiveEvidenceSession({ epoch: 2, protocol: 'DS2' });
  const snap = session.ingest(read('DS2', 2, [], 'READ_TIMEOUT'));
  assert.equal(snap.stage, 'PORT_OPEN');
  assert.equal(snap.observedBytes, 0);
  assert.equal(snap.candidateFrames, 0);
});

test('epoch/protocol mismatch is rejected', () => {
  const session = new DesktopReceiveEvidenceSession({ epoch: 3, protocol: 'DS2' });
  assert.throws(() => session.ingest(read('DS2', 4, [])), /epoch/i);
  assert.throws(() => session.ingest(read('KWP2000_BMW', 3, [])), /protocol/i);
});
