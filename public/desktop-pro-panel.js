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
import {
  instantiateReadOnlyRequest,
  listReadOnlyRequests,
} from './read-only-request-registry.js';

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
  if (state.requestOptions.some(item => item.id === state.requestOperationId)) {
    requestSelect.value = state.requestOperationId;
  }

  panel.querySelector('[data-desktop-pro-request-plan]').textContent = state.requestPlan
    ? `Identity plan: ${state.requestPlan.operationId} · epoch ${state.requestPlan.epoch} · request ${state.requestPlan.requestId} · ${state.requestPlan.protocol} · TX MATERIAL NOT EXPOSED · correlation required`
    : 'Identity plan: brak. Rejestr jest metadata-only i nie zawiera ramek TX.';

  panel.querySelectorAll('button[data-desktop-pro-action]').forEach(button => {
    button.disabled = state.busy || !state.ready;
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
      state.requestPlan = instantiateReadOnlyRequest(operationId, {
        epoch: state.snapshot.epoch,
        requestId,
      });
      state.message = `Plan identity utworzony dla ${option.moduleFamily}. TX nadal niewystawiony; następna bramka: zaufana korelacja request/response.`;
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
      state.message = 'Port zamknięty. Evidence parser sesji i identity plan wyzerowane.';
    } else if (name === 'clear') {
      state.snapshot = await clearDesktopSerialCandidate(window);
      state.selected = '';
      state.evidenceSession = null;
      state.evidence = null;
      state.requestPlan = null;
      state.message = `Kandydat usunięty · nowy epoch ${state.snapshot.epoch}.`;
    }
  } catch (error) {
    state.message = error instanceof Error ? error.message : 'Operacja Desktop PRO nie powiodła się.';
  } finally {
    state.busy = false;
    render(panel);
  }
}

async function attachDesktopProPanel() {
  const root = rootNow();
  if (!root || root.querySelector('[data-desktop-pro-panel]')) return;

  const host = await probeDesktopHost(window).catch(() => null);
  if (!host?.status?.available) return;
  state.ready = true;
  state.snapshot = await getDesktopTransportSnapshot(window).catch(() => null);

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
    </div>
    <div class="ha-cable-actions">
      <button type="button" data-desktop-pro-action="refresh">1. PORTY</button>
      <button type="button" data-desktop-pro-action="bind">2. BIND</button>
      <button type="button" data-desktop-pro-action="open">3. OPEN + CONFIG</button>
      <button type="button" data-desktop-pro-action="read">PASSIVE RX</button>
      <button type="button" data-desktop-pro-action="close">CLOSE</button>
      <button type="button" data-desktop-pro-action="clear">CLEAR</button>
    </div>
    <p data-desktop-pro-evidence></p>
    <p data-desktop-pro-message></p>
    <p><strong>Boundary:</strong> brak raw TX, brak coding/actuation/flash. Poprawna rama może osiągnąć tylko FRAME_CANDIDATE.</p>
  `;

  panel.querySelector('[data-desktop-pro-protocol]').addEventListener('change', event => {
    state.protocol = event.target.value;
  });
  panel.querySelector('[data-desktop-pro-baud]').addEventListener('input', event => {
    state.baudRate = event.target.value;
  });
  panel.querySelector('[data-desktop-pro-port]').addEventListener('change', event => {
    state.selected = event.target.value;
  });
  panel.querySelectorAll('button[data-desktop-pro-action]').forEach(button => {
    button.addEventListener('click', () => action(panel, button.dataset.desktopProAction));
  });

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
