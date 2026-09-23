import test from 'node:test';
import assert from 'node:assert/strict';
import {
  deriveMe72EngineSnapshotFromEvidence,
  parseMe72EngineSnapshotFrame,
} from '../public/me72-engine-snapshot-parser.js';

const sample='B8 F1 12 2D 62 40 00 00 C3 7E 36 81 B4 00 0A EC 46 FF F1 00 21 66 C4 11 05 00 B5 1B 62 8F 00 93 AF 00 20 00 1F 00 1E 00 1F 00 25 00 1E 00 24 00 1E 93';

function mutateAndRepair(frameHex,mutate){
  const bytes=frameHex.split(' ').map(v=>Number.parseInt(v,16));
  mutate(bytes);
  bytes[bytes.length-1]=bytes.slice(0,-1).reduce((v,b)=>v^b,0);
  return bytes.map(b=>b.toString(16).toUpperCase().padStart(2,'0')).join(' ');
}

test('ME7.2 0x4000 parser decodes reference engine snapshot',()=>{
  const r=parseMe72EngineSnapshotFrame(sample);
  assert.equal(r.dataIdentifier,'0x4000');
  assert.equal(r.rpm,699);
  assert.equal(r.targetRpm,700);
  assert.equal(r.coolantTempC,99);
  assert.equal(r.intakeAirTempC,28.5);
  assert.equal(r.ignitionAngleDeg,12.75);
  assert.ok(Math.abs(r.injectionTimeMs-3.12)<1e-12);
  assert.ok(Math.abs(r.batteryVoltage-13.585)<1e-12);
  assert.ok(Math.abs(r.loadPercent-10.696559)<1e-9);
  assert.equal(r.knockSensors.length,8);
  assert.ok(Math.abs(r.knockSensors[0].voltage-0.624992)<1e-9);
  assert.equal(r.hardwareVerified,false);
  assert.equal(r.writesEnabled,false);
});

test('engine snapshot parser rejects checksum, header, DID and truncation',()=>{
  assert.throws(()=>parseMe72EngineSnapshotFrame(sample.replace(/93$/,'92')),/checksum/i);
  assert.throws(()=>parseMe72EngineSnapshotFrame(sample.replace(/^B8/,'B9')),/header/i);
  const wrongDid=mutateAndRepair(sample,bytes=>{bytes[6]=0x01;});
  assert.throws(()=>parseMe72EngineSnapshotFrame(wrongDid),/0x4000/i);
  assert.throws(()=>parseMe72EngineSnapshotFrame('B8 F1 12 03 62 40 00 68'),/too short|length/i);
});

test('engine snapshot evidence requires exactly one valid 0x4000 reply',()=>{
  const r=deriveMe72EngineSnapshotFromEvidence({
    protocol:'KWP2000_BMW',
    stage:'FRAME_CANDIDATE',
    frames:[
      {directionHint:'possible-reply',frameHex:'B8 F1 12 05 62 40 07 FD 10 96'},
      {directionHint:'possible-reply',frameHex:sample},
    ],
  });
  assert.equal(r.rpm,699);
  assert.throws(()=>deriveMe72EngineSnapshotFromEvidence({
    protocol:'KWP2000_BMW',
    stage:'FRAME_CANDIDATE',
    frames:[{directionHint:'possible-reply',frameHex:'B8 F1 12 05 62 40 07 FD 10 96'}],
  }),/Exactly one/i);
});
