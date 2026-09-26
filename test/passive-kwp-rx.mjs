import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { PassiveKwpDecoder, attachPassiveKwpRx } from '../gateway/passive-kwp-rx.mjs';
const pkt = (dst, src, ...payload) => {
  const head = [0xB8, dst, src, payload.length, ...payload];
  return Uint8Array.from([...head, head.reduce((x, b) => x ^ b, 0)]);
};
test('fragmented ME7.2-format KWP answer is parsed but NOT ECU-verified', () => {
  const d = new PassiveKwpDecoder();
  const sample = Uint8Array.of(0xB8, 0xF1, 0x12, 0x05, 0x62, 0x40, 0x07, 0x01, 0x90, 0xEA);
  d.ingest(sample.slice(0, 3)); assert.equal(d.snapshot().kwpFrames.length, 0);
  d.ingest(sample.slice(3));
  const f = d.snapshot().kwpFrames[0];
  assert.equal(f.frameHex, 'B8 F1 12 05 62 40 07 01 90 EA');
  assert.equal(f.directionHint, 'possible-reply');
  assert.equal(f.ecuVerified, false);
  assert.equal(d.snapshot().ecuVerified, false);
});
test('request echo is a possible echo, never online', () => {
  const d = new PassiveKwpDecoder();
  d.ingest(pkt(0x12, 0xF1, 0xA2));
  assert.equal(d.snapshot().kwpFrames[0].directionHint, 'possible-echo');
  assert.equal(d.snapshot().kwpFrames[0].ecuVerified, false);
});
test('noise, invalid XOR, wrong header are not trusted; resync accepts next frame', () => {
  const d = new PassiveKwpDecoder();
  const bad = pkt(0xF1, 0x12, 0xE2); bad[bad.length - 1] ^= 1;
  d.ingest(Uint8Array.from([0x99, ...bad, ...pkt(0xF1, 0x12, 0xE2)]));
  assert.equal(d.snapshot().kwpFrames.length, 1);
  assert.ok(d.snapshot().rejectedCandidates > 0);
});
test('bad declared length does not block a complete following frame', () => {
  const d = new PassiveKwpDecoder();
  d.ingest(Uint8Array.from([0xB8, 0x12, 0xF1, 0x80, ...pkt(0xF1, 0x12, 0xE2)]));
  assert.equal(d.snapshot().kwpFrames.length, 1);
});
test('bounded FIFO, overflow and malformed input', () => {
  const d = new PassiveKwpDecoder({ maxFrames: 2 });
  const p = pkt(0xF1, 0x12, 0xE2);
  d.ingest(Uint8Array.from([...p, ...p, ...p]));
  assert.equal(d.snapshot().kwpFrames.length, 2);
  d.ingest(new Uint8Array(9000));
  assert.equal(d.snapshot().ecuVerified, false);
  assert.throws(() => d.ingest('B8'), /bytes/);
});
test('disconnect clears listener, evidence and old session data', () => {
  const port = new EventEmitter(), rx = attachPassiveKwpRx(port);
  port.emit('data', Buffer.from(pkt(0xF1, 0x12, 0xE2)));
  assert.equal(rx.snapshot().kwpFrames.length, 1);
  rx.dispose(); assert.equal(port.listenerCount('data'), 0);
  assert.equal(rx.snapshot().kwpFrames.length, 0);
  port.emit('data', Buffer.from(pkt(0xF1, 0x12, 0xE2)));
  assert.equal(rx.snapshot().observedBytes, 0);
});
test('zero-byte payload and unrelated addresses remain unverified', () => {
  const d = new PassiveKwpDecoder();
  d.ingest(pkt(0xF2, 0x98));
  assert.equal(d.snapshot().kwpFrames[0].directionHint, 'unknown');
  assert.equal(d.snapshot().ecuVerified, false);
});
