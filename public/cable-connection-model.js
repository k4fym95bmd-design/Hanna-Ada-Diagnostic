// Shared evidence model for USB direct and authenticated Windows bridge modes.
// Opening USB serial NEVER proves an E39 ECU or any BMW protocol capability.
import { classifyBridgeEnvelope } from './bridge-state-ordering.js';
import {
  EVIDENCE_CONTRACT_VERSION,
  deriveTransportEvidence,
  validateTransportEvidenceEnvelope,
} from './evidence-contract.js';

export const CABLE_STAGES = Object.freeze(['NO_CABLE', 'CABLE_DETECTED', 'PORT_OPEN', 'ECU_VERIFIED']);

export function validateBridgeUrl(value) {
  let url;
  try { url = new URL(value); } catch { throw new TypeError('Podaj poprawny adres mostu.'); }
  const loopback = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  if (!(url.protocol === 'https:' || (url.protocol === 'http:' && loopback))) {
    throw new TypeError('Most przez sieć wymaga HTTPS; HTTP tylko na tym samym komputerze (localhost).');
  }
  if (url.username || url.password || url.search || url.hash || url.pathname !== '/') {
    throw new TypeError('Adres nie może zawierać hasła, parametrów ani ścieżki.');
  }
  return url.origin;
}

export function cableStatus(input = {}) {
  const detected = input.cableDetected === true;
  const opened = detected && input.portOpen === true;
  const stage = opened ? 'PORT_OPEN' : detected ? 'CABLE_DETECTED' : 'NO_CABLE';
  return Object.freeze({
    stage,
    cableDetected: detected,
    portOpen: opened,
    ecuVerified: false,
    bmwModulesVerified: Object.freeze([]),
    writesEnabled: false,
    flashEnabled: false,
    nextStep: stage === 'NO_CABLE' ? 'Wykryj kabel USB lub sprawdź most Windows.'
      : stage === 'CABLE_DETECTED' ? 'Uzyskaj zgodę i otwórz port USB-serial.'
      : 'Port otwarty. BMW ECU wymaga osobnego lokalnego walidatora odpowiedzi read-only; przeglądarka sama nie może potwierdzić ECU.',
  });
}

const validInstanceId = value => typeof value === 'string' && /^[a-f0-9]{32}$/i.test(value);
const validSessionId = value => typeof value === 'string' && /^[a-f0-9]{40}$/i.test(value);
const safeRevision = value => Number.isSafeInteger(value) && value >= 0;
const safeEpoch = value => Number.isSafeInteger(value) && value > 0;

export function validateBridgeStatus(value) {
  if (!value || typeof value !== 'object' || value.version !== 1 || value.transport !== 'physical-vci'
      || value.evidenceContractVersion !== EVIDENCE_CONTRACT_VERSION
      || !validInstanceId(value.bridgeInstanceId)
      || !safeRevision(value.stateRevision)
      || typeof value.cableDetected !== 'boolean' || typeof value.portOpen !== 'boolean'
      || value.ecuVerified !== false || value.writesEnabled !== false || value.flashEnabled !== false) {
    throw new TypeError('Nieprawidłowy lub niebezpieczny status mostu.');
  }

  validateTransportEvidenceEnvelope(value.evidence);

  const bindingActive = value.cableBinding?.active === true;
  const expected = deriveTransportEvidence({
    cableDetected: value.cableDetected,
    hardwareBound: bindingActive,
    portOpen: value.portOpen,
    observedBytes: 0,
    candidateFrames: 0,
  });
  if (value.evidence.stage !== expected.stage
      || value.evidence.nextGate !== expected.nextGate
      || value.evidence.cableDetected !== expected.cableDetected
      || value.evidence.hardwareBound !== expected.hardwareBound
      || value.evidence.portOpen !== expected.portOpen
      || value.evidence.qualifiedPortOpen !== expected.qualifiedPortOpen) {
    throw new TypeError('Status mostu ma niespójny łańcuch dowodowy.');
  }

  if (value.portOpen) {
    if (!validSessionId(value.sessionId) || !safeEpoch(value.sessionEpoch)) {
      throw new TypeError('Otwarty port nie ma poprawnej tożsamości sesji.');
    }
  } else if (value.sessionId !== null || value.sessionEpoch !== null) {
    throw new TypeError('Zamknięty port nie może zachowywać aktywnej sesji.');
  }

  return Object.freeze({
    ...cableStatus({ cableDetected: value.cableDetected, portOpen: value.portOpen }),
    bridgeInstanceId: value.bridgeInstanceId,
    stateRevision: value.stateRevision,
    sessionEpoch: value.sessionEpoch,
    evidenceStage: value.evidence.stage,
  });
}

export function nextBridgeFreshness(previous, rawStatus) {
  const current = validateBridgeStatus(rawStatus);
  const order = classifyBridgeEnvelope({
    knownInstanceId: previous?.bridgeInstanceId ?? null,
    lastRevision: previous?.stateRevision ?? -1,
  }, {
    bridgeInstanceId: current.bridgeInstanceId,
    stateRevision: current.stateRevision,
  });

  if (order.action === 'STALE') throw new TypeError('Odrzucono przestarzały status mostu.');

  if (previous && order.action === 'ACCEPT'
      && current.stateRevision === previous.stateRevision
      && current.sessionEpoch !== previous.sessionEpoch) {
    throw new TypeError('Niespójna epoka sesji przy tej samej rewizji mostu.');
  }

  return Object.freeze({
    bridgeInstanceId: current.bridgeInstanceId,
    stateRevision: current.stateRevision,
    sessionEpoch: current.sessionEpoch,
    resetLocalState: order.resetLocalState === true,
  });
}
