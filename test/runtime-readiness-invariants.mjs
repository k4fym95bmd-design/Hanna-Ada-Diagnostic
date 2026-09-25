import assert from 'node:assert/strict';
import test from 'node:test';

globalThis.document = {
  querySelector() { return null; },
  querySelectorAll() { return []; },
  addEventListener() {},
  documentElement: {},
};
globalThis.MutationObserver = class { observe() {} };
globalThis.performance = { now: () => Date.now() };
globalThis.Element = class {};

const encoder = new TextEncoder();
const decoder = new TextDecoder();

const baseReplies = new Map([
  ['ATZ', 'ELM327 v1.5\r>'],
  ['ATE0', 'OK\r>'],
  ['ATL0', 'OK\r>'],
  ['ATS0', 'OK\r>'],
  ['ATH0', 'OK\r>'],
  ['ATAT1', 'OK\r>'],
  ['ATSTFF', 'OK\r>'],
  ['ATSP0', 'OK\r>'],
  ['ATI', 'ELM327 v1.5\r>'],
  ['0100', '41 00 80 00 00 00\r>'],
  ['ATDPN', 'A6\r>'],
  ['ATDP', 'AUTO, ISO 15765-4 CAN\r>'],
  ['ATRV', '12.4V\r>'],
]);

async function boot(tag, overrides = {}) {
  globalThis.window = {};
  const replies = new Map(baseReplies);
  for (const [command, response] of Object.entries(overrides)) replies.set(command, response);

  let listener = null;
  const notify = {
    value: new Uint8Array(),
    async startNotifications() { return this; },
    addEventListener(type, fn) {
      if (type === 'characteristicvaluechanged') listener = fn;
    },
    removeEventListener() {},
    async stopNotifications() {},
  };
  const write = {
    properties: { writeWithoutResponse: true },
    async writeValueWithoutResponse(bytes) {
      const command = decoder.decode(bytes).replace(/\r$/, '');
      const response = replies.get(command);
      queueMicrotask(() => {
        notify.value = encoder.encode(response ?? '?\r>');
        listener?.({ target: notify });
      });
    },
  };
  const service = {
    async getCharacteristic(uuid) {
      return uuid.includes('fff1') ? notify : write;
    },
  };
  const server = { async getPrimaryService() { return service; } };
  const device = {
    name: 'READINESS TEST',
    addEventListener() {},
    removeEventListener() {},
    gatt: { async connect() { return server; }, disconnect() {} },
  };

  Object.defineProperty(globalThis, 'navigator', {
    value: { bluetooth: { async requestDevice() { return device; } } },
    configurable: true,
  });

  await import(`../public/obd-runtime.js?${tag}`);
  return globalThis.window.HannaAdaOBD;
}

test('invalid ATI identity blocks ECU verification and connection readiness', async () => {
  const HA = await boot('bad-ati', { ATI: 'ERROR\r>' });
  assert.equal(await HA.connect(), false);
  assert.equal(HA.connected, false);
  assert.equal(HA.adapter, false);
  assert.equal(HA.ecu, false);
  assert.equal(HA.stats.lastCommand, 'ATI');
});

test('failed mandatory ELM initialization command blocks readiness immediately', async () => {
  const HA = await boot('bad-init', { ATE0: 'ERROR\r>' });
  assert.equal(await HA.connect(), false);
  assert.equal(HA.connected, false);
  assert.equal(HA.adapter, false);
  assert.equal(HA.ecu, false);
  assert.equal(HA.stats.lastCommand, 'ATE0');
});
