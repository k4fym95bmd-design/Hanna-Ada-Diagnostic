export interface ParsedApiTraceRecord {
  readonly timestampMs: number | null;
  readonly sgbdName: string;
  readonly jobName: string;
  readonly resultName: string;
  readonly lineNumber: number;
}
export interface TraceParseIssue { readonly lineNumber:number; readonly reason:string; readonly raw:string; }
export interface ApiTraceParseResult { readonly records:readonly ParsedApiTraceRecord[]; readonly issues:readonly TraceParseIssue[]; }

const MAX_LINE_LENGTH=65536;
function clean(v:string):string { return v.replace(/^\uFEFF/,"").replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g,"").trim(); }
function field(line:string,names:readonly string[]):string|null {
 for(const n of names){ const m=line.match(new RegExp("(?:^|[;\\s,])"+n+"\\s*[:=]\\s*[\\\"']?([^;,\"'\\s]+)","i")); if(m?.[1]) return clean(m[1]); }
 return null;
}
function timestamp(line:string):number|null {
 const epoch=field(line,["TIMESTAMP_MS","TIME_MS"]); if(epoch && /^\d{10,16}$/.test(epoch)){const n=Number(epoch); return Number.isSafeInteger(n)?n:null;}
 const iso=line.match(/\b(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z)\b/); if(iso?.[1]){const n=Date.parse(iso[1]); return Number.isFinite(n)?n:null;}
 return null;
}
export class ApiTraceParser {
 parse(raw:string):ApiTraceParseResult {
  const records:ParsedApiTraceRecord[]=[]; const issues:TraceParseIssue[]=[];
  const lines=raw.replace(/^\uFEFF/,"").split(/\r?\n/);
  for(let i=0;i<lines.length;i++){
   const original=lines[i]??""; if(!original.trim()) continue;
   if(original.length>MAX_LINE_LENGTH){issues.push({lineNumber:i+1,reason:"LINE_TOO_LONG",raw:original.slice(0,256)});continue;}
   const line=clean(original);
   const sgbd=field(line,["SGBD_NAME","SGBD"]); const job=field(line,["JOB_NAME","JOB"]); const result=field(line,["RESULT_NAME","RESULT"]);
   if(!sgbd&&!job&&!result) continue;
   if(!sgbd||!job||!result){issues.push({lineNumber:i+1,reason:"INCOMPLETE_TRACE_TRIPLE",raw:line.slice(0,512)});continue;}
   records.push(Object.freeze({timestampMs:timestamp(line),sgbdName:sgbd,jobName:job,resultName:result,lineNumber:i+1}));
  }
  return Object.freeze({records:Object.freeze(records),issues:Object.freeze(issues)});
 }
}
