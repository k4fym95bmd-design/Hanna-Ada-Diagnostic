// Metadata-only registry of read-only diagnostic operations.
// No raw request bytes are stored or exposed here.
export const READONLY_REQUEST_REGISTRY_VERSION = 1;

const entries = Object.freeze([
  Object.freeze({
    id: 'e39-dme-me72-module-identity',
    vehicleFamily: 'BMW_E39',
    moduleFamily: 'DME_ME72',
    protocol: 'KWP2000_BMW',
    operation: 'MODULE_IDENTITY',
    timeoutMs: 750,
    maxResponseBytes: 197,
    expectedDirection: 'possible-reply',
    requestMaterial: 'EXTERNAL_VERIFIED_PROFILE_REQUIRED',
    requiresConfiguredTransport: true,
    requiresEpochBinding: true,
    requiresRequestCorrelation: true,
    txBytesExposed: false,
    writeLike: false,
    ecuVerified: false,
    writesEnabled: false,
  }),
  Object.freeze({
    id: 'e39-legacy-module-identity',
    vehicleFamily: 'BMW_E39',
    moduleFamily: 'E39_LEGACY_MODULE',
    protocol: 'DS2',
    operation: 'MODULE_IDENTITY',
    timeoutMs: 750,
    maxResponseBytes: 255,
    expectedDirection: 'correlated-reply-required',
    requestMaterial: 'EXTERNAL_VERIFIED_PROFILE_REQUIRED',
    requiresConfiguredTransport: true,
    requiresEpochBinding: true,
    requiresRequestCorrelation: true,
    txBytesExposed: false,
    writeLike: false,
    ecuVerified: false,
    writesEnabled: false,
  }),
]);

const byId = new Map(entries.map(entry => [entry.id, entry]));

export function listReadOnlyRequests() {
  return Object.freeze(entries.map(entry => Object.freeze({ ...entry })));
}

export function getReadOnlyRequest(id) {
  if (typeof id !== 'string') throw new TypeError('Invalid request registry id');
  const entry = byId.get(id);
  if (!entry) throw new TypeError('Unknown read-only request');
  return Object.freeze({ ...entry });
}

export function instantiateReadOnlyRequest(id, { epoch, requestId } = {}) {
  const entry = getReadOnlyRequest(id);
  if (!Number.isSafeInteger(epoch) || epoch < 1) throw new TypeError('Invalid request epoch');
  if (typeof requestId !== 'string' || requestId.length < 8 || requestId.length > 128) {
    throw new TypeError('Invalid request id');
  }

  return Object.freeze({
    registryVersion: READONLY_REQUEST_REGISTRY_VERSION,
    operationId: entry.id,
    vehicleFamily: entry.vehicleFamily,
    moduleFamily: entry.moduleFamily,
    protocol: entry.protocol,
    operation: entry.operation,
    epoch,
    requestId,
    timeoutMs: entry.timeoutMs,
    maxResponseBytes: entry.maxResponseBytes,
    expectedDirection: entry.expectedDirection,
    requestMaterial: entry.requestMaterial,
    requiresConfiguredTransport: true,
    requiresRequestCorrelation: true,
    txBytesExposed: false,
    writeLike: false,
    ecuVerified: false,
    writesEnabled: false,
  });
}

export function validateReadOnlyRequestPlan(value) {
  if (!value || typeof value !== 'object'
      || value.registryVersion !== READONLY_REQUEST_REGISTRY_VERSION
      || typeof value.operationId !== 'string'
      || !Number.isSafeInteger(value.epoch) || value.epoch < 1
      || typeof value.requestId !== 'string'
      || value.requestId.length < 8 || value.requestId.length > 128
      || !['DS2', 'KWP2000_BMW'].includes(value.protocol)
      || value.operation !== 'MODULE_IDENTITY'
      || value.requiresConfiguredTransport !== true
      || value.requiresRequestCorrelation !== true
      || value.txBytesExposed !== false
      || value.writeLike !== false
      || value.ecuVerified !== false
      || value.writesEnabled !== false) {
    throw new TypeError('Invalid read-only request plan');
  }

  const canonical = getReadOnlyRequest(value.operationId);
  if (canonical.protocol !== value.protocol
      || canonical.moduleFamily !== value.moduleFamily
      || canonical.maxResponseBytes !== value.maxResponseBytes
      || canonical.timeoutMs !== value.timeoutMs) {
    throw new TypeError('Read-only request plan diverged from registry');
  }
  return value;
}
