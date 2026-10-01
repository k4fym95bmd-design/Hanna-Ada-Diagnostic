import { VerificationState, type ScalarType } from "../telemetry/prg_harvester.js";

export interface SqliteStatement {
  all(...parameters: readonly unknown[]): readonly Record<string, unknown>[];
}
export interface SqliteDatabase {
  prepare(sql: string): SqliteStatement;
}
export interface TraceVerifiedBindingRow {
  readonly bindingId: number;
  readonly ecuFamily: string;
  readonly sgbd: string;
  readonly jobName: string;
  readonly resultName: string;
  readonly canonicalName: string;
  readonly dataType: ScalarType;
  readonly verificationState: VerificationState.TRACE_VERIFIED;
}
export class BindingRepository {
  constructor(private readonly db: SqliteDatabase) {}
  findTraceVerified(sgbd: string): readonly TraceVerifiedBindingRow[] {
    const rows = this.db.prepare(`
      SELECT b.binding_id, b.ecu_family, b.sgbd, b.job_name, b.result_name,
             s.canonical_name, s.data_type, b.verification_state
      FROM ecu_signal_binding b
      JOIN telemetry_signal s ON s.signal_id = b.signal_id
      WHERE b.sgbd = ? AND b.verification_state = 'TRACE_VERIFIED'
      ORDER BY b.binding_id
    `).all(sgbd);
    return rows.map((r) => {
      if (r.verification_state !== VerificationState.TRACE_VERIFIED ||
          typeof r.job_name !== "string" || typeof r.result_name !== "string") {
        throw new Error("ZERO_TRUST_BINDING_INVARIANT_VIOLATION");
      }
      return Object.freeze({
        bindingId: Number(r.binding_id), ecuFamily: String(r.ecu_family),
        sgbd: String(r.sgbd), jobName: r.job_name, resultName: r.result_name,
        canonicalName: String(r.canonical_name), dataType: String(r.data_type) as ScalarType,
        verificationState: VerificationState.TRACE_VERIFIED,
      });
    });
  }
}
