import { validateBridgeStatus, validateBridgeUrl } from './cable-connection-model.js';
import { EVIDENCE_CONTRACT_VERSION, EVIDENCE_STAGES, EVIDENCE_GATES } from './evidence-contract.js';

// Add passive RX evidence to the EXISTING Windows bridge tab. No TX endpoint,
// no automatic polling and no attempt to turn a frame into ECU verification.
function attach() {
  const panel = document.querySelector('#haCableWorkbench [data-cable-panel="bridge"]');
  if (!panel || panel.querySelector('[data-cable-rx-read]')) return;
  const wrap = document.createElement('div');
  wrap.className = 'ha-cable-foot';
  const healthButton = document.createElement('button');
  healthButton.type = 'button';
  healthButton.dataset.cableHealthRead = '';
  healthButton.textContent = 'PODSUMUJ SESJĘ';
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
  wrap.append(healthButton, button, result);
  panel.appendChild(wrap);
  healthButton.addEventListener('click', async () => {
    if (healthButton.disabled) return;
    healthButton.disabled = true;
    result.textContent = 'Sprawdzanie stanu bieżącej sesji kabla…';
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);
    try {
      const root = document.querySelector('#haCableWorkbench');
      if (!root || !root.contains(panel)) return;
      const url = validateBridgeUrl(root.querySelector('[data-cable-url]')?.value.trim() || '');
      const token = root.querySelector('[data-cable-token]')?.value || '';
      if (token.length < 32) throw new TypeError('Brak tokenu mostu (minimum 32 znaki).');
      const response = await fetch(`${url}/v1/telemetry`, {
        headers: { Authorization: `Bearer ${token}` },
        mode: 'cors', cache: 'no-store', credentials: 'omit', signal: controller.signal,
      });
      if (!response.ok) throw new TypeError(`Most telemetry zwrócił HTTP ${response.status}.`);
      const data = await response.json();
      const integer = value => Number.isSafeInteger(value) && value >= 0;
      if (!data || data.version !== 1 || data.contractVersion !== EVIDENCE_CONTRACT_VERSION
        || !EVIDENCE_STAGES.includes(data.stage) || data.stage === 'READ_ONLY_IDENTITY_VERIFIED'
        || !EVIDENCE_GATES.includes(data.nextGate)
        || data.ecuVerified !== false || data.writesEnabled !== false || data.flashEnabled !== false
        || !integer(data.observedBytes) || !integer(data.ds2FrameCount) || !integer(data.kwpFrameCount)
        || !integer(data.candidateFrames) || data.candidateFrames !== data.ds2FrameCount + data.kwpFrameCount
        || !Array.isArray(data.flags) || data.flags.length > 10) {
        throw new TypeError('Nieprawidłowe podsumowanie sesji.');
      }
      if (panel.isConnected) {
        result.textContent = [
          `Etap: ${data.stage}`,
          `USB związane z sesją: ${data.hardwareBound ? 'TAK' : 'NIE'}`,
          `Port otwarty: ${data.portOpen ? 'TAK' : 'NIE'}`,
          `Bajty RX: ${data.observedBytes}`,
          `DS2 kandydaci: ${data.ds2FrameCount}`,
          `KWP kandydaci: ${data.kwpFrameCount}`,
          `Flagi: ${data.flags.join(', ') || 'brak'}`,
          `Następna bramka: ${data.nextGate}`,
          'ECU nadal niepotwierdzone; zapis i flash zablokowane.'
        ].join('\n');
      }
    } catch (error) {
      if (panel.isConnected) result.textContent = error?.name === 'AbortError'
        ? 'Przekroczony czas odczytu stanu sesji.'
        : (error instanceof TypeError ? error.message : 'Podsumowanie sesji nie powiodło się.');
    } finally {
      clearTimeout(timeout);
      healthButton.disabled = false;
    }
  });
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
      const response = await fetch(`${url}/v1/snapshot`, options);
      if (!response.ok) throw new TypeError(`Most snapshot zwrócił HTTP ${response.status}.`);
      const snapshot = await response.json();
      if (!snapshot || snapshot.version !== 1 || snapshot.snapshotVersion !== 1 || snapshot.ecuVerified !== false
        || snapshot.writesEnabled !== false || snapshot.flashEnabled !== false
        || !snapshot.status || !snapshot.rx) {
        throw new TypeError('Nieprawidłowy snapshot mostu.');
      }
      const status = snapshot.status;
      const safeStatus = validateBridgeStatus(status);
      const data = snapshot.rx;
      const telemetry = snapshot.telemetry;
      const integer = value => Number.isSafeInteger(value) && value >= 0;
      if (!telemetry || telemetry.contractVersion !== EVIDENCE_CONTRACT_VERSION
        || !EVIDENCE_STAGES.includes(telemetry.stage) || telemetry.stage === 'READ_ONLY_IDENTITY_VERIFIED'
        || !EVIDENCE_GATES.includes(telemetry.nextGate)
        || telemetry.ecuVerified !== false || telemetry.writesEnabled !== false || telemetry.flashEnabled !== false
        || telemetry.stateRevision !== status.stateRevision || telemetry.sessionEpoch !== status.sessionEpoch
        || !integer(telemetry.observedBytes) || !integer(telemetry.candidateFrames)) {
        throw new TypeError('Snapshot ma niespójny łańcuch dowodowy.');
      }
      if (!Array.isArray(data.frames) || data.frames.length > 16) throw new TypeError('Nieprawidłowe ramki snapshotu.');
      if (!safeStatus.portOpen || !/^[a-f0-9]{40}$/i.test(status.sessionId || '')) {
        result.textContent = 'Port zamknięty. Brak bieżącej sesji RX.';
        return;
      }
      if (status.ecuVerified !== false || data.ecuVerified !== false) throw new TypeError('Snapshot narusza read-only evidence contract.');
      const frames = data.frames.map(frame => {
        if (!frame || frame.ecuVerified !== false || typeof frame.frameHex !== 'string'
          || !/^(?:[0-9A-F]{2})(?: [0-9A-F]{2}){3,254}$/.test(frame.frameHex)) {
          throw new TypeError('Nieprawidłowe ramki DS2 RX.');
        }
        return frame.frameHex;
      });
      if (!Array.isArray(data.kwpFrames) || data.kwpFrames.length > 16) throw new TypeError('Most nie dostarczył poprawnych danych KWP2000.');
      const kwpFrames = data.kwpFrames.map(frame => {
        if (!frame || frame.ecuVerified !== false || typeof frame.frameHex !== 'string'
          || !/^(?:[0-9A-F]{2})(?: [0-9A-F]{2}){4,196}$/.test(frame.frameHex)
          || !['possible-reply', 'possible-echo', 'unknown'].includes(frame.directionHint)) {
          throw new TypeError('Nieprawidłowa ramka KWP RX.');
        }
        const bytes = frame.frameHex.split(' ').map(part => parseInt(part, 16));
        if (bytes[0] !== 0xB8 || bytes[3] + 5 !== bytes.length
          || bytes.slice(0, -1).reduce((x, b) => x ^ b, 0) !== bytes.at(-1)) {
          throw new TypeError('Ramka KWP nie przeszła kontroli długości i XOR.');
        }
        return `${frame.directionHint}: ${frame.frameHex}`;
      });
      const bytes = Number.isSafeInteger(data.observedBytes) && data.observedBytes >= 0 ? data.observedBytes : '?';
      if (panel.isConnected) result.textContent = `Etap dowodowy: ${telemetry.stage}\nRewizja sesji: ${telemetry.stateRevision}\nOdebrano bajtów: ${bytes}\nDS2 (kandydaci): ${frames.length}\n${frames.join('\n') || 'Brak ramek DS2.'}\nKWP2000 / ME7.2 (kandydaci): ${kwpFrames.length}\n${kwpFrames.join('\n') || 'Brak ramek KWP.'}\nUWAGA: możliwe echo/szum. ECU niepotwierdzone; nie wysłano komend.`;
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
