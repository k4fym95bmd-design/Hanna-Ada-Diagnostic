const profiles = Object.freeze({
  'e39-dme-me72-module-identity': Object.freeze({
    version: 1,
    id: 'e39-me72-identity-parser',
    operationId: 'e39-dme-me72-module-identity',
    protocol: 'KWP2000_BMW',
    moduleFamily: 'DME_ME72',
    verificationState: 'UNVERIFIED',
    implementationState: 'NOT_IMPLEMENTED',
    identitySource: 'RAW_FRAME_PROFILE_PARSER',
    sourceRefs: Object.freeze([
      'EdiabasLib KWP2000 identification path: reference only; exact ME7.2 byte mapping not yet verified',
    ]),
  }),
  'e39-legacy-module-identity': Object.freeze({
    version: 1,
    id: 'e39-legacy-ds2-identity-parser',
    operationId: 'e39-legacy-module-identity',
    protocol: 'DS2',
    moduleFamily: 'E39_LEGACY',
    verificationState: 'UNVERIFIED',
    implementationState: 'NOT_IMPLEMENTED',
    identitySource: 'RAW_FRAME_PROFILE_PARSER',
    sourceRefs: Object.freeze([
      'Legacy E39 DS2 identity format requires module-specific verification before use',
    ]),
  }),
});

export function getIdentityParserProfile(operationId) {
  const profile = profiles[operationId];
  if (!profile) throw new TypeError('Unknown identity parser profile');
  return profile;
}

export function isIdentityParserVerified(operationId) {
  const profile = getIdentityParserProfile(operationId);
  return profile.verificationState === 'VERIFIED'
    && profile.implementationState === 'IMPLEMENTED';
}

export function requireVerifiedIdentityParserProfile({
  operationId,
  protocol,
  moduleFamily,
} = {}) {
  const profile = getIdentityParserProfile(operationId);
  if (profile.protocol !== protocol || profile.moduleFamily !== moduleFamily) {
    throw new TypeError('Identity parser profile mismatch');
  }
  if (profile.verificationState !== 'VERIFIED'
      || profile.implementationState !== 'IMPLEMENTED') {
    throw new TypeError('VERIFIED_PROFILE_PARSER_REQUIRED');
  }
  return profile;
}

export function listIdentityParserProfiles() {
  return Object.freeze(Object.values(profiles));
}
