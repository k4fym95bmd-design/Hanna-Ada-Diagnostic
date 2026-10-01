import type {EcuIdentity,NblEvent,ProcedureLimits,SafetyDecision,SessionState,VehicleState} from "../types/bmw540i_nbl_schema.js";
export class HardInterrupt extends Error{readonly code="HARD_INTERRUPT";constructor(readonly decisions:readonly SafetyDecision[]){super("HARD_INTERRUPT");}}
export function evaluateSafety(s:VehicleState,p:ProcedureLimits):readonly SafetyDecision[]{
 const d:SafetyDecision[]=[];
 if(s.batteryV===null)d.push({severity:"BLOCK",code:"BATTERY_UNKNOWN",detail:"Battery voltage unavailable"});
 else if(p.writeOrAdaptation&&s.batteryV<12.2)d.push({severity:"BLOCK",code:"VBAT_WRITE_LOW",detail:"Write/adaptation voltage below configured minimum"});
 else if(s.batteryV<12.6)d.push({severity:"WARNING",code:"VBAT_LOW",detail:"Battery voltage below warning threshold"});
 if(s.speedKph===null||s.rpm===null)d.push({severity:"BLOCK",code:"MOTION_STATE_UNKNOWN",detail:"Speed/RPM unavailable"});
 else {if(p.mode==="STATIC"&&s.speedKph>0)d.push({severity:"BLOCK",code:"VEHICLE_MOVING",detail:"Static procedure requires zero speed"});if(p.mode==="STATIC"&&s.rpm>0)d.push({severity:"BLOCK",code:"ENGINE_RUNNING_STATIC",detail:"Static procedure requires zero RPM"});if(p.mode==="DYNAMIC"&&s.rpm===0)d.push({severity:"BLOCK",code:"ENGINE_STOPPED_DYNAMIC",detail:"Dynamic correlation requires running engine"});}
 if(s.coolantC===null||s.oilC===null)d.push({severity:"BLOCK",code:"THERMAL_STATE_UNKNOWN",detail:"Coolant/oil temperature unavailable"});
 else if(s.coolantC<p.minCoolantC||s.coolantC>p.maxCoolantC||s.oilC<p.minOilC||s.oilC>p.maxOilC)d.push({severity:"BLOCK",code:"THERMAL_WINDOW",detail:"Outside procedure-defined thermal window"});
 return d;
}
export class Bmw540iSessionMachine{
 private state:SessionState="IDLE"; get current():SessionState{return this.state;}
 identify(id:EcuIdentity,expected:EcuIdentity):void{if(this.state!=="IDLE")throw new Error("INVALID_TRANSITION");this.state="IDENTIFYING";if(id.trust!=="TRACE_VERIFIED"||id.hardwareId!==expected.hardwareId||id.softwareId!==expected.softwareId||id.variant!==expected.variant||id.provenanceSha256!==expected.provenanceSha256){this.state="HARD_INTERRUPT";throw new HardInterrupt([{severity:"BLOCK",code:"ECU_IDENTITY_MISMATCH",detail:"Exact identity/provenance match required"}]);}this.state="AUTHORIZED";}
 beginStream():void{if(this.state!=="AUTHORIZED")throw new Error("INVALID_TRANSITION");this.state="STREAMING";}
 armAction(s:VehicleState,p:ProcedureLimits):readonly SafetyDecision[]{if(this.state!=="STREAMING")throw new Error("INVALID_TRANSITION");const d=evaluateSafety(s,p);if(d.some(x=>x.severity==="BLOCK")){this.state="HARD_INTERRUPT";throw new HardInterrupt(d);}this.state="ACTION_ARMED";return d;}
 onEvent(e:NblEvent):void{if(e.kind==="DISCONNECT"||e.kind==="FAULT")this.state="HARD_INTERRUPT";}
 close():void{this.state="CLOSED";}
}
