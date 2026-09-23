import { KDCAN_INPA_SWITCH_TARGET, kdcanRuntimeStatus } from './kdcan-cable-profile.js';

const hexToInt = value => /^[0-9A-F]{4}$/i.test(value || '') ? Number.parseInt(value, 16) : null;

function currentUsbIdentity(root) {
  const mode = root.dataset.cableModeCurrent || 'desktop';

  if (mode === 'desktop') {
    const vendorId = hexToInt(root.dataset.directUsbVendorId);
    const productId = hexToInt(root.dataset.directUsbProductId);
    return vendorId != null && productId != null ? { vendorId, productId } : {};
  }

  if (mode === 'bridge') {
    let vendorId = hexToInt(root.dataset.bridgeUsbVendorId);
    let productId = hexToInt(root.dataset.bridgeUsbProductId);
    if (vendorId != null && productId != null) return { vendorId, productId };

    const option = root.querySelector('[data-cable-port]')?.selectedOptions?.[0];
    vendorId = hexToInt(option?.dataset?.vendorId);
    productId = hexToInt(option?.dataset?.productId);
    return vendorId != null && productId != null ? { vendorId, productId } : {};
  }

  if (mode === 'android') {
    const vendorId = hexToInt(root.dataset.webUsbVendorId);
    const productId = hexToInt(root.dataset.webUsbProductId);
    return vendorId != null && productId != null ? { vendorId, productId } : {};
  }

  return {};
}

function attachKdcanCard() {
  const root = document.querySelector('#haCableWorkbench');
  if (!root || root.querySelector('[data-user-kdcan-card]')) return;

  const card = document.createElement('section');
  card.dataset.userKdcanCard = '';
  card.className = 'ha-cable-panel';
  card.innerHTML = `
    <h3>Twój kabel · K+DCAN USB / INPA Compatible</h3>
    <p><strong>Profil:</strong> ${KDCAN_INPA_SWITCH_TARGET.label}. Ze zdjęcia potwierdzony jest fizyczny przełącznik, ale jego znaczenie elektryczne nadal pozostaje niezweryfikowane.</p>
    <div class="ha-cable-fields">
      <label>Pozycja przełącznika
        <select data-user-kdcan-selector>
          <option value="UNKNOWN">Nie wiem / nie zapisano</option>
          <option value="A">Pozycja A</option>
          <option value="B">Pozycja B</option>
        </select>
      </label>
    </div>
    <div class="ha-cable-actions">
      <button type="button" data-user-kdcan-refresh>ODŚWIEŻ PROFIL KABLA</button>
    </div>
    <p role="status" aria-live="polite" data-user-kdcan-status>
      Czekam na rzeczywisty VID:PID z wybranego urządzenia USB.
    </p>
  `;

  const status = card.querySelector('[data-user-kdcan-status]');
  const selector = card.querySelector('[data-user-kdcan-selector]');

  const render = () => {
    const usb = currentUsbIdentity(root);
    const runtime = kdcanRuntimeStatus({
      usb,
      portOpen: root.dataset.cablePortOpen === 'true',
      switchEvidence: { position: selector.value },
      connector: {},
    });

    const parts = [
      `Profil: ${runtime.target.label}.`,
      runtime.usb.vidPid ? `USB VID:PID ${runtime.usb.vidPid}.` : 'VID:PID jeszcze nieodczytany.',
      `Port: ${runtime.portOpen ? 'otwarty' : 'zamknięty'}.`,
      `Przełącznik: ${runtime.switch.position}; znaczenie: ${runtime.switch.meaningVerified ? 'zweryfikowane' : 'niezweryfikowane'}.`,
      `Następna bramka: ${runtime.nextGate}`,
      'ECU, zapis, kodowanie i flash pozostają zablokowane.'
    ];
    status.textContent = parts.join(' ');
  };

  card.querySelector('[data-user-kdcan-refresh]').addEventListener('click', render);
  selector.addEventListener('change', render);
  root.querySelector('[data-cable-port]')?.addEventListener('change', render);

  const observer = new MutationObserver(render);
  observer.observe(root, { attributes: true, attributeFilter: [
    'data-cable-port-open',
    'data-cable-mode-current',
    'data-direct-usb-vendor-id',
    'data-direct-usb-product-id',
    'data-bridge-usb-vendor-id',
    'data-bridge-usb-product-id',
    'data-web-usb-vendor-id',
    'data-web-usb-product-id',
  ]});

  root.appendChild(card);
  render();
}

if (typeof document !== 'undefined') {
  const start = () => {
    const view = document.querySelector('#view');
    if (!view) return;
    new MutationObserver(attachKdcanCard).observe(view, { childList: true, subtree: true });
    attachKdcanCard();
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
  else start();
}
