import test from 'node:test';
import assert from 'node:assert/strict';
import {
  bindDesktopSerialCandidate,
  clearDesktopSerialCandidate,
  closeDesktopPort,
  getDesktopTransportSnapshot,
  getTauriInvoke,
  listDesktopSerialCandidates,
  openDesktopConfiguredPort,
  probeDesktopHost,
  validateDesktopHostStatus,
  validateDesktopSafetyPolicy,
  validateDesktopSerialCandidates,
  validateDesktopTransportSnapshot,
} from '../public/desktop-host-bridge.js';

test('plain browser stays a safe fallback', async () => {
  const fake = { window: {} };
  assert.equal(getTauriInvoke(fake), null);
  const result = await probeDesktopHost(fake);
  assert.equal(result.status.available, false);
  assert.equal(result.status.mode, 'web-fallback');
  assert.equal(result.status.writesEnabled, false);
});

test('valid Tauri host contract is accepted without capability promotion', async () => {
  const fake = {
    window: {
      __TAURI__: {
        core: {
          invoke: async name => {
            if (name === 'desktop_host_status') return {
              version: 1,
              host: 'tauri',
              mode: 'desktop-pro',
              platform: 'windows',
              offlineCapable: true,
              transportAuthority: 'native-desktop',
              ecuVerified: false,
              writesEnabled: false,
              codingEnabled: false,
              actuationEnabled: false,
              flashEnabled: false,
            };
            if (name === 'desktop_safety_policy') return {
              version: 1,
              readOnlyFirst: true,
              maxOutstandingRequests: 1,
              rawSerialWriteExposedToUi: false,
              arbitraryShellExposedToUi: false,
              arbitraryFilesystemExposedToUi: false,
              writesEnabled: false,
              codingEnabled: false,
              actuationEnabled: false,
              flashEnabled: false,
            };
            throw new Error('unexpected command');
          },
        },
      },
    },
  };
  const result = await probeDesktopHost(fake);
  assert.equal(result.status.available, true);
  assert.equal(result.status.platform, 'windows');
  assert.equal(result.policy.maxOutstandingRequests, 1);
});

test('unsafe native promotion is rejected', () => {
  assert.throws(() => validateDesktopHostStatus({
    version: 1,
    host: 'tauri',
    mode: 'desktop-pro',
    platform: 'windows',
    offlineCapable: true,
    transportAuthority: 'native-desktop',
    ecuVerified: false,
    writesEnabled: true,
    codingEnabled: false,
    actuationEnabled: false,
    flashEnabled: false,
  }), /unsafe/i);

  assert.throws(() => validateDesktopSafetyPolicy({
    version: 1,
    readOnlyFirst: true,
    maxOutstandingRequests: 1,
    rawSerialWriteExposedToUi: true,
    arbitraryShellExposedToUi: false,
    arbitraryFilesystemExposedToUi: false,
    writesEnabled: false,
    codingEnabled: false,
    actuationEnabled: false,
    flashEnabled: false,
  }), /unsafe/i);
});


test('desktop serial inventory is sanitized and never promotes transport', async () => {
  const fake = {
    window: {
      __TAURI__: {
        core: {
          invoke: async name => {
            if (name !== 'desktop_list_serial_ports') throw new Error('unexpected command');
            return [{
              portName: 'COM7',
              kind: 'usb',
              vid: 0x0403,
              pid: 0x6001,
              manufacturer: 'FTDI',
              product: 'USB Serial',
              candidateFamily: 'FTDI',
              usbIdentityOnly: true,
              transportVerified: false,
              ecuVerified: false,
              writesEnabled: false,
            }];
          },
        },
      },
    },
  };
  const items = await listDesktopSerialCandidates(fake);
  assert.equal(items.length, 1);
  assert.equal(items[0].portName, 'COM7');
  assert.equal(items[0].candidateFamily, 'FTDI');
  assert.equal(items[0].transportVerified, false);
});

test('desktop serial inventory rejects serial numbers and fake verification', () => {
  assert.throws(() => validateDesktopSerialCandidates([{
    portName: 'COM7',
    kind: 'usb',
    vid: 0x0403,
    pid: 0x6001,
    manufacturer: 'FTDI',
    product: 'USB Serial',
    serialNumber: 'private',
    candidateFamily: 'FTDI',
    usbIdentityOnly: true,
    transportVerified: false,
    ecuVerified: false,
    writesEnabled: false,
  }]), /serial number/i);

  assert.throws(() => validateDesktopSerialCandidates([{
    portName: 'COM7',
    kind: 'usb',
    vid: 0x0403,
    pid: 0x6001,
    manufacturer: 'FTDI',
    product: 'USB Serial',
    candidateFamily: 'FTDI',
    usbIdentityOnly: true,
    transportVerified: true,
    ecuVerified: false,
    writesEnabled: false,
  }]), /unsafe/i);
});


