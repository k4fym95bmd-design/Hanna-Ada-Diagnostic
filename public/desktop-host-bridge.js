// Desktop host adapter for the existing Hanna & Ada frontend.
// No package bundler is required because Tauri 2 injects window.__TAURI__ when
// app.withGlobalTauri=true. Browser mode remains a safe fallback.

const SAFE_FALLBACK = Object.freeze({
  available: false,
  host: 'browser',
  mode: 'web-fallback',
  platform: 'web',
  offlineCapable: false,
  transportAuthority: 'browser-limited',
  ecuVerified: false,
  writesEnabled: false,
  codingEnabled: false,
  actuationEnabled: false,
  flashEnabled: false,
});

function assertBoolean(value, name) {
  if (typeof value !== 'boolean') throw new TypeError(`Invalid desktop host field: ${name}`);
}

export function validateDesktopHostStatus(value) {
  if (!value || typeof value !== 'object' || value.version !== 1
      || value.host !== 'tauri' || value.mode !== 'desktop-pro'
      || typeof value.platform !== 'string' || !value.platform
      || value.transportAuthority !== 'native-desktop') {
    throw new TypeError('Invalid desktop host status');
  }
  for (const key of ['offlineCapable','ecuVerified','writesEnabled','codingEnabled','actuationEnabled','flashEnabled']) {
    assertBoolean(value[key], key);
  }
  if (value.ecuVerified || value.writesEnabled || value.codingEnabled
      || value.actuationEnabled || value.flashEnabled) {
    throw new TypeError('Desktop host attempted unsafe capability promotion');
  }
  return Object.freeze({ available: true, ...value });
}

export function validateDesktopSafetyPolicy(value) {
  if (!value || typeof value !== 'object' || value.version !== 1
      || value.readOnlyFirst !== true || value.maxOutstandingRequests !== 1) {
    throw new TypeError('Invalid desktop safety policy');
  }
  const forbidden = [
    'rawSerialWriteExposedToUi',
    'arbitraryShellExposedToUi',
    'arbitraryFilesystemExposedToUi',
    'writesEnabled',
    'codingEnabled',
    'actuationEnabled',
    'flashEnabled',
  ];
  for (const key of forbidden) {
    assertBoolean(value[key], key);
    if (value[key]) throw new TypeError(`Unsafe desktop permission: ${key}`);
  }
  return Object.freeze({ ...value });
}

export function getTauriInvoke(globalObject = globalThis) {
  const invoke = globalObject?.window?.__TAURI__?.core?.invoke;
  return typeof invoke === 'function' ? invoke : null;
}

export async function probeDesktopHost(globalObject = globalThis) {
  const invoke = getTauriInvoke(globalObject);
  if (!invoke) return Object.freeze({ status: SAFE_FALLBACK, policy: null });

  const [rawStatus, rawPolicy] = await Promise.all([
    invoke('desktop_host_status'),
    invoke('desktop_safety_policy'),
  ]);
  const status = validateDesktopHostStatus(rawStatus);
  const policy = validateDesktopSafetyPolicy(rawPolicy);
  return Object.freeze({ status, policy });
}

export async function publishDesktopHost(globalObject = globalThis) {
  const result = await probeDesktopHost(globalObject);
  if (globalObject?.document?.documentElement) {
    globalObject.document.documentElement.dataset.hannaHost =
      result.status.available ? 'desktop-pro' : 'web-fallback';
  }
  if (typeof globalObject?.dispatchEvent === 'function'
      && typeof globalObject?.CustomEvent === 'function') {
    globalObject.dispatchEvent(new globalObject.CustomEvent('hannaada:host-ready', {
      detail: result,
    }));
  }
  return result;
}

if (typeof window !== 'undefined') {
  publishDesktopHost(window).catch(() => {
    document.documentElement.dataset.hannaHost = 'host-error';
  });
}
