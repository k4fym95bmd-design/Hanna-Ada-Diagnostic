import test from 'node:test';
import assert from 'node:assert/strict';
import {
  finalizeReadOnlyIdentity,
  validateDesktopLocalAttestation,
} from '../public/read-only-identity-finalizer.js';

const correlation = () => ({
  epoch: 7,
  operationId: 'e39-dme-me72-module-identity',
  protocol: 'KWP2000_BMW',
  moduleFamily: 'DME_ME72',
  confirmations: 2,
  moduleIdentity: 'PN7506366-HW0F-CI01-DIA8-BI60-BW08-BY00-SP001021',
  confirmedRequestIds: ['identity-request-A','identity-request-B'],
  confirmedNativeReceipts: [41,42],
  repeatCandidateReady: true,
  localAttestationRequired: true,
  identityVerified: false,
  ecuVerified: false,
  writesEnabled: false,
  flashEnabled: false,
});

const attestation = () => ({
  version: 1,
  evidenceContractVersion: 1,
  stage: 'LOCAL_HOST_ATTESTED',
  host: 'native-desktop',
  epoch: 7,
  sequence: 3,
  protocol: 'KWP2000_BMW',
  transportConfigured: true,
  brokerIdle: true,
  brokerAttemptCount: 2,
  brokerEvidencedAttemptCount: 2,
  brokerEvidencedAttempts: [
    { operationId:'e39-dme-me72-module-identity', requestId:'identity-request-A', nativeReceiveReceipt:41, nativeIdentityFingerprint:'PN7506366-HW0F-CI01-DIA8-BI60-BW08-BY00-SP001021' },
    { operationId:'e39-dme-me72-module-identity', requestId:'identity-request-B', nativeReceiveReceipt:42, nativeIdentityFingerprint:'PN7506366-HW0F-CI01-DIA8-BI60-BW08-BY00-SP001021' },
  ],
  nativeIdentityFingerprint:'PN7506366-HW0F-CI01-DIA8-BI60-BW08-BY00-SP001021',
  nativeIdentityConsistent:true,
  rawSerialWriteExposed: false,
  identityVerified: false,
  ecuVerified: false,
  writesEnabled: false,
  flashEnabled: false,
});

test('reference-verified ME7.2 parser allows native-attested read-only identity finalization', () => {
  const result = finalizeReadOnlyIdentity({
    correlationSnapshot: correlation(),
    localAttestation: attestation(),
  });
  assert.equal(result.stage, 'READ_ONLY_IDENTITY_VERIFIED');
  assert.equal(result.parserProfileId, 'e39-me72-identity-parser');
  assert.equal(result.identityVerified, true);
  assert.equal(result.ecuVerified, false);
  assert.equal(result.writesEnabled, false);
  assert.equal(result.flashEnabled, false);
});

test('attestation and correlation epoch/protocol must match exactly', () => {
  assert.throws(() => finalizeReadOnlyIdentity({
    correlationSnapshot: correlation(),
    localAttestation: { ...attestation(), epoch: 8 },
  }), /does not match/i);
  assert.throws(() => finalizeReadOnlyIdentity({
    correlationSnapshot: correlation(),
    localAttestation: { ...attestation(), protocol: 'DS2' },
  }), /does not match/i);
});

test('attestation rejects unsafe native capability promotion', () => {
  assert.throws(() => validateDesktopLocalAttestation({
    ...attestation(),
    rawSerialWriteExposed: true,
  }), /invalid/i);
  assert.throws(() => validateDesktopLocalAttestation({
    ...attestation(),
    writesEnabled: true,
  }), /invalid/i);
});

test('one confirmation can never be finalized', () => {
  assert.throws(() => finalizeReadOnlyIdentity({
    correlationSnapshot: { ...correlation(), confirmations: 1, repeatCandidateReady: false },
    localAttestation: attestation(),
  }), /candidate required/i);
});


test('attestation rejects planned-but-not-evidenced attempts', () => {
  assert.throws(() => validateDesktopLocalAttestation({
    ...attestation(),
    brokerAttemptCount: 2,
    brokerEvidencedAttemptCount: 1,
  }), /invalid/i);
});


test('evidenced count cannot exceed broker attempts', () => {
  assert.throws(() => validateDesktopLocalAttestation({
    ...attestation(),
    brokerAttemptCount: 2,
    brokerEvidencedAttemptCount: 3,
  }), /invalid/i);
});


test('native ledger must match correlation request-receipt pairs', () => {
  assert.throws(() => finalizeReadOnlyIdentity({
    correlationSnapshot: correlation(),
    localAttestation: {
      ...attestation(),
      brokerEvidencedAttempts: [
        { operationId:'e39-dme-me72-module-identity', requestId:'identity-request-A', nativeReceiveReceipt:41, nativeIdentityFingerprint:'PN7506366-HW0F-CI01-DIA8-BI60-BW08-BY00-SP001021' },
        { operationId:'e39-dme-me72-module-identity', requestId:'identity-request-B', nativeReceiveReceipt:99, nativeIdentityFingerprint:'PN7506366-HW0F-CI01-DIA8-BI60-BW08-BY00-SP001021' },
      ],
    },
  }), /ledger does not match/i);
});

test('duplicate native ledger receipts are rejected', () => {
  assert.throws(() => validateDesktopLocalAttestation({
    ...attestation(),
    brokerEvidencedAttempts: [
      { operationId:'e39-dme-me72-module-identity', requestId:'identity-request-A', nativeReceiveReceipt:41, nativeIdentityFingerprint:'PN7506366-HW0F-CI01-DIA8-BI60-BW08-BY00-SP001021' },
      { operationId:'e39-dme-me72-module-identity', requestId:'identity-request-B', nativeReceiveReceipt:41, nativeIdentityFingerprint:'PN7506366-HW0F-CI01-DIA8-BI60-BW08-BY00-SP001021' },
    ],
  }), /ledger/i);
});


test('native fingerprint must match parser-derived identity', () => {
  assert.throws(() => finalizeReadOnlyIdentity({
    correlationSnapshot: correlation(),
    localAttestation: {
      ...attestation(),
      nativeIdentityFingerprint:'PN9999999-HW0F-CI01-DIA8-BI60-BW08-BY00-SP001021',
      brokerEvidencedAttempts: attestation().brokerEvidencedAttempts.map(item => ({
        ...item,
        nativeIdentityFingerprint:'PN9999999-HW0F-CI01-DIA8-BI60-BW08-BY00-SP001021',
      })),
    },
  }), /fingerprint does not match/i);
});
