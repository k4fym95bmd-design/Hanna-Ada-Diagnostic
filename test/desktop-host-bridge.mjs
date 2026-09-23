import test from 'node:test';
import assert from 'node:assert/strict';
import {
  bindDesktopSerialCandidate,
  cancelDesktopReadOnlyRequest,
  clearDesktopSerialCandidate,
  closeDesktopPort,
  consumeDesktopReadOnlyRequest,
  getDesktopRequestBrokerSnapshot,
  getDesktopTransportSnapshot,
  getTauriInvoke,
  listDesktopSerialCandidates,
  openDesktopConfiguredPort,
  prepareDesktopReadOnlyRequest,
  probeDesktopHost,
  readDesktopBounded,
  executeDesktopMe72Identity,
  executeDesktopMe72Roughness,
  executeDesktopMe72EngineSnapshot,
  executeDesktopMe72FuelAdaptation,
  validateDesktopHostStatus,
  validateDesktopSafetyPolicy,
  validateDesktopSerialCandidates,
  validateDesktopTransportSnapshot,
  validateDesktopReadResult,
  validateDesktopRequestBrokerSnapshot,
  validateDesktopLocalIdentityAttestation,
} from '../public/desktop-host-bridge.js';
import { instantiateReadOnlyRequest } from '../public/read-only-request-registry.js';

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
              evidenceContractVersion: 1,
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
    evidenceContractVersion: 1,
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
              evidenceContractVersion: 1,
              stage: selected ? 'USB_CANDIDATE_BOUND' : 'NO_CANDIDATE',
              evidenceStage: selected ? 'HARDWARE_BOUND' : 'NO_CABLE',
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
    evidenceContractVersion: 1,
    stage: 'PORT_CONFIGURED',
    evidenceStage: 'PORT_OPEN',
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
                evidenceContractVersion: 1,
                stage: 'PORT_CONFIGURED',
                evidenceStage: 'PORT_OPEN',
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
                evidenceContractVersion: 1,
                stage: 'USB_CANDIDATE_BOUND',
                evidenceStage: 'HARDWARE_BOUND',
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


test('bounded desktop receive never promotes ECU or write state', async () => {
  const fake = {
    window: {
      __TAURI__: {
        core: {
          invoke: async (name, args) => {
            assert.equal(name, 'desktop_read_bounded');
            assert.equal(args.epoch, 7);
            assert.equal(args.maxBytes, 32);
            assert.equal(args.timeoutMs, 250);
            return {
              version: 1,
              evidenceContractVersion: 1,
              stage: 'READ_BYTES',
              evidenceStage: 'RX_ACTIVITY',
              epoch: 7,
              protocol: 'KWP2000_BMW',
              receivedBytes: 4,
              bytes: [0xB8, 0xF1, 0x12, 0x00],
              nativeRequestReceipt: null,
              ecuVerified: false,
              writesEnabled: false,
            };
          },
        },
      },
    },
  };

  const result = await readDesktopBounded(7, 32, 250, fake);
  assert.equal(result.receivedBytes, 4);
  assert.equal(result.ecuVerified, false);
  assert.equal(result.writesEnabled, false);

  assert.throws(() => validateDesktopReadResult({
    ...result,
    ecuVerified: true,
  }), /unsafe/i);

  await assert.rejects(() => readDesktopBounded(7, 0, 250, fake), /max bytes/i);
  await assert.rejects(() => readDesktopBounded(7, 32, 6000, fake), /timeout/i);
});


