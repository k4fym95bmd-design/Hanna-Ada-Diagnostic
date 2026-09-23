const FRAME_HEX_RE=/^(?:[0-9A-F]{2})(?: [0-9A-F]{2})*$/i;

function fromHex(frameHex){
  if(typeof frameHex!=='string'||!FRAME_HEX_RE.test(frameHex)){
    throw new TypeError('Invalid ME7.2 engine snapshot frame');
  }
  return frameHex.split(' ').map(v=>Number.parseInt(v,16));
}
function xorChecksum(bytes){ return bytes.reduce((v,b)=>v^b,0); }
function be16(bytes,offset){ return (bytes[offset]<<8)|bytes[offset+1]; }
function signed8(value){ return value&0x80 ? value-0x100 : value; }

export function parseMe72EngineSnapshotFrame(frameHex){
  const bytes=fromHex(frameHex);
  if(bytes.length<50) throw new TypeError('ME7.2 engine snapshot response too short');
  if(bytes[0]!==0xB8||bytes[1]!==0xF1||bytes[2]!==0x12){
    throw new TypeError('ME7.2 engine snapshot response header mismatch');
  }
  const payloadLength=bytes[3];
  if(payloadLength<45||bytes.length!==payloadLength+5){
    throw new TypeError('ME7.2 engine snapshot response length mismatch');
  }
  if(bytes.at(-1)!==xorChecksum(bytes.slice(0,-1))){
    throw new TypeError('ME7.2 engine snapshot response checksum mismatch');
  }
  const p=bytes.slice(4,4+payloadLength);
  if(p[0]!==0x62||p[1]!==0x40||p[2]!==0x00){
    throw new TypeError('ME7.2 engine snapshot 0x4000 positive response required');
  }

  const knockSensors=Object.freeze(Array.from({length:8},(_,index)=>Object.freeze({
    cylinder:index+1,
    raw:be16(p,29+index*2),
    voltage:be16(p,29+index*2)*0.019531,
  })));

  return Object.freeze({
    parserId:'e39-me72-engine-snapshot-4000-v1',
    protocol:'KWP2000_BMW',
    moduleFamily:'DME_ME72',
    dataIdentifier:'0x4000',
    injectionTimeMs:be16(p,3)*0.016,
    speedKmh:p[9]*1.25,
    rpm:be16(p,10)*0.25,
    targetRpm:p[12]*10,
    intakeAirTempC:p[17]*0.75-48,
    coolantTempC:p[18]*0.75-48,
    ignitionAngleDeg:signed8(p[19])*0.75,
    throttlePercent:p[20]*0.39216,
    airMassKgH:be16(p,21)*0.1,
    loadPercent:be16(p,23)*0.0015259,
    batteryVoltage:p[25]*0.095,
    pedalPositionV:be16(p,26)*0.0048828,
    coolantOutletTempC:p[28]*0.75-48,
    knockSensors,
    referenceVerified:true,
    hardwareVerified:false,
    ecuVerified:false,
    writesEnabled:false,
    flashEnabled:false,
  });
}

export function deriveMe72EngineSnapshotFromEvidence(receiveEvidence){
  if(!receiveEvidence||typeof receiveEvidence!=='object'
      ||receiveEvidence.protocol!=='KWP2000_BMW'
      ||receiveEvidence.stage!=='FRAME_CANDIDATE'
      ||!Array.isArray(receiveEvidence.frames)){
    throw new TypeError('ME7.2 engine snapshot frame evidence required');
  }
  const matches=[];
  for(const frame of receiveEvidence.frames){
    if(frame?.directionHint!=='possible-reply'||typeof frame.frameHex!=='string') continue;
    try{ matches.push(parseMe72EngineSnapshotFrame(frame.frameHex)); }catch{}
  }
  if(matches.length!==1){
    throw new TypeError('Exactly one ME7.2 engine snapshot response required');
  }
  return matches[0];
}
