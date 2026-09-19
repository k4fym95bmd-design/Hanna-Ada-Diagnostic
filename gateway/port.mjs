// Local VCI port contract. Transport only: no vehicle protocol, USB driver or ECU I/O is implemented here.
// The caller must provide a physical gateway that independently proves K-line/DS2 support.
export const VCI_PROTOCOL_VERSION = 1;

const allowedCapabilities = new Set(['generic-obd', 'bmw-ds2', 'bmw-kwp']);
const validModule = /^[a-z0-9][a-z0-9_-]{0,31}$/;

export class GatewayProtocolError extends Error {
  constructor(message) { super(message); this.name = 'GatewayProtocolError'; }
}

export function validateGatewayHello(hello) {
  if (!hello || typeof hello !== 'object' || Array.isArray(hello)) throw new GatewayProtocolError('No gateway handshake');
  if (hello.version !== VCI_PROTOCOL_VERSION) throw new GatewayProtocolError('Unsupported VCI protocol version');
  if (typeof hello.sessionId !== 'string' || !/^[a-zA-Z0-9_-]{16,128}$/.test(hello.sessionId)) throw new GatewayProtocolError('Invalid session ID');
  if (hello.transport !== 'physical-vci') throw new GatewayProtocolError('An ELM/BLE connection alone is not a BMW VCI');
  if (!Array.isArray(hello.capabilities) || hello.capabilities.some(c => !allowedCapabilities.has(c)) || new Set(hello.capabilities).size !== hello.capabilities.length) throw new GatewayProtocolError('Invalid capability list');
  if (typeof hello.hardwareId !== 'string' || !/^[a-zA-Z0-9_.:-]{3,100}$/.test(hello.hardwareId)) throw new GatewayProtocolError('Hardware identity absent');
  return Object.freeze({ version: hello.version, sessionId: hello.sessionId, transport: hello.transport, hardwareId: hello.hardwareId, capabilities: Object.freeze([...hello.capabilities]) });
}

// A capability claim never marks a control unit online. Only validated real responses may do so.
export class LocalVciPort {
  #hello = null;
  #modules = new Map();
  #exchange;
  #epoch = 0;
  #inFlight = false;

  constructor(exchange) {
    if (typeof exchange !== 'function') throw new TypeError('An injected physical gateway exchange is required');
    this.#exchange = exchange;
  }

  connect(hello) {
    const validated = validateGatewayHello(hello);
    this.disconnect();
    this.#hello = validated;
    return this.status();
  }

  status() {
    return { connected: !!this.#hello, hardwareId: this.#hello?.hardwareId ?? null, transport: this.#hello?.transport ?? null, capabilities: [...(this.#hello?.capabilities ?? [])], onlineModules: [...this.#modules.keys()] };
  }

  // Probe definitions are reviewed per ECU and injected by a future BMW protocol layer.
  // Arbitrary hex/raw TX and write/actuation/reset requests are intentionally unavailable.
  async probeIdentity(definition) {
    if (!this.#hello) throw new GatewayProtocolError('VCI not connected');
    if (!definition || !validModule.test(definition.moduleId || '') || !allowedCapabilities.has(definition.capability) || definition.capability === 'generic-obd') throw new GatewayProtocolError('Invalid BMW identity probe');
    if (!this.#hello.capabilities.includes(definition.capability)) throw new GatewayProtocolError('BMW physical protocol unsupported');
    if (typeof definition.request !== 'function' || typeof definition.validateResponse !== 'function') throw new GatewayProtocolError('Reviewed identity request and parser required');
    if (definition.readOnly !== true) throw new GatewayProtocolError('Only read-only identity probes are allowed');
    // One vehicle bus, one outstanding exchange; never interleave module replies.
    if (this.#inFlight) throw new GatewayProtocolError('Vehicle bus busy with another identity probe');
    this.#modules.delete(definition.moduleId);
    const epoch = this.#epoch;
    const sessionId = this.#hello.sessionId;
    const bytes = definition.request();
    if (!(bytes instanceof Uint8Array) || bytes.length === 0 || bytes.length > 256) throw new GatewayProtocolError('Invalid request frame');
    this.#inFlight = true;
    try {
      const received = await this.#exchange({ sessionId, capability: definition.capability, moduleId: definition.moduleId, bytes: Uint8Array.from(bytes) });
      // Session IDs are supplied by a remote peer and can be reused: check our own epoch too.
      if (!this.#hello || this.#epoch !== epoch || this.#hello.sessionId !== sessionId) throw new GatewayProtocolError('VCI session changed during request');
      if (!(received instanceof Uint8Array) || received.length === 0 || received.length > 4096) throw new GatewayProtocolError('Missing or oversized physical ECU response');
      const identity = definition.validateResponse(Uint8Array.from(received));
      if (typeof identity !== 'string' || identity.trim().length < 2 || identity.length > 256) throw new GatewayProtocolError('ECU identity not verified');
      // A parser may indirectly end the session; never publish identity from a stale one.
      if (!this.#hello || this.#epoch !== epoch || this.#hello.sessionId !== sessionId) throw new GatewayProtocolError('VCI session changed while validating response');
      this.#modules.set(definition.moduleId, identity.trim());
      return { moduleId: definition.moduleId, identity: identity.trim(), status: 'VERIFIED_ONLINE' };
    } finally {
      if (this.#epoch === epoch) this.#inFlight = false;
    }
  }

  disconnect() {
    this.#epoch += 1;
    this.#hello = null;
    this.#modules.clear();
    this.#inFlight = false;
  }
}
