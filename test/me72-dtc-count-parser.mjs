import test from 'node:test';
import assert from 'node:assert/strict';
import {
  deriveMe72DtcCountFromEvidence,
  parseMe72DtcCountFrame,
} from '../public/me72-dtc-count-parser.js';

// Contract-derived vector, not a captured hardware trace:
// KWP reply B8 F1 12 + payload length 02 + positive A2 response E2 + count 03 + XOR.
const count3='B8 F1 12 02 E2 03 B8';

function mutateAndRepair(frameHex,mutate){
  const bytes=frameHex.split(' ').map(v=>Number.parseInt(v,16));
  mutate(bytes);
  bytes[bytes.length-1]=bytes.slice(0,-1).reduce((v,b)=>v^b,0);
  return bytes.map(b=>b.toString(16).toUpperCase().padStart(2,'0')).join(' ');
}

test('ME7.2 A2 00 contract parser exposes only the fault count',()=>{
  const r=parseMe72DtcCountFrame(count3);
  assert.equal(r.operation,'DTC_COUNT');
  assert.equal(r.faultCount,3);
  assert.equal(r.referenceContractVerified,true);
  assert.equal(r.capturedHardwareVector,false);
  assert.equal(r.hardwareVerified,false);
  assert.equal(r.writesEnabled,false);
  assert.equal(r.clearDtcEnabled,false);
});

test('DTC-count parser fails closed on checksum, header, service and extra payload',()=>{
  assert.throws(()=>parseMe72DtcCountFrame(count3.replace(/B8$/,'B9')),/checksum/i);
  assert.throws(()=>parseMe72DtcCountFrame(count3.replace(/^B8/,'B9')),/header/i);
  const wrongService=mutateAndRepair(count3,bytes=>{bytes[4]=0xE1;});
  assert.throws(()=>parseMe72DtcCountFrame(wrongService),/E2/i);
  assert.throws(()=>parseMe72DtcCountFrame('B8 F1 12 03 E2 03 00 BB'),/length/i);
});

test('DTC-count evidence requires exactly one strict E2-count reply',()=>{
  const r=deriveMe72DtcCountFromEvidence({
    protocol:'KWP2000_BMW',
    stage:'FRAME_CANDIDATE',
    frames:[
      {directionHint:'possible-reply',frameHex:'B8 F1 12 05 62 40 07 FD 10 96'},
      {directionHint:'possible-reply',frameHex:count3},
    ],
  });
  assert.equal(r.faultCount,3);
  assert.throws(()=>deriveMe72DtcCountFromEvidence({
    protocol:'KWP2000_BMW',
    stage:'FRAME_CANDIDATE',
    frames:[{directionHint:'possible-reply',frameHex:'B8 F1 12 05 62 40 07 FD 10 96'}],
  }),/Exactly one/i);
});
