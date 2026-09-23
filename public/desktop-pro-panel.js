import {
  attestDesktopIdentityContext,
  bindDesktopSerialCandidate,
  cancelDesktopReadOnlyRequest,
  clearDesktopSerialCandidate,
  closeDesktopPort,
  consumeDesktopReadOnlyRequest,
  getDesktopTransportSnapshot,
  executeDesktopMe72Identity,
  executeDesktopMe72Roughness,
  executeDesktopMe72EngineSnapshot,
  executeDesktopMe72FuelAdaptation,
  executeDesktopMe72OutputStatus,
  executeDesktopMe72Readiness,
  executeDesktopMe72DtcCount,
  listDesktopSerialCandidates,
  openDesktopConfiguredPort,
  prepareDesktopReadOnlyRequest,
  probeDesktopHost,
  readDesktopBounded,
} from './desktop-host-bridge.js';
import { DesktopReceiveEvidenceSession } from './desktop-receive-evidence.js';
import { listReadOnlyRequests } from './read-only-request-registry.js';
import { TrustedCorrelationSession } from './trusted-correlation-session.js';
import { validateTrustedIdentityCandidateEvent } from './trusted-identity-event.js';
import { finalizeReadOnlyIdentity } from './read-only-identity-finalizer.js';
import { getIdentityParserProfile, isIdentityParserVerified } from './identity-parser-profile.js';
import { deriveMe72IdentityFromEvidence } from './me72-identity-parser.js';
import { deriveMe72CylinderRoughnessFromEvidence } from './me72-roughness-parser.js';
import { deriveMe72EngineSnapshotFromEvidence } from './me72-engine-snapshot-parser.js';
import { deriveMe72FuelAdaptationFromEvidence } from './me72-fuel-adaptation-parser.js';
import { deriveMe72OutputStatusFromEvidence } from './me72-output-status-parser.js';
import { deriveMe72ReadinessFromEvidence } from './me72-readiness-parser.js';
import { deriveMe72DtcCountFromEvidence } from './me72-dtc-count-parser.js';

const state = {
  ready: false,
  busy: false,
  ports: [],
  selected: '',
  snapshot: null,
  protocol: 'KWP2000_BMW',
  baudRate: '',
  evidenceSession: null,
  evidence: null,
  nativeReadReceipt: null,
  requestOptions: listReadOnlyRequests(),
  requestOperationId: 'e39-dme-me72-module-identity',
  requestPlan: null,
  brokerSnapshot: null,
  correlationSession: null,
  localAttestation: null,
  identityResult: null,
  roughnessSample: null,
  roughnessSampleSequence: null,
  roughnessIdentityFingerprint: null,
  engineSnapshot: null,
  engineSnapshotSequence: null,
  engineSnapshotIdentityFingerprint: null,
  fuelAdaptation: null,
  fuelAdaptationSequence: null,
  fuelAdaptationIdentityFingerprint: null,
  outputStatus: null,
  outputStatusSequence: null,
  outputStatusIdentityFingerprint: null,
  readinessStatus: null,
  readinessSequence: null,
  readinessIdentityFingerprint: null,
  dtcCount: null,
  dtcCountSequence: null,
  dtcCountIdentityFingerprint: null,
  message: 'Desktop PRO host nieaktywny.',
};

const rootNow = () => document.querySelector('#haCableWorkbench');

function fmtUsb(port) {
  if (!Number.isInteger(port?.vid) || !Number.isInteger(port?.pid)) return '';
  return `${port.vid.toString(16).toUpperCase().padStart(4,'0')}:${port.pid.toString(16).toUpperCase().padStart(4,'0')}`;
}

function applyControlLocks(panel, { configured, finalized }) {
  const protocolSelect = panel.querySelector('[data-desktop-pro-protocol]');
  const requestSelect = panel.querySelector('[data-desktop-pro-request]');
  const baudInput = panel.querySelector('[data-desktop-pro-baud]');
  protocolSelect.disabled = configured || !!state.requestPlan;
  baudInput.disabled = configured || !!state.requestPlan;
  requestSelect.disabled = !!state.requestPlan || finalized;
}