test('desktop inventory and snapshots reject internally inconsistent USB identity', () => {
  assert.throws(() => validateDesktopSerialCandidates([{
    portName:'COM7', kind:'usb', vid:0x0403, pid:null,
    manufacturer:'FTDI', product:'USB Serial', candidateFamily:'FTDI',
    usbIdentityOnly:true, transportVerified:false, ecuVerified:false, writesEnabled:false,
  }]), /USB identity/i);

  assert.throws(() => validateDesktopSerialCandidates([{
    portName:'COM5', kind:'bluetooth', vid:null, pid:null,
    manufacturer:null, product:null, candidateFamily:'FTDI',
    usbIdentityOnly:false, transportVerified:false, ecuVerified:false, writesEnabled:false,
  }]), /Non-USB|USB transport/i);

  assert.throws(() => validateDesktopTransportSnapshot({
    version:1, evidenceContractVersion:1, stage:'NO_CANDIDATE', evidenceStage:'NO_CABLE', epoch:0,
    portName:'COM7', kind:'usb', vid:0x0403, pid:0x6001, candidateFamily:'FTDI',
    transportOpen:false, configured:false, ecuVerified:false, writesEnabled:false,
  }), /stale bound identity/i);

  assert.throws(() => validateDesktopTransportSnapshot({
    version:1, evidenceContractVersion:1, stage:'PORT_CONFIGURED', evidenceStage:'PORT_OPEN', epoch:1,
    portName:'COM5', kind:'bluetooth', vid:null, pid:null, candidateFamily:null,
    transportOpen:true, configured:true, ecuVerified:false, writesEnabled:false,
  }), /requires USB/i);
});

test('READ_BYTES must contain at least one byte', () => {
  assert.throws(() => validateDesktopReadResult({
    version:1, evidenceContractVersion:1, stage:'READ_BYTES', evidenceStage:'RX_ACTIVITY', epoch:1, protocol:'DS2',
    receivedBytes:0, bytes:[], ecuVerified:false, writesEnabled:false,
  }), /cannot be empty/i);
});


test('desktop evidence contract rejects mismatched canonical stage', () => {
  assert.throws(() => validateDesktopTransportSnapshot({
    version:1,
    evidenceContractVersion:1,
    stage:'USB_CANDIDATE_BOUND',
    evidenceStage:'PORT_OPEN',
    epoch:1,
    portName:'COM7',
    kind:'usb',
    vid:0x0403,
    pid:0x6001,
    candidateFamily:'FTDI',
    transportOpen:false,
    configured:false,
    ecuVerified:false,
    writesEnabled:false,
  }), /evidence stage mismatch/i);

  assert.throws(() => validateDesktopReadResult({
    version:1,
    evidenceContractVersion:1,
    stage:'READ_TIMEOUT',
    evidenceStage:'RX_ACTIVITY',
    epoch:1,
    protocol:'KWP2000_BMW',
    receivedBytes:0,
    bytes:[],
    ecuVerified:false,
    writesEnabled:false,
  }), /evidence stage mismatch/i);
});


test('native request broker accepts canonical metadata and never exposes TX', async () => {
  let active = null;
  let attempts = 0;
  let evidenced = 0;
  const evidencedAttempts = [];
  const fake = {
    window: {
      __TAURI__: {
        core: {
          invoke: async (name, args) => {
            if (name === 'desktop_prepare_readonly_request') {
              active = { ...args };
              attempts += 1;
            } else if (name === 'desktop_consume_readonly_request') {
              assert.equal(args.requestId, active.requestId);
              assert.equal(args.nativeRequestReceipt, active.receipt);
              evidencedAttempts.push({
                operationId: active.operationId,
                requestId: active.requestId,
                nativeReceiveReceipt: args.nativeRequestReceipt,
                nativeIdentityFingerprint: active.nativeIdentityFingerprint
                  || 'PN7506366-HW0F-CI01-DIA8-BI60-BW08-BY00-SP001021',
              });
              active = null;
              evidenced += 1;
            } else if (name === 'desktop_cancel_readonly_request') {
              assert.equal(args.requestId, active.requestId);
              active = null;
            } else if (name !== 'desktop_request_broker_snapshot') {
              throw new Error('unexpected command');
            }
            return {
              version: 1,
              evidenceContractVersion: 1,
              stage: active ? 'REQUEST_ACTIVE' : 'BROKER_IDLE',
              epoch: active?.epoch ?? 7,
              activeRequest: !!active,
              activeRequestId: active?.requestId ?? null,
              operationId: active?.operationId ?? null,
              protocol: active?.protocol ?? null,
              timeoutMs: active?.timeoutMs ?? null,
              maxResponseBytes: active?.maxResponseBytes ?? null,
              attemptCount: attempts,
              evidencedAttemptCount: evidenced,
              evidencedAttempts: evidencedAttempts.map(item => ({ ...item })),
              maxAttempts: 32,
              activeReceiveReceipt: active?.receipt ?? null,
              activeReceivedBytes: active?.receivedBytes ?? 0,
              txBytesExposed: false,
              writeLike: false,
              ecuVerified: false,
              writesEnabled: false,
              flashEnabled: false,
            };
          },
        },
      },
    },
  };

  const plan = instantiateReadOnlyRequest('e39-dme-me72-module-identity', {
    epoch: 7,
    requestId: 'broker-js-request-01',
  });
  const opened = await prepareDesktopReadOnlyRequest(plan, fake);
  assert.equal(opened.stage, 'REQUEST_ACTIVE');
  assert.equal(opened.txBytesExposed, false);
  active.receipt = 51;
  active.receivedBytes = 4;

  const consumed = await consumeDesktopReadOnlyRequest(7, plan.requestId, 51, fake);
  assert.equal(consumed.stage, 'BROKER_IDLE');

  const plan2 = instantiateReadOnlyRequest('e39-dme-me72-module-identity', {
    epoch: 7,
    requestId: 'broker-js-request-02',
  });
  await prepareDesktopReadOnlyRequest(plan2, fake);
  const cancelled = await cancelDesktopReadOnlyRequest(7, plan2.requestId, fake);
  assert.equal(cancelled.activeRequest, false);

  const snapshot = await getDesktopRequestBrokerSnapshot(fake);
  assert.equal(snapshot.writesEnabled, false);
});

