import { classifyVehicleProtocol, decodeStoredDTCs } from './diagnostic-core.js';

// Compatibility extension for the existing browser runtime. This only reads
// generic OBD-II and never claims manufacturer-level BMW ECU functionality.
(() => {
  const H = () => window.HannaAdaOBD;
  let latestProtocol = 'unknown';
  let latestProtocolSource = 'none';
  let dtcReadSerial = 0;
  let activeDtcRead = 0;
  let lastDtcEvidence = null;

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

  function staleSessionError() {
    const error = new Error('Stale diagnostic session');
    error.code = 'STALE_SESSION';
    return error;
  }

  function assertSession(ownerEpoch) {
    const h = H();
    if (!h?.ecu || h.sessionEpoch !== ownerEpoch) throw staleSessionError();
    return h;
  }

  function setDtcButtonsDisabled(disabled) {
    for (const id of ['#haDecodeDtc', '#haDtc']) {
      const button = document.querySelector(id);
      if (button) button.disabled = disabled;
    }
  }

  function getLastDtcEvidence() {
    if (!lastDtcEvidence) return null;
    return {
      ...lastDtcEvidence,
      codes: Array.isArray(lastDtcEvidence.codes) ? [...lastDtcEvidence.codes] : [],
    };
  }

  async function detectProtocol(ownerEpoch = H()?.sessionEpoch) {
    assertSession(ownerEpoch);

    let rawNumber = '';
    try {
      rawNumber = await send('ATDPN', 5000);
      assertSession(ownerEpoch);
    } catch (error) {
      if (H()?.sessionEpoch !== ownerEpoch) throw staleSessionError();
      // Older adapters may not implement ATDPN.
    }

    const verifiedKind = classifyVehicleProtocol(rawNumber);
    if (verifiedKind !== 'unknown') {
      assertSession(ownerEpoch);
      latestProtocol = verifiedKind;
      latestProtocolSource = 'ATDPN';
      const el = document.querySelector('#haProtocolValue');
      if (el) el.textContent = `${verifiedKind.toUpperCase()} · ATDPN verified`;
      return verifiedKind;
    }

    // ATDP may provide useful display text, but it must never authorize
    // protocol-aware unframed Mode 03 decoding.
    latestProtocol = 'unknown';
    latestProtocolSource = 'none';
    const el = document.querySelector('#haProtocolValue');

    try {
      const rawDescription = await send('ATDP', 5000);
      assertSession(ownerEpoch);
      const describedKind = classifyVehicleProtocol(rawDescription);
      if (el) el.textContent = describedKind === 'unknown'
        ? 'Unverified'
        : `${describedKind.toUpperCase()} · ATDP description only`;
    } catch (error) {
      if (H()?.sessionEpoch !== ownerEpoch) throw staleSessionError();
      if (el) el.textContent = 'Unverified';
    }

    return 'unknown';
  }

  async function readProtocol() {
    const ownerEpoch = H()?.sessionEpoch;
    try {
      await detectProtocol(ownerEpoch);
    } catch (error) {
      if (error?.code === 'STALE_SESSION') return;
      latestProtocol = 'unknown';
      latestProtocolSource = 'none';
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

  function resetEvidenceUi() {
    latestProtocol = 'unknown';
    latestProtocolSource = 'none';
    lastDtcEvidence = null;
    dtcReadSerial++;
    activeDtcRead = 0;
    setDtcButtonsDisabled(false);

    const protocol = document.querySelector('#haProtocolValue');
    if (protocol) protocol.textContent = '—';
    const cycle = document.querySelector('#haCycle');
    if (cycle) cycle.textContent = '—';
    const poll = document.querySelector('#haPollState');
    if (poll) poll.textContent = 'IDLE';
    showDTCResult('No DTC read in this session.', 'v2-empty');
  }

  async function readDecode() {
    if (activeDtcRead) return;

    const ownerEpoch = H()?.sessionEpoch;
    try {
      assertSession(ownerEpoch);
    } catch {
      return;
    }

    const token = ++dtcReadSerial;
    activeDtcRead = token;
    setDtcButtonsDisabled(true);
    showDTCResult('Odczyt i weryfikacja odpowiedzi ECU…', 'v2-empty');

    let raw = null;
    let protocol = 'unknown';

    try {
      // Never infer CAN/legacy layout from byte-count parity or adapter ATI.
      protocol = await detectProtocol(ownerEpoch);
      assertSession(ownerEpoch);

      raw = await send('03', 10000);
      assertSession(ownerEpoch);

      const parsed = decodeStoredDTCs(raw, protocol);
      if (activeDtcRead !== token) throw staleSessionError();

      lastDtcEvidence = {
        epoch: ownerEpoch,
        capturedAt: new Date().toISOString(),
        protocol,
        protocolSource: latestProtocolSource,
        raw: String(raw),
        status: 'verified',
        errorCode: null,
        responderCount: parsed.responderCount,
        codes: [...parsed.codes],
      };

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
      if (error?.code === 'STALE_SESSION'
          || H()?.sessionEpoch !== ownerEpoch
          || activeDtcRead !== token) return;

      lastDtcEvidence = {
        epoch: ownerEpoch,
        capturedAt: new Date().toISOString(),
        protocol,
        protocolSource: latestProtocolSource,
        raw: raw == null ? null : String(raw),
        status: 'error',
        errorCode: error?.code || 'READ_ERROR',
        responderCount: null,
        codes: [],
      };

      // Parsing failures are UNKNOWN, not a successful empty DTC read.
      showDTCResult(`Niezweryfikowany odczyt DTC: ${error?.code || 'READ_ERROR'}. Zachowaj RAW do diagnostyki.`, 'v2-error');
    } finally {
      if (activeDtcRead === token) {
        activeDtcRead = 0;
        setDtcButtonsDisabled(false);
      }
    }
  }

  window.addEventListener('hannaada:obd-runtime-mounted', ensurePanel);
  window.addEventListener('hannaada:module-rendered', ensurePanel);
  window.addEventListener('hannaada:obd-disconnected', resetEvidenceUi);
  ensurePanel();
  window.HannaAdaDiagV2 = {
    startLive,
    stopLive,
    readProtocol,
    readDtc: readDecode,
    getLastDtcEvidence,
  };
})();