function render(panel) {
  const snap = state.snapshot;
  panel.querySelector('[data-desktop-pro-host]').textContent =
    state.ready ? 'HOST: DESKTOP PRO / TAURI · OFFLINE READY' : 'HOST: NIEAKTYWNY';
  panel.querySelector('[data-desktop-pro-stage]').textContent =
    `STAN: ${snap?.stage || 'NO_CANDIDATE'} · evidence ${snap?.evidenceStage || 'NO_CABLE'} · epoch ${snap?.epoch ?? 0} · ECU NIEPOTWIERDZONE · WRITE LOCKED`;
  panel.querySelector('[data-desktop-pro-message]').textContent = state.message;

  const select = panel.querySelector('[data-desktop-pro-port]');
  const before = select.value;
  const portOptionsKey = state.ports.map(port =>
    [port.portName, port.candidateFamily || '', fmtUsb(port)].join('|')
  ).join('||');
  if (select.dataset.optionsKey !== portOptionsKey) {
    select.replaceChildren(...state.ports.map(port => {
      const opt = document.createElement('option');
      opt.value = port.portName;
      const family = port.candidateFamily ? ` · ${port.candidateFamily}` : '';
      const usb = fmtUsb(port);
      opt.textContent = `${port.portName}${usb ? ` · ${usb}` : ''}${family}`;
      return opt;
    }));
    select.dataset.optionsKey = portOptionsKey;
  }
  const desired = state.selected || before;
  if (state.ports.some(port => port.portName === desired)) select.value = desired;
  state.selected = select.value || '';

  panel.querySelector('[data-desktop-pro-protocol]').value = state.protocol;
  panel.querySelector('[data-desktop-pro-baud]').value = state.baudRate;

  const ev = state.evidence;
  panel.querySelector('[data-desktop-pro-evidence]').textContent = ev
    ? `Evidence: ${ev.stage} · RX ${ev.observedBytes} B · frames ${ev.candidateFrames} · next ${ev.nextGate}`
    : 'Evidence: brak odebranych danych.';

  const requestSelect = panel.querySelector('[data-desktop-pro-request]');
  const requestOptionsKey = state.requestOptions.map(item =>
    [item.id,item.moduleFamily,item.protocol,item.operation].join('|')
  ).join('||');
  if (requestSelect.dataset.optionsKey !== requestOptionsKey) {
    requestSelect.replaceChildren(...state.requestOptions.map(item => {
      const opt = document.createElement('option');
      opt.value = item.id;
      opt.textContent = `${item.moduleFamily} · ${item.protocol} · ${item.operation}`;
      return opt;
    }));
    requestSelect.dataset.optionsKey = requestOptionsKey;
  }
  if (!state.requestOptions.some(item => item.id === state.requestOperationId && item.protocol === state.protocol)) {
    state.requestOperationId = state.requestOptions.find(item => item.protocol === state.protocol)?.id || '';
    state.requestPlan = null;
  }
  if (state.requestOperationId) requestSelect.value = state.requestOperationId;

  const correlation = state.correlationSession?.snapshot?.() || null;
  const finalized = state.identityResult?.identityVerified === true;
  const repeatedCandidate = correlation?.repeatCandidateReady === true;
  const parserProfile = state.requestOperationId
    ? getIdentityParserProfile(state.requestOperationId)
    : null;
  const parserVerified = state.requestOperationId
    ? isIdentityParserVerified(state.requestOperationId)
    : false;
  panel.querySelector('[data-desktop-pro-request-plan]').textContent = state.requestPlan
    ? `Identity attempt active: ${state.requestPlan.requestId} · ${correlation?.confirmations || 0}/2 · native broker ${state.brokerSnapshot?.stage || 'pending'} · RX receipt ${state.nativeReadReceipt || 'pending'} · TX MATERIAL NOT EXPOSED`
    : finalized
      ? `Identity chain finalized · ${state.identityResult.moduleIdentity} · attestation #${state.identityResult.attestationSequence}`
      : repeatedCandidate
        ? `Identity chain: 2/2 · ${correlation.moduleIdentity || 'identity candidate'} · REPEATED_CORRELATED_IDENTITY_CANDIDATE · parser ${parserProfile?.verificationState || 'UNKNOWN'} · ${parserVerified ? 'LOCAL ATTESTATION REQUIRED' : 'VERIFIED PROFILE PARSER REQUIRED'}`
        : correlation
          ? `Identity chain: ${correlation.confirmations}/2 · ${correlation.moduleIdentity || 'identity pending'} · next independent attempt required`
          : 'Identity plan: brak. Rejestr jest metadata-only i nie zawiera ramek TX.';

  panel.querySelector('[data-desktop-pro-identity]').textContent = finalized
    ? `Identity evidence: READ_ONLY_IDENTITY_VERIFIED · local attestation #${state.identityResult.attestationSequence} · ECU NIEPOTWIERDZONE · WRITE LOCKED`
    : state.identityResult
      ? `Identity evidence: ${state.identityResult.stage} · confirmations ${state.identityResult.confirmations}/2 · LOCAL ATTESTATION ${state.identityResult.repeatCandidateReady ? 'REQUIRED' : 'PENDING'} · ECU NIEPOTWIERDZONE`
      : 'Identity evidence: 0/2 · brak zaufanej korelacji.';

  const roughness = state.roughnessSample;
  panel.querySelector('[data-desktop-pro-roughness]').textContent = roughness
    ? `Roughness sample #${state.roughnessSampleSequence} · ${roughness.cylinders
        .map(item => `C${item.cylinder} ${item.valuePerSecond.toFixed(4)} s⁻¹`)
        .join(' · ')}`
    : finalized
      ? 'Roughness C1–C8: gotowe do pojedynczego read-only snapshotu.'
      : 'Roughness C1–C8: zablokowane do READ_ONLY_IDENTITY_VERIFIED.';

  const engine = state.engineSnapshot;
  panel.querySelector('[data-desktop-pro-engine]').textContent = engine
    ? `Engine sample #${state.engineSnapshotSequence} · RPM ${engine.rpm.toFixed(0)} · coolant ${engine.coolantTempC.toFixed(1)}°C · IAT ${engine.intakeAirTempC.toFixed(1)}°C · batt ${engine.batteryVoltage.toFixed(2)} V · load ${engine.loadPercent.toFixed(2)}% · throttle ${engine.throttlePercent.toFixed(2)}% · knock ${engine.knockSensors.map(item => `C${item.cylinder} ${item.voltage.toFixed(3)}V`).join(' ')}`
    : finalized
      ? 'Engine snapshot 0x4000: gotowy do pojedynczego read-only odczytu.'
      : 'Engine snapshot 0x4000: zablokowany do READ_ONLY_IDENTITY_VERIFIED.';

  const fuel = state.fuelAdaptation;
  panel.querySelector('[data-desktop-pro-fuel]').textContent = fuel
    ? `Fuel adapt sample #${state.fuelAdaptationSequence} · add B1 ${fuel.additiveBank1Percent.toFixed(3)}% · add B2 ${fuel.additiveBank2Percent.toFixed(3)}% · mult B1 ${fuel.multiplicativeBank1Percent.toFixed(4)}% · mult B2 ${fuel.multiplicativeBank2Percent.toFixed(4)}%`
    : finalized
      ? 'Fuel adaptations 0x4004: gotowe do pojedynczego read-only odczytu.'
      : 'Fuel adaptations 0x4004: zablokowane do READ_ONLY_IDENTITY_VERIFIED.';

  const adaptation = state.fuelAdaptation;
  panel.querySelector('[data-desktop-pro-fuel-adaptation]').textContent = adaptation
    ? `Fuel adaptation #${state.fuelAdaptationSequence} · add B1 ${adaptation.additiveBank1Percent.toFixed(4)}% · add B2 ${adaptation.additiveBank2Percent.toFixed(4)}% · mult B1 ${adaptation.multiplicativeBank1Percent.toFixed(6)}% · mult B2 ${adaptation.multiplicativeBank2Percent.toFixed(6)}%`
    : finalized
      ? 'Fuel adaptation 0x4004: gotowa do pojedynczego read-only snapshotu.'
      : 'Fuel adaptation 0x4004: zablokowana do READ_ONLY_IDENTITY_VERIFIED.';

  const outputStatus = state.outputStatus;
  panel.querySelector('[data-desktop-pro-output-status]').textContent = outputStatus
    ? `Output status #${state.outputStatusSequence} · fuel pump ${outputStatus.fuelPump ? 'ON' : 'OFF'} · fan ${outputStatus.electricFan ? 'ON' : 'OFF'} · thermostat ${outputStatus.thermostat ? 'ON' : 'OFF'} · secondary-air valve ${outputStatus.secondaryAirValve ? 'ON' : 'OFF'} · pump ${outputStatus.secondaryAirPump ? 'ON' : 'OFF'} · leak pump ${outputStatus.leakDiagnosticPump ? 'ON' : 'OFF'} · O2 pre ${[outputStatus.oxygenHeaterBeforeBank1,outputStatus.oxygenHeaterBeforeBank2].filter(Boolean).length}/2 · post raw 0x40=${outputStatus.postCatHeaterBit40 ? 1 : 0} 0x80=${outputStatus.postCatHeaterBit80 ? 1 : 0} · post-bank map CONFLICT`
    : finalized
      ? 'Output status 0x4005: gotowy do pojedynczego read-only odczytu.'
      : 'Output status 0x4005: zablokowany do READ_ONLY_IDENTITY_VERIFIED.';

  const readiness = state.readinessStatus;
  panel.querySelector('[data-desktop-pro-readiness]').textContent = readiness
    ? `Readiness sample #${state.readinessSequence} · neutral ${readiness.neutralSwitch ? 'YES' : 'NO'} · enrich ${readiness.accelerationEnrichment ? 'YES' : 'NO'} · O2 pre B1 ${readiness.oxygenBeforeBank1Ready ? 'READY' : 'NOT READY'} · pre B2 ${readiness.oxygenBeforeBank2Ready ? 'READY' : 'NOT READY'} · post B1 ${readiness.oxygenAfterBank1Ready ? 'READY' : 'NOT READY'} · post B2 ${readiness.oxygenAfterBank2Ready ? 'READY' : 'NOT READY'}`
    : finalized
      ? 'Readiness 0x4007: gotowe do pojedynczego read-only odczytu.'
      : 'Readiness 0x4007: zablokowane do READ_ONLY_IDENTITY_VERIFIED.';

  const dtcCount = state.dtcCount;
  panel.querySelector('[data-desktop-pro-dtc-count]').textContent = dtcCount
    ? `DTC count sample #${state.dtcCountSequence} · stored faults ${dtcCount.faultCount} · CLEAR DTC LOCKED`
    : finalized
      ? 'DTC count A2 00: gotowy do pojedynczego read-only odczytu · clear-DTC zablokowane.'
      : 'DTC count A2 00: zablokowany do READ_ONLY_IDENTITY_VERIFIED.';

  const stage = snap?.stage || 'NO_CANDIDATE';
  const boundClosed = stage === 'USB_CANDIDATE_BOUND' && snap?.kind === 'usb';
  const configured = stage === 'PORT_CONFIGURED';
  const actions = {
    refresh: state.ready,
    bind: state.ready && !!state.selected && !['PORT_OPEN','PORT_CONFIGURED'].includes(stage),
    open: state.ready && boundClosed && Number.isInteger(Number(state.baudRate))
      && Number(state.baudRate) >= 300 && Number(state.baudRate) <= 1000000,
    read: state.ready && configured && !!state.evidenceSession,
    'plan-identity': state.ready && configured
      && !state.requestPlan
      && !finalized
      && !repeatedCandidate
      && state.requestOptions.some(item => item.id === state.requestOperationId && item.protocol === state.protocol),
    'cancel-identity': state.ready && configured && !!state.requestPlan,
    'attest-identity': state.ready && configured && !state.requestPlan
      && repeatedCandidate && parserVerified && !finalized,
    'read-roughness': state.ready && configured && finalized && !state.requestPlan,
    'read-engine': state.ready && configured && finalized && !state.requestPlan,
    'read-fuel': state.ready && configured && finalized && !state.requestPlan,
    'read-output-status': state.ready && configured && finalized && !state.requestPlan,
    'read-readiness': state.ready && configured && finalized && !state.requestPlan,
    'read-dtc-count': state.ready && configured && finalized && !state.requestPlan,
    close: state.ready && ['PORT_OPEN','PORT_CONFIGURED'].includes(stage),
    clear: state.ready && stage !== 'NO_CANDIDATE',
  };
  applyControlLocks(panel, { configured, finalized });
  panel.querySelectorAll('button[data-desktop-pro-action]').forEach(button => {
    button.disabled = state.busy || actions[button.dataset.desktopProAction] !== true;
  });
}

