import { VerificationState, type DiscoveredBinding } from "./prg_harvester.js";

export interface RuntimeObservation {
  readonly timestampMs: number;
  readonly sgbd: string;
  readonly jobName: string;
  readonly resultName: string;
  readonly rawValue: unknown;
}

export interface ApiTraceRecord {
  readonly timestampMs: number;
  readonly sgbd: string;
  readonly jobName: string;
  readonly resultName: string;
  readonly direction: "REQUEST" | "RESPONSE";
}

export interface VerifiedBinding extends DiscoveredBinding {
  readonly jobName: string;
  readonly resultName: string;
  readonly state: VerificationState.TRACE_VERIFIED;
  readonly traceTimestampMs: number;
}

export class TraceCorrelator {
  verify(
    binding: DiscoveredBinding,
    observations: readonly RuntimeObservation[],
    trace: readonly ApiTraceRecord[],
  ): VerifiedBinding | null {
    if (!binding.jobName || !binding.resultName) return null;

    const observed = observations.some(
      (o) =>
        o.sgbd === binding.sgbd &&
        o.jobName === binding.jobName &&
        o.resultName === binding.resultName,
    );
    if (!observed) return null;

    const traceRecord = trace.find(
      (r) =>
        r.direction === "RESPONSE" &&
        r.sgbd === binding.sgbd &&
        r.jobName === binding.jobName &&
        r.resultName === binding.resultName,
    );
    if (!traceRecord) return null;

    return Object.freeze({
      ...binding,
      jobName: binding.jobName,
      resultName: binding.resultName,
      state: VerificationState.TRACE_VERIFIED,
      traceTimestampMs: traceRecord.timestampMs,
    });
  }
}
