import { VerificationState } from "../telemetry/prg_harvester.js";

export enum MisfireTopology {
  SINGLE_CYLINDER = "SINGLE_CYLINDER",
  MULTI_RANDOM = "MULTI_RANDOM",
  BANK1_CLUSTER = "BANK1_CLUSTER",
  BANK2_CLUSTER = "BANK2_CLUSTER",
  CROSS_BANK = "CROSS_BANK",
  NONE = "NONE",
}

export enum InjectorState {
  NORMAL = "NORMAL",
  DME_PROTECTIVE_CUTOUT = "DME_PROTECTIVE_CUTOUT",
  ELECTRICAL_OPEN_CIRCUIT = "ELECTRICAL_OPEN_CIRCUIT",
  ELECTRICAL_SHORT = "ELECTRICAL_SHORT",
  COMMAND_PRESENT_NO_DELIVERY = "COMMAND_PRESENT_NO_DELIVERY",
  UNKNOWN = "UNKNOWN",
}

export type Hypothesis =
  | "IGNITION_COIL"
  | "SPARK_PLUG"
  | "IGNITION_HARNESS"
  | "INJECTOR_ELECTRICAL"
  | "INJECTOR_FLOW"
  | "LOCAL_VACUUM_LEAK"
  | "KGE_CCV"
  | "FUEL_PRESSURE"
  | "COMPRESSION"
  | "VALVE_SEALING"
  | "CAM_SENSOR"
  | "VANOS"
  | "CAM_TIMING"
  | "OTHER";

export interface Evidence {
  readonly id: string;
  readonly reliability: number;
  readonly likelihoodRatios: Readonly<Partial<Record<Hypothesis, number>>>;
  readonly verificationState: VerificationState;
}

export interface EvaluationInput {
  readonly misfiringCylinders: readonly number[];
  readonly priors: Readonly<Record<Hypothesis, number>>;
  readonly evidence: readonly Evidence[];
  readonly injectorState: InjectorState;
  readonly evidenceQuality: number;
}

export interface EvaluationResult {
  readonly topology: MisfireTopology;
  readonly posterior: Readonly<Record<Hypothesis, number>>;
  readonly diagnosticConfidence: "LOW" | "MEDIUM" | "HIGH";
  readonly excludedEvidenceIds: readonly string[];
  readonly blockers: readonly string[];
}

const HYPOTHESES: readonly Hypothesis[] = [
  "IGNITION_COIL", "SPARK_PLUG", "IGNITION_HARNESS", "INJECTOR_ELECTRICAL",
  "INJECTOR_FLOW", "LOCAL_VACUUM_LEAK", "KGE_CCV", "FUEL_PRESSURE",
  "COMPRESSION", "VALVE_SEALING", "CAM_SENSOR", "VANOS", "CAM_TIMING", "OTHER",
];

function assertProbability(value: number, name: string): void {
  if (!Number.isFinite(value) || value <= 0 || value > 1) {
    throw new RangeError(`${name} must be finite and in (0,1]`);
  }
}

function assertLikelihoodRatio(value: number): void {
  if (!Number.isFinite(value) || value <= 0) {
    throw new RangeError("Likelihood ratio must be finite and > 0");
  }
}

export function classifyTopology(cylinders: readonly number[]): MisfireTopology {
  const c = [...new Set(cylinders)].filter((n) => Number.isInteger(n) && n >= 1 && n <= 8).sort((a,b)=>a-b);
  if (c.length === 0) return MisfireTopology.NONE;
  if (c.length === 1) return MisfireTopology.SINGLE_CYLINDER;
  if (c.every((n) => n <= 4)) return c.length >= 3 ? MisfireTopology.BANK1_CLUSTER : MisfireTopology.MULTI_RANDOM;
  if (c.every((n) => n >= 5)) return c.length >= 3 ? MisfireTopology.BANK2_CLUSTER : MisfireTopology.MULTI_RANDOM;
  const b1 = c.some((n) => n <= 4), b2 = c.some((n) => n >= 5);
  return b1 && b2 ? MisfireTopology.CROSS_BANK : MisfireTopology.MULTI_RANDOM;
}

function normalizedSoftmax(logScores: Readonly<Record<Hypothesis, number>>): Record<Hypothesis, number> {
  const max = Math.max(...HYPOTHESES.map((h) => logScores[h]));
  const exp = Object.fromEntries(HYPOTHESES.map((h) => [h, Math.exp(logScores[h] - max)])) as Record<Hypothesis, number>;
  const z = HYPOTHESES.reduce((sum, h) => sum + exp[h], 0);
  if (!Number.isFinite(z) || z <= 0) throw new Error("POSTERIOR_NORMALIZATION_FAILURE");
  return Object.fromEntries(HYPOTHESES.map((h) => [h, exp[h] / z])) as Record<Hypothesis, number>;
}

export class MisfireMatrixEvaluator {
  evaluate(input: EvaluationInput): EvaluationResult {
    if (!Number.isFinite(input.evidenceQuality) || input.evidenceQuality < 0 || input.evidenceQuality > 1) {
      throw new RangeError("evidenceQuality must be in [0,1]");
    }

    const eligible = input.evidence.filter((e) => e.verificationState === VerificationState.TRACE_VERIFIED);
    const excluded = input.evidence.filter((e) => e.verificationState !== VerificationState.TRACE_VERIFIED).map((e) => e.id);
    const blockers: string[] = [];

    const scores = {} as Record<Hypothesis, number>;
    for (const h of HYPOTHESES) {
      const prior = input.priors[h];
      assertProbability(prior, `prior[${h}]`);
      let score = Math.log(prior);
      for (const e of eligible) {
        if (!Number.isFinite(e.reliability) || e.reliability < 0 || e.reliability > 1) {
          throw new RangeError(`reliability[${e.id}] must be in [0,1]`);
        }
        let lr = e.likelihoodRatios[h] ?? 1;
        assertLikelihoodRatio(lr);
        if (input.injectorState === InjectorState.DME_PROTECTIVE_CUTOUT && h === "INJECTOR_ELECTRICAL" && lr > 1) {
          lr = 1; // protective cutout may not support an electrical-fault diagnosis
          if (!blockers.includes("DME_PROTECTIVE_CUTOUT_BLOCKS_INJECTOR_ELECTRICAL_ESCALATION")) {
            blockers.push("DME_PROTECTIVE_CUTOUT_BLOCKS_INJECTOR_ELECTRICAL_ESCALATION");
          }
        }
        score += e.reliability * Math.log(lr);
      }
      scores[h] = score;
    }

    const posterior = normalizedSoftmax(scores);
    const diagnosticConfidence =
      input.evidenceQuality < 0.6 ? "LOW" :
      input.evidenceQuality < 0.85 ? "MEDIUM" : "HIGH";

    return Object.freeze({
      topology: classifyTopology(input.misfiringCylinders),
      posterior: Object.freeze(posterior),
      diagnosticConfidence,
      excludedEvidenceIds: Object.freeze(excluded),
      blockers: Object.freeze(blockers),
    });
  }
}
