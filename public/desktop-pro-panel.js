import {
  bindDesktopSerialCandidate,
  clearDesktopSerialCandidate,
  closeDesktopPort,
  getDesktopTransportSnapshot,
  listDesktopSerialCandidates,
  openDesktopConfiguredPort,
  probeDesktopHost,
  readDesktopBounded,
} from './desktop-host-bridge.js';
import { DesktopReceiveEvidenceSession } from './desktop-receive-evidence.js';
import { listReadOnlyRequests } from './read-only-request-registry.js';
import { TrustedCorrelationSession } from './trusted-correlation-session.js';
import { validateTrustedIdentityCandidateEvent } from './trusted-identity-event.js';

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
  requestOptions: listReadOnlyRequests(),
  requestOperationId: 'e39-dme-me72-module-identity',
  requestPlan: null,
  correlationSession: null,
  identityResult: null,
  message: 'Desktop PRO host nieaktywny.',
};

const rootNow = () => document.querySelector('#haCableWorkbench');

function fmtUsb(port) {
  if (!Number.isInteger(port?.vid) || !Number.isInteger(port?.pid)) return '';
  return `${port.vid.toString(16).toUpperCase().padStart(4,'0')}:${port.pid.toString(16).toUpperCase().padStart(4,'0')}`;
}

