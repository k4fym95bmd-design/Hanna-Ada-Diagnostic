import { listMe72ReadOnlyDataProfiles } from './me72-readonly-data-profile.js';

export const ME72_CAPABILITY_MATRIX_VERSION=1;

export const Me72CapabilityState=Object.freeze({
  REFERENCE_VERIFIED:'REFERENCE_VERIFIED',
  REFERENCE_CONFLICT_AWARE:'REFERENCE_CONFLICT_AWARE',
  REFERENCE_CONTRACT_VERIFIED:'REFERENCE_CONTRACT_VERIFIED',
  BLOCKED_REFERENCE_INCONSISTENT:'BLOCKED_REFERENCE_INCONSISTENT',
  NOT_EXPOSED:'NOT_EXPOSED',
});

const blocked=Object.freeze([
  Object.freeze({
    id:'e39-me72-dtc-list',
    label:'Full DTC list',
    state:Me72CapabilityState.BLOCKED_REFERENCE_INCONSISTENT,
    executionEnabled:false,
    executorId:null,
    txBytesExposed:false,
    writeLike:false,
    clearDtcEnabled:false,
    reason:'DS2PlusPlus ME7.2 dtc_load_bank1 duplicates dtc_count A2 00 across every known revision; no distinct, trustworthy DTC-list response contract is available.',
  }),
  Object.freeze({
    id:'e39-me72-clear-dtc',
    label:'Clear DTC',
    state:Me72CapabilityState.NOT_EXPOSED,
    executionEnabled:false,
    executorId:null,
    txBytesExposed:false,
    writeLike:true,
    clearDtcEnabled:false,
    reason:'No write-like DTC clearing surface is exposed.',
  }),
  Object.freeze({
    id:'e39-me72-coding',
    label:'Coding',
    state:Me72CapabilityState.NOT_EXPOSED,
    executionEnabled:false,
    executorId:null,
    txBytesExposed:false,
    writeLike:true,
    reason:'Coding is outside the verified read-only boundary.',
  }),
  Object.freeze({
    id:'e39-me72-actuation',
    label:'Actuation',
    state:Me72CapabilityState.NOT_EXPOSED,
    executionEnabled:false,
    executorId:null,
    txBytesExposed:false,
    writeLike:true,
    reason:'Status bits are readable; actuator commands are not exposed.',
  }),
  Object.freeze({
    id:'e39-me72-flash',
    label:'Flash/programming',
    state:Me72CapabilityState.NOT_EXPOSED,
    executionEnabled:false,
    executorId:null,
    txBytesExposed:false,
    writeLike:true,
    reason:'Flash/programming is not part of the read-only diagnostic host.',
  }),
]);

function normalizeProfile(profile){
  const state=profile.verificationState;
  if(!Object.values(Me72CapabilityState).includes(state)){
    throw new TypeError('Unknown ME7.2 evidence state');
  }
  return Object.freeze({
    id:profile.id,
    label:profile.operation,
    state,
    executionEnabled:profile.executionEnabled===true,
    executorId:profile.executorId,
    txBytesExposed:profile.txBytesExposed,
    writeLike:profile.writeLike,
    clearDtcEnabled:profile.clearDtcEnabled===true,
    actuationEnabled:profile.actuationEnabled===true,
    hardwareVerified:false,
  });
}

export function listMe72Capabilities(){
  return Object.freeze([
    ...listMe72ReadOnlyDataProfiles().map(normalizeProfile),
    ...blocked,
  ]);
}

export function summarizeMe72Capabilities(){
  const capabilities=listMe72Capabilities();
  const enabled=capabilities.filter(item=>item.executionEnabled===true);
  const referenceVerified=enabled.filter(item=>item.state===Me72CapabilityState.REFERENCE_VERIFIED).length;
  const conflictAware=enabled.filter(item=>item.state===Me72CapabilityState.REFERENCE_CONFLICT_AWARE).length;
  const contractVerified=enabled.filter(item=>item.state===Me72CapabilityState.REFERENCE_CONTRACT_VERIFIED).length;
  const blockedCount=capabilities.filter(item=>item.executionEnabled!==true).length;
  return Object.freeze({
    version:ME72_CAPABILITY_MATRIX_VERSION,
    enabledCount:enabled.length,
    referenceVerified,
    conflictAware,
    contractVerified,
    blockedCount,
    fullDtcListEnabled:false,
    clearDtcEnabled:false,
    codingEnabled:false,
    actuationEnabled:false,
    flashEnabled:false,
    hardwareVerified:false,
  });
}

export function assertMe72CapabilitySafety(){
  const capabilities=listMe72Capabilities();
  const unsafe=capabilities.filter(item =>
    item.txBytesExposed!==false
    || (item.executionEnabled===true && item.writeLike!==false)
    || item.clearDtcEnabled===true
    || item.actuationEnabled===true
  );
  if(unsafe.length>0) throw new TypeError('Unsafe ME7.2 capability matrix');
  const blockedDtc=capabilities.find(item=>item.id==='e39-me72-dtc-list');
  if(!blockedDtc
      || blockedDtc.state!==Me72CapabilityState.BLOCKED_REFERENCE_INCONSISTENT
      || blockedDtc.executionEnabled!==false){
    throw new TypeError('Full DTC list must remain blocked');
  }
  return true;
}
