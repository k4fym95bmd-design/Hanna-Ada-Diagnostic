import test from 'node:test';
import assert from 'node:assert/strict';
import {
  deriveMe72FuelAdaptationFromEvidence,
  parseMe72FuelAdaptationFrame,
} from '../public/me72-fuel-adaptation-parser.js';

const sample='B8 F1 12 13 62 40 04 00 2C 00 20 82 83 80 0C 6C 6C 6C 6C 00 F5 01 15 0E';

function mutateAndRepair(frameHex,mutate){
  const bytes=frameHex.split(' ').map(v=>Number.parseInt(v,16));
  mutate(bytes);
  bytes[bytes.length-1]=bytes.slice(0,-1).reduce((v,b)=>v^b,0);
  return bytes.map(b=>b.toString(16).toUpperCase().padStart(2,'0')).join(' ');
}

test('ME7.2 0x4004 parser decodes four signed fuel adaptations',()=>{
  const r=parseMe72FuelAdaptationFrame(sample);
  assert.equal(r.dataIdentifier,'0x4004');
  assert.equal(r.additiveBank1Percent,2.0625);
  assert.equal(r.additiveBank2Percent,1.5);
  assert.ok(Math.abs(r.multiplicativeBank1Percent-(-0.9798125))<1e-12);
  assert.ok(Math.abs(r.multiplicativeBank2Percent-(-0.999058))<1e-12);
  assert.deepEqual(r.raw,{
    additiveBank1:44,
    additiveBank2:32,
    multiplicativeBank1:-32125,
    multiplicativeBank2:-32756,
  });
  assert.equal(r.hardwareVerified,false);
  assert.equal(r.writesEnabled,false);
});

test('fuel adaptation parser rejects checksum, header, DID and truncation',()=>{
  assert.throws(()=>parseMe72FuelAdaptationFrame(sample.replace(/0E$/,'0F')),/checksum/i);
  assert.throws(()=>parseMe72FuelAdaptationFrame(sample.replace(/^B8/,'B9')),/header/i);
  const wrongDid=mutateAndRepair(sample,bytes=>{bytes[6]=0x05;});
  assert.throws(()=>parseMe72FuelAdaptationFrame(wrongDid),/0x4004/i);
  assert.throws(()=>parseMe72FuelAdaptationFrame('B8 F1 12 03 62 40 04 6C'),/too short|length/i);
});

test('fuel adaptation evidence requires exactly one valid 0x4004 reply',()=>{
  const r=deriveMe72FuelAdaptationFromEvidence({
    protocol:'KWP2000_BMW',
    stage:'FRAME_CANDIDATE',
    frames:[
      {directionHint:'possible-reply',frameHex:'B8 F1 12 05 62 40 07 FD 10 96'},
      {directionHint:'possible-reply',frameHex:sample},
    ],
  });
  assert.equal(r.additiveBank1Percent,2.0625);
  assert.throws(()=>deriveMe72FuelAdaptationFromEvidence({
    protocol:'KWP2000_BMW',
    stage:'FRAME_CANDIDATE',
    frames:[{directionHint:'possible-reply',frameHex:'B8 F1 12 05 62 40 07 FD 10 96'}],
  }),/Exactly one/i);
});