test('desktop candidate binding is epoch-scoped and remains unopened', async () => {
  let epoch = 0;
  let selected = null;
  const fake = {
    window: {
      __TAURI__: {
        core: {
          invoke: async (name, args) => {
            if (name === 'desktop_bind_serial_candidate') {
              epoch += 1;
              selected = args.portName;
            } else if (name === 'desktop_clear_serial_candidate') {
              epoch += 1;
              selected = null;
            } else if (name !== 'desktop_transport_snapshot') {
              throw new Error('unexpected command');
            }
            return {
              version: 1,
              stage: selected ? 'USB_CANDIDATE_BOUND' : 'NO_CANDIDATE',
              epoch,
              portName: selected,
              kind: selected ? 'usb' : null,
              vid: selected ? 0x0403 : null,
              pid: selected ? 0x6001 : null,
              candidateFamily: selected ? 'FTDI' : null,
              transportOpen: false,
              configured: false,
              ecuVerified: false,
              writesEnabled: false,
            };
          },
        },
      },
    },
  };

  const first = await bindDesktopSerialCandidate('COM7', fake);
  assert.equal(first.epoch, 1);
  assert.equal(first.portName, 'COM7');
  assert.equal(first.transportOpen, false);

  const cleared = await clearDesktopSerialCandidate(fake);
  assert.equal(cleared.epoch, 2);
  assert.equal(cleared.stage, 'NO_CANDIDATE');

  const snapshot = await getDesktopTransportSnapshot(fake);
  assert.equal(snapshot.epoch, 2);
  assert.equal(snapshot.writesEnabled, false);
});

test('desktop transport snapshot allows only coherent open/configured states', () => {
  const configured = validateDesktopTransportSnapshot({
    version: 1,
    stage: 'PORT_CONFIGURED',
    epoch: 1,
    portName: 'COM7',
    kind: 'usb',
    vid: 0x0403,
    pid: 0x6001,
    candidateFamily: 'FTDI',
    transportOpen: true,
    configured: true,
    ecuVerified: false,
    writesEnabled: false,
  });
  assert.equal(configured.configured, true);

  assert.throws(() => validateDesktopTransportSnapshot({
    ...configured,
    stage: 'USB_CANDIDATE_BOUND',
  }), /unexpected/i);
  assert.throws(() => validateDesktopTransportSnapshot({
    ...configured,
    ecuVerified: true,
  }), /unsafe/i);
});


test('configured native port open is protocol and epoch bounded', async () => {
  const calls = [];
  const fake = {
    window: {
      __TAURI__: {
        core: {
          invoke: async (name, args) => {
            calls.push([name, args]);
            if (name === 'desktop_open_configured_port') {
              return {
                version: 1,
                stage: 'PORT_CONFIGURED',
                epoch: args.epoch,
                portName: 'COM7',
                kind: 'usb',
                vid: 0x0403,
                pid: 0x6001,
                candidateFamily: 'FTDI',
                transportOpen: true,
                configured: true,
                ecuVerified: false,
                writesEnabled: false,
              };
            }
            if (name === 'desktop_close_port') {
              return {
                version: 1,
                stage: 'USB_CANDIDATE_BOUND',
                epoch: args.epoch,
                portName: 'COM7',
                kind: 'usb',
                vid: 0x0403,
                pid: 0x6001,
                candidateFamily: 'FTDI',
                transportOpen: false,
                configured: false,
                ecuVerified: false,
                writesEnabled: false,
              };
            }
            throw new Error('unexpected command');
          },
        },
      },
    },
  };

  const opened = await openDesktopConfiguredPort(7, 'KWP2000_BMW', 10400, fake);
  assert.equal(opened.stage, 'PORT_CONFIGURED');
  assert.equal(opened.ecuVerified, false);
  const closed = await closeDesktopPort(7, fake);
  assert.equal(closed.transportOpen, false);

  await assert.rejects(() => openDesktopConfiguredPort(7, 'RAW', 10400, fake), /protocol/i);
  await assert.rejects(() => openDesktopConfiguredPort(7, 'DS2', 0, fake), /baud/i);
  assert.equal(calls[0][0], 'desktop_open_configured_port');
});
