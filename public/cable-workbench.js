import { cableStatus, nextBridgeFreshness, validateBridgeStatus, validateBridgeUrl } from './cable-connection-model.js';
import { KDCAN_INPA_SWITCH_TARGET, usbIdentity } from './kdcan-cable-profile.js';
import { identifyUsbSerialCandidate } from './usb-chipset-candidates.js';
import { assessCablePlugReadiness, findNewCablePorts } from './cable-plug-readiness.js';
import { classifyBridgeFailure } from './bridge-error-policy.js';

// Adds a cable route to the EXISTING VCI page without replacing the BLE runtime.
// Enumerate/open/close only: there is NO ECU TX/RX, coding, actuation or flash.
const work = { mode: 'desktop', serialPort: null, bridgeUrl: null, bridgeToken: null, bridgeFreshness: null, ports: [], selectedPath: '', bridgeOnline: false, detected: false, opened: false, busy: false, message: 'Nie wybrano portu.' };
let cableWaitAbort = null;
const $ = (root, sel) => root.querySelector(sel);
const hasWebSerial = () => typeof navigator !== 'undefined' && !!navigator.serial?.requestPort;
const platform = () => /Android/i.test(navigator.userAgent) ? 'android' : /iPhone|iPad|iPod/i.test(navigator.userAgent) ? 'ios' : /Windows/i.test(navigator.userAgent) ? 'windows' : 'desktop';
const errText = e => e instanceof TypeError ? e.message : 'Operacja nie powiodła się. Sprawdź uprawnienia, sterownik i połączenie.';
const usbId = value => {
  if (Number.isInteger(value) && value >= 0 && value <= 0xFFFF) return value.toString(16).toUpperCase().padStart(4, '0');
  return typeof value === 'string' && /^[0-9a-f]{4}$/i.test(value) ? value.toUpperCase() : '';
};
const usbHex = usbId;
const usbFingerprint = value => typeof value === 'string' && /^[a-f0-9]{16,64}$/i.test(value)
  ? value.toLowerCase() : '';
