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
const LATENCY_WINDOW_SIZE = 32;
const CYCLE_BUDGET_MS = 2500;

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
  let averageMs = null, reads = 0, noData = 0, errors = 0, cycles = 0, consecutiveFailures = 0;
  let lastCycleMs = null, lastDelayMs = null, lastBatchSize = 0, wakeCoalesced = 0, timerReschedules = 0, budgetStops = 0;
  const latencyWindow = new Float64Array(LATENCY_WINDOW_SIZE);
  let latencyCount = 0, latencyCursor = 0;
  let p95Cache = null, p95Dirty = true;

  const recordLatency = value => {
    const safe = clamp(value, 0, 60_000);
    latencyWindow[latencyCursor] = safe;
    latencyCursor = (latencyCursor + 1) % LATENCY_WINDOW_SIZE;
    latencyCount = Math.min(latencyCount + 1, LATENCY_WINDOW_SIZE);
    p95Dirty = true;
    return safe;
  };

  const percentile95 = () => {
    if (!latencyCount) return null;
    if (!p95Dirty) return p95Cache;
    const copy = Array.from(latencyWindow.slice(0, latencyCount)).sort((a, b) => a - b);
    p95Cache = copy[Math.min(copy.length - 1, Math.ceil(copy.length * 0.95) - 1)];
    p95Dirty = false;
    return p95Cache;
  };

  const computeDelay = () => {
    if (averageMs == null && lastCycleMs == null) return 900;
    const readDriven = averageMs == null ? 0 : averageMs * 2;
    const p95 = percentile95();
    const tailDriven = p95 == null ? 0 : p95 * 1.5;
    // Never make the polling loop more aggressive than the previous 600 ms floor.
    // For slower or jittery links, keep a quiet interval proportional to the full sequential cycle.
    const cycleDriven = lastCycleMs == null ? 0 : lastCycleMs * 0.75;
    return clamp(Math.round(Math.max(readDriven, tailDriven, cycleDriven)), 600, 3000);
  };

  const metrics = () => {
    const quiet = lastDelayMs ?? computeDelay();
    const total = lastCycleMs == null ? null : lastCycleMs + quiet;
    const dutyCyclePct = total && total > 0 ? Math.round((lastCycleMs / total) * 100) : null;
    const p95 = percentile95();
    return Object.freeze({
      running, reads, noData, errors, cycles,
      averageMs: averageMs == null ? null : Math.round(averageMs),
      p95Ms: p95 == null ? null : Math.round(p95),
      latencySamples: latencyCount,
      lastCycleMs: lastCycleMs == null ? null : Math.round(lastCycleMs),
      lastDelayMs: lastDelayMs == null ? null : Math.round(lastDelayMs),
      lastBatchSize,
      dutyCyclePct,
      wakeCoalesced,
      timerReschedules,
      budgetStops,
      inFlight: !!currentTask,
      queuedCommands: 0,
      writesEnabled: false,
    });
  };

  const publish = () => onMetrics(metrics());

  function schedule(ms, owner, { replace = false } = {}) {
    if (!running || epoch !== owner) return false;
    if (timer !== null) {
      if (!replace) return false;
      clearTimer(timer);
      timer = null;
      timerReschedules++;
    }
    const bounded = clamp(Math.round(ms), 0, 5000);
    lastDelayMs = bounded;
    timer = setTimer(() => {
      timer = null;
      void cycle(owner);
    }, bounded);
    return true;
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

  function fail(owner, missing) {
    if (missing) noData++; else errors++;
    consecutiveFailures++;
    if (consecutiveFailures >= 3) {
      onStatus('Trzy kolejne błędy odczytu lub odpowiedzi bez danych. Live zatrzymany; sprawdź adapter i ECU.');
      // Keep the bus locked until the in-flight task settles.
      stop();
      return true;
    }
    return false;
  }

  async function perform(owner, backgroundSensitive = false) {
    if (currentTask) return Object.freeze({ skipped: 'BUS_BUSY' });
    if (!isConnected()) return Object.freeze({ skipped: 'ECU_OFFLINE' });

    let supported;
    try {
      supported = getSupported();
    } catch {
      errors++;
      onStatus('Nie udało się odczytać listy potwierdzonych PID. Live pozostaje zablokowany.');
      publish();
      return Object.freeze({ skipped: 'PID_EVIDENCE_UNAVAILABLE' });
    }

    const batch = selectLiveBatch(supported, cursor);
    cursor = batch.nextCursor;
    lastBatchSize = batch.keys.length;
    if (!batch.keys.length) {
      onStatus('Brak potwierdzonych PID. Najpierw zweryfikuj obsługiwane PID w ECU.');
      return Object.freeze({ skipped: 'NO_VERIFIED_PIDS' });
    }

    const task = (async () => {
      const start = now();
      let completed = 0;
      let budgetLimited = false;
      for (const key of batch.keys) {
        if (!isConnected() || epoch !== owner || (backgroundSensitive && !isVisible())) break;
        if (now() - start >= CYCLE_BUDGET_MS && completed > 0) {
          budgetStops++;
          budgetLimited = true;
          break;
        }
        const before = now();
        try {
          const sample = await readPid(key);
          if (!isConnected() || epoch !== owner) break;
          // Actual legacy transport returns number or null. A missing, NaN,
          // infinite or non-numeric result is NOT a completed measurement.
          if (typeof sample !== 'number' || !Number.isFinite(sample)) {
            if (fail(owner, true)) break;
            continue;
          }
          reads++;
          completed++;
          consecutiveFailures = 0;
          const elapsed = recordLatency(now() - before);
          averageMs = averageMs == null ? elapsed : averageMs * 0.75 + elapsed * 0.25;
        } catch {
          if (!isConnected() || epoch !== owner) break;
          if (fail(owner, false)) break;
        }
      }
      if (epoch === owner && isConnected()) {
        cycles++;
        lastCycleMs = clamp(now() - start, 0, 300_000);
      }
      return Object.freeze({ completed, attempted: batch.keys.length, budgetLimited, stopped: !running });
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
    if (running && epoch === owner) schedule(computeDelay(), owner);
  }

  function start() {
    if (running || !isConnected()) return false;
    running = true;
    epoch++;
    lastDelayMs = 0;
    schedule(0, epoch);
    publish();
    return true;
  }

  async function snapshot() {
    if (currentTask) return Object.freeze({ skipped: 'BUS_BUSY' });
    if (!isConnected()) return Object.freeze({ skipped: 'ECU_OFFLINE' });

    const owner = epoch;
    const wasRunning = running;
    if (wasRunning && timer !== null) {
      clearTimer(timer);
      timer = null;
      timerReschedules++;
    }

    const result = await perform(owner, false);
    if (wasRunning && running && epoch === owner && !currentTask) {
      schedule(computeDelay(), owner);
    }
    return result;
  }

  return Object.freeze({
    start, stop, snapshot, isRunning: () => running, metrics,
    wake() {
      if (!running || !isVisible()) return false;
      if (currentTask) {
        wakeCoalesced++;
        publish();
        return false;
      }
      if (timer !== null) {
        wakeCoalesced++;
        return schedule(0, epoch, { replace: true });
      }
      return schedule(0, epoch);
    },
  });
}
