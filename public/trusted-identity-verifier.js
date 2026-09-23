import { validateReadOnlyRequestPlan } from './read-only-request-registry.js';
import { assessModuleIdentityCandidate } from './module-identity-evidence.js';

export class TrustedIdentityVerifier {
  #epoch;
  #operationId;
  #protocol;
  #moduleFamily;
  #seenRequestIds = new Set();
  #acceptedIdentity = null;
  #confirmations = 0;

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
    if (this.#seenRequestIds.has(plan.requestId)) {
      return blocked('REPLAY_REJECTED', this.#confirmations);
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
        identityVerified: false,
        ecuVerified: false,
        writesEnabled: false,
        flashEnabled: false,
      });
    }

    if (this.#acceptedIdentity === null) {
      this.#acceptedIdentity = candidate.moduleIdentity;
      this.#confirmations = 1;
      return Object.freeze({
        correlated: true,
        moduleIdentityEligible: true,
        stage: 'IDENTITY_CONFIRMATION_REQUIRED',
        moduleIdentity: this.#acceptedIdentity,
        confirmations: 1,
        identityVerified: false,
        ecuVerified: false,
        writesEnabled: false,
        flashEnabled: false,
      });
    }

    if (candidate.moduleIdentity !== this.#acceptedIdentity) {
      this.#acceptedIdentity = null;
      this.#confirmations = 0;
      return Object.freeze({
        correlated: true,
        moduleIdentityEligible: false,
        stage: 'IDENTITY_CONFLICT_RESET',
        moduleIdentity: null,
        confirmations: 0,
        identityVerified: false,
        ecuVerified: false,
        writesEnabled: false,
        flashEnabled: false,
      });
    }

    this.#confirmations += 1;
    const verified = this.#confirmations >= 2;
    return Object.freeze({
      correlated: true,
      moduleIdentityEligible: true,
      stage: verified ? 'READ_ONLY_IDENTITY_VERIFIED' : 'IDENTITY_CONFIRMATION_REQUIRED',
      moduleIdentity: this.#acceptedIdentity,
      confirmations: this.#confirmations,
      identityVerified: verified,
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
      identityVerified: this.#confirmations >= 2,
      ecuVerified: false,
      writesEnabled: false,
      flashEnabled: false,
    });
  }

  reset() {
    this.#seenRequestIds.clear();
    this.#acceptedIdentity = null;
    this.#confirmations = 0;
  }
}

function blocked(stage, confirmations) {
  return Object.freeze({
    correlated: false,
    moduleIdentityEligible: false,
    stage,
    moduleIdentity: null,
    confirmations,
    identityVerified: false,
    ecuVerified: false,
    writesEnabled: false,
    flashEnabled: false,
  });
}