function render(panel) {
  const snap = state.snapshot;
  panel.querySelector('[data-desktop-pro-host]').textContent =
    state.ready ? 'HOST: DESKTOP PRO / TAURI · OFFLINE READY' : 'HOST: NIEAKTYWNY';
  panel.querySelector('[data-desktop-pro-stage]').textContent =
    `STAN: ${snap?.stage || 'NO_CANDIDATE'} · epoch ${snap?.epoch ?? 0} · ECU NIEPOTWIERDZONE · WRITE LOCKED`;
  panel.querySelector('[data-desktop-pro-message]').textContent = state.message;

  const select = panel.querySelector('[data-desktop-pro-port]');
  const before = select.value;
  select.replaceChildren(...state.ports.map(port => {
    const opt = document.createElement('option');
    opt.value = port.portName;
    const family = port.candidateFamily ? ` · ${port.candidateFamily}` : '';
    const usb = fmtUsb(port);
    opt.textContent = `${port.portName}${usb ? ` · ${usb}` : ''}${family}`;
    return opt;
  }));
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
  requestSelect.replaceChildren(...state.requestOptions.map(item => {
    const opt = document.createElement('option');
    opt.value = item.id;
    opt.textContent = `${item.moduleFamily} · ${item.protocol} · ${item.operation}`;
    return opt;
  }));
  if (!state.requestOptions.some(item => item.id === state.requestOperationId && item.protocol === state.protocol)) {
    state.requestOperationId = state.requestOptions.find(item => item.protocol === state.protocol)?.id || '';
    state.requestPlan = null;
  }
  if (state.requestOperationId) requestSelect.value = state.requestOperationId;

  const correlation = state.correlationSession?.snapshot?.() || null;
  panel.querySelector('[data-desktop-pro-request-plan]').textContent = state.requestPlan
    ? `Identity attempt active: ${state.requestPlan.requestId} · ${correlation?.confirmations || 0}/2 · TX MATERIAL NOT EXPOSED`
    : correlation
      ? `Identity chain: ${correlation.confirmations}/2 · ${correlation.moduleIdentity || 'identity pending'} · ${correlation.identityVerified ? 'READ_ONLY_IDENTITY_VERIFIED' : 'next attempt required'}`
      : 'Identity plan: brak. Rejestr jest metadata-only i nie zawiera ramek TX.';

  panel.querySelector('[data-desktop-pro-identity]').textContent = state.identityResult
    ? `Identity evidence: ${state.identityResult.stage} · confirmations ${state.identityResult.confirmations}/2 · ECU NIEPOTWIERDZONE · WRITE LOCKED`
    : 'Identity evidence: 0/2 · brak zaufanej korelacji.';

  const stage = snap?.stage || 'NO_CANDIDATE';
  const boundClosed = ['USB_CANDIDATE_BOUND','SERIAL_CANDIDATE_BOUND'].includes(stage);
  const configured = stage === 'PORT_CONFIGURED';
  const actions = {
    refresh: state.ready,
    bind: state.ready && !!state.selected && !['PORT_OPEN','PORT_CONFIGURED'].includes(stage),
    open: state.ready && boundClosed && Number.isInteger(Number(state.baudRate))
      && Number(state.baudRate) >= 300 && Number(state.baudRate) <= 1000000,
    read: state.ready && configured && !!state.evidenceSession,
    'plan-identity': state.ready && configured
      && !state.requestPlan
      && state.correlationSession?.snapshot?.().identityVerified !== true
      && state.requestOptions.some(item => item.id === state.requestOperationId && item.protocol === state.protocol),
    close: state.ready && ['PORT_OPEN','PORT_CONFIGURED'].includes(stage),
    clear: state.ready && stage !== 'NO_CANDIDATE',
  };
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
      state.requestPlan = null;
      state.correlationSession = null;
      state.identityResult = null;
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
      state.requestPlan = null;
      state.correlationSession = null;
      state.identityResult = null;
      state.message = `PORT_CONFIGURED · ${protocol} · ${baudRate} baud. Brak TX.`;
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
      state.requestPlan = state.correlationSession.prepareAttempt(requestId);
      const confirmations = state.correlationSession.snapshot().confirmations;
      state.message = `Identity attempt prepared for ${option.moduleFamily} · ${confirmations}/2 confirmed. TX nadal niewystawiony; oczekuję trusted correlation event.`;
    } else if (name === 'read') {
      if (state.snapshot?.stage !== 'PORT_CONFIGURED' || !state.evidenceSession) {
        throw new TypeError('Najpierw otwórz skonfigurowany port.');
      }
      const maxBytes = state.protocol === 'DS2' ? 255 : 197;
      const result = await readDesktopBounded(
        state.snapshot.epoch, maxBytes, 250, window
      );
      state.evidence = state.evidenceSession.ingest(result);
      state.message = result.stage === 'READ_TIMEOUT'
        ? 'Passive RX timeout · sesja nadal skonfigurowana.'
        : `Passive RX: ${result.receivedBytes} B. ECU nadal niepotwierdzone.`;
    } else if (name === 'close') {
      if (!state.snapshot?.epoch) return;
      state.snapshot = await closeDesktopPort(state.snapshot.epoch, window);
      state.evidenceSession = null;
      state.evidence = null;
      state.requestPlan = null;
      state.correlationSession = null;
      state.identityResult = null;
      state.message = 'Port zamknięty. Evidence parser sesji i identity plan wyzerowane.';
    } else if (name === 'clear') {
      state.snapshot = await clearDesktopSerialCandidate(window);
      state.selected = '';
      state.evidenceSession = null;
      state.evidence = null;
      state.requestPlan = null;
      state.correlationSession = null;
      state.identityResult = null;
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
  state.requestPlan = null;
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
      <button type="button" data-desktop-pro-action="plan-identity">4. PLAN IDENTITY</button>
      <button type="button" data-desktop-pro-action="read">PASSIVE RX</button>
      <button type="button" data-desktop-pro-action="close">CLOSE</button>
      <button type="button" data-desktop-pro-action="clear">CLEAR</button>
    </div>
    <p data-desktop-pro-request-plan></p>
    <p data-desktop-pro-identity></p>
    <p data-desktop-pro-evidence></p>
    <p data-desktop-pro-message></p>
    <p><strong>Boundary:</strong> brak raw TX, brak coding/actuation/flash. Poprawna rama może osiągnąć tylko FRAME_CANDIDATE.</p>
  `;

  panel.querySelector('[data-desktop-pro-protocol]').addEventListener('change', event => {
    state.protocol = event.target.value;
    state.requestOperationId = state.requestOptions.find(item => item.protocol === state.protocol)?.id || '';
    state.requestPlan = null;
    state.correlationSession = null;
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
    render(panel);
  });
  panel.querySelectorAll('button[data-desktop-pro-action]').forEach(button => {
    button.addEventListener('click', () => action(panel, button.dataset.desktopProAction));
  });

  const trustedHandler = event => {
    try {
      if (!state.correlationSession || !state.requestPlan) return;
      const detail = validateTrustedIdentityCandidateEvent(event?.detail, {
        epoch: state.requestPlan.epoch,
        requestId: state.requestPlan.requestId,
        protocol: state.requestPlan.protocol,
      });
      state.identityResult = state.correlationSession.consumeAttempt({
        receiveEvidence: detail.receiveEvidence,
        responseRequestId: detail.responseRequestId,
        moduleIdentity: detail.moduleIdentity,
      });
      state.requestPlan = null;
      state.message = state.identityResult.identityVerified
        ? 'READ_ONLY_IDENTITY_VERIFIED 2/2. ECU/write/flash nadal zablokowane.'
        : `${state.identityResult.stage} · ${state.identityResult.confirmations}/2. Przygotuj nowy, niezależny attempt.`;
    } catch (error) {
      state.message = error instanceof Error ? error.message : 'Trusted identity event odrzucony.';
    }
    render(panel);
  };
  window.addEventListener('hannaada:trusted-identity-candidate', trustedHandler, { signal: panelAbort.signal });

  root.appendChild(panel);
  render(panel);
  action(panel, 'refresh');
}

if (typeof document !== 'undefined') {
  const start = () => {
    const view = document.querySelector('#view');
    if (!view) return;
    new MutationObserver(() => attachDesktopProPanel()).observe(view, { childList: true, subtree: true });
    attachDesktopProPanel();
  };
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start, { once: true });
  } else {
    start();
  }
}
