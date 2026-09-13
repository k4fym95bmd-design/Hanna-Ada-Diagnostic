(()=>{
const wait=()=>new Promise(r=>setTimeout(r,250));
const H=()=>window.HannaAdaOBD;
const dtcType=n=>['P','C','B','U'][(n>>6)&3];
function decodeDtc(raw){
 const clean=String(raw||'').toUpperCase().replace(/SEARCHING\.\.\./g,' ').replace(/[^0-9A-F]/g,'');
 const ix=clean.indexOf('43'); if(ix<0)return [];
 const h=clean.slice(ix+2); const out=[];
 for(let i=0;i+3<h.length;i+=4){const a=parseInt(h.slice(i,i+2),16),b=parseInt(h.slice(i+2,i+4),16);if(!a&&!b)continue;out.push(`${dtcType(a)}${(a>>4)&3}${(a&15).toString(16).toUpperCase()}${(b>>4).toString(16).toUpperCase()}${(b&15).toString(16).toUpperCase()}`)}
 return [...new Set(out)];
}
function ensurePanel(){const rt=document.querySelector('#haRuntime');if(!rt||document.querySelector('#haDiagV2'))return;const s=document.createElement('section');s.id='haDiagV2';s.className='ha-v2';s.innerHTML=`<div class="v2-head"><div><small>DIAGNOSTIC CORE V2</small><h3>Continuous Live · DTC Decode · Protocol</h3></div><span id="haPollState">IDLE</span></div><div class="v2-grid"><button id="haStartLive">START LIVE</button><button id="haStopLive">STOP LIVE</button><button id="haProtocol">READ PROTOCOL</button><button id="haVoltage">READ VOLTAGE</button></div><div class="v2-meta"><div><small>PROTOCOL</small><b id="haProtocolValue">—</b></div><div><small>VOLTAGE</small><b data-ha-value="voltage">—</b></div><div><small>LAST CYCLE</small><b id="haCycle">—</b></div></div><div class="v2-dtc"><div class="v2-dtc-title"><b>GENERIC OBD-II DTC</b><button id="haDecodeDtc">READ + DECODE</button></div><div id="haDtcList"><span class="v2-empty">No DTC read in this session.</span></div></div>`;rt.appendChild(s);
 s.querySelector('#haStartLive').onclick=startLive;s.querySelector('#haStopLive').onclick=stopLive;s.querySelector('#haProtocol').onclick=readProtocol;s.querySelector('#haVoltage').onclick=readVoltage;s.querySelector('#haDecodeDtc').onclick=readDecode;
}
async function send(c,t=8000){const h=H();if(!h?.ecu)throw Error('ECU offline');if(typeof window.haObdCommand==='function')return window.haObdCommand(c,t);throw Error('Runtime command bridge unavailable')}
async function readProtocol(){try{const raw=await send('ATDP');const v=String(raw).replace(/[>\r\n]/g,' ').replace(/\s+/g,' ').trim();document.querySelector('#haProtocolValue').textContent=v||'—'}catch(e){document.querySelector('#haProtocolValue').textContent='ERROR'}}
async function readVoltage(){const h=H();try{if(!h?.ecu)throw Error('ECU offline');if(typeof window.haReadPid==='function')await window.haReadPid('voltage')}catch(e){}}
async function cycle(){const h=H();if(!h?.ecu)return stopLive();if(h._cycleBusy)return;h._cycleBusy=true;try{if(typeof window.haReadAll==='function')await window.haReadAll();await readVoltage();const e=document.querySelector('#haCycle');if(e)e.textContent=new Date().toLocaleTimeString()}finally{h._cycleBusy=false}}
function startLive(){const h=H();if(!h?.ecu)return;stopLive();const st=document.querySelector('#haPollState');if(st)st.textContent='LIVE';cycle();h.poll=setInterval(cycle,1800)}
function stopLive(){const h=H();if(h?.poll)clearInterval(h.poll);if(h)h.poll=null;const st=document.querySelector('#haPollState');if(st)st.textContent='IDLE'}
async function readDecode(){const list=document.querySelector('#haDtcList');try{const raw=await send('03',10000);const codes=decodeDtc(raw);list.innerHTML=codes.length?codes.map(c=>`<span class="v2-code">${c}</span>`).join(''):'<span class="v2-ok">No generic emission DTC returned.</span>'}catch(e){list.innerHTML=`<span class="v2-error">${String(e.message||e)}</span>`}}
new MutationObserver(ensurePanel).observe(document.documentElement,{childList:true,subtree:true});setInterval(ensurePanel,700);ensurePanel();
window.HannaAdaDiagV2={decodeDtc,startLive,stopLive};
})();