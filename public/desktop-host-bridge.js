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

export function validateDesktopSerialCandidates(value) {
  if (!Array.isArray(value)) throw new TypeError('Invalid desktop serial inventory');
  const allowedKinds = new Set(['usb', 'bluetooth', 'pci', 'unknown']);
  const allowedFamilies = new Set(['FTDI', 'CP210X', 'CH34X', 'PL2303']);

  return Object.freeze(value.map(item => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) {
      throw new TypeError('Invalid desktop serial candidate');
    }
    if ('serialNumber' in item || 'serial_number' in item) {
      throw new TypeError('Serial number must not cross the desktop IPC boundary');
    }
    if (typeof item.portName !== 'string' || item.portName.length < 1 || item.portName.length > 96
        || !allowedKinds.has(item.kind)) {
      throw new TypeError('Invalid desktop serial identity');
    }
    for (const key of ['usbIdentityOnly', 'transportVerified', 'ecuVerified', 'writesEnabled']) {
      assertBoolean(item[key], key);
    }
    if (item.transportVerified || item.ecuVerified || item.writesEnabled) {
      throw new TypeError('Serial inventory attempted unsafe capability promotion');
    }
    for (const key of ['vid', 'pid']) {
      const v = item[key];
      if (v !== null && (!Number.isInteger(v) || v < 0 || v > 0xFFFF)) {
        throw new TypeError('Invalid USB identity');
      }
    }
    if (item.candidateFamily !== null && !allowedFamilies.has(item.candidateFamily)) {
      throw new TypeError('Unknown serial family candidate');
    }
    for (const key of ['manufacturer', 'product']) {
      const v = item[key];
      if (v !== null && (typeof v !== 'string' || v.length > 128)) {
        throw new TypeError('Invalid serial metadata');
      }
    }
    return Object.freeze({ ...item });
  }));
}

export async function listDesktopSerialCandidates(globalObject = globalThis) {
  const invoke = getTauriInvoke(globalObject);
  if (!invoke) return Object.freeze([]);
  return validateDesktopSerialCandidates(await invoke('desktop_list_serial_ports'));
}

export function validateDesktopTransportSnapshot(value) {
  if (!value || typeof value !== 'object' || value.version !== 1
      || typeof value.stage !== 'string'
      || !Number.isInteger(value.epoch) || value.epoch < 0) {
    throw new TypeError('Invalid desktop transport snapshot');
  }
  for (const key of ['transportOpen', 'configured', 'ecuVerified', 'writesEnabled']) {
    assertBoolean(value[key], key);
  }
  if (value.transportOpen || value.configured || value.ecuVerified || value.writesEnabled) {
    throw new TypeError('Transport snapshot attempted unsafe capability promotion');
  }
  if (value.portName !== null && (typeof value.portName !== 'string'
      || value.portName.length < 1 || value.portName.length > 96)) {
    throw new TypeError('Invalid bound port');
  }
  return Object.freeze({ ...value });
}

export async function bindDesktopSerialCandidate(portName, globalObject = globalThis) {
  if (typeof portName !== 'string' || portName.length < 1 || portName.length > 96) {
    throw new TypeError('Invalid port name');
  }
  const invoke = getTauriInvoke(globalObject);
  if (!invoke) throw new Error('Desktop host unavailable');
  return validateDesktopTransportSnapshot(
    await invoke('desktop_bind_serial_candidate', { portName })
  );
}

export async function clearDesktopSerialCandidate(globalObject = globalThis) {
  const invoke = getTauriInvoke(globalObject);
  if (!invoke) throw new Error('Desktop host unavailable');
  return validateDesktopTransportSnapshot(await invoke('desktop_clear_serial_candidate'));
}

export async function getDesktopTransportSnapshot(globalObject = globalThis) {
  const invoke = getTauriInvoke(globalObject);
  if (!invoke) return Object.freeze({
    version: 1,
    stage: 'NO_CANDIDATE',
    epoch: 0,
    portName: null,
    kind: null,
    vid: null,
    pid: null,
    candidateFamily: null,
    transportOpen: false,
    configured: false,
    ecuVerified: false,
    writesEnabled: false,
  });
  return validateDesktopTransportSnapshot(await invoke('desktop_transport_snapshot'));
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
