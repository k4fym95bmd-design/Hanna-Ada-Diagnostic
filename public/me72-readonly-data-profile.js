const roughnessProfile=Object.freeze({
    version:1,
    id:'e39-me72-roughness-4003',
    operationId:'e39-dme-me72-cylinder-roughness',
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
  });

const engineSnapshotProfile=Object.freeze({
  version:1,
  id:'e39-me72-engine-snapshot-4000',
  operationId:'e39-dme-me72-engine-snapshot',
  vehicleFamily:'BMW_E39',
  moduleFamily:'DME_ME72',
  protocol:'KWP2000_BMW',
  operation:'LIVE_DATA_SNAPSHOT',
  dataIdentifier:'0x4000',
  parserId:'e39-me72-engine-snapshot-4000-v1',
  verificationState:'REFERENCE_VERIFIED',
  implementationState:'NATIVE_EXECUTOR_IMPLEMENTED',
  executionState:'NATIVE_ATTESTATION_GATED',
  executorId:'desktop_execute_me72_engine_snapshot',
  executionEnabled:true,
  requiresVerifiedIdentity:true,
  requiresNativeAttestation:true,
  txBytesExposed:false,
  writeLike:false,
  ecuVerified:false,
  writesEnabled:false,
  flashEnabled:false,
  sourceRefs:Object.freeze([
    'pBmwScanner me72.py: tested ME7.2/M62TU KWP2000 request 0x22 0x40 0x00 with reference response and scaling',
  ]),
});

const fuelAdaptationProfile=Object.freeze({
  version:1,
  id:'e39-me72-fuel-adaptation-4004',
  operationId:'e39-dme-me72-fuel-adaptation',
  vehicleFamily:'BMW_E39',
  moduleFamily:'DME_ME72',
  protocol:'KWP2000_BMW',
  operation:'LIVE_DATA_SNAPSHOT',
  dataIdentifier:'0x4004',
  parserId:'e39-me72-fuel-adaptation-4004-v1',
  verificationState:'REFERENCE_VERIFIED',
  implementationState:'NATIVE_EXECUTOR_IMPLEMENTED',
  executionState:'NATIVE_ATTESTATION_GATED',
  executorId:'desktop_execute_me72_fuel_adaptation',
  executionEnabled:true,
  requiresVerifiedIdentity:true,
  requiresNativeAttestation:true,
  txBytesExposed:false,
  writeLike:false,
  ecuVerified:false,
  writesEnabled:false,
  flashEnabled:false,
  sourceRefs:Object.freeze([
    'pBmwScanner me72.py: tested ME7.2/M62TU KWP2000 request 0x22 0x40 0x04 with signed adaptation scaling',
  ]),
});

const readinessProfile=Object.freeze({
  version:1,
  id:'e39-me72-readiness-4007',
  operationId:'e39-dme-me72-readiness-status',
  vehicleFamily:'BMW_E39',
  moduleFamily:'DME_ME72',
  protocol:'KWP2000_BMW',
  operation:'LIVE_DATA_SNAPSHOT',
  dataIdentifier:'0x4007',
  parserId:'e39-me72-readiness-4007-v1',
  verificationState:'REFERENCE_VERIFIED',
  implementationState:'NATIVE_EXECUTOR_IMPLEMENTED',
  executionState:'NATIVE_ATTESTATION_GATED',
  executorId:'desktop_execute_me72_readiness',
  executionEnabled:true,
  requiresVerifiedIdentity:true,
  requiresNativeAttestation:true,
  txBytesExposed:false,
  writeLike:false,
  ecuVerified:false,
  writesEnabled:false,
  flashEnabled:false,
  sourceRefs:Object.freeze([
    'pBmwScanner me72.py: tested ME7.2/M62TU KWP2000 request 0x22 0x40 0x07 with documented readiness bit mapping',
  ]),
});

const profiles=Object.freeze({
  [roughnessProfile.id]:roughnessProfile,
  [engineSnapshotProfile.id]:engineSnapshotProfile,
  [fuelAdaptationProfile.id]:fuelAdaptationProfile,
  [readinessProfile.id]:readinessProfile,
});

export function getMe72ReadOnlyDataProfile(id){
  const direct=profiles[id];
  if(direct) return direct;
  const byOperation=Object.values(profiles).find(profile => profile.operationId === id);
  if(!byOperation) throw new TypeError('Unknown ME7.2 read-only data profile');
  return byOperation;
}

export function listMe72ReadOnlyDataProfiles(){
  return Object.freeze(Object.values(profiles));
}

const allowedExecutors=Object.freeze({
  'e39-me72-roughness-4003':'desktop_execute_me72_roughness',
  'e39-me72-engine-snapshot-4000':'desktop_execute_me72_engine_snapshot',
  'e39-me72-fuel-adaptation-4004':'desktop_execute_me72_fuel_adaptation',
  'e39-me72-readiness-4007':'desktop_execute_me72_readiness',
});

export function assertMe72DataExecutionGated(id){
  const profile=getMe72ReadOnlyDataProfile(id);
  if(profile.executionEnabled !== true
      || profile.executionState !== 'NATIVE_ATTESTATION_GATED'
      || allowedExecutors[profile.id] !== profile.executorId
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
