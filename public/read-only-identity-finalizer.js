import { requireVerifiedIdentityParserProfile } from './identity-parser-profile.js';

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
      || !Number.isInteger(value.brokerEvidencedAttemptCount)
      || value.brokerEvidencedAttemptCount < 2
      || value.brokerEvidencedAttemptCount > value.brokerAttemptCount
      || !Array.isArray(value.brokerEvidencedAttempts)
      || value.brokerEvidencedAttempts.length !== value.brokerEvidencedAttemptCount
      || value.brokerEvidencedAttempts.some(item =>
        !item || typeof item !== 'object'
        || typeof item.requestId !== 'string'
        || !/^[A-Za-z0-9._:-]{8,64}$/.test(item.requestId)
        || !Number.isSafeInteger(item.nativeReceiveReceipt)
        || item.nativeReceiveReceipt < 1)
      || value.rawSerialWriteExposed !== false
      || value.identityVerified !== false
      || value.ecuVerified !== false
      || value.writesEnabled !== false
      || value.flashEnabled !== false) {
    throw new TypeError('Invalid desktop local attestation');
  }
  const brokerEvidencedAttempts = Object.freeze(
    value.brokerEvidencedAttempts.map(item => Object.freeze({
      requestId: item.requestId,
      nativeReceiveReceipt: item.nativeReceiveReceipt,
    }))
  );
  const requestIds = brokerEvidencedAttempts.map(item => item.requestId);
  const receipts = brokerEvidencedAttempts.map(item => item.nativeReceiveReceipt);
  if (new Set(requestIds).size !== requestIds.length
      || new Set(receipts).size !== receipts.length) {
    throw new TypeError('Invalid desktop local attestation ledger');
  }
  return Object.freeze({ ...value, brokerEvidencedAttempts });
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
      || !Array.isArray(correlationSnapshot.confirmedRequestIds)
      || !Array.isArray(correlationSnapshot.confirmedNativeReceipts)
      || correlationSnapshot.confirmedRequestIds.length !== correlationSnapshot.confirmations
      || correlationSnapshot.confirmedNativeReceipts.length !== correlationSnapshot.confirmations
      || correlationSnapshot.confirmedRequestIds.some(id =>
        typeof id !== 'string' || !/^[A-Za-z0-9._:-]{8,64}$/.test(id))
      || correlationSnapshot.confirmedNativeReceipts.some(receipt =>
        !Number.isSafeInteger(receipt) || receipt < 1)
      || new Set(correlationSnapshot.confirmedRequestIds).size !== correlationSnapshot.confirmedRequestIds.length
      || new Set(correlationSnapshot.confirmedNativeReceipts).size !== correlationSnapshot.confirmedNativeReceipts.length
      || typeof correlationSnapshot.moduleIdentity !== 'string'
      || !/^[A-Za-z0-9._-]{2,64}$/.test(correlationSnapshot.moduleIdentity)) {
    throw new TypeError('Repeated correlated identity candidate required');
  }

  const parserProfile = requireVerifiedIdentityParserProfile({
    operationId: correlationSnapshot.operationId,
    protocol: correlationSnapshot.protocol,
    moduleFamily: correlationSnapshot.moduleFamily,
  });

  const attestation = validateDesktopLocalAttestation(localAttestation);
  if (attestation.epoch !== correlationSnapshot.epoch
      || attestation.protocol !== correlationSnapshot.protocol) {
    throw new TypeError('Local attestation does not match correlation session');
  }

  const nativeLedger = new Map(
    attestation.brokerEvidencedAttempts.map(item => [
      item.requestId,
      item.nativeReceiveReceipt,
    ])
  );
  for (let i = 0; i < correlationSnapshot.confirmedRequestIds.length; i++) {
    const requestId = correlationSnapshot.confirmedRequestIds[i];
    const receipt = correlationSnapshot.confirmedNativeReceipts[i];
    if (nativeLedger.get(requestId) !== receipt) {
      throw new TypeError('Native evidence ledger does not match correlation ledger');
    }
  }

  return Object.freeze({
    stage: 'READ_ONLY_IDENTITY_VERIFIED',
    epoch: correlationSnapshot.epoch,
    protocol: correlationSnapshot.protocol,
    operationId: correlationSnapshot.operationId,
    moduleFamily: correlationSnapshot.moduleFamily,
    moduleIdentity: correlationSnapshot.moduleIdentity,
    confirmations: correlationSnapshot.confirmations,
    evidenceRequestIds: Object.freeze([...correlationSnapshot.confirmedRequestIds]),
    nativeReceiveReceipts: Object.freeze([...correlationSnapshot.confirmedNativeReceipts]),
    parserProfileId: parserProfile.id,
    attestationSequence: attestation.sequence,
    identityVerified: true,
    ecuVerified: false,
    writesEnabled: false,
    flashEnabled: false,
  });
}
