// Original, transport-agnostic, read-only live-data scheduler for Hanna & Ada.
// Never creates an ECU connection, invents samples or sends arbitrary commands.
const PID = Object.freeze({
  rpm: 0x0c, coolant: 0x05, maf: 0x10, throttle: 0x11,
  stft1: 0x06, ltft1: 0x07, stft2: 0x08, ltft2: 0x09,
  iat: 0x0f, speed: 0x0d, load: 0x04,
});
const FAST = Object.freeze(['rpm', 'coolant']);
const SLOW = Object.freeze(['maf', 'throttle', 'stft1', 'ltft1', 'stft2', 'ltft2', 'iat', 'speed', 'load', 'voltage']);
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

export function selectLiveBatch(supported, cursor = 0) {
  // PID discovery must have provided actual support evidence. Never probe all
  // unsupported ECU PIDs just because a generic OBD connection exists.
  const observed = supported instanceof Set ? supported : new Set();
  const eligible = key => key === 'voltage' || observed.has(PID[key]);
  const fast = FAST.filter(eligible);
  const slow = SLOW.filter(eligible);
  const offset = slow.length ? ((cursor % slow.length) + slow.length) % slow.length : 0;
  const rotating = Array.from({ length: Math.min(2, slow.length) }, (_, i) => slow[(offset + i) % slow.length]);
  const keys = [...fast, ...rotating];
  return Object.freeze({ keys: Object.freeze(keys.slice(0, 4)), nextCursor: cursor + rotating.length });
}

export function createLivePerformanceController({
  readPid, getSupported, isConnected, isVisible = () => true,
  onMetrics = () => {}, onStatus = () => {},
  now = () => performance.now(), setTimer = setTimeout, clearTimer = clearTimeout,
} = {}) {
  if (typeof readPid !== 'function' || typeof getSupported !== 'function'
    || typeof isConnected !== 'function' || typeof isVisible !== 'function'
    || typeof onMetrics !== 'function' || typeof onStatus !== 'function') {
    throw new TypeError('Live performance controller requires transport evidence and callbacks.');
  }
  let running = false, epoch = 0, timer = null, currentTask = null, cursor = 0;
  let averageMs = null, reads = 0, errors = 0, cycles = 0, consecutiveErrors = 0;
  let lastCycleMs = null;

  const metrics = () => Object.freeze({
    running, reads, errors, cycles, averageMs: averageMs == null ? null : Math.round(averageMs),
    lastCycleMs: lastCycleMs == null ? null : Math.round(lastCycleMs),
    inFlight: !!currentTask, queuedCommands: 0, writesEnabled: false,
  });
  const publish = () => onMetrics(metrics());
  const delay = () => averageMs == null ? 900 : clamp(Math.round(averageMs * 2), 600, 2400);

  function schedule(ms, owner) {
    if (!running || epoch !== owner || timer !== null) return;
    timer = setTimer(() => {
      timer = null;
      void cycle(owner);
    }, ms);
  }

  function stop() {
    running = false;
    epoch += 1;
    if (timer !== null) { clearTimer(timer); timer = null; }
    publish();
    // Physical transport may still be settling. Do not reacquire it
    // before an in-progress read has actually finished.
    return currentTask ?? Promise.resolve();
  }

  async function perform(owner, backgroundSensitive = false) {
    if (currentTask) return Object.freeze({ skipped: 'BUS_BUSY' });
    if (!isConnected()) return Object.freeze({ skipped: 'ECU_OFFLINE' });
    const batch = selectLiveBatch(getSupported(), cursor);
    cursor = batch.nextCursor;
    if (!batch.keys.length) {
      onStatus('Brak potwierdzonych PID. Najpierw zweryfikuj obsługiwane PID w ECU.');
      return Object.freeze({ skipped: 'NO_VERIFIED_PIDS' });
    }
    const task = (async () => {
      const start = now();
      let completed = 0;
      for (const key of batch.keys) {
        if (!isConnected() || epoch !== owner || (backgroundSensitive && !isVisible())) break;
        const before = now();
        try {
          await readPid(key);
          if (!isConnected() || epoch !== owner) break;
          reads++;
          completed++;
          consecutiveErrors = 0;
          const elapsed = clamp(now() - before, 0, 60_000);
          averageMs = averageMs == null ? elapsed : averageMs * 0.75 + elapsed * 0.25;
        } catch {
          if (!isConnected() || epoch !== owner) break;
          errors++;
          consecutiveErrors++;
          if (consecutiveErrors >= 3) {
            onStatus('Trzy kolejne błędy odczytu. Live zatrzymany; sprawdź adapter i ECU.');
            // stop() invalidates this owner but retains the bus lock.
            stop();
            break;
          }
        }
      }
      if (epoch === owner && isConnected()) {
        cycles++;
        lastCycleMs = clamp(now() - start, 0, 300_000);
      }
      return Object.freeze({ completed, attempted: batch.keys.length, stopped: !running });
    })();
    currentTask = task;
    try { return await task; }
    finally {
      if (currentTask === task) currentTask = null;
      publish();
    }
  }

  async function cycle(owner) {
    if (!running || epoch !== owner) return;
    if (!isConnected()) { onStatus('ECU rozłączone; zatrzymano Live.'); stop(); return; }
    if (!isVisible()) { schedule(2000, owner); return; }
    if (currentTask) { schedule(150, owner); return; }
    await perform(owner, true);
    if (running && epoch === owner) schedule(delay(), owner);
  }

  function start() {
    if (running || !isConnected()) return false;
    running = true;
    epoch++;
    schedule(0, epoch);
    publish();
    return true;
  }

  return Object.freeze({
    start, stop, isRunning: () => running, metrics,
    snapshot: () => perform(epoch),
    wake() {
      if (!running || !isVisible()) return;
      if (timer !== null) { clearTimer(timer); timer = null; }
      schedule(0, epoch);
    },
  });
}
