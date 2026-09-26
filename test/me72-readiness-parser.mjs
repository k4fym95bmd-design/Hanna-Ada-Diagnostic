import test from 'node:test';
import assert from 'node:assert/strict';
import {
  deriveMe72ReadinessFromEvidence,
  parseMe72ReadinessFrame,
} from '../public/me72-readiness-parser.js';

const sample='B8 F1 12 05 62 40 07 FD 10 96';

function mutateAndRepair(frameHex,mutate){
  const bytes=frameHex.split(' ').map(v=>Number.parseInt(v,16));
  mutate(bytes);
  bytes[bytes.length-1]=bytes.slice(0,-1).reduce((v,b)=>v^b,0);
  return bytes.map(b=>b.toString(16).toUpperCase().padStart(2,'0')).join(' ');
}

test('ME7.2 0x4007 parser decodes documented readiness bits only',()=>{
  const r=parseMe72ReadinessFrame(sample);
  assert.equal(r.dataIdentifier,'0x4007');
  assert.equal(r.neutralSwitch,true);
  assert.equal(r.accelerationEnrichment,false);
  assert.equal(r.oxygenAfterBank2Ready,true);
  assert.equal(r.oxygenAfterBank1Ready,true);
  assert.equal(r.oxygenBeforeBank2Ready,true);
  assert.equal(r.oxygenBeforeBank1Ready,true);
  assert.deepEqual(r.raw,{primaryStatus:0xFD,secondaryStatus:0x10});
  assert.equal(r.hardwareVerified,false);
  assert.equal(r.writesEnabled,false);
});

test('readiness parser rejects checksum, header, DID and truncation',()=>{
  assert.throws(()=>parseMe72ReadinessFrame(sample.replace(/96$/,'97')),/checksum/i);
  assert.throws(()=>parseMe72ReadinessFrame(sample.replace(/^B8/,'B9')),/header/i);
  const wrongDid=mutateAndRepair(sample,bytes=>{bytes[6]=0x06;});
  assert.throws(()=>parseMe72ReadinessFrame(wrongDid),/0x4007/i);
  assert.throws(()=>parseMe72ReadinessFrame('B8 F1 12 03 62 40 07 6F'),/too short|length/i);
});

test('readiness evidence requires exactly one valid 0x4007 reply',()=>{
  const r=deriveMe72ReadinessFromEvidence({
    protocol:'KWP2000_BMW',
    stage:'FRAME_CANDIDATE',
    frames:[
      {directionHint:'possible-reply',frameHex:'B8 F1 12 18 62 40 03 FF 70 FF 4E 00 00 FF D8 00 32 00 90 00 0C 00 8E 01 00 E5 01 26 98'},
      {directionHint:'possible-reply',frameHex:sample},
    ],
  });
  assert.equal(r.neutralSwitch,true);
  assert.throws(()=>deriveMe72ReadinessFromEvidence({
    protocol:'KWP2000_BMW',
    stage:'FRAME_CANDIDATE',
    frames:[{directionHint:'possible-reply',frameHex:'B8 F1 12 18 62 40 03 FF 70 FF 4E 00 00 FF D8 00 32 00 90 00 0C 00 8E 01 00 E5 01 26 98'}],
  }),/Exactly one/i);
});
