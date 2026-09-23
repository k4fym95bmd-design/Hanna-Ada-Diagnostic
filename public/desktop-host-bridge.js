import { EVIDENCE_CONTRACT_VERSION } from './evidence-contract.js';
import { validateReadOnlyRequestPlan } from './read-only-request-registry.js';

// Desktop host adapter for the existing Hanna & Ada frontend.
// No package bundler is required because Tauri 2 injects window.__TAURI__ when
// app.withGlobalTauri=true. Browser mode remains a safe fallback.

const SAFE_FALLBACK = Object.freeze({
  available: false,
  host: 'browser',
  mode: 'web-fallback',
  platform: 'web',
  evidenceContractVersion: EVIDENCE_CONTRACT_VERSION,
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
      || value.evidenceContractVersion !== EVIDENCE_CONTRACT_VERSION
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
    const hasVid = Number.isInteger(item.vid);
    const hasPid = Number.isInteger(item.pid);
    if (hasVid !== hasPid) throw new TypeError('Incomplete USB identity');
    if (item.kind === 'usb') {
      if (!hasVid || item.usbIdentityOnly !== true) throw new TypeError('USB candidate requires VID PID evidence');
    } else {
      if (item.usbIdentityOnly !== false || hasVid || hasPid || item.candidateFamily !== null) {
        throw new TypeError('Non-USB candidate carried USB-only evidence');
      }
    }
    if (item.candidateFamily !== null && item.kind !== 'usb') {
      throw new TypeError('Serial family candidate requires USB transport');
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
      || value.evidenceContractVersion !== EVIDENCE_CONTRACT_VERSION
      || typeof value.stage !== 'string'
      || typeof value.evidenceStage !== 'string'
      || !Number.isInteger(value.epoch) || value.epoch < 0) {
    throw new TypeError('Invalid desktop transport snapshot');
  }
  for (const key of ['transportOpen', 'configured', 'ecuVerified', 'writesEnabled']) {
    assertBoolean(value[key], key);
  }
  if (value.ecuVerified || value.writesEnabled) {
    throw new TypeError('Transport snapshot attempted unsafe capability promotion');
  }
  const allowedStages = new Set([
    'NO_CANDIDATE',
    'USB_CANDIDATE_BOUND',
    'SERIAL_CANDIDATE_BOUND',
    'PORT_OPEN',
    'PORT_CONFIGURED',
  ]);
  if (!allowedStages.has(value.stage)) throw new TypeError('Invalid transport stage');
  if (value.stage === 'PORT_CONFIGURED') {
    if (!value.transportOpen || !value.configured) throw new TypeError('Invalid configured state');
  } else if (value.stage === 'PORT_OPEN') {
    if (!value.transportOpen || value.configured) throw new TypeError('Invalid open state');
  } else if (value.transportOpen || value.configured) {
    throw new TypeError('Unexpected transport-open state');
  }
  const allowedKinds = new Set(['usb','bluetooth','pci','unknown']);
  const allowedFamilies = new Set(['FTDI','CP210X','CH34X','PL2303']);
  const hasPort = typeof value.portName === 'string' && value.portName.length >= 1 && value.portName.length <= 96;
  if (value.portName !== null && !hasPort) throw new TypeError('Invalid bound port');
  if (value.kind !== null && !allowedKinds.has(value.kind)) throw new TypeError('Invalid bound transport kind');
  for (const key of ['vid','pid']) {
    if (value[key] !== null && (!Number.isInteger(value[key]) || value[key] < 0 || value[key] > 0xFFFF)) {
      throw new TypeError('Invalid bound USB identity');
    }
  }
  if ((value.vid === null) !== (value.pid === null)) throw new TypeError('Incomplete bound USB identity');
  if (value.candidateFamily !== null && !allowedFamilies.has(value.candidateFamily)) {
    throw new TypeError('Invalid bound serial family');
  }

  if (value.stage === 'NO_CANDIDATE') {
    if (value.portName !== null || value.kind !== null || value.vid !== null || value.pid !== null || value.candidateFamily !== null) {
      throw new TypeError('NO_CANDIDATE carried stale bound identity');
    }
  } else {
    if (!hasPort || value.kind === null || value.epoch < 1) throw new TypeError('Bound stage missing candidate identity');
    if (value.kind === 'usb' && (value.vid === null || value.pid === null)) {
      throw new TypeError('USB bound stage missing VID PID');
    }
    if (value.kind !== 'usb' && (value.vid !== null || value.pid !== null || value.candidateFamily !== null)) {
      throw new TypeError('Non-USB bound stage carried USB identity');
    }
    if (value.stage === 'USB_CANDIDATE_BOUND' && value.kind !== 'usb') {
      throw new TypeError('USB candidate stage requires USB kind');
    }
    if (value.stage === 'SERIAL_CANDIDATE_BOUND' && value.kind === 'usb') {
      throw new TypeError('Serial candidate stage cannot represent USB kind');
    }
    if (['PORT_OPEN','PORT_CONFIGURED'].includes(value.stage) && value.kind !== 'usb') {
      throw new TypeError('Native legacy port open requires USB candidate');
    }
  }
  const expectedEvidenceStage = value.stage === 'NO_CANDIDATE'
    ? 'NO_CABLE'
    : value.kind !== 'usb'
      ? 'NO_CABLE'
      : value.transportOpen
        ? 'PORT_OPEN'
        : 'HARDWARE_BOUND';
  if (value.evidenceStage !== expectedEvidenceStage) {
    throw new TypeError('Desktop evidence stage mismatch');
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

export async function openDesktopConfiguredPort(epoch, protocol, baudRate, globalObject = globalThis) {
  if (!Number.isInteger(epoch) || epoch < 1) throw new TypeError('Invalid epoch');
  if (!['DS2', 'KWP2000_BMW'].includes(protocol)) throw new TypeError('Invalid protocol');
  if (!Number.isInteger(baudRate) || baudRate < 300 || baudRate > 1000000) {
    throw new TypeError('Invalid baud rate');
  }
  const invoke = getTauriInvoke(globalObject);
  if (!invoke) throw new Error('Desktop host unavailable');
  return validateDesktopTransportSnapshot(
    await invoke('desktop_open_configured_port', { epoch, protocol, baudRate })
  );
}

export function validateDesktopReadResult(value) {
  if (!value || typeof value !== 'object' || value.version !== 1
      || value.evidenceContractVersion !== EVIDENCE_CONTRACT_VERSION
      || typeof value.evidenceStage !== 'string'
      || !['READ_BYTES', 'READ_EMPTY', 'READ_TIMEOUT'].includes(value.stage)
      || !Number.isInteger(value.epoch) || value.epoch < 1
      || !['DS2', 'KWP2000_BMW'].includes(value.protocol)
      || !Number.isInteger(value.receivedBytes) || value.receivedBytes < 0
      || !Array.isArray(value.bytes)) {
    throw new TypeError('Invalid desktop read result');
  }
  if (value.ecuVerified !== false || value.writesEnabled !== false) {
    throw new TypeError('Read result attempted unsafe capability promotion');
  }
  const nativeRequestReceipt = value.nativeRequestReceipt ?? null;
  if (nativeRequestReceipt !== null
      && (!Number.isSafeInteger(nativeRequestReceipt) || nativeRequestReceipt < 1)) {
    throw new TypeError('Invalid native request receipt');
  }
  const hardMax = value.protocol === 'DS2' ? 255 : 197;
  if (value.bytes.length !== value.receivedBytes || value.bytes.length > hardMax) {
    throw new TypeError('Invalid read length');
  }
  for (const byte of value.bytes) {
    if (!Number.isInteger(byte) || byte < 0 || byte > 255) {
      throw new TypeError('Invalid read byte');
    }
  }
  if (value.stage === 'READ_BYTES' && value.bytes.length === 0) {
    throw new TypeError('READ_BYTES cannot be empty');
  }
  if (value.stage !== 'READ_BYTES' && value.bytes.length !== 0) {
    throw new TypeError('Non-data read stage carried bytes');
  }
  if (value.stage !== 'READ_BYTES' && nativeRequestReceipt !== null) {
    throw new TypeError('Non-data read stage carried a native request receipt');
  }
  const expectedEvidenceStage = value.stage === 'READ_BYTES' ? 'RX_ACTIVITY' : 'PORT_OPEN';
  if (value.evidenceStage !== expectedEvidenceStage) {
    throw new TypeError('Desktop read evidence stage mismatch');
  }
  return Object.freeze({
    ...value,
    nativeRequestReceipt,
    bytes: Object.freeze([...value.bytes]),
  });
}

export async function readDesktopBounded(epoch, maxBytes, timeoutMs, globalObject = globalThis) {
  if (!Number.isInteger(epoch) || epoch < 1) throw new TypeError('Invalid epoch');
  if (!Number.isInteger(maxBytes) || maxBytes < 1 || maxBytes > 255) {
    throw new TypeError('Invalid max bytes');
  }
  if (!Number.isInteger(timeoutMs) || timeoutMs < 10 || timeoutMs > 5000) {
    throw new TypeError('Invalid timeout');
  }
  const invoke = getTauriInvoke(globalObject);
  if (!invoke) throw new Error('Desktop host unavailable');
  return validateDesktopReadResult(
    await invoke('desktop_read_bounded', { epoch, maxBytes, timeoutMs })
  );
}

export function validateDesktopRequestBrokerSnapshot(value) {
  if (!value || typeof value !== 'object'
      || value.version !== 1
      || value.evidenceContractVersion !== EVIDENCE_CONTRACT_VERSION
      || !['BROKER_IDLE','REQUEST_ACTIVE'].includes(value.stage)
      || !Number.isInteger(value.epoch) || value.epoch < 0
      || typeof value.activeRequest !== 'boolean'
      || !Number.isInteger(value.attemptCount) || value.attemptCount < 0
      || !Number.isInteger(value.evidencedAttemptCount) || value.evidencedAttemptCount < 0
      || value.evidencedAttemptCount > value.attemptCount
      || value.maxAttempts !== 32
      || !Number.isInteger(value.activeReceivedBytes) || value.activeReceivedBytes < 0
      || value.txBytesExposed !== false
      || value.writeLike !== false
      || value.ecuVerified !== false
      || value.writesEnabled !== false
      || value.flashEnabled !== false) {
    throw new TypeError('Invalid desktop request broker snapshot');
  }
  if (value.stage === 'REQUEST_ACTIVE') {
    if (!value.activeRequest
        || typeof value.activeRequestId !== 'string'
        || typeof value.operationId !== 'string'
        || !['DS2','KWP2000_BMW'].includes(value.protocol)
        || !Number.isInteger(value.timeoutMs) || value.timeoutMs < 1
        || !Number.isInteger(value.maxResponseBytes) || value.maxResponseBytes < 1
        || (value.activeReceiveReceipt !== null
            && (!Number.isSafeInteger(value.activeReceiveReceipt) || value.activeReceiveReceipt < 1))
        || (value.activeReceiveReceipt === null && value.activeReceivedBytes !== 0)
        || (value.activeReceiveReceipt !== null && value.activeReceivedBytes < 1)) {
      throw new TypeError('Invalid active broker request');
    }
  } else if (value.activeRequest
      || value.activeRequestId !== null
      || value.operationId !== null
      || value.protocol !== null
      || value.timeoutMs !== null
      || value.maxResponseBytes !== null
      || value.activeReceiveReceipt !== null
      || value.activeReceivedBytes !== 0) {
    throw new TypeError('Idle broker carried stale request state');
  }
  return Object.freeze({ ...value });
}

export async function prepareDesktopReadOnlyRequest(plan, globalObject = globalThis) {
  const validated = validateReadOnlyRequestPlan(plan);
  const invoke = getTauriInvoke(globalObject);
  if (!invoke) throw new Error('Desktop host unavailable');
  return validateDesktopRequestBrokerSnapshot(await invoke('desktop_prepare_readonly_request', {
    epoch: validated.epoch,
    operationId: validated.operationId,
    requestId: validated.requestId,
    protocol: validated.protocol,
    timeoutMs: validated.timeoutMs,
    maxResponseBytes: validated.maxResponseBytes,
  }));
}

export async function consumeDesktopReadOnlyRequest(
  epoch,
  requestId,
  nativeRequestReceipt,
  globalObject = globalThis
) {
  if (!Number.isInteger(epoch) || epoch < 1) throw new TypeError('Invalid epoch');
  if (typeof requestId !== 'string' || requestId.length < 8 || requestId.length > 64) {
    throw new TypeError('Invalid request id');
  }
  if (!Number.isSafeInteger(nativeRequestReceipt) || nativeRequestReceipt < 1) {
    throw new TypeError('Native request receipt required');
  }
  const invoke = getTauriInvoke(globalObject);
  if (!invoke) throw new Error('Desktop host unavailable');
  return validateDesktopRequestBrokerSnapshot(
    await invoke('desktop_consume_readonly_request', {
      epoch,
      requestId,
      nativeRequestReceipt,
    })
  );
}

export async function cancelDesktopReadOnlyRequest(epoch, requestId, globalObject = globalThis) {
  if (!Number.isInteger(epoch) || epoch < 1) throw new TypeError('Invalid epoch');
  if (typeof requestId !== 'string' || requestId.length < 8 || requestId.length > 64) {
    throw new TypeError('Invalid request id');
  }
  const invoke = getTauriInvoke(globalObject);
  if (!invoke) throw new Error('Desktop host unavailable');
  return validateDesktopRequestBrokerSnapshot(
    await invoke('desktop_cancel_readonly_request', { epoch, requestId })
  );
}

export async function getDesktopRequestBrokerSnapshot(globalObject = globalThis) {
  const invoke = getTauriInvoke(globalObject);
  if (!invoke) return Object.freeze({
    version: 1,
    evidenceContractVersion: EVIDENCE_CONTRACT_VERSION,
    stage: 'BROKER_IDLE',
    epoch: 0,
    activeRequest: false,
    activeRequestId: null,
    operationId: null,
    protocol: null,
    timeoutMs: null,
    maxResponseBytes: null,
    attemptCount: 0,
    evidencedAttemptCount: 0,
    maxAttempts: 32,
    activeReceiveReceipt: null,
    activeReceivedBytes: 0,
    txBytesExposed: false,
    writeLike: false,
    ecuVerified: false,
    writesEnabled: false,
    flashEnabled: false,
  });
  return validateDesktopRequestBrokerSnapshot(await invoke('desktop_request_broker_snapshot'));
}

export function validateDesktopLocalIdentityAttestation(value) {
  if (!value || typeof value !== 'object'
      || value.version !== 1
      || value.evidenceContractVersion !== EVIDENCE_CONTRACT_VERSION
      || value.stage !== 'LOCAL_HOST_ATTESTED'
      || value.host !== 'native-desktop'
      || !Number.isInteger(value.epoch) || value.epoch < 1
      || !Number.isInteger(value.sequence) || value.sequence < 1
      || !['DS2','KWP2000_BMW'].includes(value.protocol)
      || value.transportConfigured !== true
      || value.brokerIdle !== true
      || !Number.isInteger(value.brokerAttemptCount) || value.brokerAttemptCount < 2
      || !Number.isInteger(value.brokerEvidencedAttemptCount)
      || value.brokerEvidencedAttemptCount < 2
      || value.brokerEvidencedAttemptCount > value.brokerAttemptCount
      || value.rawSerialWriteExposed !== false
      || value.identityVerified !== false
      || value.ecuVerified !== false
      || value.writesEnabled !== false
      || value.flashEnabled !== false) {
    throw new TypeError('Invalid desktop local identity attestation');
  }
  return Object.freeze({ ...value });
}

export async function attestDesktopIdentityContext(epoch, protocol, globalObject = globalThis) {
  if (!Number.isInteger(epoch) || epoch < 1) throw new TypeError('Invalid epoch');
  if (!['DS2','KWP2000_BMW'].includes(protocol)) throw new TypeError('Invalid protocol');
  const invoke = getTauriInvoke(globalObject);
  if (!invoke) throw new Error('Desktop host unavailable');
  return validateDesktopLocalIdentityAttestation(
    await invoke('desktop_local_identity_attestation', { epoch, protocol })
  );
}

export async function closeDesktopPort(epoch, globalObject = globalThis) {
  if (!Number.isInteger(epoch) || epoch < 1) throw new TypeError('Invalid epoch');
  const invoke = getTauriInvoke(globalObject);
  if (!invoke) throw new Error('Desktop host unavailable');
  return validateDesktopTransportSnapshot(await invoke('desktop_close_port', { epoch }));
}

export async function getDesktopTransportSnapshot(globalObject = globalThis) {
  const invoke = getTauriInvoke(globalObject);
  if (!invoke) return Object.freeze({
    version: 1,
    evidenceContractVersion: EVIDENCE_CONTRACT_VERSION,
    stage: 'NO_CANDIDATE',
    evidenceStage: 'NO_CABLE',
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
