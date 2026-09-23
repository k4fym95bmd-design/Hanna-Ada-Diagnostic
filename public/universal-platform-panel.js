import { chooseTransportRoute } from './universal-transport-router.js';

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

    const usbBound = !!(root.dataset.bridgeUsbVendorId && root.dataset.bridgeUsbProductId);
    section.querySelector('[data-windows-gateway-status]').textContent =
      `Profil laptopa: 12 GB RAM · wymagany runtime Node >=20. Rzeczywisty runtime sprawdza doctor:windows. Bridge ${bridgeReachable ? 'OK' : 'NIEPOŁĄCZONY'} · USB ID ${usbBound ? 'OK' : 'BRAK'}.`;
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
