import test from 'node:test';
import assert from 'node:assert/strict';
import {
  assertMe72DataExecutionLocked,
  getMe72ReadOnlyDataProfile,
  listMe72ReadOnlyDataProfiles,
} from '../public/me72-readonly-data-profile.js';

test('roughness profile is reference-verified but execution-locked', () => {
  const profile=getMe72ReadOnlyDataProfile('e39-dme-me72-cylinder-roughness');
  assert.equal(profile.protocol,'KWP2000_BMW');
  assert.equal(profile.operation,'LIVE_DATA_SNAPSHOT');
  assert.equal(profile.dataIdentifier,'0x4003');
  assert.equal(profile.verificationState,'REFERENCE_VERIFIED');
  assert.equal(profile.implementationState,'PARSER_IMPLEMENTED');
  assert.equal(profile.executionEnabled,false);
  assert.equal(profile.requiresVerifiedIdentity,true);
  assert.equal(profile.requiresNativeAttestation,true);
  assert.equal(profile.txBytesExposed,false);
  assert.equal(profile.writesEnabled,false);
  assert.equal(listMe72ReadOnlyDataProfiles().length,1);
  assert.equal(assertMe72DataExecutionLocked(profile.id),profile);
});
