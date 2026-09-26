// VID:PID matching is a HINT for selecting an appropriate USB serial driver,
// never proof of a genuine chip, K+DCAN cable, usable USB interface or BMW ECU.
const KNOWN = Object.freeze({
  '0403:6001': ['FTDI', 'FT232-family candidate'],
  '0403:6010': ['FTDI', 'dual-channel USB serial candidate'],
  '10C4:EA60': ['Silicon Labs', 'CP210x-family candidate'],
  '067B:2303': ['Prolific', 'PL2303-family candidate'],
  '1A86:7523': ['WCH', 'CH340/CH341-family candidate'],
});

export function identifyUsbSerialCandidate(device) {
  const vid = device?.vendorId, pid = device?.productId;
  if (!Number.isInteger(vid) || !Number.isInteger(pid)
    || vid < 0 || vid > 65535 || pid < 0 || pid > 65535) {
    throw new TypeError('Missing valid USB VID/PID; do not infer hardware family.');
  }
  const id = `${vid.toString(16).toUpperCase().padStart(4, '0')}:${pid.toString(16).toUpperCase().padStart(4, '0')}`;
  const matching = KNOWN[id];
  return Object.freeze({
    vidPid: id,
    candidate: matching ? `${matching[0]} · ${matching[1]}` : 'Nieznany układ lub własny identyfikator',
    isKnownCandidate: !!matching,
    serialDriverVerified: false,
    usbSerialOpen: false,
    bmwProtocolVerified: false,
    ecuVerified: false,
    writesEnabled: false,
    nextStep: matching
      ? 'Sprawdź zgodny sterownik USB-serial dla konkretnego urządzenia. VID:PID nie jest potwierdzeniem chipsetu.'
      : 'Nie zgaduj sterownika. Sprawdź chipset i obsługę USB-serial dla konkretnego urządzenia.',
  });
}
