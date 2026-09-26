const FRAME_HEX_RE=/^(?:[0-9A-F]{2})(?: [0-9A-F]{2})*$/i;

function fromHex(frameHex){
  if(typeof frameHex!=='string'||!FRAME_HEX_RE.test(frameHex)){
    throw new TypeError('Invalid ME7.2 fuel adaptation frame');
  }
  return frameHex.split(' ').map(v=>Number.parseInt(v,16));
}
function xorChecksum(bytes){ return bytes.reduce((v,b)=>v^b,0); }
function signedBe16(msb,lsb){
  const raw=(msb<<8)|lsb;
  return raw&0x8000 ? raw-0x10000 : raw;
}

export function parseMe72FuelAdaptationFrame(frameHex){
  const bytes=fromHex(frameHex);
  if(bytes.length<24) throw new TypeError('ME7.2 fuel adaptation response too short');
  if(bytes[0]!==0xB8||bytes[1]!==0xF1||bytes[2]!==0x12){
    throw new TypeError('ME7.2 fuel adaptation response header mismatch');
  }
  const payloadLength=bytes[3];
  if(payloadLength<19||bytes.length!==payloadLength+5){
    throw new TypeError('ME7.2 fuel adaptation response length mismatch');
  }
  if(bytes.at(-1)!==xorChecksum(bytes.slice(0,-1))){
    throw new TypeError('ME7.2 fuel adaptation response checksum mismatch');
  }
  const p=bytes.slice(4,4+payloadLength);
  if(p[0]!==0x62||p[1]!==0x40||p[2]!==0x04){
    throw new TypeError('ME7.2 fuel adaptation 0x4004 positive response required');
  }

  const additive1Raw=signedBe16(p[3],p[4]);
  const additive2Raw=signedBe16(p[5],p[6]);
  const multiplicative1Raw=signedBe16(p[7],p[8]);
  const multiplicative2Raw=signedBe16(p[9],p[10]);

  return Object.freeze({
    parserId:'e39-me72-fuel-adaptation-4004-v1',
    protocol:'KWP2000_BMW',
    moduleFamily:'DME_ME72',
    dataIdentifier:'0x4004',
    additiveBank1Percent:additive1Raw*0.046875,
    additiveBank2Percent:additive2Raw*0.046875,
    multiplicativeBank1Percent:multiplicative1Raw*0.0000305,
    multiplicativeBank2Percent:multiplicative2Raw*0.0000305,
    raw:Object.freeze({
      additiveBank1:additive1Raw,
      additiveBank2:additive2Raw,
      multiplicativeBank1:multiplicative1Raw,
      multiplicativeBank2:multiplicative2Raw,
    }),
    referenceVerified:true,
    hardwareVerified:false,
    ecuVerified:false,
    writesEnabled:false,
    flashEnabled:false,
  });
}

export function deriveMe72FuelAdaptationFromEvidence(receiveEvidence){
  if(!receiveEvidence||typeof receiveEvidence!=='object'
      ||receiveEvidence.protocol!=='KWP2000_BMW'
      ||receiveEvidence.stage!=='FRAME_CANDIDATE'
      ||!Array.isArray(receiveEvidence.frames)){
    throw new TypeError('ME7.2 fuel adaptation frame evidence required');
  }
  const matches=[];
  for(const frame of receiveEvidence.frames){
    if(frame?.directionHint!=='possible-reply'||typeof frame.frameHex!=='string') continue;
    try{matches.push(parseMe72FuelAdaptationFrame(frame.frameHex));}catch{}
  }
  if(matches.length!==1){
    throw new TypeError('Exactly one ME7.2 fuel adaptation response required');
  }
  return matches[0];
}
