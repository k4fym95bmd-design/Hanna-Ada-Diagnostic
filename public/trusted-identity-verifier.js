import { validateReadOnlyRequestPlan } from './read-only-request-registry.js';
import { assessModuleIdentityCandidate } from './module-identity-evidence.js';

const MAX_VERIFIER_ATTEMPTS = 32;

export class TrustedIdentityVerifier {
  #epoch;
  #operationId;
  #protocol;
  #moduleFamily;
  #seenRequestIds = new Set();
  #acceptedIdentity = null;
  #confirmations = 0;
  #confirmedRequestIds = [];
  #confirmedNativeReceipts = [];

  constructor({ epoch, operationId, protocol, moduleFamily } = {}) {
    if (!Number.isSafeInteger(epoch) || epoch < 1) throw new TypeError('Invalid verifier epoch');
    if (typeof operationId !== 'string' || !operationId) throw new TypeError('Invalid operation id');
    if (!['DS2', 'KWP2000_BMW'].includes(protocol)) throw new TypeError('Invalid protocol');
    if (typeof moduleFamily !== 'string' || !moduleFamily) throw new TypeError('Invalid module family');
    this.#epoch = epoch;
    this.#operationId = operationId;
    this.#protocol = protocol;
    this.#moduleFamily = moduleFamily;
  }

  recordAttempt({
    requestPlan,
    receiveEvidence,
    responseRequestId,
    moduleIdentity,
  } = {}) {
    const plan = validateReadOnlyRequestPlan(requestPlan);

    if (plan.epoch !== this.#epoch) return blocked('STALE_EPOCH', this.#confirmations);
    if (plan.operationId !== this.#operationId
        || plan.protocol !== this.#protocol
        || plan.moduleFamily !== this.#moduleFamily) {
      return blocked('VERIFIER_PLAN_MISMATCH', this.#confirmations);
    }
    if (this.#confirmations >= 2) {
      return Object.freeze({
        ...blocked('LOCAL_ATTESTATION_REQUIRED', this.#confirmations),
        repeatCandidateReady: true,
      });
    }
    if (this.#seenRequestIds.has(plan.requestId)) {
      return blocked('REPLAY_REJECTED', this.#confirmations);
    }
    if (this.#seenRequestIds.size >= MAX_VERIFIER_ATTEMPTS) {
      return blocked('ATTEMPT_LIMIT_REACHED', this.#confirmations);
    }

    this.#seenRequestIds.add(plan.requestId);

    const candidate = assessModuleIdentityCandidate({
      requestPlan: plan,
      receiveEvidence,
      responseRequestId,
      moduleIdentity,
    });

    if (!candidate.correlated || !candidate.moduleIdentityEligible) {
      return Object.freeze({
        ...candidate,
        confirmations: this.#confirmations,
        repeatCandidateReady: false,
        localAttestationRequired: true,
        identityVerified: false,
        ecuVerified: false,
        writesEnabled: false,
        flashEnabled: false,
      });
    }

    const nativeReceipt = receiveEvidence?.nativeReadReceipt;
    if (!Number.isSafeInteger(nativeReceipt) || nativeReceipt < 1) {
      return blocked('NATIVE_RECEIPT_REQUIRED', this.#confirmations);
    }
    if (this.#confirmedNativeReceipts.includes(nativeReceipt)) {
      return blocked('NATIVE_RECEIPT_REPLAY_REJECTED', this.#confirmations);
    }

    if (this.#acceptedIdentity === null) {
      this.#acceptedIdentity = candidate.moduleIdentity;
      this.#confirmations = 1;
      this.#confirmedRequestIds.push(plan.requestId);
      this.#confirmedNativeReceipts.push(nativeReceipt);
      return Object.freeze({
        correlated: true,
        moduleIdentityEligible: true,
        stage: 'IDENTITY_CONFIRMATION_REQUIRED',
        moduleIdentity: this.#acceptedIdentity,
        confirmations: 1,
        confirmedRequestIds: Object.freeze([...this.#confirmedRequestIds]),
        confirmedNativeReceipts: Object.freeze([...this.#confirmedNativeReceipts]),
        repeatCandidateReady: false,
        localAttestationRequired: true,
        identityVerified: false,
        ecuVerified: false,
        writesEnabled: false,
        flashEnabled: false,
      });
    }

    if (candidate.moduleIdentity !== this.#acceptedIdentity) {
      this.#acceptedIdentity = null;
      this.#confirmations = 0;
      this.#confirmedRequestIds = [];
      this.#confirmedNativeReceipts = [];
      return Object.freeze({
        correlated: true,
        moduleIdentityEligible: false,
        stage: 'IDENTITY_CONFLICT_RESET',
        moduleIdentity: null,
        confirmations: 0,
        repeatCandidateReady: false,
        localAttestationRequired: true,
        identityVerified: false,
        ecuVerified: false,
        writesEnabled: false,
        flashEnabled: false,
      });
    }

    this.#confirmations += 1;
    this.#confirmedRequestIds.push(plan.requestId);
    this.#confirmedNativeReceipts.push(nativeReceipt);
    const repeatCandidateReady = this.#confirmations >= 2;
    return Object.freeze({
      correlated: true,
      moduleIdentityEligible: true,
      stage: repeatCandidateReady ? 'REPEATED_CORRELATED_IDENTITY_CANDIDATE' : 'IDENTITY_CONFIRMATION_REQUIRED',
      moduleIdentity: this.#acceptedIdentity,
      confirmations: this.#confirmations,
      confirmedRequestIds: Object.freeze([...this.#confirmedRequestIds]),
      confirmedNativeReceipts: Object.freeze([...this.#confirmedNativeReceipts]),
      repeatCandidateReady,
      localAttestationRequired: true,
      identityVerified: false,
      ecuVerified: false,
      writesEnabled: false,
      flashEnabled: false,
    });
  }

  snapshot() {
    return Object.freeze({
      epoch: this.#epoch,
      operationId: this.#operationId,
      protocol: this.#protocol,
      moduleFamily: this.#moduleFamily,
      confirmations: this.#confirmations,
      moduleIdentity: this.#acceptedIdentity,
      confirmedRequestIds: Object.freeze([...this.#confirmedRequestIds]),
      confirmedNativeReceipts: Object.freeze([...this.#confirmedNativeReceipts]),
      attemptCount: this.#seenRequestIds.size,
      maxAttempts: MAX_VERIFIER_ATTEMPTS,
      repeatCandidateReady: this.#confirmations >= 2,
      localAttestationRequired: true,
      identityVerified: false,
      ecuVerified: false,
      writesEnabled: false,
      flashEnabled: false,
    });
  }

  reset() {
    this.#seenRequestIds.clear();
    this.#acceptedIdentity = null;
    this.#confirmations = 0;
    this.#confirmedRequestIds = [];
    this.#confirmedNativeReceipts = [];
  }
}

function blocked(stage, confirmations) {
  return Object.freeze({
    correlated: false,
    moduleIdentityEligible: false,
    stage,
    moduleIdentity: null,
    confirmations,
    repeatCandidateReady: false,
    localAttestationRequired: true,
    identityVerified: false,
    ecuVerified: false,
    writesEnabled: false,
    flashEnabled: false,
  });
}
