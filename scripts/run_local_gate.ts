import { execFileSync } from "node:child_process";
import { readFileSync, rmSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";

function run(cmd:string,args:string[]):void { execFileSync(cmd,args,{stdio:"inherit",shell:process.platform==="win32"}); }
function sqlInvariant():void {
 const db=new DatabaseSync(":memory:");
 try{
  const ddl=readFileSync("db/migrations/0072_apex_zero_trust_bindings.sql","utf8");
  db.exec(ddl);
  db.exec("INSERT INTO telemetry_signal(canonical_name,data_type) VALUES ('gate.synthetic','number')");
  let rejected=false;
  try{
   db.prepare(`INSERT INTO ecu_signal_binding(ecu_family,sgbd,job_name,result_name,signal_id,verification_state,source_sha256)
    VALUES(?,?,?,?,1,'TRACE_VERIFIED',?)`).run("GATE","GATE","JOB","RESULT","0".repeat(64));
  }catch{rejected=true;}
  if(!rejected) throw new Error("SQL_FAIL_CLOSED_INVARIANT_NOT_ENFORCED");
 } finally { db.close(); }
}
try{
 run("npx",["--yes","typescript@5.9.3","tsc","-p","tsconfig.phase7.1.json"]);
 sqlInvariant();
 run("npm",["run","test:phase7.2"]);
 console.log("PHASE_7_3_LOCAL_GATE_PASS");
 process.exitCode=0;
}catch(error){
 console.error("PHASE_7_3_LOCAL_GATE_FAIL",error);
 process.exitCode=1;
}finally{
 try{rmSync(".phase72-build",{recursive:true,force:true});}catch{}
}
