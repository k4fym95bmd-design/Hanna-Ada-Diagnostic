import assert from 'node:assert/strict';
import test from 'node:test';

globalThis.window = {};
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

const replies = new Map([
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

function makeDevice(name) {
  let rxListener = null;
  let disconnectListener = null;

  const notify = {
    value: new Uint8Array(),
    async startNotifications() { return this; },
    addEventListener(type, listener) {
      if (type === 'characteristicvaluechanged') rxListener = listener;
    },
    removeEventListener(type, listener) {
      if (type === 'characteristicvaluechanged' && rxListener === listener) rxListener = null;
    },
    async stopNotifications() {},
  };

  const write = {
    properties: { writeWithoutResponse: true },
    async writeValueWithoutResponse(bytes) {
      const command = decoder.decode(bytes).replace(/\r$/, '');
      const response = replies.get(command);
      if (response == null) throw new Error('No response configured for ' + command);
      queueMicrotask(() => {
        notify.value = encoder.encode(response);
        rxListener?.({ target: notify });
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
    name,
    gatt: {
      async connect() { return server; },
      disconnect() {},
    },
    addEventListener(type, listener) {
      if (type === 'gattserverdisconnected') disconnectListener = listener;
    },
    removeEventListener(type, listener) {
      if (type === 'gattserverdisconnected' && disconnectListener === listener) disconnectListener = null;
    },
    emitDisconnect() {
      disconnectListener?.({ target: device });
    },
  };

  return device;
}

test('concurrent CONNECT calls collapse to one requestDevice attempt', async () => {
  let requestCount = 0;
  let resolveDevice;
  const devicePromise = new Promise(resolve => { resolveDevice = resolve; });

  Object.defineProperty(globalThis, 'navigator', {
    value: {
      bluetooth: {
        async requestDevice() {
          requestCount++;
          return devicePromise;
        },
      },
    },
    configurable: true,
  });

  await import('../public/obd-runtime.js?connect-race');
  const HA = globalThis.window.HannaAdaOBD;

  const first = HA.connect();
  const second = HA.connect();

  await new Promise(resolve => setTimeout(resolve, 5));
  assert.equal(requestCount, 1);

  HA.disconnect();
  resolveDevice(makeDevice('late'));

  const settled = await Promise.allSettled([first, second]);
  assert.equal(settled[0].status, 'fulfilled');
  assert.equal(settled[0].value, false);
  assert.equal(HA.connected, false);
  assert.equal(HA.connecting, false);
});

test('stale disconnect event from old device cannot tear down current session', async () => {
  globalThis.window = {};
  const firstDevice = makeDevice('one');
  const secondDevice = makeDevice('two');
  let request = 0;

  Object.defineProperty(globalThis, 'navigator', {
    value: {
      bluetooth: {
        async requestDevice() {
          return request++ === 0 ? firstDevice : secondDevice;
        },
      },
    },
    configurable: true,
  });

  await import('../public/obd-runtime.js?stale-device');
  const HA = globalThis.window.HannaAdaOBD;

  assert.equal(await HA.connect(), true);
  assert.equal(HA.device, firstDevice);

  HA.disconnect();

  assert.equal(await HA.connect(), true);
  assert.equal(HA.device, secondDevice);

  firstDevice.emitDisconnect();
  await new Promise(resolve => setTimeout(resolve, 0));

  assert.equal(HA.connected, true);
  assert.equal(HA.device, secondDevice);

  HA.disconnect();
});