test('broker snapshot rejects stale active data and unsafe promotion', () => {
  assert.throws(() => validateDesktopRequestBrokerSnapshot({
    version: 1,
    evidenceContractVersion: 1,
    stage: 'BROKER_IDLE',
    epoch: 7,
    activeRequest: false,
    activeRequestId: 'stale',
    operationId: null,
    protocol: null,
    timeoutMs: null,
    maxResponseBytes: null,
    attemptCount: 1,
    evidencedAttemptCount: 0,
    evidencedAttempts: [],
    maxAttempts: 32,
    activeReceiveReceipt: null,
    activeReceivedBytes: 0,
    txBytesExposed: false,
    writeLike: false,
    ecuVerified: false,
    writesEnabled: false,
    flashEnabled: false,
  }), /stale/i);

  assert.throws(() => validateDesktopRequestBrokerSnapshot({
    version: 1,
    evidenceContractVersion: 1,
    stage: 'BROKER_IDLE',
    epoch: 7,
    activeRequest: false,
    activeRequestId: null,
    operationId: null,
    protocol: null,
    timeoutMs: null,
    maxResponseBytes: null,
    attemptCount: 1,
    evidencedAttemptCount: 0,
    evidencedAttempts: [],
    maxAttempts: 32,
    activeReceiveReceipt: null,
    activeReceivedBytes: 0,
    txBytesExposed: true,
    writeLike: false,
    ecuVerified: false,
    writesEnabled: false,
    flashEnabled: false,
  }), /invalid/i);
});


test('consume rejects missing native receipt before IPC', async () => {
  const fake = { window: { __TAURI__: { core: { invoke: async () => { throw new Error('must not invoke'); } } } } };
  await assert.rejects(
    () => consumeDesktopReadOnlyRequest(7, 'broker-js-request-03', null, fake),
    /receipt required/i
  );
});


test('ME7.2 executor sends only epoch and request id over IPC', async () => {
  const calls = [];
  const fake = {
    window: {
      __TAURI__: {
        core: {
          invoke: async (name, args) => {
            calls.push([name, args]);
            assert.equal(name, 'desktop_execute_me72_identity');
            assert.deepEqual(Object.keys(args).sort(), ['epoch','requestId']);
            return {
              version: 1,
              evidenceContractVersion: 1,
              stage: 'READ_BYTES',
              evidenceStage: 'RX_ACTIVITY',
              epoch: 7,
              protocol: 'KWP2000_BMW',
              receivedBytes: 6,
              bytes: [0xB8,0x12,0xF1,0x01,0xA2,0xF8],
              nativeRequestReceipt: 61,
              nativeIdentityFingerprint: 'PN7506366-HW0F-CI01-DIA8-BI60-BW08-BY00-SP001021',
              ecuVerified: false,
              writesEnabled: false,
            };
          },
        },
      },
    },
  };

  const result = await executeDesktopMe72Identity(7, 'identity-native-0001', fake);
  assert.equal(result.nativeRequestReceipt, 61);
  assert.equal(result.nativeIdentityFingerprint, 'PN7506366-HW0F-CI01-DIA8-BI60-BW08-BY00-SP001021');
  assert.equal(calls.length, 1);
  assert.equal('bytes' in calls[0][1], false);
  assert.equal('payload' in calls[0][1], false);
  assert.equal('command' in calls[0][1], false);

  await assert.rejects(
    () => executeDesktopMe72Identity(7, 'bad id', fake),
    /request id/i
  );
});


