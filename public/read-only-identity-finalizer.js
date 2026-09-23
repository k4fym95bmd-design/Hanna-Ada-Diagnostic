export function validateDesktopLocalAttestation(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)
      || value.version !== 1
      || value.evidenceContractVersion !== 1
      || value.stage !== 'LOCAL_HOST_ATTESTED'
      || value.host !== 'native-desktop'
      || !Number.isSafeInteger(value.epoch) || value.epoch < 1
      || !Number.isSafeInteger(value.sequence) || value.sequence < 1
      || !['DS2','KWP2000_BMW'].includes(value.protocol)
      || value.transportConfigured !== true
      || value.brokerIdle !== true
      || !Number.isInteger(value.brokerAttemptCount) || value.brokerAttemptCount < 2
      || value.rawSerialWriteExposed !== false
      || value.identityVerified !== false
      || value.ecuVerified !== false
      || value.writesEnabled !== false
      || value.flashEnabled !== false) {
    throw new TypeError('Invalid desktop local attestation');
  }
  return Object.freeze({ ...value });
}

export function finalizeReadOnlyIdentity({
  correlationSnapshot,
  localAttestation,
} = {}) {
  if (!correlationSnapshot || typeof correlationSnapshot !== 'object'
      || !Number.isSafeInteger(correlationSnapshot.epoch)
      || correlationSnapshot.epoch < 1
      || !['DS2','KWP2000_BMW'].includes(correlationSnapshot.protocol)
      || correlationSnapshot.repeatCandidateReady !== true
      || correlationSnapshot.localAttestationRequired !== true
      || correlationSnapshot.identityVerified !== false
      || correlationSnapshot.confirmations < 2
      || typeof correlationSnapshot.moduleIdentity !== 'string'
      || !/^[A-Za-z0-9._-]{2,64}$/.test(correlationSnapshot.moduleIdentity)) {
    throw new TypeError('Repeated correlated identity candidate required');
  }

  const attestation = validateDesktopLocalAttestation(localAttestation);
  if (attestation.epoch !== correlationSnapshot.epoch
      || attestation.protocol !== correlationSnapshot.protocol) {
    throw new TypeError('Local attestation does not match correlation session');
  }

  return Object.freeze({
    stage: 'READ_ONLY_IDENTITY_VERIFIED',
    epoch: correlationSnapshot.epoch,
    protocol: correlationSnapshot.protocol,
    operationId: correlationSnapshot.operationId,
    moduleFamily: correlationSnapshot.moduleFamily,
    moduleIdentity: correlationSnapshot.moduleIdentity,
    confirmations: correlationSnapshot.confirmations,
    attestationSequence: attestation.sequence,
    identityVerified: true,
    ecuVerified: false,
    writesEnabled: false,
    flashEnabled: false,
  });
}
