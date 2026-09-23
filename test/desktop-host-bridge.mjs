import test from 'node:test';
import assert from 'node:assert/strict';
import {
  getTauriInvoke,
  listDesktopSerialCandidates,
  probeDesktopHost,
  validateDesktopHostStatus,
  validateDesktopSafetyPolicy,
  validateDesktopSerialCandidates,
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
