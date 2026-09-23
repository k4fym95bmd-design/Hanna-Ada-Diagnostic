import test from 'node:test';
import assert from 'node:assert/strict';
import {
  assertMe72DataExecutionGated,
  getMe72ReadOnlyDataProfile,
  listMe72ReadOnlyDataProfiles,
} from '../public/me72-readonly-data-profile.js';

test('roughness profile is reference-verified and only native-attestation-gated', () => {
  const profile=getMe72ReadOnlyDataProfile('e39-dme-me72-cylinder-roughness');
  assert.equal(profile.operationId,'e39-dme-me72-cylinder-roughness');
  assert.equal(profile.protocol,'KWP2000_BMW');
  assert.equal(profile.operation,'LIVE_DATA_SNAPSHOT');
  assert.equal(profile.dataIdentifier,'0x4003');
  assert.equal(profile.verificationState,'REFERENCE_VERIFIED');
  assert.equal(profile.implementationState,'NATIVE_EXECUTOR_IMPLEMENTED');
  assert.equal(profile.executionState,'NATIVE_ATTESTATION_GATED');
  assert.equal(profile.executorId,'desktop_execute_me72_roughness');
  assert.equal(profile.executionEnabled,true);
  assert.equal(profile.requiresVerifiedIdentity,true);
  assert.equal(profile.requiresNativeAttestation,true);
  assert.equal(profile.txBytesExposed,false);
  assert.equal(profile.writesEnabled,false);
  assert.equal(listMe72ReadOnlyDataProfiles().length,1);
  assert.equal(getMe72ReadOnlyDataProfile(profile.id),profile);
  assert.equal(assertMe72DataExecutionGated(profile.id),profile);
});
