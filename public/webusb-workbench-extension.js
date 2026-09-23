import { webUsbAvailable, chooseWebUsbDevice, probeWebUsbAccess } from './webusb-cable-discovery.js';
import { identifyUsbSerialCandidate } from './usb-chipset-candidates.js';

// A secondary, browser-only Android path inside the EXISTING VCI screen.
// Nothing here can transmit USB packets, open a serial line or validate a BMW ECU.
let chosenDevice = null;
let inProgress = false;
const root = () => document.querySelector('#haWebUsb');
const workbenchRoot = () => document.querySelector('#haCableWorkbench');
const hex4 = value => Number.isInteger(value) && value >= 0 && value <= 0xFFFF ? value.toString(16).toUpperCase().padStart(4, '0') : '';
function clearPublishedUsb() {
  const workbench = workbenchRoot();
  if (!workbench) return;
  delete workbench.dataset.webUsbVendorId;
  delete workbench.dataset.webUsbProductId;
}
function publishUsb(device) {
  const workbench = workbenchRoot();
  if (!workbench) return;
  const vendorId = hex4(device?.vendorId);
  const productId = hex4(device?.productId);
  if (!vendorId || !productId) return clearPublishedUsb();
  workbench.dataset.webUsbVendorId = vendorId;
  workbench.dataset.webUsbProductId = productId;
}
function message(text, error = false) {
  const status = root()?.querySelector('[data-webusb-status]');
  if (!status) return;
  status.textContent = text;
  status.classList.toggle('ha-cable-error', error);
}
function updateButtons() {
  const panel = root();
  if (!panel) return;
  const available = webUsbAvailable(navigator.usb) && window.isSecureContext;
  panel.querySelector('[data-webusb-select]').disabled = inProgress || !available;
  panel.querySelector('[data-webusb-probe]').disabled = inProgress || !chosenDevice;
  panel.querySelector('[data-webusb-reset]').disabled = inProgress || !chosenDevice;
  if (!available && !chosenDevice) message('WebUSB niedostępny w tej przeglądarce lub poza HTTPS. Natywny USB Probe pozostaje alternatywą.', true);
}
async function choose() {
  if (inProgress) return;
  inProgress = true; updateButtons();
  try {
    // This call is reached immediately from the button's real user gesture.
    const { device, evidence } = await chooseWebUsbDevice(navigator.usb);
    chosenDevice = device;
    publishUsb(device);
    const candidate = identifyUsbSerialCandidate(device);
    message(`Android/USB ${evidence.vidPid} · wskazówka chipsetu: ${candidate.candidate}. ${candidate.nextStep} Kabel K+DCAN, port szeregowy i ECU nadal NIEPOTWIERDZONE.`);
  } catch (error) {
    chosenDevice = null;
    clearPublishedUsb();
    message(error?.name === 'NotFoundError' ? 'Nie wybrano urządzenia USB.' : 'Chrome nie uzyskał dostępu do USB. Sprawdź OTG, uprawnienia i zgodność kabla.', true);
  } finally { inProgress = false; updateButtons(); }
}
async function probe() {
  if (inProgress || !chosenDevice) return;
  inProgress = true; updateButtons();
  try {
    const evidence = await probeWebUsbAccess(chosenDevice);
    const candidate = identifyUsbSerialCandidate(chosenDevice);
    message(`Otwarto i zamknięto urządzenie ${evidence.vidPid}. Kandydat: ${candidate.candidate}. Zero poleceń do BMW. Sterownik USB-serial, port i ECU NIEPOTWIERDZONE.`);
  } catch {
    // Rejecting close/open is not success: explicitly invalidate this discovery session.
    chosenDevice = null;
    clearPublishedUsb();
    message('Test WebUSB nie powiódł się albo zamknięcie nie zostało potwierdzone. Nie oznaczam połączenia jako gotowego.', true);
  } finally { inProgress = false; updateButtons(); }
}
function reset() {
  if (inProgress) return;
  chosenDevice = null;
  clearPublishedUsb();
  message('Sesję wykrywania WebUSB wyczyszczono. Port i ECU niepołączone.');
  updateButtons();
}
function attach() {
  const androidPanel = document.querySelector('#haCableWorkbench [data-cable-panel="android"]');
  if (!androidPanel || root()) return;
  const section = document.createElement('section');
  section.id = 'haWebUsb';
  section.className = 'ha-cable-panel';
  section.setAttribute('aria-label', 'Android WebUSB discovery');
  section.innerHTML = `<h3>Android Chrome · kabel USB bez komputera</h3><p>WebUSB: wybierz urządzenie, sprawdź dostęp USB i zamknij je bez transmisji. Identyfikator USB może wskazać rodzinę układu, ale nie potwierdza K+DCAN, sterownika ani ECU.</p><div class="ha-cable-actions"><button type="button" data-webusb-select>WYBIERZ USB / OTG</button><button type="button" data-webusb-probe disabled>SPRAWDŹ DOSTĘP USB</button><button type="button" data-webusb-reset disabled>WYCZYŚĆ</button></div><p role="status" aria-live="polite" data-webusb-status>Nie wybrano urządzenia. Port i ECU niepotwierdzone.</p>`;
  androidPanel.appendChild(section);
  section.querySelector('[data-webusb-select]').addEventListener('click', choose);
  section.querySelector('[data-webusb-probe]').addEventListener('click', probe);
  section.querySelector('[data-webusb-reset]').addEventListener('click', reset);
  updateButtons();
}
if (typeof document !== 'undefined') {
  const start = () => {
    const view = document.querySelector('#view');
    if (!view) return;
    new MutationObserver(attach).observe(view, { childList: true, subtree: true });
    attach();
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
  else start();
  navigator.usb?.addEventListener?.('disconnect', event => {
    if (event.device && event.device === chosenDevice) {
      chosenDevice = null;
      clearPublishedUsb();
      message('Kabel USB został odłączony. Dowody dostępu unieważnione.', true);
      updateButtons();
    }
  });
}
