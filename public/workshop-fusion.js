// Hanna & Ada: portable, read-only workshop workflow. No I/O, vehicle commands,
// guessed measurements, licensed repair content or BMW-specific module claims.
const GROUPS = Object.freeze([
  Object.freeze({id:'ignition-context',title:'Zapłon: kontekst silnika',pids:[0x0c,0x05,0x06,0x07,0x10]}),
  Object.freeze({id:'air-fuel',title:'Powietrze i mieszanka',pids:[0x04,0x06,0x07,0x08,0x09,0x0f,0x10,0x11]}),
  Object.freeze({id:'vehicle-motion',title:'Ruch pojazdu',pids:[0x0d]}),
]);
const DTC = /^[PCBU][0-3][0-9A-F]{3}$/;
const unavailable = reason => Object.freeze({status:'unavailable',reason});

/** The caller must provide the single canonical session built from validated ECU replies. */
export function buildWorkshopDashboard(session = null) {
  const epochValid = Number.isInteger(session?.epoch) && session.epoch >= 0;
  const verified = epochValid && session.stage === 'ECU' && Array.isArray(session.pids);
  const pids = verified ? new Set(session.pids.filter(p=>Number.isInteger(p) && p>=1 && p<=0xff)) : new Set();
  const protocol = verified && ['can','legacy'].includes(session.protocol) ? session.protocol : 'unknown';
  const groups = GROUPS.map(group=>{
    const availablePids = verified ? group.pids.filter(pid=>pids.has(pid)) : [];
    return Object.freeze({id:group.id,title:group.title,
      status:!verified?'locked':availablePids.length?'available':'not-advertised',
      availablePids:Object.freeze(availablePids)});
  });
  const stage=epochValid?session.stage:'DISCONNECTED';
  const nextStep = !['BLE','ADAPTER','ECU'].includes(stage)
    ? {code:'CONNECT_ADAPTER',label:'Połącz adapter i potwierdź transport'}
    : stage==='BLE'
      ? {code:'IDENTIFY_ADAPTER',label:'Sprawdź rzeczywistą odpowiedź ATI'}
      : stage==='ADAPTER'
        ? {code:'VERIFY_GENERIC_ECU',label:'Potwierdź pełną odpowiedź PID 0100'}
        : protocol==='unknown'
          ? {code:'IDENTIFY_PROTOCOL',label:'Potwierdź ATDPN lub ATDP przed DTC'}
          : {code:'READ_GENERIC_DTC',label:'Możliwy odczyt standardowych DTC bez zapisu'};
  return Object.freeze({genericEcuVerified:verified,protocol,
    bmwModulesVerified:false,writesEnabled:false,
    // Topology is a verification map, not an invented map of vehicle modules.
    topologyStatus:verified?'generic-ecu-evidence':'no-verified-ecu',
    groups:Object.freeze(groups),nextStep:Object.freeze(nextStep)});
}

/** Compare only two reviewed, verified generic OBD snapshots of the SAME vehicle. */
export function compareVerifiedDtcScans(before,after,{sameVehicleConfirmed=false}={}) {
  if(!sameVehicleConfirmed) return unavailable('same-vehicle-confirmation-required');
  const valid = scan=>scan && scan.status==='verified' && scan.scope==='generic-obd' &&
    ['can','legacy'].includes(scan.protocol) &&
    typeof scan.vehicleKey==='string' && scan.vehicleKey.trim().length>0 &&
    Number.isFinite(scan.recordedAt) && scan.recordedAt>=0 &&
    Array.isArray(scan.codes) && scan.codes.every(code=>typeof code==='string' && DTC.test(code));
  if(!valid(before)||!valid(after)) return unavailable('verified-snapshots-required');
  if(before.vehicleKey!==after.vehicleKey||before.protocol!==after.protocol) return unavailable('vehicle-or-protocol-mismatch');
  if(after.recordedAt<=before.recordedAt) return unavailable('chronology-unverified');
  const oldCodes=new Set(before.codes),newCodes=new Set(after.codes);
  return Object.freeze({status:'verified-comparison',
    resolved:Object.freeze([...oldCodes].filter(code=>!newCodes.has(code)).sort()),
    persisting:Object.freeze([...oldCodes].filter(code=>newCodes.has(code)).sort()),
    newCodes:Object.freeze([...newCodes].filter(code=>!oldCodes.has(code)).sort()),
    repairVerified:false,
    note:'Zmiana zapisanych DTC sama nie potwierdza naprawy. Porównanie obejmuje tylko odczytany zakres generic OBD.'});
}

/** Summarize real, ordered, individually verified samples; never invent norms. */
export function summarizeLivePid(samples) {
  if(!Array.isArray(samples)||samples.length<1||samples.length>5000) return unavailable('no-bounded-samples');
  let previous=-Infinity,sum=0,min=Infinity,max=-Infinity;
  for(const point of samples){
    if(!point || point.verified!==true || !Number.isFinite(point.at) ||
      point.at<=previous || !Number.isFinite(point.value)) return unavailable('unverified-or-unordered-sample');
    previous=point.at;sum+=point.value/samples.length;min=Math.min(min,point.value);max=Math.max(max,point.value);
  }
  return Object.freeze({status:'verified-summary',count:samples.length,min,max,
    average:sum,durationMs:samples[samples.length-1].at-samples[0].at,
    referenceRange:null});
}
