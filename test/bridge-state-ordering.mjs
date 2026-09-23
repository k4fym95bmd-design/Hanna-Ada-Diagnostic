import test from 'node:test';
import assert from 'node:assert/strict';
import { classifyBridgeEnvelope } from '../public/bridge-state-ordering.js';

const A='a'.repeat(32), B='b'.repeat(32);

test('first bridge envelope is accepted', () => {
  const r=classifyBridgeEnvelope({}, { bridgeInstanceId:A, stateRevision:0 });
  assert.equal(r.action,'ACCEPT');
  assert.equal(r.resetLocalState,false);
});

test('older response from same bridge is rejected as stale', () => {
  const r=classifyBridgeEnvelope({ knownInstanceId:A, lastRevision:8 }, { bridgeInstanceId:A, stateRevision:7 });
  assert.equal(r.action,'STALE');
});

test('same revision is idempotent and accepted', () => {
  const r=classifyBridgeEnvelope({ knownInstanceId:A, lastRevision:8 }, { bridgeInstanceId:A, stateRevision:8 });
  assert.equal(r.action,'ACCEPT');
});

test('new bridge process is accepted only as an explicit restart', () => {
  const r=classifyBridgeEnvelope({ knownInstanceId:A, lastRevision:99 }, { bridgeInstanceId:B, stateRevision:0 });
  assert.equal(r.action,'RESTART');
  assert.equal(r.resetLocalState,true);
});

test('malformed instance or revision is rejected', () => {
  assert.throws(()=>classifyBridgeEnvelope({}, { bridgeInstanceId:'bad', stateRevision:0 }), /ordering/);
  assert.throws(()=>classifyBridgeEnvelope({}, { bridgeInstanceId:A, stateRevision:-1 }), /ordering/);
});
