import test from 'node:test';
import assert from 'node:assert/strict';
import {
  deriveMe72IdentityFromEvidence,
  parseMe72IdentityFrame,
} from '../public/me72-identity-parser.js';

const sample = 'B8 F1 12 2B E2 37 35 30 36 33 36 36 30 46 30 31 41 38 36 30 30 38 30 30 30 30 31 30 32 31 33 35 31 30 FF FF FF FF 30 30 30 30 38 33 38 32 38 99';

test('clean-room ME7.2 parser derives structured identity from reference frame', () => {
  const result = parseMe72IdentityFrame(sample);
  assert.equal(result.protocol, 'KWP2000_BMW');
  assert.equal(result.moduleFamily, 'DME_ME72');
  assert.equal(result.identity.partNumber, '7506366');
  assert.equal(result.identity.hardwareNumber, '0F');
  assert.equal(result.identity.codingIndex, '01');
  assert.equal(result.identity.diagnosticIndex, 'A8');
  assert.equal(result.identity.busIndex, '60');
  assert.equal(result.identity.buildWeek, '08');
  assert.equal(result.identity.buildYear, '00');
  assert.equal(result.identity.supplier, '001021');
  assert.equal(result.fingerprint, 'PN7506366-HW0F-CI01-DIA8-BI60-BW08-BY00-SP001021');
  assert.equal(result.hardwareVerified, false);
  assert.equal(result.writesEnabled, false);
});

test('checksum, header, length and service mismatches fail closed', () => {
  const badChecksum = sample.replace(/99$/, '98');
  assert.throws(() => parseMe72IdentityFrame(badChecksum), /checksum/i);

  const badHeader = sample.replace(/^B8/, 'B9');
  assert.throws(() => parseMe72IdentityFrame(badHeader), /header/i);

  const badLength = sample.replace('B8 F1 12 2B', 'B8 F1 12 2A');
  assert.throws(() => parseMe72IdentityFrame(badLength), /length/i);

  const badService = sample.replace('2B E2', '2B E1');
  assert.throws(() => parseMe72IdentityFrame(badService), /E2/i);
});

test('evidence derivation ignores unrelated replies but requires one identity response', () => {
  const result = deriveMe72IdentityFromEvidence({
    protocol: 'KWP2000_BMW',
    stage: 'FRAME_CANDIDATE',
    frames: [
      { directionHint:'possible-reply', frameHex:'B8 F1 12 05 62 40 07 FD 10 96' },
      { directionHint:'possible-reply', frameHex:sample },
    ],
  });
  assert.equal(result.identity.partNumber, '7506366');

  assert.throws(() => deriveMe72IdentityFromEvidence({
    protocol:'KWP2000_BMW',
    stage:'FRAME_CANDIDATE',
    frames:[{ directionHint:'possible-reply', frameHex:'B8 F1 12 05 62 40 07 FD 10 96' }],
  }), /Exactly one/i);
});
