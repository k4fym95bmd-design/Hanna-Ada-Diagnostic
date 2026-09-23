import { usbIdentity } from '../public/kdcan-cable-profile.js';
import { identifyUsbSerialCandidate } from '../public/usb-chipset-candidates.js';

// Single-session binding for the user's photographed K+DCAN USB cable.
// This layer binds USB identity to one local session only. It never transmits,
// selects a BMW protocol, verifies an ECU, clears DTCs, codes, actuates or flashes.
const normalizeFingerprint = value => {
  if (value == null || value === '') return null;
  if (typeof value !== 'string' || !/^[a-f0-9]{16,64}$/i.test(value)) {
    throw new TypeError('Invalid K+DCAN hardware fingerprint');
  }
  return value.toLowerCase();
};

const normalizeSelector = value => {
  if (value === 'A' || value === 'position-1') return 'A';
  if (value === 'B' || value === 'position-2') return 'B';
  if (value === 'UNKNOWN' || value === 'unknown' || value == null) return 'UNKNOWN';
  throw new TypeError('Invalid K+DCAN selector position');
};

const cableEvidence = ({ vendorId, productId, selectorPosition, portOpen }) => {
  const usb = usbIdentity({ vendorId, productId });
  if (!usb.verified) throw new TypeError('Valid USB VID/PID required for K+DCAN binding');

  let chipsetCandidate = 'Nieznany układ lub własny identyfikator';
  try {
    chipsetCandidate = identifyUsbSerialCandidate({ vendorId, productId }).candidate;
  } catch {}

  return Object.freeze({
    vidPid: usb.vidPid,
    chipsetCandidate,
    selectorPosition: normalizeSelector(selectorPosition),
    portOpen: portOpen === true,
    serialDriverVerified: false,
    bmwProtocolVerified: false,
    ecuVerified: false,
    writesEnabled: false,
    flashEnabled: false,
  });
};

export class KdcanReadonlySession {
  #state = null;
  #clock;
  #ttlMs;

  constructor({ clock = Date.now, ttlMs = 300000 } = {}) {
    if (typeof clock !== 'function') throw new TypeError('Clock function required');
    if (!Number.isInteger(ttlMs) || ttlMs < 1000 || ttlMs > 3600000) {
      throw new TypeError('Invalid K+DCAN session TTL');
    }
    this.#clock = clock;
    this.#ttlMs = ttlMs;
  }

  begin({ sessionId, vendorId, productId, selectorPosition = 'UNKNOWN', portPath = null, hardwareFingerprint = null } = {}) {
    if (typeof sessionId !== 'string' || sessionId.length < 16 || sessionId.length > 128) {
      throw new TypeError('Invalid K+DCAN session');
    }
    if (portPath != null && (typeof portPath !== 'string' || portPath.length < 1 || portPath.length > 240)) {
      throw new TypeError('Invalid serial port path');
    }

    const selector = normalizeSelector(selectorPosition);
    const fingerprint = normalizeFingerprint(hardwareFingerprint);
    const cable = cableEvidence({ vendorId, productId, selectorPosition: selector, portOpen: false });
    const now = this.#now();

    this.#state = {
      sessionId,
      portPath,
      vendorId,
      productId,
      hardwareFingerprint: fingerprint,
      selectorPosition: selector,
      cable,
      portOpen: false,
      startedAt: now,
      lastSeenAt: now,
    };
    return this.snapshot();
  }

  markPresent({ sessionId, vendorId, productId, portPath = null, hardwareFingerprint = null } = {}) {
    const state = this.#requireActive(sessionId);
    if (vendorId !== state.vendorId || productId !== state.productId) {
      throw new TypeError('Different USB device cannot replace active K+DCAN session');
    }
    if (portPath != null && state.portPath != null && portPath !== state.portPath) {
      throw new TypeError('Serial port path changed inside active K+DCAN session');
    }
    const fingerprint = normalizeFingerprint(hardwareFingerprint);
    if (state.hardwareFingerprint && fingerprint !== state.hardwareFingerprint) {
      throw new TypeError('Hardware fingerprint changed inside active K+DCAN session');
    }
    state.lastSeenAt = this.#now();
    return this.snapshot();
  }

  markPortOpen({ sessionId } = {}) {
    const state = this.#requireActive(sessionId);
    state.portOpen = true;
    state.lastSeenAt = this.#now();
    state.cable = cableEvidence({
      vendorId: state.vendorId,
      productId: state.productId,
      selectorPosition: state.selectorPosition,
      portOpen: true,
    });
    return this.snapshot();
  }

  markPortClosed({ sessionId } = {}) {
    const state = this.#requireActive(sessionId);
    state.portOpen = false;
    state.lastSeenAt = this.#now();
    state.cable = cableEvidence({
      vendorId: state.vendorId,
      productId: state.productId,
      selectorPosition: state.selectorPosition,
      portOpen: false,
    });
    return this.snapshot();
  }

  snapshot() {
    if (!this.#state) return Object.freeze({
      active: false,
      stage: 'NO_SESSION',
      ecuVerified: false,
      writesEnabled: false,
      flashEnabled: false,
    });

    const now = Number(this.#clock());
    const age = Number.isFinite(now) ? now - this.#state.lastSeenAt : Infinity;
    const fresh = age >= 0 && age <= this.#ttlMs;
    if (!fresh) return Object.freeze({
      active: false,
      expired: true,
      stage: 'SESSION_EXPIRED',
      sessionId: null,
      ecuVerified: false,
      writesEnabled: false,
      flashEnabled: false,
    });

    const knownUsbFamily = !/Nieznany/i.test(this.#state.cable.chipsetCandidate);
    return Object.freeze({
      active: true,
      expired: false,
      sessionId: this.#state.sessionId,
      portPath: this.#state.portPath,
      vidPid: this.#state.cable.vidPid,
      chipsetCandidate: this.#state.cable.chipsetCandidate,
      selectorPosition: this.#state.selectorPosition,
      portOpen: this.#state.portOpen,
      stage: this.#state.portOpen ? 'PORT_OPEN' : knownUsbFamily ? 'USB_FAMILY_HINT' : 'USB_BOUND',
      serialDriverVerified: false,
      bmwProtocolVerified: false,
      ecuVerified: false,
      writesEnabled: false,
      flashEnabled: false,
    });
  }

  end({ sessionId } = {}) {
    this.#requireActive(sessionId);
    this.#state = null;
    return this.snapshot();
  }

  #now() {
    const now = Number(this.#clock());
    if (!Number.isFinite(now)) throw new TypeError('Invalid session clock');
    return now;
  }

  #requireActive(sessionId) {
    if (!this.#state) throw new TypeError('No active K+DCAN session');
    if (typeof sessionId !== 'string' || sessionId !== this.#state.sessionId) {
      throw new TypeError('Stale or mismatched K+DCAN session');
    }
    const snap = this.snapshot();
    if (!snap.active) {
      this.#state = null;
      throw new TypeError('K+DCAN session expired');
    }
    return this.#state;
  }
}
