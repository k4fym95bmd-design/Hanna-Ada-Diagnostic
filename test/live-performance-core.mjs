import test from 'node:test';
import assert from 'node:assert/strict';
import { createLivePerformanceController, selectLiveBatch } from '../public/live-performance-core.js';

const all = new Set([0x0c,0x05,0x10,0x11,0x06,0x07,0x08,0x09,0x0f,0x0d,0x04]);
const flush = () => new Promise(resolve => setImmediate(resolve));
function mockTimer() {
  const pending = [];
  return {
    pending,
    setTimer(fn, ms) { const record = { fn, ms, canceled: false }; pending.push(record); return record; },
    clearTimer(record) { record.canceled = true; },
    async tick() {
      const current = pending.find(t => !t.canceled && !t.fired);
      if (!current) return false;
      current.fired = true;
      current.fn();
      await flush();
      return true;
    },
    active() { return pending.filter(t => !t.canceled && !t.fired); },
  };
}

test('caps every cycle to four supported reads and rotates slow PIDs without guessing', () => {
  const first = selectLiveBatch(all, 0);
  const second = selectLiveBatch(all, first.nextCursor);
  assert.deepEqual(first.keys, ['rpm','coolant','maf','throttle']);
  assert.deepEqual(second.keys, ['rpm','coolant','stft1','ltft1']);
  assert.equal(first.keys.length, 4);
  assert.deepEqual(selectLiveBatch(new Set([0x0c]), 0).keys, ['rpm','voltage']);
  assert.deepEqual(selectLiveBatch(new Set(), 0).keys, ['voltage']);
});

test('executes sequentially, refuses parallel snapshots and keeps bus lock during stop', async () => {
  let resolveFirst, inFlight = 0, peak = 0;
  const c = createLivePerformanceController({
    readPid: () => { inFlight++; peak = Math.max(peak,inFlight); return new Promise(resolve => { resolveFirst = () => { inFlight--; resolve(1); }; }); },
    getSupported: () => new Set([0x0c]), isConnected: () => true,
  });
  const snapshot = c.snapshot();
  assert.deepEqual(await c.snapshot(), { skipped: 'BUS_BUSY' });
  const stopping = c.stop();
  assert.deepEqual(await c.snapshot(), { skipped: 'BUS_BUSY' });
  resolveFirst();
  await snapshot;
  await stopping;
  assert.equal(peak, 1);
  assert.equal(c.metrics().inFlight, false);
  assert.equal(c.metrics().reads, 0, 'stale completion must not be credited');
});

test('pauses all scheduled transport reads while page hidden and wakes on visibility', async () => {
  const timer = mockTimer(); let visible = false, count = 0;
  const c = createLivePerformanceController({
    readPid: async () => { count++; return 1; }, getSupported: () => new Set([0x0c]),
    isConnected: () => true, isVisible: () => visible, ...timer,
  });
  assert.equal(c.start(), true);
  await timer.tick();
  assert.equal(count, 0);
  assert.equal(timer.active()[0].ms, 2000);
  visible = true; c.wake();
  await timer.tick();
  assert.equal(count, 2);
  assert.equal(c.metrics().cycles, 1);
  await c.stop();
});

test('timer cannot re-arm or read after user stops live polling', async () => {
  const timer = mockTimer(); let count = 0;
  const c = createLivePerformanceController({
    readPid: async () => { count++; return 1; }, getSupported: () => all,
    isConnected: () => true, ...timer,
  });
  c.start(); await timer.tick();
  assert.equal(count, 4);
  assert.equal(timer.active().length, 1);
  await c.stop();
  assert.equal(timer.active().length, 0);
  assert.equal(await timer.tick(), false);
  assert.equal(count, 4);
});

test('offline ECU never performs a transport read or creates live values', async () => {
  let reads = 0;
  const c = createLivePerformanceController({
    readPid: async () => reads++, getSupported: () => all, isConnected: () => false,
  });
  assert.equal(c.start(), false);
  assert.deepEqual(await c.snapshot(), { skipped: 'ECU_OFFLINE' });
  assert.equal(reads, 0);
});

test('three consecutive transport failures stop polling without concurrent retries', async () => {
  const timer = mockTimer(); let attempts = 0; const messages = [];
  const c = createLivePerformanceController({
    readPid: async () => { attempts++; throw Error('link failed'); },
    getSupported: () => all, isConnected: () => true,
    onStatus: text => messages.push(text), ...timer,
  });
  c.start(); await timer.tick();
  assert.equal(attempts, 3);
  assert.equal(c.isRunning(), false);
  assert.equal(c.metrics().errors, 3);
  assert.match(messages[0], /Trzy kolejne/);
  assert.equal(timer.active().length, 0);
});

test('adaptive pacing stays bounded and metrics never claim writes', async () => {
  const timer = mockTimer(); let now = 0;
  const c = createLivePerformanceController({
    readPid: async () => { now += 75; return 1; }, getSupported: () => all,
    isConnected: () => true, now: () => now, ...timer,
  });
  c.start(); await timer.tick();
  assert.equal(timer.active()[0].ms, 600);
  assert.equal(c.metrics().averageMs, 75);
  assert.equal(c.metrics().writesEnabled, false);
  assert.equal(c.metrics().queuedCommands, 0);
  await c.stop();
});

