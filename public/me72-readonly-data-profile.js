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
    'DS2PlusPlus dme_me7_2.json analog_status: intake camshaft bank 1 start_pos 13 and bank 2 start_pos 15, signed short scale 0.0039 deg',
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

const outputStatusProfile=Object.freeze({
  version:1,
  id:'e39-me72-output-status-4005',
  operationId:'e39-dme-me72-output-status',
  vehicleFamily:'BMW_E39',
  moduleFamily:'DME_ME72',
  protocol:'KWP2000_BMW',
  operation:'STATUS_SNAPSHOT',
  dataIdentifier:'0x4005',
  parserId:'e39-me72-output-status-4005-v1',
  verificationState:'REFERENCE_CONFLICT_AWARE',
  implementationState:'NATIVE_EXECUTOR_IMPLEMENTED',
  executionState:'NATIVE_ATTESTATION_GATED',
  executorId:'desktop_execute_me72_output_status',
  mappingConflict:'POST_CAT_HEATER_BANK_0x40_0x80',
  executionEnabled:true,
  requiresVerifiedIdentity:true,
  requiresNativeAttestation:true,
  txBytesExposed:false,
  writeLike:false,
  actuationEnabled:false,
  ecuVerified:false,
  writesEnabled:false,
  flashEnabled:false,
  sourceRefs:Object.freeze([
    'pBmwScanner me72.py: tested ME7.2/M62TU KWP2000 request 0x22 0x40 0x05',
    'DS2PlusPlus dme_me7_2.json: bit 0x02 secondary-air valve, bit 0x04 secondary-air pump',
    'pBmwScanner vs DS2PlusPlus disagree on post-cat O2 heater bank labels for bits 0x40/0x80; raw bits retained without bank assignment',
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

const dtcCountProfile=Object.freeze({
  version:1,
  id:'e39-me72-dtc-count-a200',
  operationId:'e39-dme-me72-dtc-count',
  vehicleFamily:'BMW_E39',
  moduleFamily:'DME_ME72',
  protocol:'KWP2000_BMW',
  operation:'DTC_COUNT',
  dataIdentifier:null,
  parserId:'e39-me72-dtc-count-a200-v1',
  verificationState:'REFERENCE_CONTRACT_VERIFIED',
  implementationState:'NATIVE_EXECUTOR_IMPLEMENTED',
  executionState:'NATIVE_ATTESTATION_GATED',
  executorId:'desktop_execute_me72_dtc_count',
  executionEnabled:true,
  requiresVerifiedIdentity:true,
  requiresNativeAttestation:true,
  txBytesExposed:false,
  writeLike:false,
  clearDtcEnabled:false,
  ecuVerified:false,
  writesEnabled:false,
  flashEnabled:false,
  sourceRefs:Object.freeze([
    'DS2PlusPlus dpp-json/dme/me-7.2/dme_me7_2.json file_version 5 at commit e67b23710b8f88dc8ae1277d90555a0c2db310d7: dtc_count command A2 00, error_code.count at payload start_pos 1',
    'The same pinned profile also defines dtc_load_bank1 as A2 00 with only error_code.count, so no full-list contract is inferred',
    'No captured ME7.2 A2 00 hardware response vector is claimed',
  ]),
});

const profiles=Object.freeze({
  [roughnessProfile.id]:roughnessProfile,
  [engineSnapshotProfile.id]:engineSnapshotProfile,
  [fuelAdaptationProfile.id]:fuelAdaptationProfile,
  [outputStatusProfile.id]:outputStatusProfile,
  [readinessProfile.id]:readinessProfile,
  [dtcCountProfile.id]:dtcCountProfile,
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
  'e39-me72-output-status-4005':'desktop_execute_me72_output_status',
  'e39-me72-readiness-4007':'desktop_execute_me72_readiness',
  'e39-me72-dtc-count-a200':'desktop_execute_me72_dtc_count',
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
