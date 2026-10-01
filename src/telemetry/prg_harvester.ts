export enum VerificationState {
  DISCOVERED_RAW = "DISCOVERED_RAW",
  PARSED_STRUCTURAL = "PARSED_STRUCTURAL",
  RUNTIME_OBSERVED = "RUNTIME_OBSERVED",
  TRACE_VERIFIED = "TRACE_VERIFIED",
}

export type ScalarType = "number" | "integer" | "boolean" | "string" | "bytes" | "unknown";
export type NullableScalar = number | boolean | string | Uint8Array | null;

export interface PrgArtifact {
  readonly path: string;
  readonly sha256: string;
  readonly sizeBytes: number;
}

export interface DiscoveredBinding {
  readonly ecuFamily: string;
  readonly sgbd: string;
  readonly jobName: string | null;
  readonly resultName: string | null;
  readonly scalarType: ScalarType;
  readonly byteOffset: number | null;
  readonly byteLength: number | null;
  readonly state: VerificationState;
  readonly sourceSha256: string;
}

export interface StructuralPrgParser {
  parse(artifact: PrgArtifact, bytes: Uint8Array): readonly DiscoveredBinding[];
}

/**
 * Deliberately does not scan printable strings and claim semantic bindings.
 * A parser implementation must understand the SGBD/PRG structure. Unknown
 * fields remain null and every harvested binding starts below TRACE_VERIFIED.
 */
export class PrgHarvester {
  constructor(private readonly parser: StructuralPrgParser) {}

  harvest(artifact: PrgArtifact, bytes: Uint8Array): readonly DiscoveredBinding[] {
    const bindings = this.parser.parse(artifact, bytes);
    return bindings.map((binding) => {
      if (binding.state === VerificationState.TRACE_VERIFIED) {
        throw new Error("HARVESTER_CANNOT_ASSERT_TRACE_VERIFIED");
      }
      return Object.freeze({ ...binding });
    });
  }
}

export function inferenceEligible(binding: DiscoveredBinding): boolean {
  return binding.state === VerificationState.TRACE_VERIFIED;
}
