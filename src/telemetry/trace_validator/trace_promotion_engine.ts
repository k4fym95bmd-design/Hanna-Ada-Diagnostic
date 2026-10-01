import { VerificationState } from "../prg_harvester.js";
import type { ParsedApiTraceRecord } from "./api_trace_parser.js";

export interface PromotionStatement { run(...parameters:readonly unknown[]):{changes:number}; }
export interface PromotionDatabase { prepare(sql:string):PromotionStatement; }
export interface PromotionCandidate {
 readonly bindingId:number; readonly sgbd:string; readonly jobName:string|null; readonly resultName:string|null; readonly verificationState:VerificationState;
}
export type PromotionResult =
 | {readonly status:"TRACE_VERIFIED";readonly bindingId:number;readonly timestampMs:number}
 | {readonly status:"REJECTED";readonly bindingId:number;readonly reason:string};

export class TracePromotionEngine {
 constructor(private readonly db:PromotionDatabase){}
 promote(candidate:PromotionCandidate, records:readonly ParsedApiTraceRecord[]):PromotionResult {
  if(candidate.verificationState===VerificationState.TRACE_VERIFIED) return {status:"REJECTED",bindingId:candidate.bindingId,reason:"ALREADY_TRACE_VERIFIED"};
  if(!candidate.jobName||!candidate.resultName) return {status:"REJECTED",bindingId:candidate.bindingId,reason:"BINDING_TRIPLE_INCOMPLETE"};
  const hit=records.find(r=>r.sgbdName===candidate.sgbd&&r.jobName===candidate.jobName&&r.resultName===candidate.resultName&&r.timestampMs!==null);
  if(!hit||hit.timestampMs===null) return {status:"REJECTED",bindingId:candidate.bindingId,reason:"NO_TIMESTAMPED_PHYSICAL_TRACE_MATCH"};
  const out=this.db.prepare(`
    UPDATE ecu_signal_binding
       SET verification_state='TRACE_VERIFIED', trace_timestamp_ms=?, updated_at=CURRENT_TIMESTAMP
     WHERE binding_id=? AND sgbd=? AND job_name=? AND result_name=?
       AND verification_state IN ('DISCOVERED_RAW','PARSED_STRUCTURAL','RUNTIME_OBSERVED')
  `).run(hit.timestampMs,candidate.bindingId,candidate.sgbd,candidate.jobName,candidate.resultName);
  if(out.changes!==1) return {status:"REJECTED",bindingId:candidate.bindingId,reason:"ATOMIC_PROMOTION_FAILED"};
  return {status:"TRACE_VERIFIED",bindingId:candidate.bindingId,timestampMs:hit.timestampMs};
 }
}
