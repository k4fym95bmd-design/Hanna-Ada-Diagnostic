import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createDesktopOperationGate,
  DESKTOP_OPERATION_GATE_PHASE,
} from '../public/desktop-operation-gate.js';

const deferred = () => {
  let resolve;
  let reject;
  const promise = new Promise((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
};

test('single-flight gate rejects overlap without executing the second task', async () => {
  const gate = createDesktopOperationGate();
  const first = deferred();
  let secondExecuted = false;
  const pending = gate.run({ epoch: 7, operation: 'identity', timeoutMs: 1000 }, () => first.promise);

  await assert.rejects(
    () => gate.run({ epoch: 7, operation: 'roughness', timeoutMs: 1000 }, async () => {
      secondExecuted = true;
      return 'unsafe-overlap';
    }),
    error => error?.code === 'DESKTOP_OPERATION_BUSY'
  );
  assert.equal(secondExecuted, false);
  assert.equal(gate.snapshot().phase, DESKTOP_OPERATION_GATE_PHASE.ACTIVE);

  first.resolve('ok');
  assert.equal(await pending, 'ok');
  assert.equal(gate.snapshot().phase, DESKTOP_OPERATION_GATE_PHASE.IDLE);
});

test('ordinary task failure releases the gate deterministically', async () => {
  const gate = createDesktopOperationGate();
  await assert.rejects(
    () => gate.run({ epoch: 3, operation: 'sample', timeoutMs: 1000 }, async () => {
      throw new Error('native failure');
    }),
    /native failure/
  );
  assert.equal(gate.snapshot().phase, DESKTOP_OPERATION_GATE_PHASE.IDLE);
  assert.equal(await gate.run({ epoch: 3, operation: 'retry', timeoutMs: 1000 }, async () => 42), 42);
});

test('deadline timeout quarantines the gate until an explicit transport boundary', async () => {
  const gate = createDesktopOperationGate();
  await assert.rejects(
    () => gate.run({ epoch: 9, operation: 'hung-read', timeoutMs: 20 }, () => new Promise(() => {})),
    error => error?.code === 'DESKTOP_OPERATION_TIMEOUT'
  );
  const quarantined = gate.snapshot();
  assert.equal(quarantined.phase, DESKTOP_OPERATION_GATE_PHASE.QUARANTINED);
  assert.equal(quarantined.quarantinedEpoch, 9);
  assert.equal(quarantined.quarantineReason, 'TIMEOUT');

  await assert.rejects(
    () => gate.run({ epoch: 9, operation: 'retry-before-close', timeoutMs: 1000 }, async () => 'no'),
    error => error?.code === 'DESKTOP_OPERATION_QUARANTINED'
  );

  gate.resetAfterTransportBoundary(10);
  assert.equal(gate.snapshot().phase, DESKTOP_OPERATION_GATE_PHASE.IDLE);
  assert.equal(await gate.run({ epoch: 10, operation: 'post-reset', timeoutMs: 1000 }, async () => 'safe'), 'safe');
});

test('transport-boundary reset fences a stale completion from the previous generation', async () => {
  const gate = createDesktopOperationGate();
  const old = deferred();
  const oldRun = gate.run({ epoch: 11, operation: 'old-read', timeoutMs: 1000 }, () => old.promise);
  assert.equal(gate.snapshot().phase, DESKTOP_OPERATION_GATE_PHASE.ACTIVE);

  gate.resetAfterTransportBoundary(12);
  assert.equal(gate.snapshot().phase, DESKTOP_OPERATION_GATE_PHASE.IDLE);
  const fresh = await gate.run({ epoch: 12, operation: 'new-read', timeoutMs: 1000 }, async () => 'fresh');
  assert.equal(fresh, 'fresh');

  old.resolve('stale');
  assert.equal(await oldRun, 'stale');
  assert.equal(gate.snapshot().phase, DESKTOP_OPERATION_GATE_PHASE.IDLE);
  assert.equal(gate.snapshot().generation, 2);
});
