const FRAME_HEX_RE=/^(?:[0-9A-F]{2})(?: [0-9A-F]{2})*$/i;

function fromHex(frameHex){
  if(typeof frameHex!=='string'||!FRAME_HEX_RE.test(frameHex)){
    throw new TypeError('Invalid ME7.2 readiness frame');
  }
  return frameHex.split(' ').map(v=>Number.parseInt(v,16));
}
function xorChecksum(bytes){return bytes.reduce((v,b)=>v^b,0);}

export function parseMe72ReadinessFrame(frameHex){
  const bytes=fromHex(frameHex);
  if(bytes.length<10) throw new TypeError('ME7.2 readiness response too short');
  if(bytes[0]!==0xB8||bytes[1]!==0xF1||bytes[2]!==0x12){
    throw new TypeError('ME7.2 readiness response header mismatch');
  }
  const payloadLength=bytes[3];
  if(payloadLength<5||bytes.length!==payloadLength+5){
    throw new TypeError('ME7.2 readiness response length mismatch');
  }
  if(bytes.at(-1)!==xorChecksum(bytes.slice(0,-1))){
    throw new TypeError('ME7.2 readiness response checksum mismatch');
  }
  const p=bytes.slice(4,4+payloadLength);
  if(p[0]!==0x62||p[1]!==0x40||p[2]!==0x07){
    throw new TypeError('ME7.2 readiness 0x4007 positive response required');
  }

  const status=p[3];
  return Object.freeze({
    parserId:'e39-me72-readiness-4007-v1',
    protocol:'KWP2000_BMW',
    moduleFamily:'DME_ME72',
    dataIdentifier:'0x4007',
    neutralSwitch:(status&(1<<0))!==0,
    accelerationEnrichment:(status&(1<<1))!==0,
    oxygenAfterBank2Ready:(status&(1<<2))!==0,
    oxygenAfterBank1Ready:(status&(1<<3))!==0,
    oxygenBeforeBank2Ready:(status&(1<<4))!==0,
    oxygenBeforeBank1Ready:(status&(1<<5))!==0,
    raw:Object.freeze({
      primaryStatus:status,
      secondaryStatus:p[4]??null,
    }),
    referenceVerified:true,
    hardwareVerified:false,
    ecuVerified:false,
    writesEnabled:false,
    flashEnabled:false,
  });
}

export function deriveMe72ReadinessFromEvidence(receiveEvidence){
  if(!receiveEvidence||typeof receiveEvidence!=='object'
      ||receiveEvidence.protocol!=='KWP2000_BMW'
      ||receiveEvidence.stage!=='FRAME_CANDIDATE'
      ||!Array.isArray(receiveEvidence.frames)){
    throw new TypeError('ME7.2 readiness frame evidence required');
  }
  const matches=[];
  for(const frame of receiveEvidence.frames){
    if(frame?.directionHint!=='possible-reply'||typeof frame.frameHex!=='string') continue;
    try{matches.push(parseMe72ReadinessFrame(frame.frameHex));}catch{}
  }
  if(matches.length!==1){
    throw new TypeError('Exactly one ME7.2 readiness response required');
  }
  return matches[0];
}
