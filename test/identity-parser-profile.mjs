import test from 'node:test';
import assert from 'node:assert/strict';
import {
  getIdentityParserProfile,
  isIdentityParserVerified,
  listIdentityParserProfiles,
  requireVerifiedIdentityParserProfile,
} from '../public/identity-parser-profile.js';

test('current E39 identity parser profiles are explicit and unverified', () => {
  const me72 = getIdentityParserProfile('e39-dme-me72-module-identity');
  assert.equal(me72.protocol, 'KWP2000_BMW');
  assert.equal(me72.moduleFamily, 'DME_ME72');
  assert.equal(me72.verificationState, 'UNVERIFIED');
  assert.equal(me72.implementationState, 'NOT_IMPLEMENTED');
  assert.equal(isIdentityParserVerified(me72.operationId), false);

  const ds2 = getIdentityParserProfile('e39-legacy-module-identity');
  assert.equal(ds2.protocol, 'DS2');
  assert.equal(ds2.verificationState, 'UNVERIFIED');
  assert.equal(isIdentityParserVerified(ds2.operationId), false);
  assert.equal(listIdentityParserProfiles().length, 2);
});

test('verified-parser gate fails closed for ME7.2 and legacy DS2 today', () => {
  assert.throws(() => requireVerifiedIdentityParserProfile({
    operationId: 'e39-dme-me72-module-identity',
    protocol: 'KWP2000_BMW',
    moduleFamily: 'DME_ME72',
  }), /VERIFIED_PROFILE_PARSER_REQUIRED/);

  assert.throws(() => requireVerifiedIdentityParserProfile({
    operationId: 'e39-legacy-module-identity',
    protocol: 'DS2',
    moduleFamily: 'E39_LEGACY',
  }), /VERIFIED_PROFILE_PARSER_REQUIRED/);
});

test('profile mismatch fails before verification state can be considered', () => {
  assert.throws(() => requireVerifiedIdentityParserProfile({
    operationId: 'e39-dme-me72-module-identity',
    protocol: 'DS2',
    moduleFamily: 'DME_ME72',
  }), /profile mismatch/i);
});
