import React,{useMemo,useRef,useState} from "react";
import type {VehicleState} from "../../types/bmw540i_nbl_schema.js";
export interface MissionSignal{readonly id:string;readonly label:string;readonly value:number|null;readonly unit:string;readonly trust:"UNVERIFIED"|"TRACE_VERIFIED";}
export interface TraceLine{readonly seq:number;readonly timestampMs:number;readonly hex:string;readonly trust:"TRACE_VERIFIED";}
export interface Props{readonly vehicle:VehicleState;readonly signals:readonly MissionSignal[];readonly posterior:Readonly<Record<string,number>>;readonly trace:readonly TraceLine[];readonly onExecute:(actionId:string)=>Promise<void>;}
export function BMW540iMissionControl(p:Props){
 const [armed,setArmed]=useState<string|null>(null);const timer=useRef<ReturnType<typeof setTimeout>|null>(null);
 const ranked=useMemo(()=>Object.entries(p.posterior).sort((a,b)=>b[1]-a[1]),[p.posterior]);
 const start=(id:string)=>{timer.current=setTimeout(()=>setArmed(id),1200);};const stop=()=>{if(timer.current)clearTimeout(timer.current);timer.current=null;};
 return <section className="apex-mission-control">
  <header><strong>POWERTRAIN MISSION CONTROL · BMW 540i</strong><span>VCI {p.vehicle.batteryV?.toFixed(2)??"UNKNOWN"} V</span><span>{p.vehicle.rpm??"UNKNOWN"} RPM</span><span>{p.vehicle.speedKph??"UNKNOWN"} km/h</span></header>
  <div className="signal-grid">{p.signals.map(s=><article key={s.id} data-trust={s.trust}><h3>{s.label}</h3><output>{s.value===null?"UNKNOWN":s.value.toFixed(2)} {s.unit}</output><small>{s.trust}</small></article>)}</div>
  <aside><h2>Bayesian Decision Tree</h2>{ranked.map(([h,v])=><div key={h}><span>{h}</span><meter min={0} max={1} value={v}/><b>{(v*100).toFixed(1)}%</b></div>)}</aside>
  <div className="action-console"><button onPointerDown={()=>start("NEXT_VERIFIED_ACTION")} onPointerUp={stop} onPointerLeave={stop} disabled={armed!==null}>HOLD TO ARM</button>{armed&&<button onClick={async()=>{const a=armed;setArmed(null);await p.onExecute(a);}}>EXECUTE {armed}</button>}</div>
  <pre className="trace-log" aria-label="Append-only TRACE_VERIFIED log">{p.trace.filter(x=>x.trust==="TRACE_VERIFIED").map(x=>`${x.seq} ${new Date(x.timestampMs).toISOString()} ${x.hex}\n`)}</pre>
 </section>;
}
