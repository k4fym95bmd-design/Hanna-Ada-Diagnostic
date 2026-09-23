import test from 'node:test';
import assert from 'node:assert/strict';
import { validateIcomReadOnlyEnvelope } from '../gateway/icom-readonly-evidence.mjs';

const sessionId = 'icom-session-1234567890123456';
const base = {
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
  modules: [],
};

test('reachable ICOM without module identity never verifies ECU', () => {
  const result = validateIcomReadOnlyEnvelope(base, sessionId);
  assert.equal(result.ecuVerified, false);
  assert.equal(result.writesEnabled, false);
  assert.equal(result.flashEnabled, false);
});

test('matched read-only module evidence can verify identity without enabling writes', () => {
  const result = validateIcomReadOnlyEnvelope({
    ...base,
    modules: [{ verified: true, sessionId, moduleId: 'DME', identity: 'Bosch ME7.2' }],
  }, sessionId);
  assert.equal(result.ecuVerified, true);
  assert.equal(result.modules[0].moduleId, 'DME');
  assert.equal(result.writesEnabled, false);
});

test('stale session is rejected', () => {
  assert.throws(() => validateIcomReadOnlyEnvelope(base, 'different-session-123456789'), /session/i);
});

test('any write or flash capability is rejected', () => {
  assert.throws(() => validateIcomReadOnlyEnvelope({ ...base, writesEnabled: true }, sessionId), /unsafe/i);
  assert.throws(() => validateIcomReadOnlyEnvelope({ ...base, flashEnabled: true }, sessionId), /unsafe/i);
});

test('unexpected interface or unverified module is rejected', () => {
  assert.throws(() => validateIcomReadOnlyEnvelope({ ...base, primaryInterface: 'Generic J2534' }, sessionId), /VCI/i);
  assert.throws(() => validateIcomReadOnlyEnvelope({
    ...base,
    modules: [{ verified: false, sessionId, moduleId: 'DME', identity: 'Bosch ME7.2' }],
  }, sessionId), /Unverified/i);
});


test('simulated ICOM evidence can never be accepted as vehicle proof', () => {
  assert.throws(() => validateIcomReadOnlyEnvelope({ ...base, simulated: true }, sessionId), /unsafe/i);
});

test('duplicate module identities are rejected', () => {
  const module = { verified: true, sessionId, moduleId: 'DME', identity: 'Bosch ME7.2' };
  assert.throws(() => validateIcomReadOnlyEnvelope({ ...base, modules: [module, { ...module }] }, sessionId), /Duplicate/i);
});
