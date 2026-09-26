import test from 'node:test';
import assert from 'node:assert/strict';
import {
  Me72CapabilityState,
  assertMe72CapabilitySafety,
  listMe72Capabilities,
  summarizeMe72Capabilities,
} from '../public/me72-capability-matrix.js';

test('capability matrix exposes six named read-only capabilities and explicit blocked surfaces',()=>{
  const all=listMe72Capabilities();
  const enabled=all.filter(item=>item.executionEnabled===true);
  assert.equal(enabled.length,6);
  assert.equal(all.find(item=>item.id==='e39-me72-dtc-list').state,Me72CapabilityState.BLOCKED_REFERENCE_INCONSISTENT);
  assert.equal(all.find(item=>item.id==='e39-me72-clear-dtc').state,Me72CapabilityState.NOT_EXPOSED);
  assert.equal(all.find(item=>item.id==='e39-me72-clear-dtc').clearDtcEnabled,false);
  assert.equal(all.find(item=>item.id==='e39-me72-actuation').actuationEnabled,undefined);
  assert.equal(assertMe72CapabilitySafety(),true);
});

test('evidence summary distinguishes verified, conflict-aware and contract-only profiles',()=>{
  const summary=summarizeMe72Capabilities();
  assert.equal(summary.enabledCount,6);
  assert.equal(summary.referenceVerified,4);
  assert.equal(summary.conflictAware,1);
  assert.equal(summary.contractVerified,1);
  assert.equal(summary.blockedCount,5);
  assert.equal(summary.fullDtcListEnabled,false);
  assert.equal(summary.clearDtcEnabled,false);
  assert.equal(summary.codingEnabled,false);
  assert.equal(summary.actuationEnabled,false);
  assert.equal(summary.flashEnabled,false);
  assert.equal(summary.hardwareVerified,false);
});

test('no enabled capability exposes raw TX or write-like execution',()=>{
  for(const item of listMe72Capabilities().filter(item=>item.executionEnabled===true)){
    assert.equal(item.txBytesExposed,false);
    assert.equal(item.writeLike,false);
    assert.notEqual(item.state,Me72CapabilityState.NOT_EXPOSED);
    assert.notEqual(item.state,Me72CapabilityState.BLOCKED_REFERENCE_INCONSISTENT);
  }
});


test('full DTC list block is tied to the pinned ME7.2 source evidence',()=>{
  const item=listMe72Capabilities().find(entry=>entry.id==='e39-me72-dtc-list');
  assert.match(item.reason,/file_version 5/);
  assert.match(item.reason,/e67b2371/);
  assert.match(item.reason,/dtc_count/);
  assert.match(item.reason,/dtc_load_bank1/);
  assert.doesNotMatch(item.reason,/every known revision/i);
});
