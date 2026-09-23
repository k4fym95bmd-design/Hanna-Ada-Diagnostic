import { USER_KDCAN_CABLE, assessUserKdcanCable } from './kdcan-cable-profile.js';

const hexToInt = value => /^[0-9A-F]{4}$/i.test(value || '') ? Number.parseInt(value, 16) : null;

function attachKdcanCard() {
  const root = document.querySelector('#haCableWorkbench');
  if (!root || root.querySelector('[data-user-kdcan-card]')) return;

  const card = document.createElement('section');
  card.dataset.userKdcanCard = '';
  card.className = 'ha-cable-panel';
  card.innerHTML = `
    <h3>Twój kabel · K+DCAN USB / INPA · Android-first</h3>
    <p><strong>Rozpoznane ze zdjęcia:</strong> ${USER_KDCAN_CABLE.visibleLabel}. Widoczny jest fizyczny przełącznik 2-pozycyjny.</p>
    <div class="ha-cable-fields">
      <label>Pozycja przełącznika
        <select data-user-kdcan-selector>
          <option value="unknown">Nie wiem / nie zapisano</option>
          <option value="position-1">Pozycja 1</option>
          <option value="position-2">Pozycja 2</option>
        </select>
      </label>
    </div>
    <div class="ha-cable-actions">
      <button type="button" data-user-kdcan-refresh>ODŚWIEŻ PROFIL KABLA</button>
    </div>
    <p role="status" aria-live="polite" data-user-kdcan-status>
      Chipset USB, sterownik, protokół BMW i ECU są niepotwierdzone.
    </p>
  `;

  const status = card.querySelector('[data-user-kdcan-status]');
  const selector = card.querySelector('[data-user-kdcan-selector]');

  const render = () => {
    const portSelect = root.querySelector('[data-cable-port]');
    const option = portSelect?.selectedOptions?.[0];
    const vendorId = hexToInt(option?.dataset?.vendorId);
    const productId = hexToInt(option?.dataset?.productId);
    const args = { selectorPosition: selector.value };
    if (vendorId != null && productId != null) {
      args.vendorId = vendorId;
      args.productId = productId;
    }
    const result = assessUserKdcanCable(args);
    status.textContent = [
      `Profil: ${result.visibleLabel}.`,
      result.vidPid ? `USB VID:PID ${result.vidPid}.` : 'VID:PID jeszcze nieodczytany z urządzenia USB.',
      `Chipset: ${result.chipsetCandidate}.`,
      `Przełącznik: ${result.selectorPosition}.`,
      'To nadal nie potwierdza sterownika BMW, K-Line/KWP/DS2, ECU ani możliwości zapisu.'
    ].join(' ');
  };

  card.querySelector('[data-user-kdcan-refresh]').addEventListener('click', render);
  selector.addEventListener('change', render);
  root.querySelector('[data-cable-port]')?.addEventListener('change', render);
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
