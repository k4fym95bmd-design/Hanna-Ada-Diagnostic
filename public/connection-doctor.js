// Portable, read-only connection triage for Hanna & Ada Diagnostics.
// Accepts observed transport data ONLY. It neither connects to Bluetooth nor
// implies that generic OBD access verifies BMW-specific modules.
import {
  classifyVehicleProtocol, decodeSupportedPIDs, DiagnosticError,
  isValidAdapterIdentity, resolveProtocolAuthority,
} from './diagnostic-core.js';

const result = (stage, code, explanation, nextStep, evidence = {}) => Object.freeze({
  stage, code, explanation, nextStep, evidence: Object.freeze(evidence),
  bmwModulesVerified: false, writesEnabled: false,
});

export class ConnectionDoctor {
  constructor() {
    this.activeProtocol = null;
  }

  resolveProtocolAuthority(atdpnRaw, atdpRaw = null) {
    this.activeProtocol = null;
    const contract = resolveProtocolAuthority(atdpnRaw, atdpRaw);
    this.activeProtocol = contract;
    return contract;
  }

  getActiveProtocol() {
    if (!this.activeProtocol) {
      throw new DiagnosticError(
        'PROTOCOL_REQUIRED',
        'Protocol has not been established via ATDPN authority contract.'
      );
    }
    return this.activeProtocol;
  }

  resetProtocol() {
    this.activeProtocol = null;
  }
}

// Observations should be supplied by the real native/Floot transport. Never
// save raw replies or VINs in this summary; export raw logs only by opt-in.
export function diagnoseConnection(observation = {}) {
  if (!observation || typeof observation !== 'object' || Array.isArray(observation)) {
    throw new TypeError('A connection observation object is required');
  }
  const {
    bluetoothPowered = false, adapterSeen = false, bleConnected = false,
    gattDiscovered = false, notificationsActive = false, adapterReply = null,
    pid0100Reply = null, protocolNumberReply = null,
    protocolDescriptionReply = null, protocolReply = null,
    protocolReplySource = null, transportError = null,
  } = observation;

  if (!bluetoothPowered) return result('BLUETOOTH', 'BT_UNAVAILABLE',
    'Bluetooth is unavailable or permission has not been granted.',
    'Enable Bluetooth, permit the app to use it, then start a fresh scan.');
  if (!adapterSeen) return result('DISCOVERY', 'ADAPTER_NOT_FOUND',
    'No suitable adapter has been identified by the scan.',
    'Check that the adapter is powered and look at the discovered BLE name and advertised services.');
  if (!bleConnected) return result('BLE', 'BLE_NOT_CONNECTED',
    'The adapter was discovered, but a Bluetooth link is not established.',
    'Reconnect and capture the Bluetooth connection result.',
    { adapterSeen: true });
  if (!gattDiscovered) return result('GATT', 'GATT_NOT_FOUND',
    'Bluetooth connected, but a compatible serial GATT service is not verified.',
    'Record available service and characteristic UUIDs and compare them with the actual adapter firmware.',
    { bleConnected: true });
  if (!notificationsActive) return result('NOTIFICATIONS', 'NOTIFY_NOT_READY',
    'The GATT channel exists, but notifications have not been confirmed.',
    'Check the notification subscription result before sending ELM commands.',
    { bleConnected: true, gattDiscovered: true });
  if (transportError) return result('ELM', 'TRANSPORT_ERROR',
    'The transport reported an error; later replies may be stale.',
    'Disconnect, re-establish a clean session and capture the first failing command.',
    { notificationsActive: true });
  if (!isValidAdapterIdentity(adapterReply)) return result('ELM', 'ADAPTER_UNVERIFIED',
    'No usable adapter identity was observed; an open BLE channel alone is insufficient.',
    'Capture the ATI response after notifications are enabled.',
    { notificationsActive: true });
  if (typeof pid0100Reply !== 'string' || !pid0100Reply.trim()) {
    return result('ECU', 'ECU_NOT_PROBED',
      'The adapter replied, but a vehicle ECU response has not been checked.',
      'Request generic Mode 01 PID 00 with the vehicle stationary and record the exact reply.',
      { adapterIdentified: true });
  }
  let pids;
  try {
    pids = decodeSupportedPIDs(pid0100Reply);
  } catch (error) {
    const cause = error instanceof DiagnosticError ? error.code : 'UNKNOWN_ERROR';
    return result('ECU', 'ECU_RESPONSE_INVALID',
      'PID 0100 did not provide a complete, verified ECU bitmap.',
      'Capture the raw PID 0100 response and verify the vehicle-side connector and protocol.',
      { adapterIdentified: true, parserError: cause });
  }
  const explicitAtdpn = typeof protocolNumberReply === 'string'
    ? protocolNumberReply
    : (protocolReplySource === 'ATDPN'
      ? protocolReply
      : (typeof protocolReply === 'string' && /(^|[\r\n])\s*AT\s*DPN\s*([\r\n]|$)/i.test(protocolReply)
        ? protocolReply
        : null));

  const descriptiveAtdp = typeof protocolDescriptionReply === 'string'
    ? protocolDescriptionReply
    : (protocolReplySource === 'ATDP' ? protocolReply : null);

  let protocolContract;
  try {
    protocolContract = resolveProtocolAuthority(explicitAtdpn, descriptiveAtdp);
  } catch (error) {
    const cause = error instanceof DiagnosticError ? error.code : 'PROTOCOL_UNVERIFIED';
    return result('PROTOCOL', 'PROTOCOL_UNVERIFIED',
      'Generic ECU communication is confirmed, but protocol authority has not been established by ATDPN.',
      'Capture ATDPN. ATDP may be shown as a description but cannot authorize unframed DTC decoding.',
      {
        genericECUVerified: true,
        responderCount: pids.responderCount,
        pidCount: pids.pids.length,
        parserError: cause,
      });
  }

  const protocol = classifyVehicleProtocol(protocolContract.rawAtdpn);
  if (protocol === 'unknown') return result('PROTOCOL', 'PROTOCOL_UNVERIFIED',
    'ATDPN was captured but did not map to a verified generic OBD bus protocol.',
    'Capture the exact ATDPN reply again before interpreting unframed fault-code replies.',
    {
      genericECUVerified: true,
      responderCount: pids.responderCount,
      pidCount: pids.pids.length,
      protocolContract,
    });

  return result('GENERIC_OBD', 'GENERIC_OBD_VERIFIED',
    'A generic vehicle ECU replied and ATDPN established protocol authority.',
    'Generic read-only DTC and live-PID tests can be run; BMW module access remains unverified.',
    {
      genericECUVerified: true,
      protocol,
      protocolContract,
      responderCount: pids.responderCount,
      pidCount: pids.pids.length,
    });
}