test('hiding page mid-batch stops new reads after the in-flight response', async () => {
  const timer = mockTimer(); let visible = true, count = 0;
  const c = createLivePerformanceController({
    readPid: async () => { count++; visible = false; return 1; },
    getSupported: () => all, isConnected: () => true,
    isVisible: () => visible, ...timer,
  });
  c.start(); await timer.tick();
  assert.equal(count, 1);
  assert.equal(timer.active()[0].ms, 600);
  await timer.tick();
  assert.equal(count, 1);
  assert.equal(timer.active()[0].ms, 2000);
  await c.stop();
});

test('disconnect while transport is pending never credits a stale reading', async () => {
  let online = true, resolveRequest, attempts = 0;
  const c = createLivePerformanceController({
    readPid: () => { attempts++; return new Promise(resolve => {resolveRequest=resolve;}); },
    getSupported: () => all, isConnected: () => online,
  });
  const old = c.snapshot();
  online = false;
  resolveRequest(1);
  await old;
  assert.equal(attempts, 1);
  assert.equal(c.metrics().reads, 0);
  assert.equal(c.metrics().cycles, 0);
});


test('snapshot while live replaces the pending timer instead of creating timer churn', async () => {
  const timer = mockTimer();
  const c = createLivePerformanceController({
    readPid: async () => 1,
    getSupported: () => new Set([0x0c]),
    isConnected: () => true,
    ...timer,
  });
  c.start();
  await timer.tick();
  assert.equal(timer.active().length, 1);
  const before = c.metrics().timerReschedules;
  const snap = await c.snapshot();
  assert.equal(snap.completed, 2);
  assert.equal(timer.active().length, 1);
  assert.ok(c.metrics().timerReschedules > before);
  await c.stop();
});

test('slow sequential cycles automatically receive a longer quiet interval without increasing bus pressure', async () => {
  const timer = mockTimer();
  let now = 0;
  const c = createLivePerformanceController({
    readPid: async () => { now += 500; return 1; },
    getSupported: () => all,
    isConnected: () => true,
    now: () => now,
    ...timer,
  });
  c.start();
  await timer.tick();
  assert.equal(c.metrics().lastCycleMs, 2000);
  assert.equal(timer.active()[0].ms, 1500);
  assert.equal(c.metrics().lastDelayMs, 1500);
  assert.ok(c.metrics().dutyCyclePct <= 58);
  await c.stop();
});

test('supported PID evidence failure is fail-closed and never invokes transport', async () => {
  let reads = 0;
  const messages = [];
  const c = createLivePerformanceController({
    readPid: async () => { reads++; return 1; },
    getSupported: () => { throw new Error('bad discovery cache'); },
    isConnected: () => true,
    onStatus: message => messages.push(message),
  });
  const result = await c.snapshot();
  assert.deepEqual(result, { skipped: 'PID_EVIDENCE_UNAVAILABLE' });
  assert.equal(reads, 0);
  assert.equal(c.metrics().errors, 1);
  assert.match(messages[0], /potwierdzonych PID/i);
});

test('wake calls coalesce while a read is in flight and never create a second command', async () => {
  let resolveRead;
  const timer = mockTimer();
  const c = createLivePerformanceController({
    readPid: () => new Promise(resolve => { resolveRead = resolve; }),
    getSupported: () => new Set([0x0c]),
    isConnected: () => true,
    ...timer,
  });
  c.start();
  const tick = timer.tick();
  await flush();
  assert.equal(c.metrics().inFlight, true);
  assert.equal(c.wake(), false);
  assert.equal(c.metrics().wakeCoalesced, 1);
  resolveRead(1);
  await tick;
  await c.stop();
});


test('p95 latency window is bounded and influences quiet time after jitter', async () => {
  const timer = mockTimer();
  let now = 0;
  let readIndex = 0;
  const c = createLivePerformanceController({
    readPid: async () => {
      readIndex++;
      now += readIndex === 4 ? 1200 : 50;
      return 1;
    },
    getSupported: () => all,
    isConnected: () => true,
    now: () => now,
    ...timer,
  });
  c.start();
  await timer.tick();
  const m = c.metrics();
  assert.equal(m.latencySamples, 4);
  assert.equal(m.p95Ms, 1200);
  assert.ok(m.lastDelayMs >= 1800);
  await c.stop();
});

test('latency percentile storage stays bounded to 32 successful reads', async () => {
  let now = 0;
  const c = createLivePerformanceController({
    readPid: async () => { now += 10; return 1; },
    getSupported: () => all,
    isConnected: () => true,
    now: () => now,
  });
  for (let i = 0; i < 20; i++) await c.snapshot();
  const m = c.metrics();
  assert.equal(m.latencySamples, 32);
  assert.equal(m.p95Ms, 10);
  assert.equal(m.writesEnabled, false);
});


test('p95 calculation is stable between writes to the latency ring', async () => {
  let now = 0;
  const c = createLivePerformanceController({
    readPid: async () => { now += 25; return 1; },
    getSupported: () => new Set([0x0c]),
    isConnected: () => true,
    now: () => now,
  });
  await c.snapshot();
  const first = c.metrics();
  const second = c.metrics();
  assert.equal(first.p95Ms, 25);
  assert.equal(second.p95Ms, 25);
  assert.equal(first.latencySamples, second.latencySamples);
  assert.equal(first.writesEnabled, false);
});
