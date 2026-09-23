// Browser-side ordering guard for one Windows bridge process.
// Prevents delayed responses from a previous revision or restarted bridge from silently
// overwriting newer physical-cable evidence.
const INSTANCE_RE = /^[a-f0-9]{32}$/i;
const revision = value => Number.isSafeInteger(value) && value >= 0 ? value : null;

export function classifyBridgeEnvelope({ knownInstanceId = null, lastRevision = -1 } = {}, envelope = {}) {
  const instanceId = typeof envelope.bridgeInstanceId === 'string' && INSTANCE_RE.test(envelope.bridgeInstanceId)
    ? envelope.bridgeInstanceId.toLowerCase() : null;
  const nextRevision = revision(envelope.stateRevision);
  if (!instanceId || nextRevision == null) throw new TypeError('Invalid bridge ordering envelope');
  if (knownInstanceId == null) {
    return Object.freeze({ action:'ACCEPT', instanceId, revision:nextRevision, resetLocalState:false });
  }
  if (!INSTANCE_RE.test(knownInstanceId)) throw new TypeError('Invalid known bridge instance');
  if (instanceId !== knownInstanceId.toLowerCase()) {
    return Object.freeze({ action:'RESTART', instanceId, revision:nextRevision, resetLocalState:true });
  }
  const previous = revision(lastRevision);
  if (previous == null && lastRevision !== -1) throw new TypeError('Invalid previous bridge revision');
  if (nextRevision < lastRevision) {
    return Object.freeze({ action:'STALE', instanceId, revision:nextRevision, resetLocalState:false });
  }
  return Object.freeze({ action:'ACCEPT', instanceId, revision:nextRevision, resetLocalState:false });
}
