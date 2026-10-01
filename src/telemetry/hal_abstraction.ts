export type VehicleProtocol =
  | "DOIP" | "CAN_FD" | "CAN" | "UDS" | "KWP2000" | "J1850" | "BMW_DS2" | "BMW_FAST";

export type TransportBackend = "J2534" | "D_PDU" | "NATIVE_VERIFIED";
export type OperationClass = "PASSIVE_READ" | "ACTIVE_TEST" | "CODING" | "PROGRAMMING" | "CALIBRATION" | "SECURITY_AUTH";

export interface VehicleState {
  readonly speedKph: number | null;
  readonly engineRpm: number | null;
  readonly supplyVoltage: number | null;
}

export interface HalCapability {
  readonly protocol: VehicleProtocol;
  readonly backend: TransportBackend;
  readonly operationClasses: readonly OperationClass[];
  readonly verified: boolean;
}

export interface TransportRequest {
  readonly protocol: VehicleProtocol;
  readonly operationClass: OperationClass;
  readonly payload: Uint8Array;
  readonly timeoutMs: number;
}

export interface TransportResponse {
  readonly payload: Uint8Array;
  readonly timestampMs: number;
  readonly backend: TransportBackend;
}

export interface SafetyPredicate {
  readonly id: string;
  evaluate(state: VehicleState): boolean;
}

export interface DiagnosticTransport {
  capabilities(): Promise<readonly HalCapability[]>;
  execute(request: TransportRequest, state: VehicleState, predicates: readonly SafetyPredicate[]): Promise<TransportResponse>;
}

/**
 * Fail-closed router: an operation is dispatchable only through a verified
 * capability and only after every declared vehicle-state predicate passes.
 */
export class ApexHalRouter {
  constructor(private readonly transports: readonly DiagnosticTransport[]) {}

  async execute(request: TransportRequest, state: VehicleState, predicates: readonly SafetyPredicate[]): Promise<TransportResponse> {
    if (state.speedKph === null || state.engineRpm === null) throw new Error("VEHICLE_STATE_UNKNOWN");
    if (!predicates.every((p) => p.evaluate(state))) throw new Error("SAFETY_PREDICATE_FAILED");

    for (const transport of this.transports) {
      const caps = await transport.capabilities();
      if (caps.some((c) => c.verified && c.protocol === request.protocol && c.operationClasses.includes(request.operationClass))) {
        return transport.execute(request, state, predicates);
      }
    }
    throw new Error("NO_VERIFIED_TRANSPORT_CAPABILITY");
  }
}
