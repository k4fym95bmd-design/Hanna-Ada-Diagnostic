import test from 'node:test';
import assert from 'node:assert/strict';
import { PassiveDs2Decoder } from '../gateway/passive-ds2-rx.mjs';
import { PassiveKwpDecoder } from '../gateway/passive-kwp-rx.mjs';

function prng(seed = 0x5A17C0DE) {
  let state = seed >>> 0;
  return () => {
    state ^= state << 13; state >>>= 0;
    state ^= state >>> 17; state >>>= 0;
    state ^= state << 5; state >>>= 0;
    return state >>> 0;
  };
}

test('random passive serial noise remains bounded and never verifies an ECU', () => {
  const next = prng();
  const ds2 = new PassiveDs2Decoder({ maxFrames:16 });
  const kwp = new PassiveKwpDecoder({ maxFrames:16 });
  let total = 0;

  for (let i = 0; i < 600; i++) {
    const len = next() % 96;
    const bytes = new Uint8Array(len);
    for (let j = 0; j < len; j++) bytes[j] = next() & 0xFF;
    total += len;
    assert.doesNotThrow(() => ds2.ingest(bytes));
    assert.doesNotThrow(() => kwp.ingest(bytes));

    const a = ds2.snapshot();
    const b = kwp.snapshot();
    assert.ok(a.frames.length <= 16);
    assert.ok(b.kwpFrames.length <= 16);
    assert.equal(a.ecuVerified, false);
    assert.equal(b.ecuVerified, false);
  }

  assert.equal(ds2.snapshot().observedBytes, total);
  assert.equal(kwp.snapshot().observedBytes, total);
});

test('oversized untrusted chunks are rejected without retaining unbounded evidence', () => {
  const ds2 = new PassiveDs2Decoder();
  const kwp = new PassiveKwpDecoder();
  const huge = new Uint8Array(8193);
  ds2.ingest(huge);
  kwp.ingest(huge);
  assert.deepEqual(ds2.snapshot().frames, []);
  assert.deepEqual(kwp.snapshot().kwpFrames, []);
  assert.equal(ds2.snapshot().ecuVerified, false);
  assert.equal(kwp.snapshot().ecuVerified, false);
});