test('roughness executor sends epoch only and validates native sample provenance', async () => {
  const calls=[];
  const sample=[
    0xB8,0xF1,0x12,0x18,0x62,0x40,0x03,0xFF,0x70,0xFF,0x4E,0x00,
    0x00,0xFF,0xD8,0x00,0x32,0x00,0x90,0x00,0x0C,0x00,0x8E,0x01,
    0x00,0xE5,0x01,0x26,0x98
  ];
  const fake={window:{__TAURI__:{core:{invoke:async(name,args)=>{
    calls.push([name,args]);
    assert.equal(name,'desktop_execute_me72_roughness');
    assert.deepEqual(args,{epoch:7});
    return {
      version:1,
      evidenceContractVersion:1,
      stage:'READ_BYTES',
      evidenceStage:'RX_ACTIVITY',
      epoch:7,
      protocol:'KWP2000_BMW',
      receivedBytes:sample.length,
      bytes:sample,
      nativeRequestReceipt:null,
      nativeIdentityFingerprint:'PN7506366-HW0F-CI01-DIA8-BI60-BW08-BY00-SP001021',
      readonlyProfileId:'e39-me72-roughness-4003',
      readonlySampleSequence:1,
      ecuVerified:false,
      writesEnabled:false,
    };
  }}}}};

  const result=await executeDesktopMe72Roughness(7,fake);
  assert.equal(result.readonlyProfileId,'e39-me72-roughness-4003');
  assert.equal(result.readonlySampleSequence,1);
  assert.equal(calls.length,1);
  assert.deepEqual(Object.keys(calls[0][1]),['epoch']);
  assert.equal('bytes' in calls[0][1],false);
  assert.equal('payload' in calls[0][1],false);
  assert.equal('command' in calls[0][1],false);
});

test('read-only sample provenance cannot exist without attested identity fingerprint', () => {
  assert.throws(() => validateDesktopReadResult({
    version:1,
    evidenceContractVersion:1,
    stage:'READ_BYTES',
    evidenceStage:'RX_ACTIVITY',
    epoch:7,
    protocol:'KWP2000_BMW',
    receivedBytes:1,
    bytes:[0x00],
    nativeRequestReceipt:null,
    nativeIdentityFingerprint:null,
    readonlyProfileId:'e39-me72-roughness-4003',
    readonlySampleSequence:1,
    ecuVerified:false,
    writesEnabled:false,
  }), /sample provenance/i);
});


test('local attestation bridge preserves operation and fingerprint provenance', () => {
  const fingerprint='PN7506366-HW0F-CI01-DIA8-BI60-BW08-BY00-SP001021';
  const result=validateDesktopLocalIdentityAttestation({
    version:1,
    evidenceContractVersion:1,
    stage:'LOCAL_HOST_ATTESTED',
    host:'native-desktop',
    epoch:7,
    sequence:1,
    protocol:'KWP2000_BMW',
    transportConfigured:true,
    brokerIdle:true,
    brokerAttemptCount:2,
    brokerEvidencedAttemptCount:2,
    brokerEvidencedAttempts:[
      {operationId:'e39-dme-me72-module-identity',requestId:'identity-native-A',nativeReceiveReceipt:1,nativeIdentityFingerprint:fingerprint},
      {operationId:'e39-dme-me72-module-identity',requestId:'identity-native-B',nativeReceiveReceipt:2,nativeIdentityFingerprint:fingerprint},
    ],
    nativeIdentityFingerprint:fingerprint,
    nativeIdentityConsistent:true,
    rawSerialWriteExposed:false,
    identityVerified:false,
    ecuVerified:false,
    writesEnabled:false,
    flashEnabled:false,
  });
  assert.equal(result.brokerEvidencedAttempts[0].operationId,'e39-dme-me72-module-identity');
  assert.equal(result.brokerEvidencedAttempts[0].nativeIdentityFingerprint,fingerprint);

  assert.throws(() => validateDesktopLocalIdentityAttestation({
    ...result,
    nativeIdentityFingerprint:'PN9999999-HW0F-CI01-DIA8-BI60-BW08-BY00-SP001021',
  }),/fingerprint mismatch/i);
});


