import test from 'node:test';
import assert from 'node:assert/strict';
import {
  deriveMe72AdaptationsFromEvidence,
  parseMe72AdaptationsFrame,
} from '../public/me72-adaptations-parser.js';

const sample='B8 F1 12 13 62 40 04 00 2C 00 20 82 83 80 0C 6C 6C 6C 6C 00 F5 01 15 0E';

function mutateAndRepair(frameHex,mutate){
  const bytes=frameHex.split(' ').map(v=>Number.parseInt(v,16));
  mutate(bytes);
  bytes[bytes.length-1]=bytes.slice(0,-1).reduce((value,byte)=>value^byte,0);
  return bytes.map(byte=>byte.toString(16).toUpperCase().padStart(2,'0')).join(' ');
}

test('ME7.2 0x4004 parser decodes four documented adaptation values',()=>{
  const r=parseMe72AdaptationsFrame(sample);
  assert.equal(r.dataIdentifier,'0x4004');
  assert.equal(r.additiveBank1.raw,44);
  assert.equal(r.additiveBank1.percent,2.0625);
  assert.equal(r.additiveBank2.raw,32);
  assert.equal(r.additiveBank2.percent,1.5);
  assert.equal(r.multiplicativeBank1.raw,-32125);
  assert.ok(Math.abs(r.multiplicativeBank1.percent-(-0.9798125))<1e-12);
  assert.equal(r.multiplicativeBank2.raw,-32756);
  assert.ok(Math.abs(r.multiplicativeBank2.percent-(-0.999058))<1e-12);
  assert.equal(r.hardwareVerified,false);
  assert.equal(r.writesEnabled,false);
});

test('adaptations parser rejects checksum, header, DID and truncation',()=>{
  assert.throws(()=>parseMe72AdaptationsFrame(sample.replace(/0E$/,'0F')),/checksum/i);
  assert.throws(()=>parseMe72AdaptationsFrame(sample.replace(/^B8/,'B9')),/header/i);
  const wrongDid=mutateAndRepair(sample,bytes=>{bytes[6]=0x05;});
  assert.throws(()=>parseMe72AdaptationsFrame(wrongDid),/0x4004/i);
  assert.throws(()=>parseMe72AdaptationsFrame('B8 F1 12 03 62 40 04 6C'),/too short|length/i);
});

test('adaptations evidence requires exactly one valid 0x4004 reply',()=>{
  const r=deriveMe72AdaptationsFromEvidence({
    protocol:'KWP2000_BMW',
    stage:'FRAME_CANDIDATE',
    frames:[
      {directionHint:'possible-reply',frameHex:'B8 F1 12 05 62 40 07 FD 10 96'},
      {directionHint:'possible-reply',frameHex:sample},
    ],
  });
  assert.equal(r.additiveBank1.percent,2.0625);

  assert.throws(()=>deriveMe72AdaptationsFromEvidence({
    protocol:'KWP2000_BMW',
    stage:'FRAME_CANDIDATE',
    frames:[{directionHint:'possible-reply',frameHex:'B8 F1 12 05 62 40 07 FD 10 96'}],
  }),/Exactly one/i);
});
