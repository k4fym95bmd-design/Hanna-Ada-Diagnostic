import test from 'node:test';
import assert from 'node:assert/strict';
import { identifyUsbSerialCandidate } from '../public/usb-chipset-candidates.js';

test('recognizes only common documented VID:PID candidates and nothing more', () => {
  for (const [vid,pid,family] of [
    [0x0403,0x6001,'FTDI'],[0x0403,0x6010,'FTDI'],
    [0x10c4,0xea60,'Silicon Labs'],[0x067b,0x2303,'Prolific'],[0x1a86,0x7523,'WCH'],
  ]) {
    const candidate = identifyUsbSerialCandidate({vendorId:vid,productId:pid});
    assert.match(candidate.candidate,new RegExp(family));
    assert.equal(candidate.isKnownCandidate,true);
    assert.equal(candidate.serialDriverVerified,false);
    assert.equal(candidate.bmwProtocolVerified,false);
    assert.equal(candidate.ecuVerified,false);
    assert.equal(candidate.writesEnabled,false);
  }
});
test('unknown VID:PID must never be guessed as FTDI or BMW', () => {
  const unknown = identifyUsbSerialCandidate({vendorId:0x1234,productId:0x9876});
  assert.equal(unknown.isKnownCandidate,false);
  assert.match(unknown.candidate,/Nieznany/);
  assert.equal(unknown.usbSerialOpen,false);
});
test('invalid identifiers, absent devices and descriptor strings are rejected or ignored', () => {
  for (const value of [null,{}, {vendorId:-1,productId:1},{vendorId:0,productId:65536},
    {vendorId:'0403',productId:0x6001}]) assert.throws(()=>identifyUsbSerialCandidate(value),TypeError);
  const result=identifyUsbSerialCandidate({vendorId:0x0403,productId:0x6001,serialNumber:'secret',productName:'BMW'});
  assert.equal(JSON.stringify(result).includes('secret'),false);
  assert.equal(JSON.stringify(result).includes('BMW'),false);
  assert.equal(Object.isFrozen(result),true);
});
