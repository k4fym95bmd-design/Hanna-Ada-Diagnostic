import { validateBridgeUrl } from './cable-connection-model.js';

// Add passive RX evidence to the EXISTING Windows bridge tab. No TX endpoint,
// no automatic polling and no attempt to turn a frame into ECU verification.
function attach() {
  const panel = document.querySelector('#haCableWorkbench [data-cable-panel="bridge"]');
  if (!panel || panel.querySelector('[data-cable-rx-read]')) return;
  const wrap = document.createElement('div');
  wrap.className = 'ha-cable-foot';
  const button = document.createElement('button');
  button.type = 'button';
  button.dataset.cableRxRead = '';
  button.textContent = 'ODCZYTAJ PASYWNY RX';
  const result = document.createElement('pre');
  result.dataset.cableRxResult = '';
  result.setAttribute('role', 'status');
  result.setAttribute('aria-live', 'polite');
  result.style.cssText = 'white-space:pre-wrap;overflow-wrap:anywhere;max-height:240px;overflow:auto';
  result.textContent = 'Nasłuch dostępny po otwarciu portu. Bez wysyłania poleceń.';
  wrap.append(button, result);
  panel.appendChild(wrap);
  button.addEventListener('click', async () => {
    if (button.disabled) return;
    button.disabled = true;
    result.textContent = 'Sprawdzanie odbioru z bieżącej sesji kabla…';
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);
    try {
      const root = document.querySelector('#haCableWorkbench');
      if (!root || !root.contains(panel)) return;
      const url = validateBridgeUrl(root.querySelector('[data-cable-url]')?.value.trim() || '');
      const token = root.querySelector('[data-cable-token]')?.value || '';
      if (token.length < 32) throw new TypeError('Brak tokenu mostu (minimum 32 znaki).');
      const options = { headers: { Authorization: `Bearer ${token}` }, mode: 'cors', cache: 'no-store', credentials: 'omit', signal: controller.signal };
      const response = await fetch(`${url}/v1/rx`, options);
      if (!response.ok) throw new TypeError(`Most RX zwrócił HTTP ${response.status}.`);
      const data = await response.json();
      if (!data || data.version !== 1 || data.ecuVerified !== false || !Array.isArray(data.frames) || data.frames.length > 16) {
        throw new TypeError('Nieprawidłowa odpowiedź mostu RX.');
      }
      if (!data.portOpen || !/^[a-f0-9]{40}$/i.test(data.sessionId || '')) {
        result.textContent = 'Port zamknięty. Brak bieżącej sesji RX.';
        return;
      }
      const statusResponse = await fetch(`${url}/v1/status`, options);
      if (!statusResponse.ok) throw new TypeError('Nie można ponownie potwierdzić sesji mostu.');
      const status = await statusResponse.json();
      if (!status.portOpen || status.sessionId !== data.sessionId || status.ecuVerified !== false) {
        result.textContent = 'Sesja zmieniła się podczas odczytu. Stare dane odrzucone.';
        return;
      }
      const frames = data.frames.map(frame => {
        if (!frame || frame.ecuVerified !== false || typeof frame.frameHex !== 'string'
          || !/^(?:[0-9A-F]{2})(?: [0-9A-F]{2}){3,254}$/.test(frame.frameHex)) {
          throw new TypeError('Nieprawidłowe ramki RX.');
        }
        return frame.frameHex;
      });
      const bytes = Number.isSafeInteger(data.observedBytes) && data.observedBytes >= 0 ? data.observedBytes : '?';
      if (panel.isConnected) result.textContent = `Odebrano bajtów: ${bytes}; ramek zgodnych ze składnią DS2: ${frames.length}.\n${frames.join('\n') || 'Brak kompletnych ramek.'}\nUWAGA: echo lub szum mogą dać ramkę. ECU niepotwierdzone; nie wysłano komend.`;
    } catch (error) {
      if (panel.isConnected) result.textContent = error?.name === 'AbortError' ? 'Przekroczony czas odbioru mostu.' : (error instanceof TypeError ? error.message : 'Nasłuch RX nie powiódł się.');
    } finally { clearTimeout(timeout); button.disabled = false; }
  });
}
if (typeof document !== 'undefined') {
  const start = () => {
    const view = document.querySelector('#view');
    if (!view) return;
    new MutationObserver(attach).observe(view, { childList: true });
    attach();
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
  else start();
}
