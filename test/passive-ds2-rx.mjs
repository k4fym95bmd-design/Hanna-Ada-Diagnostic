import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { PassiveDs2Decoder, attachPassiveRx } from '../gateway/passive-ds2-rx.mjs';

const frame = (...body) => Uint8Array.from([...body, body.reduce((acc, b) => acc ^ b, 0)]);

test('fragmented DS2 frame assembles with valid XOR and never proves ECU online', () => {
  const d = new PassiveDs2Decoder();
  const msg = frame(0x12, 0x04, 0x00);
  d.ingest(msg.slice(0, 2));
  assert.equal(d.snapshot().frames.length, 0);
  d.ingest(msg.slice(2));
  assert.deepEqual(d.snapshot().frames.map(f => f.frameHex), ['12 04 00 16']);
  assert.equal(d.snapshot().ecuVerified, false);
  assert.equal(d.snapshot().frames[0].ecuVerified, false);
});

test('checksum-invalid data is not accepted as verified frame', () => {
  const d = new PassiveDs2Decoder();
  d.ingest(Uint8Array.of(0x12, 0x04, 0x00, 0x17));
  assert.equal(d.snapshot().frames.length, 0);
  assert.ok(d.snapshot().rejectedCandidates >= 1);
});

test('noise resynchronises and retains only last bounded window', () => {
  const d = new PassiveDs2Decoder({ maxFrames: 2 });
  const msg = frame(0x12, 0x04, 0x00);
  d.ingest(Uint8Array.from([0xFF, 0x00, ...msg, ...msg, ...msg]));
  assert.equal(d.snapshot().frames.length, 2);
  assert.equal(d.snapshot().observedBytes, 14);
});

test('live RX listener is removed and data purged at disconnect', () => {
  const port = new EventEmitter();
  const monitor = attachPassiveRx(port);
  port.emit('data', Buffer.from(frame(0x12, 0x04, 0x00)));
  assert.equal(monitor.snapshot().frames.length, 1);
  monitor.dispose();
  assert.equal(port.listenerCount('data'), 0);
  assert.equal(monitor.snapshot().frames.length, 0);
  port.emit('data', Buffer.from(frame(0x12, 0x04, 0x00)));
  assert.equal(monitor.snapshot().observedBytes, 0);
});

test('rejects excessive input and never returns raw unbounded buffer', () => {
  const d = new PassiveDs2Decoder();
  d.ingest(new Uint8Array(9000));
  assert.equal(d.snapshot().frames.length, 0);
  assert.ok(d.snapshot().rejectedCandidates > 0);
  assert.throws(() => d.ingest('12 04 00 16'), /bytes/);
});
