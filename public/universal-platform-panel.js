import { chooseTransportRoute, assessWindowsGateway } from './universal-transport-router.js';

const detectPlatform = () => {
  const ua = navigator.userAgent || '';
  if (/iPhone|iPad|iPod/i.test(ua)) return 'ios';
  if (/Android/i.test(ua)) return 'android';
  if (/Windows/i.test(ua)) return 'windows';
  return 'desktop';
};

function attachUniversalPanel() {
  const root = document.querySelector('#haCableWorkbench');
  if (!root || root.querySelector('[data-universal-route]')) return;

  const section = document.createElement('section');
  section.dataset.universalRoute = '';
  section.className = 'ha-cable-panel';
  section.innerHTML = `
    <h3>Universal Link · iOS / Android / Windows</h3>
    <p data-universal-route-status></p>
    <p data-windows-gateway-status></p>
  `;
  root.appendChild(section);

  const render = () => {
    const bridgeReachable = root.querySelector('[data-cable-bridge-state]')?.textContent === 'MOST ODPOWIADA';
    const route = chooseTransportRoute({
      platform: detectPlatform(),
      bridgeReachable,
      secureContext: window.isSecureContext,
      webSerial: !!navigator.serial?.requestPort,
      webUsb: !!navigator.usb?.requestDevice,
      nativeUsbHost: root.dataset.androidNativeUsb === 'true',
    });

    section.querySelector('[data-universal-route-status]').textContent =
      `Trasa: ${route.route}. ${route.reason} Tryb read-only; zapis zablokowany.`;

    const gateway = assessWindowsGateway({
      ramGb: 12,
      nodeMajor: 24,
      bridgeReachable,
      usbIdentityKnown: !!(root.dataset.bridgeUsbVendorId && root.dataset.bridgeUsbProductId),
    });
    section.querySelector('[data-windows-gateway-status]').textContent =
      `Laptop 12 GB RAM: pamięć ${gateway.memoryReady ? 'OK' : 'NIE'} · runtime Node 24 ${gateway.runtimeReady ? 'OK' : 'NIE'} · bridge ${gateway.transportReady ? 'OK' : 'NIEPOŁĄCZONY'} · USB ID ${gateway.usbBound ? 'OK' : 'BRAK'}. ${gateway.note}`;
  };

  new MutationObserver(render).observe(root, { attributes: true, subtree: true, childList: true, characterData: true });
  render();
}

if (typeof document !== 'undefined') {
  const start = () => {
    const view = document.querySelector('#view');
    if (!view) return;
    new MutationObserver(attachUniversalPanel).observe(view, { childList: true, subtree: true });
    attachUniversalPanel();
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
  else start();
}
