import test from 'node:test';
import assert from 'node:assert/strict';
import {
  getTauriInvoke,
  probeDesktopHost,
  validateDesktopHostStatus,
  validateDesktopSafetyPolicy,
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