test('engine snapshot executor sends epoch only and validates native provenance', async () => {
  const calls=[];
  const sample='B8 F1 12 2D 62 40 00 00 C3 7E 36 81 B4 00 0A EC 46 FF F1 00 21 66 C4 11 05 00 B5 1B 62 8F 00 93 AF 00 20 00 1F 00 1E 00 1F 00 25 00 1E 00 24 00 1E 93'
    .split(' ').map(v=>Number.parseInt(v,16));
  const fingerprint='PN7506366-HW0F-CI01-DIA8-BI60-BW08-BY00-SP001021';
  const fake={window:{__TAURI__:{core:{invoke:async(name,args)=>{
    calls.push([name,args]);
    assert.equal(name,'desktop_execute_me72_engine_snapshot');
    assert.deepEqual(args,{epoch:7});
    return {
      version:1,
      evidenceContractVersion:1,
      stage:'READ_BYTES',
      evidenceStage:'RX_ACTIVITY',
      epoch:7,
      protocol:'KWP2000_BMW',
      receivedBytes:sample.length,
      bytes:sample,
      nativeRequestReceipt:null,
      nativeIdentityFingerprint:fingerprint,
      readonlyProfileId:'e39-me72-engine-snapshot-4000',
      readonlySampleSequence:2,
      ecuVerified:false,
      writesEnabled:false,
    };
  }}}}};
  const result=await executeDesktopMe72EngineSnapshot(7,fake);
  assert.equal(result.readonlyProfileId,'e39-me72-engine-snapshot-4000');
  assert.equal(result.readonlySampleSequence,2);
  assert.deepEqual(Object.keys(calls[0][1]),['epoch']);
  assert.equal('bytes' in calls[0][1],false);
  assert.equal('payload' in calls[0][1],false);
  assert.equal('command' in calls[0][1],false);
});


test('fuel adaptation executor sends epoch only and validates native provenance', async () => {
  const calls=[];
  const sample='B8 F1 12 13 62 40 04 00 2C 00 20 82 83 80 0C 6C 6C 6C 6C 00 F5 01 15 0E'
    .split(' ').map(v=>Number.parseInt(v,16));
  const fingerprint='PN7506366-HW0F-CI01-DIA8-BI60-BW08-BY00-SP001021';
  const fake={window:{__TAURI__:{core:{invoke:async(name,args)=>{
    calls.push([name,args]);
    assert.equal(name,'desktop_execute_me72_fuel_adaptation');
    assert.deepEqual(args,{epoch:7});
    return {
      version:1,
      evidenceContractVersion:1,
      stage:'READ_BYTES',
      evidenceStage:'RX_ACTIVITY',
      epoch:7,
      protocol:'KWP2000_BMW',
      receivedBytes:sample.length,
      bytes:sample,
      nativeRequestReceipt:null,
      nativeIdentityFingerprint:fingerprint,
      readonlyProfileId:'e39-me72-fuel-adaptation-4004',
      readonlySampleSequence:3,
      ecuVerified:false,
      writesEnabled:false,
    };
  }}}}};
  const result=await executeDesktopMe72FuelAdaptation(7,fake);
  assert.equal(result.readonlyProfileId,'e39-me72-fuel-adaptation-4004');
  assert.equal(result.readonlySampleSequence,3);
  assert.deepEqual(Object.keys(calls[0][1]),['epoch']);
  assert.equal('bytes' in calls[0][1],false);
  assert.equal('payload' in calls[0][1],false);
  assert.equal('command' in calls[0][1],false);
});
