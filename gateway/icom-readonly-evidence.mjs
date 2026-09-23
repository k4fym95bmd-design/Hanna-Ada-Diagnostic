// Strict read-only evidence contract for a future LOCAL BMW ICOM adapter.
// This file performs validation only. It does not discover ICOMs, open sockets,
// transmit diagnostic requests, code, actuate, erase faults or flash modules.

function textField(value, name, max = 160) {
  if (typeof value !== 'string' || value.trim().length < 1 || value.length > max) {
    throw new TypeError(`Invalid ${name}`);
  }
  return value.trim();
}

export function validateIcomReadOnlyEnvelope(value, expectedSessionId) {
  if (!value || typeof value !== 'object') throw new TypeError('Invalid ICOM evidence');
  if (value.version !== 1 || value.source !== 'bmw-icom' || value.transport !== 'ethernet'
      || value.mode !== 'read-only' || value.icomFamily !== 'ICOM Next'
      || value.simulated === true
      || value.writesEnabled !== false || value.flashEnabled !== false) {
    throw new TypeError('Unsafe or unsupported ICOM evidence');
  }
  const sessionId = textField(value.sessionId, 'sessionId', 128);
  if (typeof expectedSessionId !== 'string' || expectedSessionId.length < 16 || sessionId !== expectedSessionId) {
    throw new TypeError('Stale or mismatched ICOM session');
  }
  const primaryInterface = textField(value.primaryInterface, 'primaryInterface', 64);
  if (primaryInterface !== 'ICOM Next A') throw new TypeError('Unexpected BMW VCI');
  if (value.legacyAdapter != null && value.legacyAdapter !== 'ICOM Next C') {
    throw new TypeError('Unexpected legacy adapter');
  }
  if (!Array.isArray(value.modules) || value.modules.length > 64) throw new TypeError('Invalid ICOM module evidence');

  const seenModuleIds = new Set();
  const modules = value.modules.map(item => {
    if (!item || typeof item !== 'object' || item.verified !== true || item.sessionId !== sessionId) {
      throw new TypeError('Unverified ICOM module evidence');
    }
    const moduleId = textField(item.moduleId, 'moduleId', 48);
    if (seenModuleIds.has(moduleId)) throw new TypeError('Duplicate ICOM module evidence');
    seenModuleIds.add(moduleId);
    return Object.freeze({
      moduleId,
      identity: textField(item.identity, 'identity', 160),
      sessionId,
      verified: true,
    });
  });

  return Object.freeze({
    sessionId,
    icomFamily: 'ICOM Next',
    primaryInterface: 'ICOM Next A',
    legacyAdapter: value.legacyAdapter ?? null,
    modules: Object.freeze(modules),
    ecuVerified: modules.length > 0,
    writesEnabled: false,
    flashEnabled: false,
  });
}
