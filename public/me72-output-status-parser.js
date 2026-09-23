const FRAME_HEX_RE=/^(?:[0-9A-F]{2})(?: [0-9A-F]{2})*$/i;

function fromHex(frameHex){
  if(typeof frameHex!=='string'||!FRAME_HEX_RE.test(frameHex)){
    throw new TypeError('Invalid ME7.2 output status frame');
  }
  return frameHex.split(' ').map(v=>Number.parseInt(v,16));
}
function xorChecksum(bytes){ return bytes.reduce((v,b)=>v^b,0); }

export function parseMe72OutputStatusFrame(frameHex){
  const bytes=fromHex(frameHex);
  if(bytes.length<16) throw new TypeError('ME7.2 output status response too short');
  if(bytes[0]!==0xB8||bytes[1]!==0xF1||bytes[2]!==0x12){
    throw new TypeError('ME7.2 output status response header mismatch');
  }
  const payloadLength=bytes[3];
  if(payloadLength<11||bytes.length!==payloadLength+5){
    throw new TypeError('ME7.2 output status response length mismatch');
  }
  if(bytes.at(-1)!==xorChecksum(bytes.slice(0,-1))){
    throw new TypeError('ME7.2 output status response checksum mismatch');
  }
  const p=bytes.slice(4,4+payloadLength);
  if(p[0]!==0x62||p[1]!==0x40||p[2]!==0x05){
    throw new TypeError('ME7.2 output status 0x4005 positive response required');
  }

  const statusA=p[9];
  const statusB=p[10];
  return Object.freeze({
    parserId:'e39-me72-output-status-4005-v1',
    protocol:'KWP2000_BMW',
    moduleFamily:'DME_ME72',
    dataIdentifier:'0x4005',
    raw:Object.freeze({statusA,statusB}),
    leakDiagnosticPump:(statusA&0x01)!==0,
    secondaryAirValve:(statusA&0x02)!==0,
    secondaryAirPump:(statusA&0x04)!==0,
    oxygenHeaterBeforeBank1:(statusA&0x10)!==0,
    oxygenHeaterBeforeBank2:(statusA&0x20)!==0,
    postCatHeaterBit40:(statusA&0x40)!==0,
    postCatHeaterBit80:(statusA&0x80)!==0,
    oxygenHeaterAfterBank1:null,
    oxygenHeaterAfterBank2:null,
    postCatHeaterBankMapping:'REFERENCE_CONFLICT',
    exhaustGasRecirculation:(statusB&0x08)!==0,
    electricFan:(statusB&0x10)!==0,
    fuelPump:(statusB&0x20)!==0,
    thermostat:(statusB&0x40)!==0,
    startMode:(statusB&0x80)!==0,
    statusOnly:true,
    actuationEnabled:false,
    referenceVerified:false,
    referenceConflictAware:true,
    hardwareVerified:false,
    ecuVerified:false,
    writesEnabled:false,
    flashEnabled:false,
  });
}

export function deriveMe72OutputStatusFromEvidence(receiveEvidence){
  if(!receiveEvidence||typeof receiveEvidence!=='object'
      ||receiveEvidence.protocol!=='KWP2000_BMW'
      ||receiveEvidence.stage!=='FRAME_CANDIDATE'
      ||!Array.isArray(receiveEvidence.frames)){
    throw new TypeError('ME7.2 output status frame evidence required');
  }
  const matches=[];
  for(const frame of receiveEvidence.frames){
    if(frame?.directionHint!=='possible-reply'||typeof frame.frameHex!=='string') continue;
    try{matches.push(parseMe72OutputStatusFrame(frame.frameHex));}catch{}
  }
  if(matches.length!==1){
    throw new TypeError('Exactly one ME7.2 output status response required');
  }
  return matches[0];
}
