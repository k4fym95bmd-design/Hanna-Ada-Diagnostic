const FRAME_HEX_RE=/^(?:[0-9A-F]{2})(?: [0-9A-F]{2})*$/i;

function fromHex(frameHex){
  if(typeof frameHex!=='string'||!FRAME_HEX_RE.test(frameHex)){
    throw new TypeError('Invalid ME7.2 DTC-count frame');
  }
  return frameHex.split(' ').map(v=>Number.parseInt(v,16));
}
function xorChecksum(bytes){return bytes.reduce((v,b)=>v^b,0);}

export function parseMe72DtcCountFrame(frameHex){
  const bytes=fromHex(frameHex);
  if(bytes.length!==7) throw new TypeError('ME7.2 DTC-count response length mismatch');
  if(bytes[0]!==0xB8||bytes[1]!==0xF1||bytes[2]!==0x12){
    throw new TypeError('ME7.2 DTC-count response header mismatch');
  }
  if(bytes[3]!==0x02){
    throw new TypeError('ME7.2 DTC-count payload length must be 2');
  }
  if(bytes.at(-1)!==xorChecksum(bytes.slice(0,-1))){
    throw new TypeError('ME7.2 DTC-count response checksum mismatch');
  }
  const payload=bytes.slice(4,6);
  if(payload[0]!==0xE2){
    throw new TypeError('ME7.2 DTC-count E2 positive response required');
  }

  return Object.freeze({
    parserId:'e39-me72-dtc-count-a200-v1',
    protocol:'KWP2000_BMW',
    moduleFamily:'DME_ME72',
    operation:'DTC_COUNT',
    faultCount:payload[1],
    referenceContractVerified:true,
    capturedHardwareVector:false,
    hardwareVerified:false,
    ecuVerified:false,
    writesEnabled:false,
    clearDtcEnabled:false,
    flashEnabled:false,
  });
}

export function deriveMe72DtcCountFromEvidence(receiveEvidence){
  if(!receiveEvidence||typeof receiveEvidence!=='object'
      ||receiveEvidence.protocol!=='KWP2000_BMW'
      ||receiveEvidence.stage!=='FRAME_CANDIDATE'
      ||!Array.isArray(receiveEvidence.frames)){
    throw new TypeError('ME7.2 DTC-count frame evidence required');
  }
  const matches=[];
  for(const frame of receiveEvidence.frames){
    if(frame?.directionHint!=='possible-reply'||typeof frame.frameHex!=='string') continue;
    try{matches.push(parseMe72DtcCountFrame(frame.frameHex));}catch{}
  }
  if(matches.length!==1){
    throw new TypeError('Exactly one ME7.2 DTC-count response required');
  }
  return matches[0];
}
