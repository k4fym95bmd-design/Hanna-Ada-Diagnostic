import { isReadOnlyELMCommand } from './terminal-readonly-guard.js';
import { isUsableAdapterIdentity } from './connection-doctor.js';
import { decodeMode01PidData, decodeStoredDTCs, decodeSupportedPIDs } from './diagnostic-core.js';
import { classifyProtocolContract, resolveProtocolAuthority } from './protocol-authority.js';

const HA=window.HannaAdaOBD={device:null,server:null,write:null,notify:null,buffer:'',pending:null,connected:false,connecting:false,connectGeneration:0,adapter:false,ecu:false,protocolContract:null,transportEpoch:0,desynchronized:false,poll:null,values:{},supported:new Set(),stats:{tx:0,rx:0,timeouts:0,lastLatency:null,lastCommand:null}};
const UUID={carista:{service:'0000fff0-0000-1000-8000-00805f9b34fb',notify:'0000fff1-0000-1000-8000-00805f9b34fb',write:'0000fff2-0000-1000-8000-00805f9b34fb'},ffe0:{service:'0000ffe0-0000-1000-8000-00805f9b34fb',notify:'0000ffe1-0000-1000-8000-00805f9b34fb',write:'0000ffe1-0000-1000-8000-00805f9b34fb'},nus:{service:'6e400001-b5a3-f393-e0a9-e50e24dcca9e',notify:'6e400003-b5a3-f393-e0a9-e50e24dcca9e',write:'6e400002-b5a3-f393-e0a9-e50e24dcca9e'}};
const enc=new TextEncoder(),dec=new TextDecoder();
function log(kind,msg){const box=document.querySelector('#haRealConsole');if(box){const d=document.createElement('div');d.className='rt-'+kind.toLowerCase();d.textContent=`${kind}  ${msg}`;box.appendChild(d);while(box.children.length>250)box.removeChild(box.firstChild);box.scrollTop=box.scrollHeight;}console.log('[H&A OBD]',kind,msg)}
function setChip(id,on,text){const e=document.querySelector(id);if(!e)return;e.classList.toggle('on',!!on);e.classList.toggle('bad',!on);if(text)e.querySelector('b').textContent=text}
function status(msg,bad=false){const e=document.querySelector('#haRuntimeStatus');if(e){e.textContent=msg;e.classList.toggle('bad',bad)}}
function clean(s){return String(s||'').replace(/\0/g,'').replace(/SEARCHING\.\.\./gi,'').replace(/BUS INIT[^\r\n>]*/gi,'').replace(/STOPPED/gi,'').replace(/[\r\n]+/g,' ').replace(/\s+/g,' ').trim()}
function classify(raw){const s=clean(raw).toUpperCase();if(!s)return'empty';if(s.includes('NO DATA'))return'no-data';if(s.includes('UNABLE TO CONNECT'))return'unable-to-connect';if(s.includes('BUS INIT')&&s.includes('ERROR'))return'bus-init-error';if(s.includes('ERROR')||s.includes('?'))return'error';return'ok'}
function refreshStats(){const e=document.querySelector('#haSessionStats');if(!e)return;e.textContent=`TX ${HA.stats.tx} · RX ${HA.stats.rx} · TIMEOUT ${HA.stats.timeouts} · ${HA.stats.lastLatency==null?'—':HA.stats.lastLatency+' ms'}`}
const MAX_ELM_REPLY_BYTES=65536;
function invalidateTransport(reason='ELM transport closed; reconnect required'){
  HA.transportEpoch++;
  HA.desynchronized=true;
  HA.buffer='';
  const pending=HA.pending;
  HA.pending=null;
  if(pending){
    clearTimeout(pending.timer);
    pending.reject(new Error(reason));
  }
}
function onNotify(ev){
  if(ev?.target!==HA.notify)return;
  const s=dec.decode(ev.target.value);
  HA.stats.rx++;
  refreshStats();
  log('RX',clean(s)||JSON.stringify(s));
  const p=HA.pending;
  if(!p){
    HA.buffer='';
    log('WARN','Unsolicited ELM data discarded.');
    return;
  }
  if(p.epoch!==HA.transportEpoch){
    HA.buffer='';
    return;
  }
  HA.buffer+=s;
  if(HA.buffer.length>MAX_ELM_REPLY_BYTES){
    invalidateTransport('ELM reply exceeded safe buffer limit; reconnect required');
    return;
  }
  const promptIndex=HA.buffer.indexOf('>');
  if(promptIndex<0)return;
  const out=HA.buffer.slice(0,promptIndex+1);
  const trailing=HA.buffer.slice(promptIndex+1);
  HA.pending=null;
  HA.buffer='';
  clearTimeout(p.timer);
  if(trailing.trim()){
    HA.desynchronized=true;
    p.reject(new Error('ELM response framing ambiguous; reconnect required'));
    return;
  }
  HA.stats.lastLatency=Math.max(0,Math.round(performance.now()-p.started));
  refreshStats();
  p.resolve(out);
}
function onGattDisconnected(event){
  if(event?.target!==HA.device)return;
  disconnect();
}
async function discover(server){for(const [name,profile] of Object.entries(UUID)){try{const svc=await server.getPrimaryService(profile.service);const n=await svc.getCharacteristic(profile.notify);const w=profile.write===profile.notify?n:await svc.getCharacteristic(profile.write);log('SYS',`BLE UART profile: ${name}`);return {n,w,profile,name}}catch{}}throw new Error('Nie znaleziono obsługiwanego profilu BLE UART (FFF0/FFE0/NUS).')}
async function command(cmd,timeout=6000){
  if(!HA.write)throw new Error('Adapter niepołączony');
  if(HA.desynchronized)throw new Error('ELM channel desynchronized; reconnect required');
  if(HA.pending)throw new Error('Poprzednie polecenie nadal oczekuje');
  if(typeof cmd!=='string'||!cmd.trim()||cmd.length>64||/[\r\n\0]/.test(cmd))throw new Error('Nieprawidłowe polecenie ELM');
  if(!Number.isInteger(timeout)||timeout<1||timeout>30000)throw new Error('Nieprawidłowy timeout ELM');

  HA.buffer='';
  HA.stats.tx++;
  HA.stats.lastCommand=cmd;
  refreshStats();
  log('TX',cmd);

  const epoch=HA.transportEpoch;
  return new Promise((resolve,reject)=>{
    const pending={resolve,reject,timer:null,started:performance.now(),epoch,cmd};
    pending.timer=setTimeout(()=>{
      if(HA.pending!==pending)return;
      HA.pending=null;
      HA.desynchronized=true;
      HA.buffer='';
      HA.stats.timeouts++;
      refreshStats();
      reject(new Error(`Timeout: ${cmd}`));
    },timeout);
    HA.pending=pending;

    const bytes=enc.encode(cmd+'\r');
    Promise.resolve()
      .then(()=>{
        if(epoch!==HA.transportEpoch)throw new Error('ELM transport epoch changed; reconnect required');
        if(HA.write.properties.writeWithoutResponse)return HA.write.writeValueWithoutResponse(bytes);
        return HA.write.writeValue(bytes);
      })
      .catch(error=>{
        if(HA.pending===pending){
          clearTimeout(pending.timer);
          HA.pending=null;
          HA.buffer='';
          HA.desynchronized=true;
        }
        reject(error instanceof Error?error:new Error(String(error)));
      });
  });
}
const PIDS={load:{cmd:'0104',bytes:1,unit:'%',parse:a=>a[0]*100/255},coolant:{cmd:'0105',bytes:1,unit:'°C',parse:a=>a[0]-40},stft1:{cmd:'0106',bytes:1,unit:'%',parse:a=>(a[0]-128)*100/128},ltft1:{cmd:'0107',bytes:1,unit:'%',parse:a=>(a[0]-128)*100/128},stft2:{cmd:'0108',bytes:1,unit:'%',parse:a=>(a[0]-128)*100/128},ltft2:{cmd:'0109',bytes:1,unit:'%',parse:a=>(a[0]-128)*100/128},rpm:{cmd:'010C',bytes:2,unit:'rpm',parse:a=>(a[0]*256+a[1])/4},speed:{cmd:'010D',bytes:1,unit:'km/h',parse:a=>a[0]},iat:{cmd:'010F',bytes:1,unit:'°C',parse:a=>a[0]-40},maf:{cmd:'0110',bytes:2,unit:'g/s',parse:a=>(a[0]*256+a[1])/100},throttle:{cmd:'0111',bytes:1,unit:'%',parse:a=>a[0]*100/255},voltage:{cmd:'ATRV',bytes:null,unit:'V',parse:null}};
function isPidSupported(cmd){if(!cmd.startsWith('01')||cmd==='0100'||HA.supported.size===0)return true;return HA.supported.has(parseInt(cmd.slice(2),16))}
async function readPid(key){
  const p=PIDS[key];
  if(!p||!HA.ecu)throw new Error('ECU offline');
  if(!isPidSupported(p.cmd)){
    HA.values[key]=null;
    updateValue(key,null,p.unit,'N/S');
    return null;
  }
  const raw=await command(p.cmd);
  if(classify(raw)==='no-data'){
    updateValue(key,null,p.unit,'NO DATA');
    return null;
  }

  let value;
  if(key==='voltage'){
    const text=clean(raw);
    if(classify(raw)!=='ok')throw new Error('Invalid ATRV response');
    const match=text.match(/^(?:ATRV\s+)?(\d+(?:\.\d+)?)\s*V\s*>?$/i);
    if(!match)throw new Error('Invalid ATRV response');
    value=Number(match[1]);
    if(!Number.isFinite(value)||value<0||value>30)throw new Error('Invalid ATRV voltage range');
  }else{
    const pid=parseInt(p.cmd.slice(2),16);
    const decoded=decodeMode01PidData(raw,pid,p.bytes);
    value=p.parse(decoded.data);
  }

  if(!Number.isFinite(value))throw new Error('Invalid decoded PID value');
  HA.values[key]=value;
  updateValue(key,value,p.unit);
  return value;
}
function updateValue(key,v,unit,note=''){const e=document.querySelector(`[data-ha-value="${key}"]`);if(e)e.textContent=v==null?(note||'—'):`${Number(v).toFixed(key==='rpm'||key==='speed'?0:1)} ${unit}`}
async function probeSupported(){
  const raw=await command('0100',15000);
  const verified=decodeSupportedPIDs(raw);
  HA.supported.clear();
  verified.pids.forEach(pid=>HA.supported.add(pid));
  log('SYS',`Verified PID 01-20: ${verified.pids.map(pid=>'0x'+pid.toString(16).padStart(2,'0').toUpperCase()).join(', ')||'none supported'} · responders ${verified.responderCount}`);
  return raw;
}
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
  HA.adapter=isUsableAdapterIdentity(ati);
  setChip('#haAdapter',HA.adapter,HA.adapter?'ADAPTER ON':'ADAPTER ?');
  log('SYS','Adapter ID: '+ati);
  if(!HA.adapter)throw new Error('Adapter identity unverified via ATI');
  status('Adapter online · sprawdzam ECU…');
  try{
    await probeSupported();
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
async function connect(){
  if(!navigator.bluetooth){
    status('Ten browser nie udostępnia Web Bluetooth. Na iPhone użyj przeglądarki/rozszerzenia z Web Bluetooth.',true);
    return false;
  }
  if(HA.connecting||HA.connected){
    status(HA.connected?'Adapter już połączony':'Łączenie już trwa');
    return false;
  }

  const generation=++HA.connectGeneration;
  HA.connecting=true;

  try{
    status('Wybierz adapter BLE…');
    const services=Object.values(UUID).map(profile=>profile.service);
    const device=await navigator.bluetooth.requestDevice({acceptAllDevices:true,optionalServices:services});
    if(generation!==HA.connectGeneration)return false;

    HA.device=device;
    HA.device.addEventListener('gattserverdisconnected',onGattDisconnected);
    status(`Łączenie: ${HA.device.name||'BLE OBD'}…`);

    const server=await HA.device.gatt.connect();
    if(generation!==HA.connectGeneration){
      try{HA.device?.gatt?.disconnect();}catch{}
      return false;
    }
    HA.server=server;

    const d=await discover(HA.server);
    if(generation!==HA.connectGeneration)return false;

    HA.notify=d.n;
    HA.write=d.w;
    await HA.notify.startNotifications();
    if(generation!==HA.connectGeneration){
      try{await HA.notify.stopNotifications?.();}catch{}
      return false;
    }

    HA.notify.addEventListener('characteristicvaluechanged',onNotify);
    HA.transportEpoch++;
    HA.desynchronized=false;
    HA.buffer='';
    HA.pending=null;
    HA.connected=true;
    setChip('#haBle',true,'BLE ON');
    log('SYS',`BLE connected: ${HA.device.name||'unknown'} · ${d.name}`);

    await initElm();
    if(generation!==HA.connectGeneration)return false;
    return HA.connected;
  }catch(error){
    if(generation===HA.connectGeneration){
      status(error.message||String(error),true);
      log('ERR',error.message||String(error));
      disconnect();
    }
    return false;
  }finally{
    if(generation===HA.connectGeneration)HA.connecting=false;
  }
}
function stopLive(){if(HA.poll){clearInterval(HA.poll);HA.poll=null}const b=document.querySelector('#haLiveToggle');if(b)b.textContent='START LIVE'}
function disconnect(){
  HA.connectGeneration++;
  HA.connecting=false;
  stopLive();

  const device=HA.device;
  const notify=HA.notify;

  if(device?.removeEventListener)device.removeEventListener('gattserverdisconnected',onGattDisconnected);
  if(notify?.removeEventListener)notify.removeEventListener('characteristicvaluechanged',onNotify);
  if(notify?.stopNotifications){
    try{Promise.resolve(notify.stopNotifications()).catch(()=>{});}catch{}
  }

  invalidateTransport('ELM transport disconnected; pending command cancelled');

  HA.connected=HA.adapter=HA.ecu=false;
  HA.protocolContract=null;
  HA.supported.clear();
  HA.write=null;
  HA.notify=null;
  HA.server=null;
  HA.device=null;

  try{device?.gatt?.disconnect();}catch{}

  setChip('#haBle',false,'BLE —');
  setChip('#haAdapter',false,'ADAPTER —');
  setChip('#haEcu',false,'ECU —');
  status('Rozłączono',true);
}
async function readAll(){if(!HA.ecu)return status('ECU offline',true);const keys=['rpm','coolant','maf','throttle','stft1','ltft1','stft2','ltft2','iat','speed','load','voltage'];for(const k of keys){try{await readPid(k)}catch(e){log('WARN',`${k}: ${e.message}`)}}}
function toggleLive(){if(HA.poll){stopLive();status('Live polling zatrzymany');return}if(!HA.ecu)return status('Najpierw połącz ECU',true);const b=document.querySelector('#haLiveToggle');if(b)b.textContent='STOP LIVE';status('Live polling aktywny');let busy=false;const tick=async()=>{if(busy||!HA.ecu)return;busy=true;try{await readAll()}finally{busy=false}};tick();HA.poll=setInterval(tick,2500)}
async function readDtc(){
  if(!HA.ecu||!HA.protocolContract)return status('Najpierw połącz i zweryfikuj ECU + ATDPN',true);
  try{
    const protocol=classifyProtocolContract(HA.protocolContract);
    if(protocol!=='can'&&protocol!=='legacy')throw new Error('PROTOCOL_UNSUPPORTED_FOR_GENERIC_OBD');
    const raw=await command('03',10000);
    const parsed=decodeStoredDTCs(raw,protocol);
    const codes=parsed.codes;
    const box=document.querySelector('#haDtcResult');
    if(box)box.innerHTML=codes.length
      ?codes.map(code=>`<span class="rt-dtc">${code}</span>`).join('')
      :'<span class="rt-none">Brak potwierdzonych kodów Mode 03</span>';
    log('SYS','Mode 03 verified: '+clean(raw));
    status(codes.length?`DTC: ${codes.join(', ')}`:`DTC zweryfikowane · brak kodów · ECU ${parsed.responderCount}`);
  }catch(error){
    const code=error?.code||error?.message||'READ_ERROR';
    status(`Niezweryfikowany odczyt DTC: ${code}`,true);
    log('ERR',`Mode 03 rejected: ${code}`);
  }
}
async function rawSend(){
  const input=document.querySelector('#haRawInput');
  const c=(input?.value||'').trim().toUpperCase();
  if(!c)return;
  if(!isReadOnlyELMCommand(c)){
    status('Terminal: polecenie zablokowane przez politykę read-only',true);
    return;
  }
  try{
    const r=await command(c,10000);
    status(`${c}: ${classify(r)}`);
  }catch(e){
    status(e.message,true);
  }
}
function inject(){if(!document.querySelector('#view'))return;const isVci=[...document.querySelectorAll('.hero h1')].some(x=>/VCI \/ Connection/i.test(x.textContent));if(!isVci)return;if(document.querySelector('#haRuntime'))return;const view=document.querySelector('#view');const old=document.querySelector('#demoBle');if(old){old.textContent='POŁĄCZ REALNY ADAPTER';old.removeAttribute('id');old.onclick=connect;old.classList.add('connect-real')}
const el=document.createElement('section');el.id='haRuntime';el.className='ha-runtime';el.innerHTML=`<div class="rt-head"><div><span class="rt-kicker">REAL OBD RUNTIME</span><h2>BLE → ELM → ECU</h2></div><div><div id="haRuntimeStatus" class="rt-status">Gotowy do połączenia</div><small id="haSessionStats" class="rt-stats">TX 0 · RX 0 · TIMEOUT 0 · —</small></div></div><div class="rt-chips"><span id="haBle" class="rt-chip bad"><i></i><b>BLE —</b></span><span id="haAdapter" class="rt-chip bad"><i></i><b>ADAPTER —</b></span><span id="haEcu" class="rt-chip bad"><i></i><b>ECU —</b></span></div><div class="rt-actions"><button id="haConnect" class="rt-primary">CONNECT BLE</button><button id="haReadAll">READ LIVE</button><button id="haLiveToggle">START LIVE</button><button id="haDtc">READ DTC</button><button id="haDisconnect">DISCONNECT</button></div><div class="rt-live"><div><small>RPM</small><strong data-ha-value="rpm">—</strong></div><div><small>COOLANT</small><strong data-ha-value="coolant">—</strong></div><div><small>MAF</small><strong data-ha-value="maf">—</strong></div><div><small>THROTTLE</small><strong data-ha-value="throttle">—</strong></div><div><small>STFT B1</small><strong data-ha-value="stft1">—</strong></div><div><small>LTFT B1</small><strong data-ha-value="ltft1">—</strong></div><div><small>STFT B2</small><strong data-ha-value="stft2">—</strong></div><div><small>LTFT B2</small><strong data-ha-value="ltft2">—</strong></div><div><small>IAT</small><strong data-ha-value="iat">—</strong></div><div><small>SPEED</small><strong data-ha-value="speed">—</strong></div><div><small>LOAD</small><strong data-ha-value="load">—</strong></div><div><small>VOLTAGE</small><strong data-ha-value="voltage">—</strong></div></div><div class="rt-dtcbox"><b>MODE 03 DTC</b><div id="haDtcResult"><span class="rt-none">Nie odczytano</span></div></div><div class="rt-raw"><div class="rt-rawbar"><b>RAW ELM TERMINAL</b><div><input id="haRawInput" placeholder="np. ATI / 010C / 03"><button id="haRawSend">SEND</button></div></div><div id="haRealConsole" class="rt-console"><div>SYS  Real runtime loaded. No fake live values.</div></div></div>`;view.appendChild(el);el.querySelector('#haConnect').onclick=connect;el.querySelector('#haReadAll').onclick=readAll;el.querySelector('#haLiveToggle').onclick=toggleLive;el.querySelector('#haDtc').onclick=readDtc;el.querySelector('#haDisconnect').onclick=disconnect;el.querySelector('#haRawSend').onclick=rawSend;el.querySelector('#haRawInput').onkeydown=e=>{if(e.key==='Enter')rawSend()}}
Object.assign(HA,{connect,disconnect,command,readPid,readAll,readDtc,toggleLive,classify,probeSupported,establishProtocolAuthority});
new MutationObserver(()=>inject()).observe(document.querySelector('#view'),{childList:true,subtree:true});setTimeout(inject,200);
