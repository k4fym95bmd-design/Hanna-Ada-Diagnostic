import test from 'node:test';
import assert from 'node:assert/strict';
import {
  executeDesktopMe72Identity,
  executeDesktopMe72Roughness,
  validateDesktopRequestBrokerSnapshot,
} from '../public/desktop-host-bridge.js';

const deferred = () => {
  let resolve;
  const promise = new Promise(res => { resolve = res; });
  return { promise, resolve };
};

function readResult(epoch, bytes = [0xB8, 0x12, 0xF1, 0x01]) {
  return {
    version: 1,
    evidenceContractVersion: 1,
    stage: 'READ_BYTES',
    evidenceStage: 'RX_ACTIVITY',
    epoch,
    protocol: 'KWP2000_BMW',
    receivedBytes: bytes.length,
    bytes,
    nativeRequestReceipt: null,
    nativeIdentityFingerprint: null,
    readonlyProfileId: null,
    readonlySampleSequence: null,
    ecuVerified: false,
    writesEnabled: false,
  };
}

test('desktop host serial executors are single-flight before native IPC', async () => {
  const first = deferred();
  const calls = [];
  const fake = {
    window: {
      __TAURI__: {
        core: {
          invoke: async (name, args) => {
            calls.push([name, args]);
            if (name === 'desktop_execute_me72_identity') return first.promise;
            if (name === 'desktop_execute_me72_roughness') return readResult(args.epoch);
            throw new Error('unexpected command');
          },
        },
      },
    },
  };

  const pending = executeDesktopMe72Identity(7, 'single-flight-identity-01', fake);

  await assert.rejects(
    () => executeDesktopMe72Roughness(7, fake),
    error => error?.code === 'DESKTOP_OPERATION_BUSY'
  );
  assert.equal(calls.filter(([name]) => name === 'desktop_execute_me72_roughness').length, 0);

  first.resolve({
    ...readResult(7, [0xB8, 0x12, 0xF1, 0x01, 0xA2, 0xF8]),
    nativeRequestReceipt: 91,
    nativeIdentityFingerprint: 'PN7506366-HW0F-CI01-DIA8-BI60-BW08-BY00-SP001021',
  });
  const firstResult = await pending;
  assert.equal(firstResult.nativeRequestReceipt, 91);

  const secondResult = await executeDesktopMe72Roughness(7, fake);
  assert.equal(secondResult.receivedBytes, 4);
  assert.equal(calls.filter(([name]) => name === 'desktop_execute_me72_roughness').length, 1);
});

test('JS broker validator accepts the native READONLY_SAMPLE_ACTIVE contract only when coherent', () => {
  const base = {
    version: 1,
    evidenceContractVersion: 1,
    stage: 'READONLY_SAMPLE_ACTIVE',
    epoch: 7,
    activeRequest: false,
    activeRequestId: null,
    operationId: null,
    protocol: null,
    timeoutMs: null,
    maxResponseBytes: null,
    attemptCount: 2,
    evidencedAttemptCount: 2,
    evidencedAttempts: [
      {
        operationId: 'e39-dme-me72-module-identity',
        requestId: 'sample-contract-id-0001',
        nativeReceiveReceipt: 11,
        nativeIdentityFingerprint: 'PN7506366-HW0F-CI01-DIA8-BI60-BW08-BY00-SP001021',
      },
      {
        operationId: 'e39-dme-me72-module-identity',
        requestId: 'sample-contract-id-0002',
        nativeReceiveReceipt: 12,
        nativeIdentityFingerprint: 'PN7506366-HW0F-CI01-DIA8-BI60-BW08-BY00-SP001021',
      },
    ],
    maxAttempts: 32,
    activeReceiveReceipt: null,
    activeReceivedBytes: 0,
    readonlySampleActive: true,
    txBytesExposed: false,
    writeLike: false,
    ecuVerified: false,
    writesEnabled: false,
    flashEnabled: false,
  };

  const accepted = validateDesktopRequestBrokerSnapshot(base);
  assert.equal(accepted.stage, 'READONLY_SAMPLE_ACTIVE');
  assert.equal(accepted.readonlySampleActive, true);

  assert.throws(
    () => validateDesktopRequestBrokerSnapshot({ ...base, readonlySampleActive: false }),
    /sample lease/i
  );
  assert.throws(
    () => validateDesktopRequestBrokerSnapshot({
      ...base,
      activeRequest: true,
      activeRequestId: 'illegal-overlap',
    }),
    /sample lease/i
  );
});
