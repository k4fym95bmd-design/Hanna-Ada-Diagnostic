import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { attachPassiveRx } from '../gateway/passive-ds2-rx.mjs';
const frame = (...bytes) => Uint8Array.from([...bytes, bytes.reduce((a,b) => a ^ b, 0)]);
test('same single COM session receives DS2 and ME7.2 KWP frames', () => {
  const port = new EventEmitter(); const monitor = attachPassiveRx(port);
  assert.equal(port.listenerCount('data'), 1);
  port.emit('data', Buffer.from(frame(0x12, 0x04, 0x00)));
  port.emit('data', Buffer.from([0xB8, 0xF1, 0x12, 0x05, 0x62, 0x40, 0x07, 0x01, 0x90, 0xEA]));
  const data = monitor.snapshot();
  assert.ok(data.frames.length >= 1);
  assert.equal(data.kwpFrames.length, 1);
  assert.equal(data.kwpFrames[0].directionHint, 'possible-reply');
  assert.equal(data.ecuVerified, false);
  monitor.dispose(); assert.equal(port.listenerCount('data'), 0);
  assert.equal(monitor.snapshot().frames.length, 0);
  assert.equal(monitor.snapshot().kwpFrames.length, 0);
});
