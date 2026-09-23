import {
  getReadOnlyRequest,
  instantiateReadOnlyRequest,
} from './read-only-request-registry.js';
import { TrustedIdentityVerifier } from './trusted-identity-verifier.js';

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
    if (this.#verifier.snapshot().identityVerified) {
      throw new TypeError('Identity already verified for this session');
    }
    if (this.#activePlan) throw new TypeError('Request token already active');
    if (typeof requestId !== 'string' || requestId.length < 8 || requestId.length > 128) {
      throw new TypeError('Invalid request id');
    }
    if (this.#issuedRequestIds.has(requestId)) {
      throw new TypeError('Request id replay');
    }

    const plan = instantiateReadOnlyRequest(this.#operation.id, {
      epoch: this.#epoch,
      requestId,
    });
    this.#issuedRequestIds.add(requestId);
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
      moduleIdentity: verifier.moduleIdentity,
      identityVerified: verifier.identityVerified,
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
    identityVerified: snapshot.identityVerified,
    activeRequest: snapshot.activeRequest,
    txBytesExposed: false,
    writeLike: false,
    ecuVerified: false,
    writesEnabled: false,
    flashEnabled: false,
  });
}
