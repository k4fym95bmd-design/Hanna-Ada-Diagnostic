import test from 'node:test';
import assert from 'node:assert/strict';
import {
  getReadOnlyRequest,
  instantiateReadOnlyRequest,
  listReadOnlyRequests,
  validateReadOnlyRequestPlan,
} from '../public/read-only-request-registry.js';

test('registry is metadata-only and contains no raw TX material', () => {
  const entries = listReadOnlyRequests();
  assert.ok(entries.length >= 2);
  for (const entry of entries) {
    assert.equal(entry.txBytesExposed, false);
    assert.equal(entry.writeLike, false);
    assert.equal(entry.ecuVerified, false);
    assert.equal(entry.writesEnabled, false);
    assert.equal(entry.requestMaterial, 'EXTERNAL_VERIFIED_PROFILE_REQUIRED');
    assert.equal('bytes' in entry, false);
    assert.equal('payload' in entry, false);
    assert.equal('command' in entry, false);
  }
});

test('ME7.2 identity is explicitly KWP2000 BMW, not DS2', () => {
  const dme = getReadOnlyRequest('e39-dme-me72-module-identity');
  assert.equal(dme.moduleFamily, 'DME_ME72');
  assert.equal(dme.protocol, 'KWP2000_BMW');
});

test('instantiated request is epoch and request-id bound', () => {
  const plan = instantiateReadOnlyRequest('e39-dme-me72-module-identity', {
    epoch: 7,
    requestId: 'request-identity-0001',
  });
  assert.equal(plan.epoch, 7);
  assert.equal(plan.requestId, 'request-identity-0001');
  assert.equal(plan.txBytesExposed, false);
  assert.equal(validateReadOnlyRequestPlan(plan), plan);
});

test('unknown or modified request plans fail closed', () => {
  assert.throws(() => getReadOnlyRequest('raw-write'), /unknown/i);
  const plan = instantiateReadOnlyRequest('e39-legacy-module-identity', {
    epoch: 1,
    requestId: 'request-ds2-0001',
  });
  assert.throws(() => validateReadOnlyRequestPlan({
    ...plan,
    maxResponseBytes: 4096,
  }), /diverged/i);
  assert.throws(() => validateReadOnlyRequestPlan({
    ...plan,
    writesEnabled: true,
  }), /invalid/i);
});


test('request ids are restricted to a transport-safe alphabet and canonical plan fields are immutable', () => {
  assert.throws(() => instantiateReadOnlyRequest('e39-dme-me72-module-identity', {
    epoch:1,
    requestId:'bad request id!',
  }), /request id/i);

  const plan = instantiateReadOnlyRequest('e39-dme-me72-module-identity', {
    epoch:2,
    requestId:'identity:epoch-2',
  });
  assert.equal(plan.requiresEpochBinding, true);
  assert.throws(() => validateReadOnlyRequestPlan({ ...plan, expectedDirection:'anything' }), /diverged/i);
  assert.throws(() => validateReadOnlyRequestPlan({ ...plan, requestMaterial:'bytes-here' }), /diverged/i);
  assert.throws(() => validateReadOnlyRequestPlan({ ...plan, payload:[1,2,3] }), /forbidden/i);
});
