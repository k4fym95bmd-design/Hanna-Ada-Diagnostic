import { strict as assert } from "node:assert";
import { InjectorState, MisfireMatrixEvaluator, type Hypothesis } from "../src/inference/bayesian_core.js";
import { nextBestTest } from "../src/inference/utility_engine.js";
import { vacuumGateEvidence } from "../src/inference/vacuum_gate.js";
import { VerificationState } from "../src/telemetry/prg_harvester.js";

const hypotheses: Hypothesis[] = ["IGNITION_COIL","SPARK_PLUG","IGNITION_HARNESS","INJECTOR_ELECTRICAL","INJECTOR_FLOW","LOCAL_VACUUM_LEAK","KGE_CCV","FUEL_PRESSURE","COMPRESSION","VALVE_SEALING","CAM_SENSOR","VANOS","CAM_TIMING","OTHER"];
const priors = Object.fromEntries(hypotheses.map(h=>[h,1/hypotheses.length])) as Record<Hypothesis,number>;
const evaluator = new MisfireMatrixEvaluator();

{
 const r=evaluator.evaluate({misfiringCylinders:[8],priors,evidenceQuality:0.9,injectorState:InjectorState.DME_PROTECTIVE_CUTOUT,evidence:[{id:"synthetic-no-injection",reliability:1,verificationState:VerificationState.TRACE_VERIFIED,likelihoodRatios:{INJECTOR_ELECTRICAL:100}}]});
 assert.ok(r.blockers.includes("DME_PROTECTIVE_CUTOUT_BLOCKS_INJECTOR_ELECTRICAL_ESCALATION"));
 assert.ok(r.posterior.INJECTOR_ELECTRICAL < 0.08);
}
{
 const r=nextBestTest(priors,[],{informationGain:1,cost:1,time:1,invasiveness:1});
 assert.equal(r.status,"INSUFFICIENT_MODEL_EVIDENCE");
}
{
 const e=vacuumGateEvidence({idleTrim:20,trim2500:2,threshold:10,reliability:1,verificationState:VerificationState.TRACE_VERIFIED});
 assert.ok(e);
 const r=evaluator.evaluate({misfiringCylinders:[8],priors,evidenceQuality:0.9,injectorState:InjectorState.NORMAL,evidence:[e]});
 assert.ok(r.posterior.KGE_CCV > r.posterior.IGNITION_COIL);
 assert.ok(r.posterior.LOCAL_VACUUM_LEAK > r.posterior.IGNITION_COIL);
}
console.log("PHASE_7_2_ADVERSARIAL_PASS");
