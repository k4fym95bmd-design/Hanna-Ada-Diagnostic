import { createLivePerformanceController } from './live-performance-core.js';

// Additive enhancement of existing Hanna & Ada OBD runtime. No second session,
// no new app, no adapter setup or ECU writes.
const obd = window.HannaAdaOBD;
if (!obd) throw new Error('Hanna & Ada OBD runtime must load before Live Performance.');
const attachedDevices = new WeakSet();
const $ = selector => document.querySelector(selector);
const say = (text, error = false) => {
  const el = $('#haRuntimeStatus');
  if (el) { el.textContent = text; el.classList.toggle('bad', error); }
};
function updateMetrics(stats) {
  const el = $('#haPerformanceStats');
  if (!el) return;
  const latency = stats.averageMs === null ? '—' : `${stats.averageMs} ms`;
  el.textContent = `PRO · odczyty ${stats.reads} · cykle ${stats.cycles} · błędy ${stats.errors} · opóźnienie ${latency} · kolejka 0`;
  const button = $('#haLiveToggle');
  if (button) button.textContent = stats.running ? 'STOP LIVE' : 'START LIVE';
}
const controller = createLivePerformanceController({
  readPid: key => obd.readPid(key),
  getSupported: () => obd.supported,
  isConnected: () => obd.connected === true && obd.adapter === true && obd.ecu === true,
  isVisible: () => !document.hidden && !!$('#haRuntime'),
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
  say('PRO Live: do 4 odczytów na cykl · adaptacyjne tempo · bez równoległych poleceń.');
}
async function snapshot() {
  subscribeDisconnect();
  const result = await controller.snapshot();
  if (result.skipped === 'BUS_BUSY') say('Magistrala zajęta; nie uruchamiam równoległego odczytu.', true);
  else if (result.skipped === 'ECU_OFFLINE') say('ECU offline; odczyt niewykonany.', true);
  else if (result.skipped === 'NO_VERIFIED_PIDS') say('Najpierw zweryfikuj dostępne PID.', true);
  else say(`Migawka PRO: ${result.completed} odczytów, maksymalnie ${result.attempted} na cykl.`);
}
function bind() {
  const root = $('#haRuntime');
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
function boot() {
  const view = $('#view');
  if (!view) return;
  new MutationObserver(bind).observe(view, { childList: true });
  bind();
  document.addEventListener('visibilitychange', () => { if (!document.hidden) controller.wake(); });
  window.addEventListener('pagehide', () => { void controller.stop(); });
}
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true });
else boot();
