export type Bmw540iGeneration="E39_M62TU"|"E60_N62"|"G30_B58";
export type BusKind="BMW_DS2"|"BMW_FAST"|"KWP2000"|"DCAN"|"DOIP"|"CAN_FD";
export type TrustState="UNVERIFIED"|"TRACE_VERIFIED";
export type SessionState="IDLE"|"IDENTIFYING"|"AUTHORIZED"|"STREAMING"|"ACTION_ARMED"|"HARD_INTERRUPT"|"CLOSED";
export type SafetySeverity="OK"|"WARNING"|"BLOCK";
export interface EcuIdentity {readonly hardwareId:string;readonly softwareId:string;readonly variant:string;readonly provenanceSha256:string;readonly trust:TrustState;}
export interface RawFrame {readonly kind:"RAW_FRAME";readonly timestampNs:bigint;readonly bus:BusKind;readonly id:number|null;readonly payload:Uint8Array;readonly trust:TrustState;}
export interface SignalFrame {readonly kind:"SIGNAL";readonly timestampNs:bigint;readonly signalId:string;readonly value:number|null;readonly unit:string;readonly trust:TrustState;}
export type NblEvent=RawFrame|SignalFrame|{readonly kind:"DISCONNECT";readonly timestampNs:bigint;readonly reason:string}|{readonly kind:"FAULT";readonly timestampNs:bigint;readonly code:string};
export interface VehicleState {readonly batteryV:number|null;readonly speedKph:number|null;readonly rpm:number|null;readonly coolantC:number|null;readonly oilC:number|null;}
export interface ProcedureLimits {readonly mode:"STATIC"|"DYNAMIC";readonly minCoolantC:number;readonly maxCoolantC:number;readonly minOilC:number;readonly maxOilC:number;readonly writeOrAdaptation:boolean;}
export interface SafetyDecision {readonly severity:SafetySeverity;readonly code:string;readonly detail:string;}
export interface M62TuTelemetry {readonly camTargetDeg:number|null;readonly camActualDeg:number|null;readonly additiveTrim:number|null;readonly multiplicativeTrim:number|null;}
export interface N62Telemetry {readonly valvetronicCurrentA:number|null;readonly minimumLiftMm:number|null;readonly crankcasePressureMbar:number|null;}
export interface B58Telemetry {readonly railTargetBar:number|null;readonly railActualBar:number|null;readonly chargeAirC:number|null;readonly ambientC:number|null;}
export class FixedRingBuffer<T>{
 private readonly data:(T|undefined)[]; private cursor=0; private count=0;
 constructor(readonly capacity:number){if(!Number.isInteger(capacity)||capacity<2)throw new RangeError("capacity");this.data=new Array<T|undefined>(capacity);}
 push(v:T):void{this.data[this.cursor]=v;this.cursor=(this.cursor+1)%this.capacity;this.count=Math.min(this.count+1,this.capacity);}
 snapshot():readonly T[]{const out:T[]=[];const start=(this.cursor-this.count+this.capacity)%this.capacity;for(let i=0;i<this.count;i++){const v=this.data[(start+i)%this.capacity];if(v!==undefined)out.push(v);}return out;}
}
