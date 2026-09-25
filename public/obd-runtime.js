import { classifyProtocolContract, resolveProtocolAuthority } from './protocol-authority.js';

const HA=window.HannaAdaOBD={device:null,server:null,write:null,notify:null,buffer:'',pending:null,connected:false,adapter:false,ecu:false,protocolContract:null,poll:null,values:{},supported:new Set(),stats:{tx:0,rx:0,timeouts:0,lastLatency:null,lastCommand:null}};
const UUID={carista:{service:'0000fff0-0000-1000-8000-00805f9b34fb',notify:'0000fff1-0000-1000-8000-00805f9b34fb',write:'0000fff2-0000-1000-8000-00805f9b34fb'},ffe0:{service:'0000ffe0-0000-1000-8000-00805f9b34fb',notify:'0000ffe1-0000-1000-8000-00805f9b34fb',write:'0000ffe1-0000-1000-8000-00805f9b34fb'},nus:{service:'6e400001-b5a3-f393-e0a9-e50e24dcca9e',notify:'6e400003-b5a3-f393-e0a9-e50e24dcca9e',write:'6e400002-b5a3-f393-e0a9-e50e24dcca9e'}};
const enc=new TextEncoder(),dec=new TextDecoder();
function log(kind,msg){const box=document.querySelector('#haRealConsole');if(box){const d=document.createElement('div');d.className='rt-'+kind.toLowerCase();d.textContent=`${kind}  ${msg}`;box.appendChild(d);while(box.children.length>250)box.removeChild(box.firstChild);box.scrollTop=box.scrollHeight;}console.log('[H&A OBD]',kind,msg)}
function setChip(id,on,text){const e=document.querySelector(id);if(!e)return;e.classList.toggle('on',!!on);e.classList.toggle('bad',!on);if(text)e.querySelector('b').textContent=text}
function status(msg,bad=false){const e=document.querySelector('#haRuntimeStatus');if(e){e.textContent=msg;e.classList.toggle('bad',bad)}}
function clean(s){return String(s||'').replace(/\0/g,'').replace(/SEARCHING\.\.\./gi,'').replace(/BUS INIT[^\r\n>]*/gi,'').replace(/STOPPED/gi,'').replace(/[\r\n]+/g,' ').replace(/\s+/g,' ').trim()}
function classify(raw){const s=clean(raw).toUpperCase();if(!s)return'empty';if(s.includes('NO DATA'))return'no-data';if(s.includes('UNABLE TO CONNECT'))return'unable-to-connect';if(s.includes('BUS INIT')&&s.includes('ERROR'))return'bus-init-error';if(s.includes('ERROR')||s.includes('?'))return'error';return'ok'}
function refreshStats(){const e=document.querySelector('#haSessionStats');if(!e)return;e.textContent=`TX ${HA.stats.tx} · RX ${HA.stats.rx} · TIMEOUT ${HA.stats.timeouts} · ${HA.stats.lastLatency==null?'—':HA.stats.lastLatency+' ms'}`}
function onNotify(ev){const s=dec.decode(ev.target.value);HA.buffer+=s;HA.stats.rx++;refreshStats();log('RX',clean(s)||JSON.stringify(s));if(HA.buffer.includes('>')&&HA.pending){const p=HA.pending;HA.pending=null;clearTimeout(p.timer);const out=HA.buffer;HA.buffer='';HA.stats.lastLatency=Math.max(0,Math.round(performance.now()-p.started));refreshStats();p.resolve(out)}}
async function discover(server){for(const [name,profile] of Object.entries(UUID)){try{const svc=await server.getPrimaryService(profile.service);const n=await svc.getCharacteristic(profile.notify);const w=profile.write===profile.notify?n:await svc.getCharacteristic(profile.write);log('SYS',`BLE UART profile: ${name}`);return {n,w,profile,name}}catch{}}throw new Error('Nie znaleziono obsługiwanego profilu BLE UART (FFF0/FFE0/NUS).')}
async function command(cmd,timeout=6000){if(!HA.write)throw new Error('Adapter niepołączony');if(HA.pending)throw new Error('Poprzednie polecenie nadal oczekuje');HA.buffer='';HA.stats.tx++;HA.stats.lastCommand=cmd;refreshStats();log('TX',cmd);return new Promise(async(resolve,reject)=>{const started=performance.now();const timer=setTimeout(()=>{HA.pending=null;HA.stats.timeouts++;refreshStats();reject(new Error(`Timeout: ${cmd}`))},timeout);HA.pending={resolve,reject,timer,started};try{const bytes=enc.encode(cmd+'\r');if(HA.write.properties.writeWithoutResponse)await HA.write.writeValueWithoutResponse(bytes);else await HA.write.writeValue(bytes)}catch(e){clearTimeout(timer);HA.pending=null;reject(e)}})}
function hexLines(raw){return clean(raw).toUpperCase().split(/(?=7E[0-9A-F]|41|43)/).map(x=>x.replace(/[^0-9A-F ]/g,' ').replace(/\s+/g,' ').trim()).filter(Boolean)}
function bytesFrom(s){const h=s.replace(/[^0-9A-F]/gi,'');const out=[];for(let i=0;i+1<h.length;i+=2)out.push(parseInt(h.slice(i,i+2),16));return out}
function findPid(raw,pid){const p=parseInt(pid,16);for(const line of hexLines(raw)){const b=bytesFrom(line);for(let i=0;i<b.length-2;i++)if(b[i]===0x41&&b[i+1]===p)return b.slice(i+2)}return null}
function decodeSupported(raw,base=0){const a=findPid(raw,base.toString(16).padStart(2,'0'));if(!a||a.length<4)return[];const bits=(a[0]<<24)|(a[1]<<16)|(a[2]<<8)|a[3];const out=[];for(let i=1;i<=32;i++)if(bits&(1<<(32-i)))out.push(base+i);return out}
function dtcFromPair(a,b){if(a===0&&b===0)return null;const fam=['P','C','B','U'][(a>>6)&3];return `${fam}${((a>>4)&3).toString(16).toUpperCase()}${(a&15).toString(16).toUpperCase()}${(b>>4).toString(16).toUpperCase()}${(b&15).toString(16).toUpperCase()}`}
function parseDtc(raw){const codes=[];for(const line of hexLines(raw)){const b=bytesFrom(line);let i=b.indexOf(0x43);if(i<0)continue;for(i=i+1;i+1<b.length;i+=2){const c=dtcFromPair(b[i],b[i+1]);if(c&&!codes.includes(c))codes.push(c)}}return codes}
const PIDS={load:{cmd:'0104',unit:'%',parse:a=>a?.length?a[0]*100/255:null},coolant:{cmd:'0105',unit:'°C',parse:a=>a?.length?a[0]-40:null},stft1:{cmd:'0106',unit:'%',parse:a=>a?.length?(a[0]-128)*100/128:null},ltft1:{cmd:'0107',unit:'%',parse:a=>a?.length?(a[0]-128)*100/128:null},stft2:{cmd:'0108',unit:'%',parse:a=>a?.length?(a[0]-128)*100/128:null},ltft2:{cmd:'0109',unit:'%',parse:a=>a?.length?(a[0]-128)*100/128:null},rpm:{cmd:'010C',unit:'rpm',parse:a=>a?.length>1?((a[0]*256+a[1])/4):null},speed:{cmd:'010D',unit:'km/h',parse:a=>a?.length?a[0]:null},iat:{cmd:'010F',unit:'°C',parse:a=>a?.length?a[0]-40:null},maf:{cmd:'0110',unit:'g/s',parse:a=>a?.length>1?((a[0]*256+a[1])/100):null},throttle:{cmd:'0111',unit:'%',parse:a=>a?.length?a[0]*100/255:null},voltage:{cmd:'ATRV',unit:'V',parse:null}};
function isPidSupported(cmd){if(!cmd.startsWith('01')||cmd==='0100'||HA.supported.size===0)return true;return HA.supported.has(parseInt(cmd.slice(2),16))}
async function readPid(key){const p=PIDS[key];if(!p||!HA.ecu)throw new Error('ECU offline');if(!isPidSupported(p.cmd)){HA.values[key]=null;updateValue(key,null,p.unit,'N/S');return null}const raw=await command(p.cmd);if(classify(raw)==='no-data'){updateValue(key,null,p.unit,'NO DATA');return null}let v;if(key==='voltage'){const m=clean(raw).match(/(\d+(?:\.\d+)?)\s*V/i);v=m?Number(m[1]):null}else v=p.parse(findPid(raw,p.cmd.slice(2)));HA.values[key]=v;updateValue(key,v,p.unit);return v}
function updateValue(key,v,unit,note=''){const e=document.querySelector(`[data-ha-value="${key}"]`);if(e)e.textContent=v==null?(note||'—'):`${Number(v).toFixed(key==='rpm'||key==='speed'?0:1)} ${unit}`}
async function probeSupported(){const raw=await command('0100',15000);const p=decodeSupported(raw,0);p.forEach(x=>HA.supported.add(x));log('SYS',`Supported PID 01-20: ${p.map(x=>'0x'+x.toString(16).padStart(2,'0').toUpperCase()).join(', ')||'none parsed'}`);return raw}
async function establishProtocolAuthority(){
  const atdpnRaw=await command('ATDPN',5000);
  let atdpRaw;
  try{atdpRaw=await command('ATDP',5000)}catch{}
  const contract=resolveProtocolAuthority(atdpnRaw,atdpRaw);
  const classification=classifyProtocolContract(contract);
  HA.protocolContract=contract;
  log('SYS',`Protocol authority ATDPN: ${contract.rawAtdpn} · ${classification}${contract.descriptionFallback?` · ${contract.descriptionFallback}`:''}`);
  return {contract,classification};
}
async function initElm(){
  status('BLE połączone · inicjalizacja ELM…');
  HA.protocolContract=null;
  for(const c of ['ATZ','ATE0','ATL0','ATS0','ATH0','ATAT1','ATSTFF','ATSP0']){
    const r=await command(c,c==='ATZ'?9000:5000);
    const cls=classify(r);
    if(cls!=='ok')log('WARN',`${c}: ${clean(r)}`);
  }
  const ati=clean(await command('ATI'));
  HA.adapter=/ELM|OBD|CARISTA|VLINK|VEEPEAK/i.test(ati)||ati.length>1;
  setChip('#haAdapter',HA.adapter,HA.adapter?'ADAPTER ON':'ADAPTER ?');
  log('SYS','Adapter ID: '+ati);
  status('Adapter online · sprawdzam ECU…');
  try{
    const p=await probeSupported();
    const ecuResponded=/41\s*00|4100/i.test(clean(p));
    if(!ecuResponded){
      HA.ecu=false;
      setChip('#haEcu',false,'ECU —');
      status('Adapter online · brak poprawnej odpowiedzi ECU',true);
      return;
    }
    const {contract,classification}=await establishProtocolAuthority();
    if(classification!=='can'&&classification!=='legacy'){
      HA.ecu=false;
      setChip('#haEcu',false,'ECU —');
      status(`ECU odpowiedziało · protokół ${contract.protocolId} nie jest zatwierdzony dla generic OBD-II`,true);
      return;
    }
    HA.ecu=true;
    setChip('#haEcu',true,'ECU ONLINE');
    status('ECU ONLINE · Generic OBD-II gotowy');
    try{await readPid('voltage')}catch{}
  }catch(e){
    HA.ecu=false;
    HA.protocolContract=null;
    setChip('#haEcu',false,'ECU —');
    status('Adapter online · ECU/protokół niezweryfikowany',true);
    log('ERR',e.message);
  }
}
async function connect(){if(!navigator.bluetooth){status('Ten browser nie udostępnia Web Bluetooth. Na iPhone użyj przeglądarki/rozszerzenia z Web Bluetooth.',true);return}try{status('Wybierz adapter BLE…');const services=Object.values(UUID).map(x=>x.service);HA.device=await navigator.bluetooth.requestDevice({acceptAllDevices:true,optionalServices:services});HA.device.addEventListener('gattserverdisconnected',disconnect);status(`Łączenie: ${HA.device.name||'BLE OBD'}…`);HA.server=await HA.device.gatt.connect();const d=await discover(HA.server);HA.notify=d.n;HA.write=d.w;await HA.notify.startNotifications();HA.notify.addEventListener('characteristicvaluechanged',onNotify);HA.connected=true;setChip('#haBle',true,'BLE ON');log('SYS',`BLE connected: ${HA.device.name||'unknown'} · ${d.name}`);await initElm()}catch(e){status(e.message||String(e),true);log('ERR',e.message||String(e));disconnect()}}
function stopLive(){if(HA.poll){clearInterval(HA.poll);HA.poll=null}const b=document.querySelector('#haLiveToggle');if(b)b.textContent='START LIVE'}
function disconnect(){
  stopLive();
  HA.connected=HA.adapter=HA.ecu=false;
  HA.protocolContract=null;
  HA.supported.clear();
  setChip('#haBle',false,'BLE —');
  setChip('#haAdapter',false,'ADAPTER —');
  setChip('#haEcu',false,'ECU —');
  status('Rozłączono',true);
}
async function readAll(){if(!HA.ecu)return status('ECU offline',true);const keys=['rpm','coolant','maf','throttle','stft1','ltft1','stft2','ltft2','iat','speed','load','voltage'];for(const k of keys){try{await readPid(k)}catch(e){log('WARN',`${k}: ${e.message}`)}}}
function toggleLive(){if(HA.poll){stopLive();status('Live polling zatrzymany');return}if(!HA.ecu)return status('Najpierw połącz ECU',true);const b=document.querySelector('#haLiveToggle');if(b)b.textContent='STOP LIVE';status('Live polling aktywny');let busy=false;const tick=async()=>{if(busy||!HA.ecu)return;busy=true;try{await readAll()}finally{busy=false}};tick();HA.poll=setInterval(tick,2500)}
async function readDtc(){if(!HA.ecu)return status('Najpierw połącz ECU',true);try{const raw=await command('03',10000);const codes=parseDtc(raw);const box=document.querySelector('#haDtcResult');if(box)box.innerHTML=codes.length?codes.map(c=>`<span class="rt-dtc">${c}</span>`).join(''):'<span class="rt-none">Brak kodów Mode 03 w odpowiedzi</span>';log('SYS','Mode 03: '+clean(raw));status(codes.length?`DTC: ${codes.join(', ')}`:'DTC odczytane · brak kodów Mode 03')}catch(e){status(e.message,true)}}
async function rawSend(){const input=document.querySelector('#haRawInput');const c=(input?.value||'').trim().toUpperCase();if(!c)return;if(c==='04')return status('Mode 04 celowo zablokowany w terminalu bezpieczeństwa',true);try{const r=await command(c,10000);status(`${c}: ${classify(r)}`)}catch(e){status(e.message,true)}}
function inject(){if(!document.querySelector('#view'))return;const isVci=[...document.querySelectorAll('.hero h1')].some(x=>/VCI \/ Connection/i.test(x.textContent));if(!isVci)return;if(document.querySelector('#haRuntime'))return;const view=document.querySelector('#view');const old=document.querySelector('#demoBle');if(old){old.textContent='POŁĄCZ REALNY ADAPTER';old.removeAttribute('id');old.onclick=connect;old.classList.add('connect-real')}
const el=document.createElement('section');el.id='haRuntime';el.className='ha-runtime';el.innerHTML=`<div class="rt-head"><div><span class="rt-kicker">REAL OBD RUNTIME</span><h2>BLE → ELM → ECU</h2></div><div><div id="haRuntimeStatus" class="rt-status">Gotowy do połączenia</div><small id="haSessionStats" class="rt-stats">TX 0 · RX 0 · TIMEOUT 0 · —</small></div></div><div class="rt-chips"><span id="haBle" class="rt-chip bad"><i></i><b>BLE —</b></span><span id="haAdapter" class="rt-chip bad"><i></i><b>ADAPTER —</b></span><span id="haEcu" class="rt-chip bad"><i></i><b>ECU —</b></span></div><div class="rt-actions"><button id="haConnect" class="rt-primary">CONNECT BLE</button><button id="haReadAll">READ LIVE</button><button id="haLiveToggle">START LIVE</button><button id="haDtc">READ DTC</button><button id="haDisconnect">DISCONNECT</button></div><div class="rt-live"><div><small>RPM</small><strong data-ha-value="rpm">—</strong></div><div><small>COOLANT</small><strong data-ha-value="coolant">—</strong></div><div><small>MAF</small><strong data-ha-value="maf">—</strong></div><div><small>THROTTLE</small><strong data-ha-value="throttle">—</strong></div><div><small>STFT B1</small><strong data-ha-value="stft1">—</strong></div><div><small>LTFT B1</small><strong data-ha-value="ltft1">—</strong></div><div><small>STFT B2</small><strong data-ha-value="stft2">—</strong></div><div><small>LTFT B2</small><strong data-ha-value="ltft2">—</strong></div><div><small>IAT</small><strong data-ha-value="iat">—</strong></div><div><small>SPEED</small><strong data-ha-value="speed">—</strong></div><div><small>LOAD</small><strong data-ha-value="load">—</strong></div><div><small>VOLTAGE</small><strong data-ha-value="voltage">—</strong></div></div><div class="rt-dtcbox"><b>MODE 03 DTC</b><div id="haDtcResult"><span class="rt-none">Nie odczytano</span></div></div><div class="rt-raw"><div class="rt-rawbar"><b>RAW ELM TERMINAL</b><div><input id="haRawInput" placeholder="np. ATI / 010C / 03"><button id="haRawSend">SEND</button></div></div><div id="haRealConsole" class="rt-console"><div>SYS  Real runtime loaded. No fake live values.</div></div></div>`;view.appendChild(el);el.querySelector('#haConnect').onclick=connect;el.querySelector('#haReadAll').onclick=readAll;el.querySelector('#haLiveToggle').onclick=toggleLive;el.querySelector('#haDtc').onclick=readDtc;el.querySelector('#haDisconnect').onclick=()=>{try{HA.device?.gatt?.disconnect()}catch{}disconnect()};el.querySelector('#haRawSend').onclick=rawSend;el.querySelector('#haRawInput').onkeydown=e=>{if(e.key==='Enter')rawSend()}}
Object.assign(HA,{connect,disconnect,command,readPid,readAll,readDtc,toggleLive,parseDtc,classify,probeSupported,establishProtocolAuthority});
new MutationObserver(()=>inject()).observe(document.querySelector('#view'),{childList:true,subtree:true});setTimeout(inject,200);
