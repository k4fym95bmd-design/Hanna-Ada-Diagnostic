import type { Evidence } from "./bayesian_core.js";
import { VerificationState } from "../telemetry/prg_harvester.js";

export interface VacuumGateInput {
  readonly idleTrim: number | null;
  readonly trim2500: number | null;
  readonly threshold: number;
  readonly reliability: number;
  readonly verificationState: VerificationState;
}
export function vacuumGateEvidence(input: VacuumGateInput): Evidence | null {
  if (input.verificationState !== VerificationState.TRACE_VERIFIED) return null;
  if (input.idleTrim === null || input.trim2500 === null) return null;
  if (![input.idleTrim,input.trim2500,input.threshold,input.reliability].every(Number.isFinite)) return null;
  if (input.threshold <= 0 || input.reliability < 0 || input.reliability > 1) return null;
  const delta = input.idleTrim - input.trim2500;
  if (delta <= input.threshold) return null;
  return Object.freeze({
    id: "VACUUM_GATE_IDLE_TO_2500",
    reliability: input.reliability,
    verificationState: VerificationState.TRACE_VERIFIED,
    likelihoodRatios: Object.freeze({
      LOCAL_VACUUM_LEAK: 4,
      KGE_CCV: 3,
      IGNITION_COIL: 0.25,
    }),
  });
}
