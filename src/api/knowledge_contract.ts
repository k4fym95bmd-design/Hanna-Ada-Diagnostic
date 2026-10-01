import type { Hypothesis, MisfireTopology } from "../inference/bayesian_core.js";
import type { NextBestTestResult } from "../inference/utility_engine.js";

export type EvidenceGrade = "LOW" | "MEDIUM" | "HIGH";
export interface KnowledgeSearchRequest {
  readonly sgbd: string;
  readonly misfiringCylinders: readonly number[];
  readonly evidenceQualityScore: number;
}
export interface EvidenceQuality {
  readonly score: number;
  readonly grade: EvidenceGrade;
  readonly unverifiedSignalsExcluded: true;
}
export interface KnowledgeSearchResponse {
  readonly topology: MisfireTopology;
  readonly posterior: Readonly<Record<Hypothesis, number>>;
  readonly evidenceQuality: EvidenceQuality;
  readonly diagnosticConfidence: EvidenceGrade;
  readonly nextBestTest: NextBestTestResult;
  readonly blockers: readonly string[];
}
export function gradeEvidence(score: number): EvidenceGrade {
  if (!Number.isFinite(score) || score < 0 || score > 1) throw new RangeError("evidenceQualityScore must be in [0,1]");
  return score < 0.6 ? "LOW" : score < 0.85 ? "MEDIUM" : "HIGH";
}
export function enforceConfidenceFromEvidence(quality: EvidenceQuality, proposed: EvidenceGrade): EvidenceGrade {
  if (quality.grade === "LOW") return "LOW";
  return proposed;
}
