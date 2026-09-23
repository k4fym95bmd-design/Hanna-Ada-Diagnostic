import test from 'node:test';
import assert from 'node:assert/strict';
import { IcomEvidenceStore } from '../gateway/icom-evidence-store.mjs';

const sessionId = 'icom-session-1234567890123456';
const envelope = (modules = []) => ({
  version: 1,
  source: 'bmw-icom',
  transport: 'ethernet',
  mode: 'read-only',
  icomFamily: 'ICOM Next',
  primaryInterface: 'ICOM Next A',
  legacyAdapter: 'ICOM Next C',
  sessionId,
  writesEnabled: false,
  flashEnabled: false,
  modules,
});

test('single active session starts with no ECU claim', () => {
  const store = new IcomEvidenceStore();
  const state = store.beginSession(sessionId);
  assert.equal(state.active, true);
  assert.equal(state.ecuVerified, false);
  assert.equal(state.writesEnabled, false);
});

test('fresh matched identity evidence advances only read-only ECU state', () => {
  let now = 1000;
  const store = new IcomEvidenceStore({ clock: () => now });
  store.beginSession(sessionId);
  const state = store.accept(envelope([
    { verified: true, sessionId, moduleId: 'DME', identity: 'Bosch ME7.2' },
  ]));
  assert.equal(state.freshEvidence, true);
  assert.equal(state.ecuVerified, true);
  assert.equal(state.modules[0].moduleId, 'DME');
  assert.equal(state.writesEnabled, false);
  assert.equal(state.flashEnabled, false);
});

test('stale session evidence is rejected and cannot replace active state', () => {
  const store = new IcomEvidenceStore();
  store.beginSession(sessionId);
  assert.throws(() => store.accept({ ...envelope(), sessionId: 'other-session-1234567890123' }), /session/i);
  assert.equal(store.snapshot().ecuVerified, false);
});

test('expired evidence automatically loses ECU verification', () => {
  let now = 1000;
  const store = new IcomEvidenceStore({ maxAgeMs: 500, clock: () => now });
  store.beginSession(sessionId);
  store.accept(envelope([{ verified: true, sessionId, moduleId: 'DME', identity: 'Bosch ME7.2' }]));
  now = 1501;
  const state = store.snapshot();
  assert.equal(state.freshEvidence, false);
  assert.equal(state.ecuVerified, false);
  assert.deepEqual(state.modules, []);
});

test('endSession purges evidence and any write-capable envelope is rejected', () => {
  const store = new IcomEvidenceStore();
  store.beginSession(sessionId);
  assert.throws(() => store.accept({ ...envelope(), writesEnabled: true }), /unsafe/i);
  const ended = store.endSession();
  assert.equal(ended.active, false);
  assert.equal(ended.sessionId, null);
  assert.equal(ended.ecuVerified, false);
});
