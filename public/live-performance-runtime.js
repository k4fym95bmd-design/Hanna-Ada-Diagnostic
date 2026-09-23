import { createLivePerformanceController } from './live-performance-core.js';

// Additive enhancement of existing Hanna & Ada OBD runtime. No second session,
// no new app, no adapter setup or ECU writes.
const obd = window.HannaAdaOBD;
if (!obd) throw new Error('Hanna & Ada OBD runtime must load before Live Performance.');
const attachedDevices = new WeakSet();
const $ = selector => document.querySelector(selector);
const inputPending = () => {
  try { return navigator.scheduling?.isInputPending?.({ includeContinuous: true }) === true; }
  catch { return false; }
};
const say = (text, error = false) => {
  const el = $('#haRuntimeStatus');
  if (el) { el.textContent = text; el.classList.toggle('bad', error); }
};

let metricFrame = null;
let pendingMetrics = null;
let lastMetricText = '';
let runtimeAttached = false;
let bindFrame = null;
function commitMetrics() {
  metricFrame = null;
  const stats = pendingMetrics;
  pendingMetrics = null;
  if (!stats) return;
  const el = $('#haPerformanceStats');
  if (!el) return;
  const latency = stats.averageMs === null ? '—' : `${stats.averageMs} ms`;
  const p95 = stats.p95Ms === null ? '—' : `${stats.p95Ms} ms`;
  const cycle = stats.lastCycleMs === null ? '—' : `${stats.lastCycleMs} ms`;
  const quiet = stats.lastDelayMs === null ? '—' : `${stats.lastDelayMs} ms`;
  const duty = stats.dutyCyclePct === null ? '—' : `${stats.dutyCyclePct}%`;
  const text = `ULTRA · poprawne ${stats.reads} · NO DATA ${stats.noData} · błędy ${stats.errors} · cykle ${stats.cycles} · avg ${latency} · p95 ${p95} · cykl ${cycle} · cisza ${quiet} · duty ${duty} · batch ${stats.lastBatchSize}/${stats.batchLimit} · backoff ${stats.pidBackoffs} · UI-yield ${stats.uiYields} · kolejka 0`;
  if (text !== lastMetricText) {
    el.textContent = text;
    lastMetricText = text;
  }
  const button = $('#haLiveToggle');
  const label = stats.running ? 'STOP LIVE' : 'START LIVE';
  if (button && button.textContent !== label) button.textContent = label;
}
function updateMetrics(stats) {
  pendingMetrics = stats;
  if (metricFrame !== null) return;
  if (typeof requestAnimationFrame === 'function') {
    metricFrame = requestAnimationFrame(commitMetrics);
  } else {
    metricFrame = setTimeout(commitMetrics, 0);
  }
}

const controller = createLivePerformanceController({
  readPid: key => obd.readPid(key),
  getSupported: () => obd.supported,
  isConnected: () => obd.connected === true && obd.adapter === true && obd.ecu === true,
  isVisible: () => !document.hidden && runtimeAttached,
  shouldYield: inputPending,
  onMetrics: updateMetrics,
  onStatus: message => say(message, true),
});

function subscribeDisconnect() {
  const device = obd.device;
  if (device && typeof device.addEventListener === 'function' && !attachedDevices.has(device)) {
    attachedDevices.add(device);
    device.addEventListener('gattserverdisconnected', () => { void controller.stop(); updateMetrics(controller.metrics()); });
  }
}

function startOrStop() {
  if (controller.isRunning()) {
    void controller.stop();
    say('Live zatrzymany. Brak nowych poleceń; istniejący odczyt może się jeszcze kończyć.');
    return;
  }
  subscribeDisconnect();
  if (!controller.start()) { say('Najpierw potwierdź połączenie z ECU.', true); return; }
  say('ULTRA Live: maks. 4 sekwencyjne odczyty · adaptacyjny budżet magistrali · zero równoległych poleceń.');
}

async function snapshot() {
  subscribeDisconnect();
  const result = await controller.snapshot();
  if (result.skipped === 'BUS_BUSY') say('Magistrala zajęta; nie uruchamiam równoległego odczytu.', true);
  else if (result.skipped === 'ECU_OFFLINE') say('ECU offline; odczyt niewykonany.', true);
  else if (result.skipped === 'NO_VERIFIED_PIDS') say('Najpierw zweryfikuj dostępne PID.', true);
  else if (result.skipped === 'PID_EVIDENCE_UNAVAILABLE') say('Brak poprawnej listy potwierdzonych PID.', true);
  else if (result.skipped === 'PID_COOLDOWN') say(`ULTRA odciąża magistralę: ${result.coolingPids} kanał(y) chwilowo w backoff.`);
  else if (result.budgetLimited) {
    say(`Migawka ULTRA zatrzymana przez budżet czasu: ${result.completed}/${result.attempted} odczytów. Kolejny cykl przejmie resztę.`);
  } else if (result.completed < result.attempted) {
    say(`Migawka niepełna: ${result.completed}/${result.attempted} poprawnych odczytów. NO DATA i błędy są pokazane osobno.`, true);
  } else say(`Migawka ULTRA: ${result.completed}/${result.attempted} poprawnych odczytów.`);
}

function bind() {
  const root = $('#haRuntime');
  runtimeAttached = !!root;
  if (!root) {
    if (controller.isRunning()) void controller.stop();
    return;
  }
  if (root.dataset.haProPerformance === '1') return;
  const live = root.querySelector('#haLiveToggle');
  const read = root.querySelector('#haReadAll');
  const dtc = root.querySelector('#haDtc');
  const disconnect = root.querySelector('#haDisconnect');
  if (!live || !read || !dtc || !disconnect) return;
  root.dataset.haProPerformance = '1';
  if (typeof obd.stopLive === 'function') obd.stopLive();
  const metrics = document.createElement('div');
  metrics.id = 'haPerformanceStats';
  metrics.className = 'ha-performance-stats';
  metrics.setAttribute('role', 'status');
  metrics.setAttribute('aria-live', 'off');
  root.querySelector('.rt-head')?.insertAdjacentElement('afterend', metrics);
  const originalDtc = dtc.onclick;
  const originalDisconnect = disconnect.onclick;
  live.onclick = startOrStop;
  read.textContent = 'READ SNAPSHOT';
  read.onclick = () => { void snapshot(); };
  dtc.onclick = async () => {
    // The BLE command layer supports one outstanding command: the old DTC
    // callback runs only after any existing PID read settles.
    await controller.stop();
    if (obd.ecu && typeof originalDtc === 'function') await originalDtc();
    else say('ECU offline; DTC nieodczytane.', true);
  };
  disconnect.onclick = () => {
    void controller.stop();
    if (typeof originalDisconnect === 'function') originalDisconnect();
  };
  obd.readAll = snapshot;
  obd.toggleLive = startOrStop;
  updateMetrics(controller.metrics());
}

function scheduleBind() {
  if (bindFrame !== null) return;
  const run = () => {
    bindFrame = null;
    bind();
  };
  bindFrame = typeof requestAnimationFrame === 'function'
    ? requestAnimationFrame(run)
    : setTimeout(run, 0);
}

function boot() {
  const view = $('#view');
  if (!view) return;
  new MutationObserver(scheduleBind).observe(view, { childList: true });
  bind();
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) {
      scheduleBind();
      controller.wake();
    }
  });
  window.addEventListener('pageshow', scheduleBind);
  window.addEventListener('pagehide', () => { runtimeAttached = false; void controller.stop(); });
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true });
else boot();