async function action(panel, name) {
  if (state.busy) return;
  state.busy = true;
  render(panel);
  try {
    if (name === 'refresh') {
      state.ports = await listDesktopSerialCandidates(window);
      state.message = `Wykryto ${state.ports.length} portów. VID:PID/rodzina to tylko evidence sprzętowe.`;
    } else if (name === 'bind') {
      const portName = panel.querySelector('[data-desktop-pro-port]').value;
      if (!portName) throw new TypeError('Wybierz port z aktualnej listy.');
      state.snapshot = await bindDesktopSerialCandidate(portName, window);
      state.selected = portName;
      state.evidenceSession = null;
      state.evidence = null;
      state.nativeReadReceipt = null;
      state.requestPlan = null;
      state.brokerSnapshot = null;
      state.correlationSession = null;
      state.localAttestation = null;
      state.identityResult = null;
      state.roughnessSample = null;
      state.roughnessSampleSequence = null;
      state.roughnessIdentityFingerprint = null;
      state.engineSnapshot = null;
      state.engineSnapshotSequence = null;
      state.engineSnapshotIdentityFingerprint = null;
      state.fuelAdaptation = null;
      state.fuelAdaptationSequence = null;
      state.fuelAdaptationIdentityFingerprint = null;
      state.outputStatus = null;
      state.outputStatusSequence = null;
      state.outputStatusIdentityFingerprint = null;
      state.readinessStatus = null;
      state.readinessSequence = null;
      state.readinessIdentityFingerprint = null;
      state.dtcCount = null;
      state.dtcCountSequence = null;
      state.dtcCountIdentityFingerprint = null;
      state.message = `Kandydat ${portName} przypięty do epoch ${state.snapshot.epoch}. Port nadal zamknięty.`;
    } else if (name === 'open') {
      if (!state.snapshot?.epoch) throw new TypeError('Najpierw przypnij port.');
      const protocol = panel.querySelector('[data-desktop-pro-protocol]').value;
      const baudRate = Number(panel.querySelector('[data-desktop-pro-baud]').value);
      if (!Number.isInteger(baudRate) || baudRate < 300 || baudRate > 1000000) {
        throw new TypeError('Podaj baud z potwierdzonego profilu komunikacyjnego.');
      }
      state.protocol = protocol;
      state.baudRate = String(baudRate);
      state.snapshot = await openDesktopConfiguredPort(
        state.snapshot.epoch, protocol, baudRate, window
      );
      state.evidenceSession = new DesktopReceiveEvidenceSession({
        epoch: state.snapshot.epoch,
        protocol,
      });
      state.evidence = null;
      state.nativeReadReceipt = null;
      state.requestPlan = null;
      state.brokerSnapshot = null;
      state.correlationSession = null;
      state.localAttestation = null;
      state.identityResult = null;
      state.roughnessSample = null;
      state.roughnessSampleSequence = null;
      state.roughnessIdentityFingerprint = null;
      state.engineSnapshot = null;
      state.engineSnapshotSequence = null;
      state.engineSnapshotIdentityFingerprint = null;
      state.fuelAdaptation = null;
      state.fuelAdaptationSequence = null;
      state.fuelAdaptationIdentityFingerprint = null;
      state.outputStatus = null;
      state.outputStatusSequence = null;
      state.outputStatusIdentityFingerprint = null;
      state.readinessStatus = null;
      state.readinessSequence = null;
      state.readinessIdentityFingerprint = null;
      state.dtcCount = null;
      state.dtcCountSequence = null;
      state.dtcCountIdentityFingerprint = null;
      state.message = `PORT_CONFIGURED · ${protocol} · ${baudRate} baud. Raw TX niewystawiony; tylko allowlisted read-only executor może nadawać.`;
    } else if (name === 'plan-identity') {
      if (state.snapshot?.stage !== 'PORT_CONFIGURED') {
        throw new TypeError('Najpierw otwórz skonfigurowany port.');
      }
      const operationId = panel.querySelector('[data-desktop-pro-request]').value;
      const option = state.requestOptions.find(item => item.id === operationId);
      if (!option) throw new TypeError('Nieznana operacja read-only.');
      if (option.protocol !== state.protocol) {
        throw new TypeError('Profil portu nie odpowiada wybranemu planowi modułu.');
      }
      const requestId = globalThis.crypto?.randomUUID?.()
        || `identity-${Date.now().toString(36)}`;
      state.requestOperationId = operationId;
      const existing = state.correlationSession?.snapshot?.();
      if (!existing || existing.epoch !== state.snapshot.epoch || existing.operationId !== operationId) {
        state.correlationSession = new TrustedCorrelationSession({
          epoch: state.snapshot.epoch,
          operationId,
        });
        state.identityResult = null;
      }
      state.nativeReadReceipt = null;
      const localPlan = state.correlationSession.prepareAttempt(requestId);
      try {
        state.brokerSnapshot = await prepareDesktopReadOnlyRequest(localPlan, window);
        state.requestPlan = localPlan;

        if (operationId === 'e39-dme-me72-module-identity') {
          if (!state.evidenceSession) {
            throw new TypeError('Brak parsera evidence dla skonfigurowanego portu.');
          }
          state.evidenceSession.reset();
          state.evidence = null;

          const result = await executeDesktopMe72Identity(
            localPlan.epoch,
            localPlan.requestId,
            window
          );
          state.evidence = state.evidenceSession.ingest(result);
          state.nativeReadReceipt = result.nativeRequestReceipt ?? null;

          if (result.stage !== 'READ_BYTES'
              || !Number.isSafeInteger(state.nativeReadReceipt)
              || state.nativeReadReceipt < 1) {
            throw new TypeError('ME7.2 identity request nie otrzymał receipt-backed READ_BYTES.');
          }

          const parsedIdentity = deriveMe72IdentityFromEvidence(state.evidence);
          state.brokerSnapshot = await consumeDesktopReadOnlyRequest(
            localPlan.epoch,
            localPlan.requestId,
            state.nativeReadReceipt,
            window
          );
          state.identityResult = state.correlationSession.consumeAttempt({
            receiveEvidence: state.evidence,
            responseRequestId: localPlan.requestId,
            moduleIdentity: parsedIdentity.fingerprint,
          });
          state.requestPlan = null;
          state.nativeReadReceipt = null;
          state.localAttestation = null;

          const confirmations = state.correlationSession.snapshot().confirmations;
          state.message = state.identityResult.repeatCandidateReady
            ? `2/2 ME7.2 identity confirmed · ${state.identityResult.moduleIdentity} · LOCAL ATTEST ready.`
            : `ME7.2 identity ${confirmations}/2 · ${state.identityResult.moduleIdentity}. Uruchom drugi niezależny RUN IDENTITY.`;
          return;
        }
      } catch (error) {
        if (state.requestPlan && state.brokerSnapshot?.activeRequest) {
          await cancelDesktopReadOnlyRequest(
            state.requestPlan.epoch,
            state.requestPlan.requestId,
            window
          ).catch(() => null);
        }
        state.correlationSession.cancelActiveAttempt();
        state.requestPlan = null;
        state.nativeReadReceipt = null;
        state.brokerSnapshot = null;
        throw error;
      }
      const confirmations = state.correlationSession.snapshot().confirmations;
      state.message = `Identity attempt prepared for ${option.moduleFamily} · ${confirmations}/2 confirmed · native broker ACTIVE. Allowlisted executor dla tego profilu nie jest jeszcze dostępny.`;
    } else if (name === 'cancel-identity') {
      if (!state.requestPlan || !state.correlationSession) return;
      const plan = state.requestPlan;
      try {
        state.brokerSnapshot = await cancelDesktopReadOnlyRequest(plan.epoch, plan.requestId, window);
      } finally {
        state.correlationSession.cancelActiveAttempt();
        state.requestPlan = null;
      }
      state.nativeReadReceipt = null;
      state.message = 'Identity attempt anulowany. Request-id pozostaje zużyty i nie może być użyty ponownie.';
    } else if (name === 'attest-identity') {
      const correlation = state.correlationSession?.snapshot?.();
      if (!correlation?.repeatCandidateReady || state.requestPlan) {
        throw new TypeError('Najpierw potrzebne są dwa niezależne, skorelowane kandydaty identity.');
      }
      if (!isIdentityParserVerified(correlation.operationId)) {
        throw new TypeError('VERIFIED_PROFILE_PARSER_REQUIRED');
      }
      state.localAttestation = await attestDesktopIdentityContext(
        correlation.epoch,
        correlation.protocol,
        window
      );
      state.identityResult = finalizeReadOnlyIdentity({
        correlationSnapshot: correlation,
        localAttestation: state.localAttestation,
      });
      state.roughnessSample = null;
      state.roughnessSampleSequence = null;
      state.roughnessIdentityFingerprint = null;
      state.engineSnapshot = null;
      state.engineSnapshotSequence = null;
      state.engineSnapshotIdentityFingerprint = null;
      state.fuelAdaptation = null;
      state.fuelAdaptationSequence = null;
      state.fuelAdaptationIdentityFingerprint = null;
      state.outputStatus = null;
      state.outputStatusSequence = null;
      state.outputStatusIdentityFingerprint = null;
      state.readinessStatus = null;
      state.readinessSequence = null;
      state.readinessIdentityFingerprint = null;
      state.dtcCount = null;
      state.dtcCountSequence = null;
      state.dtcCountIdentityFingerprint = null;
      state.dtcCount = null;
      state.dtcCountSequence = null;
      state.dtcCountIdentityFingerprint = null;
      state.message = `READ_ONLY_IDENTITY_VERIFIED po native attestation #${state.identityResult.attestationSequence}. Read-only live data + DTC count odblokowane; clear-DTC/write/flash nadal zablokowane.`;
    } else if (name === 'read-roughness') {
      if (state.identityResult?.identityVerified !== true
          || state.snapshot?.stage !== 'PORT_CONFIGURED'
          || !state.evidenceSession) {
        throw new TypeError('READ_ONLY_IDENTITY_VERIFIED wymagane przed roughness.');
      }

      state.evidenceSession.reset();
      state.evidence = null;
      const result = await executeDesktopMe72Roughness(state.snapshot.epoch, window);
      if (result.readonlyProfileId !== 'e39-me72-roughness-4003'
          || !Number.isSafeInteger(result.readonlySampleSequence)
          || result.nativeIdentityFingerprint !== state.identityResult.moduleIdentity) {
        throw new TypeError('Native roughness provenance mismatch.');
      }

      state.evidence = state.evidenceSession.ingest(result);
      state.roughnessSample = deriveMe72CylinderRoughnessFromEvidence(state.evidence);
      state.roughnessSampleSequence = result.readonlySampleSequence;
      state.roughnessIdentityFingerprint = result.nativeIdentityFingerprint;
      state.message = `ME7.2 roughness C1–C8 · native sample #${result.readonlySampleSequence} · read-only.`;
    } else if (name === 'read-engine') {
      if (state.identityResult?.identityVerified !== true
          || state.snapshot?.stage !== 'PORT_CONFIGURED'
          || !state.evidenceSession) {
        throw new TypeError('READ_ONLY_IDENTITY_VERIFIED wymagane przed engine snapshot.');
      }

      state.evidenceSession.reset();
      state.evidence = null;
      const result = await executeDesktopMe72EngineSnapshot(state.snapshot.epoch, window);
      if (result.readonlyProfileId !== 'e39-me72-engine-snapshot-4000'
          || !Number.isSafeInteger(result.readonlySampleSequence)
          || result.nativeIdentityFingerprint !== state.identityResult.moduleIdentity) {
        throw new TypeError('Native engine snapshot provenance mismatch.');
      }

      state.evidence = state.evidenceSession.ingest(result);
      state.engineSnapshot = deriveMe72EngineSnapshotFromEvidence(state.evidence);
      state.engineSnapshotSequence = result.readonlySampleSequence;
      state.engineSnapshotIdentityFingerprint = result.nativeIdentityFingerprint;
      state.message = `ME7.2 engine snapshot 0x4000 · native sample #${result.readonlySampleSequence} · read-only.`;
    } else if (name === 'read-fuel') {
      if (state.identityResult?.identityVerified !== true
          || state.snapshot?.stage !== 'PORT_CONFIGURED'
          || !state.evidenceSession) {
        throw new TypeError('READ_ONLY_IDENTITY_VERIFIED wymagane przed fuel adaptations.');
      }

      state.evidenceSession.reset();
      state.evidence = null;
      const result = await executeDesktopMe72FuelAdaptation(state.snapshot.epoch, window);
      if (result.readonlyProfileId !== 'e39-me72-fuel-adaptation-4004'
          || !Number.isSafeInteger(result.readonlySampleSequence)
          || result.nativeIdentityFingerprint !== state.identityResult.moduleIdentity) {
        throw new TypeError('Native fuel adaptation provenance mismatch.');
      }

      state.evidence = state.evidenceSession.ingest(result);
      state.fuelAdaptation = deriveMe72FuelAdaptationFromEvidence(state.evidence);
      state.fuelAdaptationSequence = result.readonlySampleSequence;
      state.fuelAdaptationIdentityFingerprint = result.nativeIdentityFingerprint;
      state.message = `ME7.2 fuel adaptations 0x4004 · native sample #${result.readonlySampleSequence} · read-only.`;
    } else if (name === 'read-output-status') {
      if (state.identityResult?.identityVerified !== true
          || state.snapshot?.stage !== 'PORT_CONFIGURED'
          || !state.evidenceSession) {
        throw new TypeError('READ_ONLY_IDENTITY_VERIFIED wymagane przed output status.');
      }

      state.evidenceSession.reset();
      state.evidence = null;
      const result = await executeDesktopMe72OutputStatus(state.snapshot.epoch, window);
      if (result.readonlyProfileId !== 'e39-me72-output-status-4005'
          || !Number.isSafeInteger(result.readonlySampleSequence)
          || result.nativeIdentityFingerprint !== state.identityResult.moduleIdentity) {
        throw new TypeError('Native output status provenance mismatch.');
      }

      state.evidence = state.evidenceSession.ingest(result);
      state.outputStatus = deriveMe72OutputStatusFromEvidence(state.evidence);
      state.outputStatusSequence = result.readonlySampleSequence;
      state.outputStatusIdentityFingerprint = result.nativeIdentityFingerprint;
      state.message = `ME7.2 output status 0x4005 · native sample #${result.readonlySampleSequence} · status-only/read-only.`;
    } else if (name === 'read-readiness') {
      if (state.identityResult?.identityVerified !== true
          || state.snapshot?.stage !== 'PORT_CONFIGURED'
          || !state.evidenceSession) {
        throw new TypeError('READ_ONLY_IDENTITY_VERIFIED wymagane przed readiness.');
      }

      state.evidenceSession.reset();
      state.evidence = null;
      const result = await executeDesktopMe72Readiness(state.snapshot.epoch, window);
      if (result.readonlyProfileId !== 'e39-me72-readiness-4007'
          || !Number.isSafeInteger(result.readonlySampleSequence)
          || result.nativeIdentityFingerprint !== state.identityResult.moduleIdentity) {
        throw new TypeError('Native readiness provenance mismatch.');
      }

      state.evidence = state.evidenceSession.ingest(result);
      state.readinessStatus = deriveMe72ReadinessFromEvidence(state.evidence);
      state.readinessSequence = result.readonlySampleSequence;
      state.readinessIdentityFingerprint = result.nativeIdentityFingerprint;
      state.message = `ME7.2 readiness 0x4007 · native sample #${result.readonlySampleSequence} · read-only.`;
    } else if (name === 'read-dtc-count') {
      if (state.identityResult?.identityVerified !== true
          || state.snapshot?.stage !== 'PORT_CONFIGURED'
          || !state.evidenceSession) {
        throw new TypeError('READ_ONLY_IDENTITY_VERIFIED wymagane przed DTC count.');
      }

      state.evidenceSession.reset();
      state.evidence = null;
      const result = await executeDesktopMe72DtcCount(state.snapshot.epoch, window);
      if (result.readonlyProfileId !== 'e39-me72-dtc-count-a200'
          || !Number.isSafeInteger(result.readonlySampleSequence)
          || result.nativeIdentityFingerprint !== state.identityResult.moduleIdentity) {
        throw new TypeError('Native DTC-count provenance mismatch.');
      }

      state.evidence = state.evidenceSession.ingest(result);
      state.dtcCount = deriveMe72DtcCountFromEvidence(state.evidence);
      state.dtcCountSequence = result.readonlySampleSequence;
      state.dtcCountIdentityFingerprint = result.nativeIdentityFingerprint;
      state.message = `ME7.2 DTC count · ${state.dtcCount.faultCount} stored faults · native sample #${result.readonlySampleSequence} · clear-DTC LOCKED.`;
    } else if (name === 'read') {
      if (state.snapshot?.stage !== 'PORT_CONFIGURED' || !state.evidenceSession) {
        throw new TypeError('Najpierw otwórz skonfigurowany port.');
      }
      const maxBytes = state.protocol === 'DS2' ? 255 : 197;
      const result = await readDesktopBounded(
        state.snapshot.epoch, maxBytes, 250, window
      );
      state.evidence = state.evidenceSession.ingest(result);
      state.nativeReadReceipt = result.nativeRequestReceipt ?? null;
      state.message = result.stage === 'READ_TIMEOUT'
        ? 'Passive RX timeout · sesja nadal skonfigurowana.'
        : `Passive RX: ${result.receivedBytes} B. ECU nadal niepotwierdzone.`;
    } else if (name === 'close') {
      if (!state.snapshot?.epoch) return;
      state.snapshot = await closeDesktopPort(state.snapshot.epoch, window);
      state.evidenceSession = null;
      state.evidence = null;
      state.nativeReadReceipt = null;
      state.requestPlan = null;
      state.brokerSnapshot = null;
      state.correlationSession = null;
      state.localAttestation = null;
      state.identityResult = null;
      state.roughnessSample = null;
      state.roughnessSampleSequence = null;
      state.roughnessIdentityFingerprint = null;
      state.engineSnapshot = null;
      state.engineSnapshotSequence = null;
      state.engineSnapshotIdentityFingerprint = null;
      state.fuelAdaptation = null;
      state.fuelAdaptationSequence = null;
      state.fuelAdaptationIdentityFingerprint = null;
      state.outputStatus = null;
      state.outputStatusSequence = null;
      state.outputStatusIdentityFingerprint = null;
      state.readinessStatus = null;
      state.readinessSequence = null;
      state.readinessIdentityFingerprint = null;
      state.dtcCount = null;
      state.dtcCountSequence = null;
      state.dtcCountIdentityFingerprint = null;
      state.message = 'Port zamknięty. Evidence parser sesji i identity plan wyzerowane.';
    } else if (name === 'clear') {
      state.snapshot = await clearDesktopSerialCandidate(window);
      state.selected = '';
      state.evidenceSession = null;
      state.evidence = null;
      state.nativeReadReceipt = null;
      state.requestPlan = null;
      state.brokerSnapshot = null;
      state.correlationSession = null;
      state.localAttestation = null;
      state.identityResult = null;
      state.roughnessSample = null;
      state.roughnessSampleSequence = null;
      state.roughnessIdentityFingerprint = null;
      state.engineSnapshot = null;
      state.engineSnapshotSequence = null;
      state.engineSnapshotIdentityFingerprint = null;
      state.fuelAdaptation = null;
      state.fuelAdaptationSequence = null;
      state.fuelAdaptationIdentityFingerprint = null;
      state.outputStatus = null;
      state.outputStatusSequence = null;
      state.outputStatusIdentityFingerprint = null;
      state.readinessStatus = null;
      state.readinessSequence = null;
      state.readinessIdentityFingerprint = null;
      state.dtcCount = null;
      state.dtcCountSequence = null;
      state.dtcCountIdentityFingerprint = null;
      state.message = `Kandydat usunięty · nowy epoch ${state.snapshot.epoch}.`;
    }
  } catch (error) {
    state.message = error instanceof Error ? error.message : 'Operacja Desktop PRO nie powiodła się.';
  } finally {
    state.busy = false;
    render(panel);
  }
}

