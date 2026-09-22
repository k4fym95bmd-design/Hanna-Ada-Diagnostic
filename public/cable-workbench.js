import { cableStatus, validateBridgeStatus, validateBridgeUrl } from './cable-connection-model.js';

// Adds a cable route to the EXISTING VCI page; does not replace the BLE runtime.
// Only enumerate and open/close a serial port. No ECU TX/RX is performed.
const work = { mode: 'desktop', serialPort: null, bridgeUrl: null, bridgeToken: null, ports: [], selectedPath: '', bridgeOnline: false, detected: false, opened: false, busy: false, message: 'Nie wybrano kabla.' };
const $ = (root, sel) => root.querySelector(sel);
const hasWebSerial = () => typeof navigator !== 'undefined' && !!navigator.serial?.requestPort;
const platform = () => /Android/i.test(navigator.userAgent) ? 'android' : /iPhone|iPad|iPod/i.test(navigator.userAgent) ? 'ios' : 'desktop';
const errText = e => e instanceof TypeError ? e.message : 'Operacja nie powiodła się. Sprawdź uprawnienia, sterownik i połączenie.';
const rootNow = () => document.querySelector('#haCableWorkbench');
const report = (message, failed = false) => { work.message = message; const r = rootNow(); if (r) { $(r, '[data-cable-message]').textContent = message; $(r, '[data-cable-message]').classList.toggle('ha-cable-error', failed); } };
function display() {
  const root = rootNow(); if (!root) return;
  const status = cableStatus({ cableDetected: work.detected, portOpen: work.opened });
  const states = [status.cableDetected, status.portOpen, status.ecuVerified];
  root.querySelectorAll('[data-cable-stage]').forEach((item, index) => {
    item.classList.toggle('verified', states[index]);
    item.querySelector('b').textContent = states[index] ? 'POTWIERDZONE' : 'NIEPOTWIERDZONE';
  });
  $(root, '[data-cable-next]').textContent = status.nextStep;
  $(root, '[data-cable-bridge-state]').textContent = work.bridgeOnline ? 'MOST ODPOWIADA' : 'MOST NIEPOŁĄCZONY';
  root.querySelectorAll('[data-cable-mode]').forEach(el => {
    const selected = el.dataset.cableMode === work.mode;
    el.setAttribute('aria-selected', String(selected));
    el.classList.toggle('selected', selected);
  });
  root.querySelectorAll('[data-cable-panel]').forEach(el => { el.hidden = el.dataset.cablePanel !== work.mode; });
  $(root, '[data-cable-port]').replaceChildren(...work.ports.map(p => {
    const option = document.createElement('option'); option.value = p.path; option.textContent = `${p.path} · ${p.manufacturer || 'USB serial'}`; return option;
  }));
  const portSelect = $(root, '[data-cable-port]');
  if (work.ports.some(p => p.path === work.selectedPath)) portSelect.value = work.selectedPath;
  $(root, '[data-cable-port-empty]').hidden = work.ports.length > 0;
  root.querySelectorAll('button[data-cable-action]').forEach(btn => { btn.disabled = work.busy; });
  $(root, '[data-cable-usb-support]').textContent = hasWebSerial()
    ? 'Przeglądarka udostępnia Web Serial. Wybierz port po zgodzie systemu.'
    : 'Ta przeglądarka nie udostępnia Web Serial. Użyj mostu Windows albo natywnego Androida.';
  $(root, '[data-cable-android]').textContent = platform() === 'android'
    ? 'Android wykryty. Oddzielny natywny USB Probe może potwierdzić USB Host, sterownik i otwarcie portu. Web UI nie otrzyma tych danych automatycznie.'
    : 'Ten ekran nie jest natywnym Androidem. Moduł Android USB Probe pozostaje osobną częścią tego repozytorium.';
}
async function action(name) {
  const root = rootNow(); if (!root || work.busy) return;
  work.busy = true; display();
  try {
    if (name === 'desktop-select') {
      if (!hasWebSerial()) throw new TypeError('Web Serial niedostępny w tej przeglądarce.');
      if (work.serialPort?.readable || work.opened) throw new TypeError('Najpierw zamknij obecny port.');
      work.serialPort = await navigator.serial.requestPort();
      const info = work.serialPort.getInfo?.() || {};
      work.detected = true; work.opened = false;
      report(`Wybrano kabel USB (VID ${info.usbVendorId ?? '—'}, PID ${info.usbProductId ?? '—'}). ECU niepołączone.`);
    } else if (name === 'desktop-open') {
      if (!work.serialPort) throw new TypeError('Najpierw wybierz port USB.');
      await work.serialPort.open({ baudRate: 9600 });
      work.detected = work.opened = true;
      report('Port USB-serial otwarty do próby transportu. Nie wysłano poleceń. ECU niezweryfikowane.');
    } else if (name === 'desktop-close') {
      if (work.serialPort && work.opened) await work.serialPort.close();
      work.serialPort = null; work.detected = work.opened = false;
      report('Port USB zamknięty; sesja zakończona.');
    } else if (name === 'bridge-connect') {
      work.bridgeUrl = validateBridgeUrl($(root, '[data-cable-url]').value.trim());
      work.bridgeToken = $(root, '[data-cable-token]').value;
      if (work.bridgeToken.length < 32) throw new TypeError('Wprowadź token mostu (minimum 32 znaki).');
      const result = await bridgeRequest('/v1/status');
      useBridgeStatus(result);
      work.bridgeOnline = true;
      report(result.message || 'Most Windows odpowiada.');
      await listPorts();
    } else if (name === 'bridge-list') {
      await listPorts(); report(`Wykryto ${work.ports.length} portów szeregowych. Wybór portu nie potwierdza kabla BMW.`);
    } else if (name === 'bridge-open') {
      const path = $(root, '[data-cable-port]').value;
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
    if (name.startsWith('bridge-')) { work.bridgeOnline = false; work.detected = work.opened = false; }
    if (name === 'desktop-open') work.opened = false;
    report(errText(error), true);
  } finally { work.busy = false; display(); }
}
function useBridgeStatus(raw) {
  const state = validateBridgeStatus(raw);
  work.detected = state.cableDetected;
  work.opened = state.portOpen;
  work.bridgeOnline = true;
}
async function bridgeRequest(path, payload) {
  if (!work.bridgeUrl || !work.bridgeToken) throw new TypeError('Najpierw połącz most Windows.');
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);
  try {
    const result = await fetch(`${work.bridgeUrl}${path}`, {
      method: payload === undefined ? 'GET' : 'POST',
      headers: { Authorization: `Bearer ${work.bridgeToken}`, ...(payload === undefined ? {} : { 'Content-Type': 'application/json' }) },
      ...(payload === undefined ? {} : { body: JSON.stringify(payload) }),
      signal: controller.signal, mode: 'cors', cache: 'no-store', credentials: 'omit',
    });
    if (!result.ok) throw new TypeError(`Most zwrócił HTTP ${result.status}; sprawdź token, CORS, port lub certyfikat.`);
    return result.json();
  } finally { clearTimeout(timeout); }
}
async function listPorts() {
  const result = await bridgeRequest('/v1/ports');
  if (!result || !Array.isArray(result.ports) || result.ports.length > 100) throw new TypeError('Nieprawidłowa lista portów mostu.');
  work.ports = result.ports.filter(p => p && typeof p.path === 'string' && p.path.length <= 240).map(p => ({ path: p.path, manufacturer: String(p.manufacturer || '').slice(0, 100) }));
  work.selectedPath = result.selectedPath || '';
}
function attach() {
  const view = document.querySelector('#view');
  if (!view || ![...view.querySelectorAll('.hero h1')].some(el => /VCI \/ Connection/.test(el.textContent))) return;
  if (rootNow()) return;
  const section = document.createElement('section'); section.id = 'haCableWorkbench'; section.className = 'ha-cable';
  section.innerHTML = `<div class="ha-cable-header"><div><small>HANNA & ADA · CABLE WORKBENCH</small><h2>Połączenie przewodowe / K+DCAN</h2><p>Jeden ekran dla Windows USB, mostu do telefonu i Android USB. Bez symulowanych odczytów ECU.</p></div><span class="ha-cable-lock">READ-ONLY · WRITE LOCKED</span></div>
    <div class="ha-cable-steps"><div data-cable-stage><span>01 · Kabel USB</span><b>NIEPOTWIERDZONE</b></div><div data-cable-stage><span>02 · Port szeregowy</span><b>NIEPOTWIERDZONE</b></div><div data-cable-stage><span>03 · ECU BMW</span><b>NIEPOTWIERDZONE</b></div></div>
    <div class="ha-cable-tabs" role="tablist" aria-label="Tryb kabla"><button type="button" role="tab" data-cable-mode="desktop" aria-selected="true">Windows / Web Serial</button><button type="button" role="tab" data-cable-mode="bridge" aria-selected="false">Telefon ↔ Windows</button><button type="button" role="tab" data-cable-mode="android" aria-selected="false">Android USB</button></div>
    <div class="ha-cable-panel" data-cable-panel="desktop"><h3>Komputer · kabel USB</h3><p data-cable-usb-support></p><p>Przeglądarka na komputerze może uzyskać zgodę na port. Otwarcie na 9600 baud jest wyłącznie próbą portu, nie konfiguracją protokołu BMW.</p><div class="ha-cable-actions"><button type="button" data-cable-action="desktop-select">1. WYBIERZ USB</button><button type="button" data-cable-action="desktop-open">2. OTWÓRZ PORT</button><button type="button" data-cable-action="desktop-close">ZAMKNIJ</button></div></div>
    <div class="ha-cable-panel" data-cable-panel="bridge" hidden><h3>iPhone / Android ↔ Windows ↔ kabel</h3><p>Agent działa lokalnie na Windows. Telefon łączy się przez HTTPS z zaufanym certyfikatem; token nie jest zapisywany ani umieszczany w URL.</p><div class="ha-cable-fields"><label>Adres mostu (HTTPS w sieci, HTTP tylko localhost)<input data-cable-url type="url" inputmode="url" placeholder="https://adres-komputera:8765" autocomplete="off"></label><label>Token dostępu<input data-cable-token type="password" placeholder="Wpisz token lokalnego agenta" autocomplete="off"></label><label>Port USB<select data-cable-port aria-label="Port USB"></select><small data-cable-port-empty>Lista pusta — połącz i wyszukaj porty.</small></label></div><div class="ha-cable-actions"><button type="button" data-cable-action="bridge-connect">POŁĄCZ MOST</button><button type="button" data-cable-action="bridge-list">ODŚWIEŻ PORTY</button><button type="button" data-cable-action="bridge-open">OTWÓRZ KABEL</button><button type="button" data-cable-action="bridge-refresh">STATUS</button><button type="button" data-cable-action="bridge-close">ZAMKNIJ PORT</button></div><div class="ha-cable-foot" data-cable-bridge-state>MOST NIEPOŁĄCZONY</div></div>
    <div class="ha-cable-panel" data-cable-panel="android" hidden><h3>Android · USB Host / OTG</h3><p data-cable-android></p><p>Natywny moduł USB Probe w repozytorium wykonuje odczyt VID:PID, zgodę Androida oraz otwarcie/zamknięcie portu. Integracja tego modułu z webowym ekranem i protokół BMW nie są jeszcze wdrożone. Sam Chrome nie gwarantuje obsługi konkretnego kabla.</p></div>
    <div class="ha-cable-result" role="status" aria-live="polite"><strong data-cable-message>Nie wybrano kabla.</strong><span data-cable-next></span></div><p class="ha-cable-disclaimer">BMW E39 1999 z okrągłym złączem: zgodność adaptera 20-pin ↔ 16-pin i dostęp do linii modułów trzeba potwierdzić dla konkretnego egzemplarza. Żaden tryb nie udostępnia kodowania, kasowania błędów ani flashowania.</p>`;
  view.appendChild(section);
  section.querySelectorAll('[data-cable-mode]').forEach(button => button.addEventListener('click', () => {
    if (work.opened && work.mode !== button.dataset.cableMode) { report('Najpierw zamknij aktywny port kabla.', true); return; }
    work.mode = button.dataset.cableMode; work.detected = false; work.opened = false; display();
  }));
  section.querySelectorAll('button[data-cable-action]').forEach(button => button.addEventListener('click', () => action(button.dataset.cableAction)));
  display();
}
if (typeof document !== 'undefined') {
  const start = () => { const view = document.querySelector('#view'); if (!view) return; new MutationObserver(attach).observe(view, { childList: true }); attach(); };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true }); else start();
  navigator.serial?.addEventListener?.('disconnect', event => {
    if (work.serialPort && event.target === work.serialPort) { work.serialPort = null; work.detected = work.opened = false; report('Kabel USB odłączony. Status ECU unieważniony.', true); display(); }
  });
}
