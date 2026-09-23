import test from 'node:test';
import assert from 'node:assert/strict';
import {
  deriveMe72CylinderRoughnessFromEvidence,
  parseMe72CylinderRoughnessFrame,
} from '../public/me72-roughness-parser.js';

const sample='B8 F1 12 18 62 40 03 FF 70 FF 4E 00 00 FF D8 00 32 00 90 00 0C 00 8E 01 00 E5 01 26 98';

test('ME7.2 0x4003 parser decodes all eight signed roughness channels', () => {
  const result=parseMe72CylinderRoughnessFrame(sample);
  assert.equal(result.dataIdentifier,'0x4003');
  assert.equal(result.cylinders.length,8);
  assert.deepEqual(result.cylinders.map(x=>x.raw),[-144,-178,0,-40,50,144,12,142]);
  assert.ok(Math.abs(result.cylinders[0].valuePerSecond - (-0.3996864)) < 1e-10);
  assert.ok(Math.abs(result.cylinders[5].valuePerSecond - 0.3996864) < 1e-10);
  assert.equal(result.hardwareVerified,false);
  assert.equal(result.ecuVerified,false);
  assert.equal(result.writesEnabled,false);
});

test('roughness parser rejects bad checksum, header, DID and truncation', () => {
  assert.throws(() => parseMe72CylinderRoughnessFrame(sample.replace(/98$/,'99')),/checksum/i);
  assert.throws(() => parseMe72CylinderRoughnessFrame(sample.replace(/^B8/,'B9')),/header/i);
  assert.throws(() => parseMe72CylinderRoughnessFrame(sample.replace('62 40 03','62 40 04')),/0x4003/i);
  assert.throws(() => parseMe72CylinderRoughnessFrame('B8 F1 12 03 62 40 03 6B'),/too short|0x4003/i);
});

test('evidence derivation ignores other KWP replies and requires one 0x4003 block', () => {
  const result=deriveMe72CylinderRoughnessFromEvidence({
    protocol:'KWP2000_BMW',
    stage:'FRAME_CANDIDATE',
    frames:[
      {directionHint:'possible-reply',frameHex:'B8 F1 12 05 62 40 07 FD 10 96'},
      {directionHint:'possible-reply',frameHex:sample},
    ],
  });
  assert.equal(result.cylinders[7].raw,142);

  assert.throws(() => deriveMe72CylinderRoughnessFromEvidence({
    protocol:'KWP2000_BMW',
    stage:'FRAME_CANDIDATE',
    frames:[{directionHint:'possible-reply',frameHex:'B8 F1 12 05 62 40 07 FD 10 96'}],
  }),/Exactly one/i);
});
