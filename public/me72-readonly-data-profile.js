const profiles=Object.freeze({
  'e39-dme-me72-cylinder-roughness':Object.freeze({
    version:1,
    id:'e39-me72-roughness-4003',
    vehicleFamily:'BMW_E39',
    moduleFamily:'DME_ME72',
    protocol:'KWP2000_BMW',
    operation:'LIVE_DATA_SNAPSHOT',
    dataIdentifier:'0x4003',
    parserId:'e39-me72-roughness-4003-v1',
    verificationState:'REFERENCE_VERIFIED',
    implementationState:'NATIVE_EXECUTOR_IMPLEMENTED',
    executionState:'NATIVE_ATTESTATION_GATED',
    executorId:'desktop_execute_me72_roughness',
    executionEnabled:true,
    requiresVerifiedIdentity:true,
    requiresNativeAttestation:true,
    txBytesExposed:false,
    writeLike:false,
    ecuVerified:false,
    writesEnabled:false,
    flashEnabled:false,
    sourceRefs:Object.freeze([
      'pBmwScanner me72.py: tested ME7.2/M62TU KWP2000 request 0x22 0x40 0x03 and eight signed roughness channels',
    ]),
  }),
});

export function getMe72ReadOnlyDataProfile(id){
  const profile=profiles[id];
  if(!profile) throw new TypeError('Unknown ME7.2 read-only data profile');
  return profile;
}

export function listMe72ReadOnlyDataProfiles(){
  return Object.freeze(Object.values(profiles));
}

export function assertMe72DataExecutionGated(id){
  const profile=getMe72ReadOnlyDataProfile(id);
  if(profile.executionEnabled !== true
      || profile.executionState !== 'NATIVE_ATTESTATION_GATED'
      || profile.executorId !== 'desktop_execute_me72_roughness'
      || profile.requiresVerifiedIdentity !== true
      || profile.requiresNativeAttestation !== true
      || profile.txBytesExposed !== false
      || profile.writeLike !== false
      || profile.writesEnabled !== false
      || profile.flashEnabled !== false){
    throw new TypeError('Unsafe ME7.2 read-only data profile');
  }
  return profile;
}
