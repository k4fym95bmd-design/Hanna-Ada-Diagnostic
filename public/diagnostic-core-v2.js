import { classifyVehicleProtocol, decodeStoredDTCs } from './diagnostic-core.js';

// Compatibility extension for the existing browser runtime. This only reads
// generic OBD-II and never claims manufacturer-level BMW ECU functionality.
(() => {
  const H = () => window.HannaAdaOBD;
  let latestProtocol = 'unknown';

  function ensurePanel() {
    const rt = document.querySelector('#haRuntime');
    if (!rt || document.querySelector('#haDiagV2')) return;
    const s = document.createElement('section');
    s.id = 'haDiagV2';
    s.className = 'ha-v2';
    s.innerHTML = `<div class="v2-head"><div><small>DIAGNOSTIC CORE V2</small><h3>Continuous Live · DTC Decode · Protocol</h3></div><span id="haPollState">IDLE</span></div><div class="v2-grid"><button id="haStartLive">START LIVE</button><button id="haStopLive">STOP LIVE</button><button id="haProtocol">READ PROTOCOL</button><button id="haVoltage">READ VOLTAGE</button></div><div class="v2-meta"><div><small>PROTOCOL</small><b id="haProtocolValue">—</b></div><div><small>VOLTAGE</small><b data-ha-value="voltage">—</b></div><div><small>LAST CYCLE</small><b id="haCycle">—</b></div></div><div class="v2-dtc"><div class="v2-dtc-title"><b>GENERIC OBD-II DTC</b><button id="haDecodeDtc">READ + DECODE</button></div><div id="haDtcList"><span class="v2-empty">No DTC read in this session.</span></div></div>`;
    rt.appendChild(s);
    s.querySelector('#haStartLive').onclick = startLive;
    s.querySelector('#haStopLive').onclick = stopLive;
    s.querySelector('#haProtocol').onclick = readProtocol;
    s.querySelector('#haVoltage').onclick = readVoltage;
    s.querySelector('#haDecodeDtc').onclick = readDecode;
  }

  async function send(cmd, timeout = 8000) {
    const h = H();
    if (!h?.ecu) throw new Error('ECU offline');
    if (typeof h.command !== 'function') throw new Error('Runtime command bridge unavailable');
    return h.command(cmd, timeout);
  }

  async function detectProtocol() {
    let rawNumber = '';
    try { rawNumber = await send('ATDPN', 5000); } catch { /* Older adapters may not implement ATDPN. */ }
    const verifiedKind = classifyVehicleProtocol(rawNumber);

    if (verifiedKind !== 'unknown') {
      latestProtocol = verifiedKind;
      const el = document.querySelector('#haProtocolValue');
      if (el) el.textContent = `${verifiedKind.toUpperCase()} · ATDPN verified`;
      return verifiedKind;
    }

    // ATDP may provide useful display text, but it must never authorize
    // protocol-aware unframed Mode 03 decoding.
    latestProtocol = 'unknown';
    const el = document.querySelector('#haProtocolValue');
    try {
      const rawDescription = await send('ATDP', 5000);
      const describedKind = classifyVehicleProtocol(rawDescription);
      if (el) el.textContent = describedKind === 'unknown'
        ? 'Unverified'
        : `${describedKind.toUpperCase()} · ATDP description only`;
    } catch {
      if (el) el.textContent = 'Unverified';
    }
    return 'unknown';
  }

  async function readProtocol() {
    try { await detectProtocol(); }
    catch {
      latestProtocol = 'unknown';
      const el = document.querySelector('#haProtocolValue');
      if (el) el.textContent = 'Unverified';
    }
  }

  async function readVoltage() {
    const h = H();
    try {
      if (!h?.ecu || typeof h.readPid !== 'function') throw new Error('ECU offline');
      await h.readPid('voltage');
    } catch { /* Unknown reading stays blank, never a fabricated voltage. */ }
  }


  function startLive() {
    const h = H();
    if (!h?.ecu) return;
    const el = document.querySelector('#haPollState');
    if (h.ultraControllerReady !== true || typeof h.startUltraLive !== 'function') {
      if (el) el.textContent = 'ULTRA WAIT';
      return;
    }
    h.startUltraLive();
    if (el) el.textContent = 'ULTRA';
  }

  function stopLive() {
    const h = H();
    if (h?.poll) clearInterval(h.poll);
    if (h) h.poll = null;
    if (h?.ultraControllerReady === true && typeof h.stopUltraLive === 'function') {
      void h.stopUltraLive();
    }
    const el = document.querySelector('#haPollState');
    if (el) el.textContent = 'IDLE';
    const button = document.querySelector('#haLiveToggle');
    if (button) button.textContent = 'START LIVE';
  }

  function showDTCResult(message, className) {
    const list = document.querySelector('#haDtcList');
    if (!list) return;
    const span = document.createElement('span');
    span.className = className;
    span.textContent = message;
    list.replaceChildren(span);
  }

  async function readDecode() {
    const button = document.querySelector('#haDecodeDtc');
    if (button) button.disabled = true;
    showDTCResult('Odczyt i weryfikacja odpowiedzi ECU…', 'v2-empty');
    try {
      // Never infer CAN/legacy layout from byte-count parity or adapter ATI.
      const protocol = await detectProtocol().catch(() => 'unknown');
      const raw = await send('03', 10000);
      const parsed = decodeStoredDTCs(raw, protocol);
      const list = document.querySelector('#haDtcList');
      if (!list) return;
      if (!parsed.codes.length) {
        showDTCResult(`Brak potwierdzonych kodów Mode 03 (${parsed.responderCount} ECU).`, 'v2-ok');
      } else {
        list.replaceChildren(...parsed.codes.map(code => {
          const span = document.createElement('span');
          span.className = 'v2-code';
          span.textContent = code;
          return span;
        }));
      }
    } catch (error) {
      // Parsing failures are UNKNOWN, not a successful empty DTC read.
      showDTCResult(`Niezweryfikowany odczyt DTC: ${error?.code || 'READ_ERROR'}. Zachowaj RAW do diagnostyki.`, 'v2-error');
    } finally {
      if (button) button.disabled = false;
    }
  }

  window.addEventListener('hannaada:obd-runtime-mounted', ensurePanel);
  window.addEventListener('hannaada:module-rendered', ensurePanel);
  ensurePanel();
  window.HannaAdaDiagV2 = { startLive, stopLive, readProtocol };
})();
