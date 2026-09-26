// Deterministic single-flight fault-containment gate for native desktop diagnostics.
// It never transmits vehicle bytes. A timeout quarantines the frontend command lane
// until a verified transport boundary (close/clear/rebind/open) advances generation.
export const DESKTOP_OPERATION_GATE_PHASE = Object.freeze({
  IDLE: 'IDLE',
  ACTIVE: 'ACTIVE',
  QUARANTINED: 'QUARANTINED',
});

export class DesktopOperationGateError extends Error {
  constructor(message, code) {
    super(message);
    this.name = 'DesktopOperationGateError';
    this.code = code;
  }
}

const OPERATION_RE = /^[A-Za-z0-9][A-Za-z0-9._:-]{1,63}$/;

function nextCounter(value) {
  return value >= Number.MAX_SAFE_INTEGER ? 1 : value + 1;
}

function validateEpoch(epoch, allowZero = false) {
  const minimum = allowZero ? 0 : 1;
  if (!Number.isSafeInteger(epoch) || epoch < minimum) {
    throw new TypeError('Invalid desktop operation epoch');
  }
}

function validateTimeout(timeoutMs) {
  if (!Number.isInteger(timeoutMs) || timeoutMs < 10 || timeoutMs > 30_000) {
    throw new TypeError('Invalid desktop operation timeout');
  }
}

export function createDesktopOperationGate({
  setTimer = globalThis.setTimeout?.bind(globalThis),
  clearTimer = globalThis.clearTimeout?.bind(globalThis),
} = {}) {
  if (typeof setTimer !== 'function' || typeof clearTimer !== 'function') {
    throw new TypeError('Desktop operation gate requires timer functions');
  }

  let generation = 1;
  let sequence = 0;
  let phase = DESKTOP_OPERATION_GATE_PHASE.IDLE;
  let active = null;
  let quarantine = null;

  const snapshot = () => Object.freeze({
    version: 1,
    phase,
    generation,
    activeEpoch: active?.epoch ?? null,
    activeOperation: active?.operation ?? null,
    quarantinedEpoch: quarantine?.epoch ?? null,
    quarantinedOperation: quarantine?.operation ?? null,
    quarantineReason: quarantine?.reason ?? null,
  });

  const resetAfterTransportBoundary = epoch => {
    validateEpoch(epoch, true);
    generation = nextCounter(generation);
    phase = DESKTOP_OPERATION_GATE_PHASE.IDLE;
    active = null;
    quarantine = null;
    return snapshot();
  };

  const run = async ({ epoch, operation, timeoutMs }, task) => {
    validateEpoch(epoch);
    validateTimeout(timeoutMs);
    if (typeof operation !== 'string' || !OPERATION_RE.test(operation)) {
      throw new TypeError('Invalid desktop operation name');
    }
    if (typeof task !== 'function') throw new TypeError('Desktop operation task required');

    if (phase === DESKTOP_OPERATION_GATE_PHASE.ACTIVE) {
      throw new DesktopOperationGateError(
        `Desktop operation already active: ${active.operation}`,
        'DESKTOP_OPERATION_BUSY'
      );
    }
    if (phase === DESKTOP_OPERATION_GATE_PHASE.QUARANTINED) {
      throw new DesktopOperationGateError(
        'Desktop operation gate quarantined until a verified transport boundary',
        'DESKTOP_OPERATION_QUARANTINED'
      );
    }

    sequence = nextCounter(sequence);
    const token = sequence;
    const operationGeneration = generation;
    active = Object.freeze({ token, epoch, operation });
    phase = DESKTOP_OPERATION_GATE_PHASE.ACTIVE;

    let timerHandle = null;
    let timedOut = false;
    const taskPromise = Promise.resolve().then(task);
    const timeoutPromise = new Promise((_, reject) => {
      timerHandle = setTimer(() => {
        if (generation !== operationGeneration
            || phase !== DESKTOP_OPERATION_GATE_PHASE.ACTIVE
            || active?.token !== token) {
          return;
        }
        timedOut = true;
        quarantine = Object.freeze({ epoch, operation, reason: 'TIMEOUT' });
        active = null;
        phase = DESKTOP_OPERATION_GATE_PHASE.QUARANTINED;
        reject(new DesktopOperationGateError(
          `Desktop operation timed out: ${operation}`,
          'DESKTOP_OPERATION_TIMEOUT'
        ));
      }, timeoutMs);
    });

    try {
      return await Promise.race([taskPromise, timeoutPromise]);
    } finally {
      if (timerHandle !== null) clearTimer(timerHandle);
      if (!timedOut
          && generation === operationGeneration
          && phase === DESKTOP_OPERATION_GATE_PHASE.ACTIVE
          && active?.token === token) {
        active = null;
        phase = DESKTOP_OPERATION_GATE_PHASE.IDLE;
      }
    }
  };

  return Object.freeze({ run, snapshot, resetAfterTransportBoundary });
}