const rootNow = () => document.querySelector('#haCableWorkbench');
const report = (message, failed = false) => { work.message = message; const r = rootNow(); if (r) { $(r, '[data-cable-message]').textContent = message; $(r, '[data-cable-message]').classList.toggle('ha-cable-error', failed); } };
function display() {
  const root = rootNow(); if (!root) return;
  const status = cableStatus({ cableDetected: work.detected, portOpen: work.opened });
  root.dataset.cablePortOpen = String(work.opened);
  root.dataset.cableModeCurrent = work.mode;
  root.dataset.bridgeOnline = String(work.bridgeOnline);
  const modeSelected = work.mode === 'bridge' ? (Boolean(work.selectedPath) || status.cableDetected) : status.cableDetected;
  const states = [modeSelected, status.portOpen, status.ecuVerified];
  root.querySelectorAll('[data-cable-stage]').forEach((item, index) => {
    item.classList.toggle('verified', states[index]);
    item.querySelector('b').textContent = states[index] ? 'POTWIERDZONE' : 'NIEPOTWIERDZONE';
  });
  $(root, '[data-cable-next]').textContent = status.nextStep;
  $(root, '[data-cable-bridge-state]').textContent = work.bridgeOnline ? 'MOST ODPOWIADA' : 'MOST NIEPOŁĄCZONY / STAN NIEZNANY';
  root.querySelectorAll('[data-cable-mode]').forEach(el => {
    const selected = el.dataset.cableMode === work.mode;
    el.setAttribute('aria-selected', String(selected)); el.classList.toggle('selected', selected);
  });
  root.querySelectorAll('[data-cable-panel]').forEach(el => { el.hidden = el.dataset.cablePanel !== work.mode; });
  const portSelect = $(root, '[data-cable-port]');
  const selectedBefore = portSelect.value;
  const optionsKey = work.ports.map(p =>
    [p.path,p.manufacturer || '',p.vendorId || '',p.productId || '',p.hardwareFingerprint || ''].join('|')
  ).join('||');
  if (portSelect.dataset.optionsKey !== optionsKey) {
    portSelect.replaceChildren(...work.ports.map(p => {
      const option = document.createElement('option');
      option.value = p.path;
      option.dataset.vendorId = p.vendorId || '';
      option.dataset.productId = p.productId || '';
      option.dataset.hardwareFingerprint = p.hardwareFingerprint || '';
      const id = p.vendorId && p.productId ? ` · ${p.vendorId}:${p.productId}` : '';
      option.textContent = `${p.path} · ${p.manufacturer || 'port szeregowy'}${id}`;
      return option;
    }));
    portSelect.dataset.optionsKey = optionsKey;
  }
  const selection = work.selectedPath || selectedBefore;
  if (work.ports.some(p => p.path === selection)) portSelect.value = selection;
  $(root, '[data-cable-port-empty]').hidden = work.ports.length > 0;
  root.querySelectorAll('button[data-cable-action]').forEach(btn => { btn.disabled = work.busy; });
  $(root, '[data-cable-usb-support]').textContent = hasWebSerial()
    ? 'Przeglądarka udostępnia Web Serial. Wybierz port po zgodzie systemu.'
    : 'Ta przeglądarka nie udostępnia Web Serial. Użyj mostu Windows albo natywnego Androida.';
  $(root, '[data-cable-android]').textContent = platform() === 'android'
    ? 'Android wykryty. Oddzielny natywny USB Probe może potwierdzić USB Host, sterownik i otwarcie portu. Web UI nie otrzyma tych danych automatycznie.'
    : 'Ten ekran nie jest natywnym Androidem. Moduł Android USB Probe pozostaje częścią tego samego repozytorium.';
  const stateKey = [
    work.mode, work.detected, work.opened, work.bridgeOnline,
    root.dataset.directUsbVendorId || '', root.dataset.directUsbProductId || '',
    root.dataset.bridgeUsbVendorId || '', root.dataset.bridgeUsbProductId || '',
    root.dataset.webUsbVendorId || '', root.dataset.webUsbProductId || '',
  ].join('|');
  if (root.dataset.broadcastStateKey !== stateKey) {
    root.dataset.broadcastStateKey = stateKey;
    root.dispatchEvent(new CustomEvent('hannaada:cable-workbench-state', {
      detail: { mode: work.mode, detected: work.detected, opened: work.opened, bridgeOnline: work.bridgeOnline }
    }));
  }
}
async function action(name) {
  const root = rootNow(); if (!root || work.busy) return;
  // Read selection BEFORE display refreshes the <select> DOM.
  const requestedPort = $(root, '[data-cable-port]').value;
  if (requestedPort) work.selectedPath = requestedPort;
  work.busy = true; display();
  try {
    if (name === 'desktop-select') {
      if (!hasWebSerial()) throw new TypeError('Web Serial niedostępny w tej przeglądarce.');
      if (work.serialPort || work.opened) throw new TypeError('Najpierw zamknij lub odrzuć poprzedni port.');
      work.serialPort = await navigator.serial.requestPort();
      const info = work.serialPort.getInfo?.() || {};
      root.dataset.directUsbVendorId = usbHex(info.usbVendorId);
      root.dataset.directUsbProductId = usbHex(info.usbProductId);
      work.detected = true; work.opened = false;
      const usb = usbIdentity({ vendorId: info.usbVendorId, productId: info.usbProductId });
      let hint = 'chipset nieustalony';
      if (usb.verified) {
        try { hint = identifyUsbSerialCandidate({ vendorId: info.usbVendorId, productId: info.usbProductId }).candidate; } catch {}
      }
      report(`Cel: ${KDCAN_INPA_SWITCH_TARGET.label}. USB ${usb.vidPid || 'VID:PID brak'} · ${hint}. Port wybrany; ECU i znaczenie przełącznika nadal niepotwierdzone.`);
    } else if (name === 'desktop-open') {
      if (!work.serialPort) throw new TypeError('Najpierw wybierz port USB.');
      await work.serialPort.open({ baudRate: 9600 });
      work.detected = work.opened = true;
      report('Port USB-serial otwarty do próby transportu. Nie wysłano poleceń. ECU niezweryfikowane.');
    } else if (name === 'desktop-close') {
      if (work.serialPort && work.opened) await work.serialPort.close();
      work.serialPort = null; work.detected = work.opened = false;
      delete root.dataset.directUsbVendorId;
      delete root.dataset.directUsbProductId;
      report('Port USB zamknięty; sesja zakończona.');
    } else if (name === 'bridge-connect') {
      work.bridgeUrl = validateBridgeUrl($(root, '[data-cable-url]').value.trim());
      work.bridgeToken = $(root, '[data-cable-token]').value;
      if (work.bridgeToken.length < 32) throw new TypeError('Wprowadź token mostu (minimum 32 znaki).');
      const result = await bridgeRequest('/v1/status');
      useBridgeStatus(result); report(result.message || 'Most Windows odpowiada.');
      await listPorts();
    } else if (name === 'bridge-list') {
      await listPorts(); report(`Wykryto ${work.ports.length} portów szeregowych. Nie jest to dowód zgodności kabla BMW.`);
    } else if (name === 'bridge-ready') {
      const readiness = await applyBridgeReadiness(await bridgeRequest('/v1/readiness'));
      report(readiness.message);
    } else if (name === 'bridge-wait') {
      cableWaitAbort?.abort();
      const owner = new AbortController();
      cableWaitAbort = owner;
      report('Czekam na podłączenie kabla USB…');
      try {
        const readiness = await waitForCable(30000, owner.signal);
        report(readiness.recommendedPath ? `${readiness.message} Port został wybrany, ale nie otwarty.` : readiness.message);
      } finally {
        if (cableWaitAbort === owner) cableWaitAbort = null;
      }
    } else if (name === 'bridge-open') {
      const path = requestedPort;
      if (!path || !work.ports.some(p => p.path === path)) throw new TypeError('Wybierz port z aktualnej listy.');
      const result = await bridgeRequest('/v1/open', { path });
      useBridgeStatus(result); work.selectedPath = path;
      report(result.message || 'Port otwarty; ECU niezweryfikowane.');
    } else if (name === 'bridge-close') {
      const result = await bridgeRequest('/v1/close', {});
      useBridgeStatus(result); work.selectedPath = '';
      report(result.message || 'Port zamknięty.');
    } else if (name === 'bridge-refresh') {
      const result = await bridgeRequest('/v1/status'); useBridgeStatus(result);
      report(result.message || 'Odświeżono stan mostu.');
    }
  } catch (error) {
    if (name.startsWith('bridge-')) {
      const failure = classifyBridgeFailure(error);
      if (failure.preservePhysicalState) {
        work.bridgeOnline = true;
        report(`${errText(error)} Most nadal odpowiada; zachowano ostatni potwierdzony stan.`, true);
      } else {
        work.bridgeOnline = false; work.detected = work.opened = false;
        delete root.dataset.bridgeUsbVendorId;
        delete root.dataset.bridgeUsbProductId;
        report(`${errText(error)} Stan fizycznego portu Windows jest teraz nieznany.`, true);
      }
    } else {
      if (name === 'desktop-open') work.opened = false;
      report(errText(error), true);
    }
  } finally { work.busy = false; display(); }
}
function useBridgeStatus(raw) {
  const state = validateBridgeStatus(raw);
  const freshness = nextBridgeFreshness(work.bridgeFreshness, raw);
  if (freshness.resetLocalState) {
    work.selectedPath = '';
    work.ports = [];
    const root = rootNow();
    if (root) {
      delete root.dataset.bridgeUsbVendorId;
      delete root.dataset.bridgeUsbProductId;
    }
  }
  work.bridgeFreshness = freshness;
  work.detected = state.cableDetected; work.opened = state.portOpen; work.bridgeOnline = true;
  const root = rootNow();
  if (root) {
    const parts = typeof raw?.cableBinding?.vidPid === 'string' ? raw.cableBinding.vidPid.split(':') : [];
    if (parts.length === 2 && usbId(parts[0]) && usbId(parts[1])) {
      root.dataset.bridgeUsbVendorId = usbId(parts[0]);
      root.dataset.bridgeUsbProductId = usbId(parts[1]);
    } else {
      delete root.dataset.bridgeUsbVendorId;
      delete root.dataset.bridgeUsbProductId;
    }
  }
}
async function bridgeRequest(path, payload, { signal } = {}) {
  if (!work.bridgeUrl || !work.bridgeToken) throw new TypeError('Najpierw połącz most Windows.');
  const controller = new AbortController();
  const relayAbort = () => controller.abort(signal?.reason);
  if (signal?.aborted) relayAbort();
  else signal?.addEventListener?.('abort', relayAbort, { once: true });
  const timeout = setTimeout(() => controller.abort(), 8000);
  try {
    const result = await fetch(`${work.bridgeUrl}${path}`, {
      method: payload === undefined ? 'GET' : 'POST',
      headers: { Authorization: `Bearer ${work.bridgeToken}`, ...(payload === undefined ? {} : { 'Content-Type': 'application/json' }) },
      ...(payload === undefined ? {} : { body: JSON.stringify(payload) }),
      signal: controller.signal, mode: 'cors', cache: 'no-store', credentials: 'omit',
    });
    if (!result.ok) {
      const error = new TypeError(`Most zwrócił HTTP ${result.status}; sprawdź token, CORS, port lub certyfikat.`);
      error.httpStatus = result.status;
      throw error;
    }
    return result.json();
  } finally {
    clearTimeout(timeout);
    signal?.removeEventListener?.('abort', relayAbort);
  }
}
async function applyBridgeReadiness(result) {
  if (!result || result.version !== 1 || result.readOnly !== true || result.arbitraryTx !== false
    || !result.status || !Array.isArray(result.ports) || result.ports.length > 100) {
    throw new TypeError('Nieprawidłowy pakiet gotowości mostu.');
  }
  useBridgeStatus(result.status);
  work.ports = result.ports.filter(p => p && typeof p.path === 'string' && p.path.length <= 240).map(p => ({
    path: p.path,
    manufacturer: String(p.manufacturer || '').slice(0, 100),
    vendorId: usbId(p.vendorId),
    productId: usbId(p.productId),
    hardwareFingerprint: usbFingerprint(p.hardwareFingerprint),
  }));
  const readiness = assessCablePlugReadiness(work.ports);
  work.selectedPath = readiness.recommendedPath
    || (work.ports.some(p => p.path === result.selectedPath) ? result.selectedPath : '');
  return readiness;
}
async function waitForCable(maxMs = 30000, signal) {
  const checkAbort = () => {
    if (signal?.aborted) throw new DOMException('Wykrywanie kabla przerwane.', 'AbortError');
  };
  const delay = ms => new Promise((resolve, reject) => {
    const timer = setTimeout(resolve, ms);
    const abort = () => {
      clearTimeout(timer);
      reject(new DOMException('Wykrywanie kabla przerwane.', 'AbortError'));
    };
    if (signal?.aborted) abort();
    else signal?.addEventListener?.('abort', abort, { once: true });
  });
  checkAbort();
  const baselineResult = await bridgeRequest('/v1/readiness', undefined, { signal });
  const baselineReadiness = await applyBridgeReadiness(baselineResult);
  const baselinePorts = work.ports.map(port => ({ ...port }));

  // If a unique strong candidate is already present, do not force the user to unplug/replug it.
  if (baselineReadiness.recommendedPath) return baselineReadiness;

  const started = Date.now();
  while (Date.now() - started < maxMs) {
    await delay(1000);
    checkAbort();
    const result = await bridgeRequest('/v1/readiness', undefined, { signal });
    await applyBridgeReadiness(result);
    const appeared = findNewCablePorts(baselinePorts, work.ports);
    if (appeared.length > 0) {
      const readiness = assessCablePlugReadiness(appeared);
      work.selectedPath = readiness.recommendedPath || '';
      display();
      return Object.freeze({
        ...readiness,
        message: readiness.recommendedPath
          ? `Nowe urządzenie USB-serial wykryte na ${readiness.recommendedPath}. To nadal nie potwierdza BMW ani ECU.`
          : 'Pojawiło się nowe urządzenie szeregowe, ale identyfikacja jest niejednoznaczna. Wybierz port ręcznie.'
      });
    }
    display();
  }
  throw new TypeError('Nie wykryto nowego wiarygodnego kandydata kabla USB w ciągu 30 sekund.');
}
async function listPorts() {
  const result = await bridgeRequest('/v1/ports');
  if (!result || !Array.isArray(result.ports) || result.ports.length > 100) throw new TypeError('Nieprawidłowa lista portów mostu.');
  work.ports = result.ports.filter(p => p && typeof p.path === 'string' && p.path.length <= 240).map(p => ({
    path: p.path,
    manufacturer: String(p.manufacturer || '').slice(0, 100),
    vendorId: usbId(p.vendorId),
    productId: usbId(p.productId),
  }));
  const readiness = assessCablePlugReadiness(work.ports);
  work.selectedPath = work.ports.some(p => p.path === result.selectedPath)
    ? result.selectedPath
    : readiness.recommendedPath || '';
}
function attach() {
  const view = document.querySelector('#view');
  if (!view || view.dataset.module !== 'vci') return;
  if (rootNow()) return;
  if (platform() === 'windows') work.mode = 'bridge';
  const section = document.createElement('section'); section.id = 'haCableWorkbench'; section.className = 'ha-cable';
  section.innerHTML = `<div class="ha-cable-header"><div><small>HANNA & ADA · CABLE WORKBENCH</small><h2>Połączenie przewodowe / K+DCAN</h2><p>Jeden ekran dla Windows USB, mostu do telefonu i Android USB. Bez symulowanych odczytów ECU.</p></div><span class="ha-cable-lock">READ-ONLY · WRITE LOCKED</span></div>
    <div class="ha-cable-steps"><div data-cable-stage><span>01 · Port wybrany</span><b>NIEPOTWIERDZONE</b></div><div data-cable-stage><span>02 · Port otwarty</span><b>NIEPOTWIERDZONE</b></div><div data-cable-stage><span>03 · ECU BMW</span><b>NIEPOTWIERDZONE</b></div></div>
    <div class="ha-cable-tabs" role="tablist" aria-label="Tryb kabla"><button type="button" role="tab" data-cable-mode="desktop" aria-selected="true">Windows / Web Serial</button><button type="button" role="tab" data-cable-mode="bridge" aria-selected="false">Telefon ↔ Windows</button><button type="button" role="tab" data-cable-mode="android" aria-selected="false">Android USB</button></div>
    <div class="ha-cable-panel" data-cable-panel="desktop"><h3>Twój kabel · K+DCAN USB / INPA Compatible</h3><p><strong>Profil docelowy:</strong> kabel ze zdjęcia z fizycznym przełącznikiem. Aplikacja nie zgaduje, co oznacza pozycja przełącznika — potwierdzimy ją na konkretnym egzemplarzu.</p><p data-cable-usb-support></p><p>Przeglądarka na komputerze może uzyskać zgodę na port. Otwarcie na 9600 baud jest wyłącznie próbą portu, nie konfiguracją protokołu BMW.</p><div class="ha-cable-actions"><button type="button" data-cable-action="desktop-select">1. WYBIERZ USB</button><button type="button" data-cable-action="desktop-open">2. OTWÓRZ PORT</button><button type="button" data-cable-action="desktop-close">ZAMKNIJ</button></div></div>
    <div class="ha-cable-panel" data-cable-panel="bridge" hidden><h3>iPhone / Android ↔ Windows ↔ kabel</h3><p>Agent działa lokalnie na Windows. Telefon łączy się przez HTTPS z zaufanym certyfikatem; token nie jest zapisywany ani umieszczany w URL.</p><div class="ha-cable-fields"><label>Adres mostu (HTTPS w sieci, HTTP tylko localhost)<input data-cable-url type="url" inputmode="url" placeholder="https://adres-komputera:8765" autocomplete="off"></label><label>Token dostępu<input data-cable-token type="password" placeholder="Wpisz token lokalnego agenta" autocomplete="off"></label><label>Port USB<select data-cable-port aria-label="Port USB"></select><small data-cable-port-empty>Lista pusta — połącz i wyszukaj porty.</small></label></div><div class="ha-cable-actions"><button type="button" data-cable-action="bridge-connect">POŁĄCZ MOST</button><button type="button" data-cable-action="bridge-ready">SPRAWDŹ GOTOWOŚĆ</button><button type="button" data-cable-action="bridge-wait">CZEKAJ NA KABEL 30 s</button><button type="button" data-cable-action="bridge-list">ODŚWIEŻ PORTY</button><button type="button" data-cable-action="bridge-open">OTWÓRZ KABEL</button><button type="button" data-cable-action="bridge-refresh">STATUS</button><button type="button" data-cable-action="bridge-close">ZAMKNIJ PORT</button></div><div class="ha-cable-foot" data-cable-bridge-state>MOST NIEPOŁĄCZONY</div></div>
    <div class="ha-cable-panel" data-cable-panel="android" hidden><h3>Android · USB Host / OTG</h3><p data-cable-android></p><p>Natywny moduł USB Probe w repozytorium wykonuje odczyt VID:PID, zgodę Androida oraz otwarcie/zamknięcie portu. Integracja tego modułu z webowym ekranem i protokół BMW nie są jeszcze wdrożone. Sam Chrome nie gwarantuje obsługi konkretnego kabla.</p></div>
    <div class="ha-cable-result" role="status" aria-live="polite"><strong data-cable-message>Nie wybrano portu.</strong><span data-cable-next></span></div><p class="ha-cable-disclaimer">BMW E39 1999 z okrągłym złączem: zgodność adaptera 20-pin ↔ 16-pin i dostęp do linii modułów trzeba potwierdzić dla konkretnego egzemplarza. Żaden tryb nie udostępnia kodowania, kasowania błędów ani flashowania.</p>`;
  view.appendChild(section);
  window.dispatchEvent(new CustomEvent('hannaada:cable-workbench-mounted'));
  const urlInput = section.querySelector('[data-cable-url]');
  if (platform() === 'windows' && urlInput && !urlInput.value) urlInput.value = 'http://127.0.0.1:8765';
  section.querySelector('[data-cable-port]').addEventListener('change', event => { work.selectedPath = event.target.value; });
  section.querySelectorAll('[data-cable-mode]').forEach(button => button.addEventListener('click', () => {
    if (work.opened && work.mode !== button.dataset.cableMode) { report('Najpierw zamknij aktywny port kabla.', true); return; }
    if (work.mode !== button.dataset.cableMode && work.mode === 'desktop') {
      work.serialPort = null;
      delete section.dataset.directUsbVendorId;
      delete section.dataset.directUsbProductId;
    }
    if (work.mode !== button.dataset.cableMode && work.mode === 'bridge') {
      work.selectedPath = '';
      work.ports = [];
      work.bridgeFreshness = null;
      delete section.dataset.bridgeUsbVendorId;
      delete section.dataset.bridgeUsbProductId;
    }
    work.mode = button.dataset.cableMode; work.detected = work.opened = false; display();
  }));
  section.querySelectorAll('button[data-cable-action]').forEach(button => button.addEventListener('click', () => action(button.dataset.cableAction)));
  display();
}
if (typeof document !== 'undefined') {
  const onModuleRendered = event => {
    if (event.detail?.module !== 'vci') {
      cableWaitAbort?.abort();
      cableWaitAbort = null;
      return;
    }
    attach();
  };
  const start = () => {
    window.addEventListener('hannaada:module-rendered', onModuleRendered);
    attach();
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true }); else start();
  navigator.serial?.addEventListener?.('disconnect', event => {
    if (work.serialPort && (event.port === work.serialPort || event.target === work.serialPort)) {
      work.serialPort = null; work.detected = work.opened = false;
      const root = rootNow();
      if (root) {
        delete root.dataset.directUsbVendorId;
        delete root.dataset.directUsbProductId;
      }
      report('Port USB odłączony. Status ECU unieważniony.', true); display();
    }
  });
}
