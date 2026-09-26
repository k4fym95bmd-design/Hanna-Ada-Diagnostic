import { validateIcomReadOnlyEnvelope } from './icom-readonly-evidence.mjs';

// In-memory, single-session cache for a future LOCAL read-only ICOM adapter.
// No persistence, LAN discovery, vehicle TX, coding, actuation, DTC erase or flash.
export class IcomEvidenceStore {
  #sessionId = null;
  #value = null;
  #acceptedAt = 0;
  #maxAgeMs;
  #clock;

  constructor({ maxAgeMs = 5000, clock = Date.now } = {}) {
    if (!Number.isInteger(maxAgeMs) || maxAgeMs < 250 || maxAgeMs > 60000) {
      throw new TypeError('Invalid ICOM evidence TTL');
    }
    if (typeof clock !== 'function') throw new TypeError('Clock function required');
    this.#maxAgeMs = maxAgeMs;
    this.#clock = clock;
  }

  beginSession(sessionId) {
    if (typeof sessionId !== 'string' || sessionId.length < 16 || sessionId.length > 128) {
      throw new TypeError('Invalid ICOM session');
    }
    this.#sessionId = sessionId;
    this.#value = null;
    this.#acceptedAt = 0;
    return this.snapshot();
  }

  accept(envelope) {
    if (!this.#sessionId) throw new TypeError('No active ICOM session');
    const normalized = validateIcomReadOnlyEnvelope(envelope, this.#sessionId);
    this.#value = normalized;
    this.#acceptedAt = Number(this.#clock());
    return this.snapshot();
  }

  snapshot() {
    const now = Number(this.#clock());
    const fresh = !!this.#value && Number.isFinite(now) && now >= this.#acceptedAt
      && now - this.#acceptedAt <= this.#maxAgeMs;
    if (!fresh) {
      return Object.freeze({
        sessionId: this.#sessionId,
        active: !!this.#sessionId,
        freshEvidence: false,
        icomReachable: false,
        ecuVerified: false,
        modules: Object.freeze([]),
        writesEnabled: false,
        flashEnabled: false,
      });
    }
    return Object.freeze({
      sessionId: this.#sessionId,
      active: true,
      freshEvidence: true,
      icomReachable: true,
      ecuVerified: this.#value.ecuVerified,
      modules: Object.freeze(this.#value.modules.map(module => ({ ...module }))),
      writesEnabled: false,
      flashEnabled: false,
    });
  }

  endSession() {
    this.#sessionId = null;
    this.#value = null;
    this.#acceptedAt = 0;
    return this.snapshot();
  }
}