let panelAbort = new AbortController();

async function attachDesktopProPanel() {
  const root = rootNow();
  if (!root || root.querySelector('[data-desktop-pro-panel]')) return;

  const host = await probeDesktopHost(window).catch(() => null);
  if (!host?.status?.available) return;
  state.ready = true;
  state.ports = [];
  state.selected = '';
  state.evidenceSession = null;
  state.evidence = null;
  state.nativeReadReceipt = null;
  state.requestPlan = null;
  state.brokerSnapshot = null;
  state.correlationSession = null;
  state.localAttestation = null;
  state.identityResult = null;
  state.roughnessSample = null;
  state.roughnessSampleSequence = null;
  state.roughnessIdentityFingerprint = null;
  state.engineSnapshot = null;
  state.engineSnapshotSequence = null;
  state.engineSnapshotIdentityFingerprint = null;
  state.fuelAdaptation = null;
  state.fuelAdaptationSequence = null;
  state.fuelAdaptationIdentityFingerprint = null;
  state.outputStatus = null;
  state.outputStatusSequence = null;
  state.outputStatusIdentityFingerprint = null;
  state.readinessStatus = null;
  state.readinessSequence = null;
  state.readinessIdentityFingerprint = null;
  state.dtcCount = null;
  state.dtcCountSequence = null;
  state.dtcCountIdentityFingerprint = null;
  state.snapshot = await getDesktopTransportSnapshot(window).catch(() => null);
  if (state.snapshot?.stage === 'PORT_CONFIGURED') {
    state.message = 'Host ma otwarty port z poprzedniego widoku. Zamknij i otwórz ponownie, aby odtworzyć lokalny parser evidence.';
  }

  panelAbort.abort();
  panelAbort = new AbortController();

  const panel = document.createElement('section');
  panel.dataset.desktopProPanel = '';
  panel.className = 'ha-cable-panel';
  panel.innerHTML = `
    <h3>Desktop PRO · Native Windows / Tauri</h3>
    <p data-desktop-pro-host></p>
    <p data-desktop-pro-stage></p>
    <div class="ha-cable-fields">
      <label>Port natywny
        <select data-desktop-pro-port aria-label="Desktop PRO port"></select>
      </label>
      <label>Profil legacy
        <select data-desktop-pro-protocol>
          <option value="KWP2000_BMW">KWP2000 BMW</option>
          <option value="DS2">DS2</option>
        </select>
      </label>
      <label>Baud z profilu komunikacyjnego
        <input data-desktop-pro-baud type="number" min="300" max="1000000" placeholder="brak wartości domyślnej" />
      </label>
      <label>Plan read-only
        <select data-desktop-pro-request aria-label="Desktop PRO read-only request plan"></select>
      </label>
    </div>
    <div class="ha-cable-actions">
      <button type="button" data-desktop-pro-action="refresh">1. PORTY</button>
      <button type="button" data-desktop-pro-action="bind">2. BIND</button>
      <button type="button" data-desktop-pro-action="open">3. OPEN + CONFIG</button>
      <button type="button" data-desktop-pro-action="plan-identity">4. RUN IDENTITY</button>
      <button type="button" data-desktop-pro-action="cancel-identity">CANCEL PLAN</button>
      <button type="button" data-desktop-pro-action="attest-identity">5. LOCAL ATTEST</button>
      <button type="button" data-desktop-pro-action="read-roughness">6. ROUGHNESS C1–C8</button>
      <button type="button" data-desktop-pro-action="read-engine">7. ENGINE SNAPSHOT</button>
      <button type="button" data-desktop-pro-action="read-fuel">8. FUEL ADAPT</button>
      <button type="button" data-desktop-pro-action="read-output-status">9. OUTPUT STATUS</button>
      <button type="button" data-desktop-pro-action="read-readiness">10. READINESS</button>
      <button type="button" data-desktop-pro-action="read-dtc-count">11. DTC COUNT</button>
      <button type="button" data-desktop-pro-action="read">PASSIVE RX</button>
      <button type="button" data-desktop-pro-action="close">CLOSE</button>
      <button type="button" data-desktop-pro-action="clear">CLEAR</button>
    </div>
    <p data-desktop-pro-request-plan></p>
    <p data-desktop-pro-identity></p>
    <p data-desktop-pro-roughness></p>
    <p data-desktop-pro-engine></p>
    <p data-desktop-pro-fuel></p>
    <p data-desktop-pro-output-status></p>
    <p data-desktop-pro-readiness></p>
    <p data-desktop-pro-dtc-count></p>
    <p data-desktop-pro-evidence></p>
    <p data-desktop-pro-message></p>
    <p><strong>Boundary:</strong> brak raw TX w UI/API, brak coding/actuation/flash. Native host może wykonać wyłącznie nazwane allowlisted read-only profile; roughness, engine snapshot, fuel adaptations, output status, readiness i DTC count wymagają 2/2 identity + parser + native local attestation. Clear-DTC pozostaje niewystawione.</p>
  `;

  panel.querySelector('[data-desktop-pro-protocol]').addEventListener('change', event => {
    state.protocol = event.target.value;
    state.requestOperationId = state.requestOptions.find(item => item.protocol === state.protocol)?.id || '';
    state.requestPlan = null;
    state.brokerSnapshot = null;
    state.correlationSession = null;
    state.localAttestation = null;
    state.identityResult = null;
    render(panel);
  });
  panel.querySelector('[data-desktop-pro-baud]').addEventListener('input', event => {
    state.baudRate = event.target.value;
  });
  panel.querySelector('[data-desktop-pro-port]').addEventListener('change', event => {
    state.selected = event.target.value;
  });
  panel.querySelector('[data-desktop-pro-request]').addEventListener('change', event => {
    state.requestOperationId = event.target.value;
    state.requestPlan = null;
    state.brokerSnapshot = null;
    state.correlationSession = null;
    state.localAttestation = null;
    state.identityResult = null;
    render(panel);
  });
  panel.querySelectorAll('button[data-desktop-pro-action]').forEach(button => {
    button.addEventListener('click', () => action(panel, button.dataset.desktopProAction));
  });

  const trustedHandler = async event => {
    if (!state.correlationSession || !state.requestPlan) return;
    const plan = state.requestPlan;

    let detail;
    try {
      if (!Number.isSafeInteger(state.nativeReadReceipt) || state.nativeReadReceipt < 1) {
        throw new TypeError('Trusted identity event wymaga native receipt z realnego READ_BYTES.');
      }
      if (state.evidence?.nativeReadReceipt !== state.nativeReadReceipt
          || !Array.isArray(state.evidence?.frames)
          || state.evidence.frames.length < 1) {
        throw new TypeError('Brak parser evidence powiązanego z native receipt.');
      }
      const parsedIdentity = plan.operationId === 'e39-dme-me72-module-identity'
        ? deriveMe72IdentityFromEvidence(state.evidence)
        : null;
      if (!parsedIdentity) {
        throw new TypeError('VERIFIED_PROFILE_PARSER_REQUIRED');
      }
      detail = validateTrustedIdentityCandidateEvent(event?.detail, {
        epoch: plan.epoch,
        requestId: plan.requestId,
        protocol: plan.protocol,
        nativeReadReceipt: state.nativeReadReceipt,
        expectedFrameHexes: state.evidence.frames.map(frame => frame.frameHex),
        expectedModuleIdentity: parsedIdentity.fingerprint,
      });
    } catch (error) {
      state.message = error instanceof Error ? error.message : 'Trusted identity event odrzucony.';
      render(panel);
      return;
    }

    try {
      state.brokerSnapshot = await consumeDesktopReadOnlyRequest(
        plan.epoch,
        plan.requestId,
        state.nativeReadReceipt,
        window
      );
    } catch (error) {
      state.correlationSession.cancelActiveAttempt();
      state.requestPlan = null;
      state.nativeReadReceipt = null;
      state.brokerSnapshot = null;
      state.message = error instanceof Error ? error.message : 'Native request broker odrzucił korelację.';
      render(panel);
      return;
    }

    try {
      state.identityResult = state.correlationSession.consumeAttempt({
        receiveEvidence: detail.receiveEvidence,
        responseRequestId: detail.responseRequestId,
        moduleIdentity: detail.moduleIdentity,
      });
      state.requestPlan = null;
      state.nativeReadReceipt = null;
      state.localAttestation = null;
      state.message = state.identityResult.repeatCandidateReady
        ? `2/2 REPEATED_CORRELATED_IDENTITY_CANDIDATE · ${state.identityResult.moduleIdentity}. Teraz wymagany jest LOCAL ATTEST.`
        : `${state.identityResult.stage} · ${state.identityResult.confirmations}/2. Przygotuj nowy, niezależny attempt.`;
    } catch (error) {
      state.correlationSession.cancelActiveAttempt();
      state.requestPlan = null;
      state.message = error instanceof Error ? error.message : 'Lokalna korelacja identity nie powiodła się.';
    }
    render(panel);
  };
  window.addEventListener('hannaada:trusted-identity-candidate', trustedHandler, { signal: panelAbort.signal });

  root.appendChild(panel);
  render(panel);
  action(panel, 'refresh');
}

if (typeof document !== 'undefined') {
  const onModuleRendered = event => {
    if (event.detail?.module !== 'vci') panelAbort.abort();
  };
  const start = () => {
    window.addEventListener('hannaada:cable-workbench-mounted', attachDesktopProPanel);
    window.addEventListener('hannaada:module-rendered', onModuleRendered);
    attachDesktopProPanel();
  };
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start, { once: true });
  } else {
    start();
  }
}
