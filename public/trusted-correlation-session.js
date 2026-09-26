import {
  getReadOnlyRequest,
  instantiateReadOnlyRequest,
} from './read-only-request-registry.js';
import { TrustedIdentityVerifier } from './trusted-identity-verifier.js';

const MAX_CORRELATION_ATTEMPTS = 32;

export class TrustedCorrelationSession {
  #epoch;
  #operation;
  #verifier;
  #issuedRequestIds = new Set();
  #activePlan = null;

  constructor({ epoch, operationId } = {}) {
    if (!Number.isSafeInteger(epoch) || epoch < 1) throw new TypeError('Invalid session epoch');
    const operation = getReadOnlyRequest(operationId);
    this.#epoch = epoch;
    this.#operation = operation;
    this.#verifier = new TrustedIdentityVerifier({
      epoch,
      operationId: operation.id,
      protocol: operation.protocol,
      moduleFamily: operation.moduleFamily,
    });
  }

  prepareAttempt(requestId) {
    if (this.#verifier.snapshot().repeatCandidateReady) {
      throw new TypeError('Repeated identity candidate already collected; local attestation is required');
    }
    if (this.#activePlan) throw new TypeError('Request token already active');
    if (this.#issuedRequestIds.size >= MAX_CORRELATION_ATTEMPTS) {
      throw new TypeError('Correlation attempt limit reached; reset session');
    }

    const plan = instantiateReadOnlyRequest(this.#operation.id, {
      epoch: this.#epoch,
      requestId,
    });
    if (this.#issuedRequestIds.has(plan.requestId)) {
      throw new TypeError('Request id replay');
    }

    this.#issuedRequestIds.add(plan.requestId);
    this.#activePlan = plan;
    return Object.freeze({ ...plan });
  }

  consumeAttempt({
    receiveEvidence,
    responseRequestId,
    moduleIdentity,
  } = {}) {
    if (!this.#activePlan) {
      return blocked('NO_ACTIVE_REQUEST', this.snapshot());
    }

    const plan = this.#activePlan;
    this.#activePlan = null;

    const result = this.#verifier.recordAttempt({
      requestPlan: plan,
      receiveEvidence,
      responseRequestId,
      moduleIdentity,
    });

    return Object.freeze({
      ...result,
      requestId: plan.requestId,
      activeRequest: false,
      txBytesExposed: false,
      writeLike: false,
      ecuVerified: false,
      writesEnabled: false,
      flashEnabled: false,
    });
  }

  cancelActiveAttempt() {
    if (!this.#activePlan) return this.snapshot();
    this.#activePlan = null;
    return this.snapshot();
  }

  snapshot() {
    const verifier = this.#verifier.snapshot();
    return Object.freeze({
      epoch: this.#epoch,
      operationId: this.#operation.id,
      protocol: this.#operation.protocol,
      moduleFamily: this.#operation.moduleFamily,
      activeRequest: !!this.#activePlan,
      activeRequestId: this.#activePlan?.requestId || null,
      confirmations: verifier.confirmations,
      attemptCount: this.#issuedRequestIds.size,
      maxAttempts: MAX_CORRELATION_ATTEMPTS,
      moduleIdentity: verifier.moduleIdentity,
      confirmedRequestIds: verifier.confirmedRequestIds,
      confirmedNativeReceipts: verifier.confirmedNativeReceipts,
      repeatCandidateReady: verifier.repeatCandidateReady,
      localAttestationRequired: true,
      identityVerified: false,
      txBytesExposed: false,
      writeLike: false,
      ecuVerified: false,
      writesEnabled: false,
      flashEnabled: false,
    });
  }

  reset() {
    this.#activePlan = null;
    this.#issuedRequestIds.clear();
    this.#verifier.reset();
  }
}

function blocked(stage, snapshot) {
  return Object.freeze({
    correlated: false,
    moduleIdentityEligible: false,
    stage,
    moduleIdentity: null,
    confirmations: snapshot.confirmations,
    repeatCandidateReady: snapshot.repeatCandidateReady === true,
    localAttestationRequired: true,
    identityVerified: false,
    activeRequest: snapshot.activeRequest,
    txBytesExposed: false,
    writeLike: false,
    ecuVerified: false,
    writesEnabled: false,
    flashEnabled: false,
  });
}
