import test from 'node:test';
import assert from 'node:assert/strict';
import {
  deriveMe72OutputStatusFromEvidence,
  parseMe72OutputStatusFrame,
} from '../public/me72-output-status-parser.js';

const sample='B8 F1 12 0B 62 40 05 2B 00 00 F2 F2 CE F8 20 4A';

function mutateAndRepair(frameHex,mutate){
  const bytes=frameHex.split(' ').map(v=>Number.parseInt(v,16));
  mutate(bytes);
  bytes[bytes.length-1]=bytes.slice(0,-1).reduce((v,b)=>v^b,0);
  return bytes.map(b=>b.toString(16).toUpperCase().padStart(2,'0')).join(' ');
}

test('ME7.2 0x4005 parser decodes only documented output-status bits',()=>{
  const r=parseMe72OutputStatusFrame(sample);
  assert.equal(r.dataIdentifier,'0x4005');
  assert.deepEqual(r.raw,{statusA:0xF8,statusB:0x20});
  assert.equal(r.leakDiagnosticPump,false);
  assert.equal(r.secondaryAirValve,false);
  assert.equal(r.secondaryAirPump,false);
  assert.equal(r.oxygenHeaterBeforeBank1,true);
  assert.equal(r.oxygenHeaterBeforeBank2,true);
  assert.equal(r.postCatHeaterBit40,true);
  assert.equal(r.postCatHeaterBit80,true);
  assert.equal(r.oxygenHeaterAfterBank1,null);
  assert.equal(r.oxygenHeaterAfterBank2,null);
  assert.equal(r.postCatHeaterBankMapping,'REFERENCE_CONFLICT');
  assert.equal(r.referenceVerified,false);
  assert.equal(r.referenceConflictAware,true);
  assert.equal(r.exhaustGasRecirculation,false);
  assert.equal(r.electricFan,false);
  assert.equal(r.fuelPump,true);
  assert.equal(r.thermostat,false);
  assert.equal(r.startMode,false);
  assert.equal(r.statusOnly,true);
  assert.equal(r.actuationEnabled,false);
  assert.equal(r.writesEnabled,false);
});

test('output status parser rejects checksum, header, DID and truncation',()=>{
  assert.throws(()=>parseMe72OutputStatusFrame(sample.replace(/4A$/,'4B')),/checksum/i);
  assert.throws(()=>parseMe72OutputStatusFrame(sample.replace(/^B8/,'B9')),/header/i);
  const wrongDid=mutateAndRepair(sample,bytes=>{bytes[6]=0x06;});
  assert.throws(()=>parseMe72OutputStatusFrame(wrongDid),/0x4005/i);
  assert.throws(()=>parseMe72OutputStatusFrame('B8 F1 12 03 62 40 05 6D'),/too short|length/i);
});

test('output status evidence requires exactly one valid 0x4005 reply',()=>{
  const r=deriveMe72OutputStatusFromEvidence({
    protocol:'KWP2000_BMW',
    stage:'FRAME_CANDIDATE',
    frames:[
      {directionHint:'possible-reply',frameHex:'B8 F1 12 05 62 40 07 FD 10 96'},
      {directionHint:'possible-reply',frameHex:sample},
    ],
  });
  assert.equal(r.fuelPump,true);
  assert.throws(()=>deriveMe72OutputStatusFromEvidence({
    protocol:'KWP2000_BMW',
    stage:'FRAME_CANDIDATE',
    frames:[{directionHint:'possible-reply',frameHex:'B8 F1 12 05 62 40 07 FD 10 96'}],
  }),/Exactly one/i);
});


test('secondary-air valve and pump are independent bits',()=>{
  const both=mutateAndRepair(sample,bytes=>{bytes[13]=0x06;});
  const r=parseMe72OutputStatusFrame(both);
  assert.equal(r.secondaryAirValve,true);
  assert.equal(r.secondaryAirPump,true);
  assert.equal(r.oxygenHeaterBeforeBank1,false);
  assert.equal(r.oxygenHeaterBeforeBank2,false);
  assert.equal(r.postCatHeaterBit40,false);
  assert.equal(r.postCatHeaterBit80,false);
});
