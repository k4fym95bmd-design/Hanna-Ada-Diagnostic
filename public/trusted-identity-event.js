const forbiddenKeys = Object.freeze([
  'requestBytes',
  'txBytes',
  'payload',
  'command',
  'rawTx',
  'writeCommand',
]);

export function validateTrustedIdentityCandidateEvent(value, {
  epoch,
  requestId,
  protocol,
} = {}) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError('Invalid trusted identity event');
  }
  for (const key of forbiddenKeys) {
    if (key in value) throw new TypeError('Raw TX material is forbidden in trusted identity event');
  }
  if (!Number.isSafeInteger(epoch) || epoch < 1
      || typeof requestId !== 'string' || requestId.length < 8
      || !['DS2', 'KWP2000_BMW'].includes(protocol)) {
    throw new TypeError('Invalid trusted identity expectation');
  }
  if (value.epoch !== epoch
      || value.requestId !== requestId
      || value.responseRequestId !== requestId
      || value.protocol !== protocol) {
    throw new TypeError('Trusted identity event correlation mismatch');
  }
  if (typeof value.moduleIdentity !== 'string'
      || !/^[A-Za-z0-9._-]{2,64}$/.test(value.moduleIdentity.trim())) {
    throw new TypeError('Invalid trusted module identity');
  }

  const evidence = value.receiveEvidence;
  if (!evidence || typeof evidence !== 'object'
      || evidence.epoch !== epoch
      || evidence.protocol !== protocol
      || evidence.ecuVerified !== false
      || evidence.writesEnabled !== false
      || evidence.flashEnabled !== false) {
    throw new TypeError('Invalid trusted receive evidence');
  }

  return Object.freeze({
    epoch,
    requestId,
    responseRequestId: requestId,
    protocol,
    moduleIdentity: value.moduleIdentity.trim(),
    receiveEvidence: evidence,
  });
}
