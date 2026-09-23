import test from 'node:test';
import assert from 'node:assert/strict';
import { createLivePerformanceController } from '../public/live-performance-core.js';
const supported = new Set([0x0c]); // RPM plus adapter voltage.

test('null RPM response is no data, not a successful measurement', async () => {
  const c = createLivePerformanceController({
    getSupported: () => supported, isConnected: () => true,
    readPid: async key => key === 'rpm' ? null : 13.8,
  });
  const result = await c.snapshot();
  assert.equal(result.completed, 1);
  assert.equal(result.attempted, 2);
  assert.equal(c.metrics().reads, 1);
  assert.equal(c.metrics().noData, 1);
  assert.equal(c.metrics().errors, 0);
});

test('missing, infinite, NaN and string values cannot count as PID measurements', async () => {
  for (const value of [undefined, NaN, Infinity, -Infinity, '99']) {
    const c = createLivePerformanceController({getSupported: () => supported, isConnected: () => true,
      readPid: async () => value});
    const result = await c.snapshot();
    assert.equal(result.completed, 0);
    assert.equal(c.metrics().reads, 0);
    assert.equal(c.metrics().noData, 2);
    assert.equal(c.metrics().averageMs, null);
  }
});

test('three consecutive no-data responses stop live polling with no false successes', async () => {
  const scheduled = [];
  const status = [];
  const c = createLivePerformanceController({
    getSupported: () => supported, isConnected: () => true,
    readPid: async () => null,
    setTimer: (fn, ms) => {const t={fn,ms,canceled:false};scheduled.push(t);return t;},
    clearTimer: t => {t.canceled=true;}, onStatus: text => status.push(text),
  });
  assert.equal(c.start(),true);
  scheduled[0].fn();
  for (let i=0;i<10 && c.isRunning();i++) await new Promise(resolve => setImmediate(resolve));
  if(c.isRunning()) {
    const next=scheduled.find(t=>!t.canceled && t !== scheduled[0]);
    if(next) next.fn();
    for (let i=0;i<10 && c.isRunning();i++) await new Promise(resolve => setImmediate(resolve));
  }
  assert.equal(c.isRunning(),false);
  assert.equal(c.metrics().reads,0);
  assert.equal(c.metrics().noData,3);
  assert.equal(c.metrics().errors,0);
  assert.match(status.join(' '), /Trzy kolejne/);
  assert.equal(scheduled.some(t=>!t.canceled && t!==scheduled[0] && t!==scheduled[1]),false);
});

test('valid finite zero resets consecutive no-data streak', async () => {
  let i=0;
  const inputs=[null,0,null,0];
  const c=createLivePerformanceController({getSupported:()=>supported,isConnected:()=>true,
    readPid:async()=>inputs[i++]});
  const first=await c.snapshot();
  const second=await c.snapshot();
  assert.equal(first.completed,1);
  assert.equal(second.completed,1);
  assert.equal(c.metrics().reads,2);
  assert.equal(c.metrics().noData,2);
});

test('exception and no-data are different metrics but share safety stop threshold', async () => {
  let count=0;
  const c=createLivePerformanceController({getSupported:()=>supported,isConnected:()=>true,
    readPid: async()=>{count++;if(count===1)throw Error('timeout');return null;}});
  const result=await c.snapshot();
  assert.equal(result.completed,0);
  assert.equal(c.metrics().errors,1);
  assert.equal(c.metrics().noData,1);
  const result2=await c.snapshot();
  assert.equal(result2.completed,0);
  assert.equal(c.metrics().noData,2);
  assert.equal(c.metrics().reads,0);
});

test('stop during delayed response never credits a stale numeric measurement', async () => {
  let resolve;
  const c=createLivePerformanceController({getSupported:()=>supported,isConnected:()=>true,
    readPid:()=>new Promise(r=>{resolve=r;})});
  const pending=c.snapshot();
  const stopping=c.stop();
  resolve(52);
  await Promise.all([pending,stopping]);
  assert.equal(c.metrics().reads,0);
  assert.equal(c.metrics().noData,0);
});


test('performance metrics remain bounded and read-only under ultra scheduling', async () => {
  let now = 0;
  const c = createLivePerformanceController({
    getSupported: () => supported,
    isConnected: () => true,
    readPid: async () => { now += 40; return 1; },
    now: () => now,
  });
  await c.snapshot();
  const m = c.metrics();
  assert.equal(m.writesEnabled, false);
  assert.equal(m.queuedCommands, 0);
  assert.equal(m.lastBatchSize, 2);
  assert.ok(m.averageMs >= 0);
  assert.ok(m.lastCycleMs >= 0);
  assert.ok(m.dutyCyclePct >= 0 && m.dutyCyclePct <= 100);
});
