// BMW OEM VCI baseline for Hanna & Ada.
// This module describes verified product/vehicle topology only. It does NOT discover,
// connect to, command, code, actuate, erase or flash a vehicle.
export const BMW_OEM_VCI = Object.freeze({
  manufacturer: 'BMW Group',
  family: 'ICOM Next',
  primaryInterface: 'ICOM Next A',
  legacyVehicleAdapter: 'ICOM Next C',
  pcLink: 'Ethernet/LAN',
  bmwRecommended: true,
  sourceScope: 'BMW Aftersales/ICOM documentation',
  writesEnabled: false,
  flashEnabled: false,
});

export function e39OemPath({ productionYear, productionMonth, hasEngineBay20Pin } = {}) {
  const year = Number(productionYear);
  const month = Number(productionMonth);
  const explicit20Pin = hasEngineBay20Pin === true;
  // BMW technical training documents the E39 20-pin deletion from 09/2000.
  const beforeDeletion = Number.isInteger(year) && Number.isInteger(month)
    && (year < 2000 || (year === 2000 && month < 9));
  const legacy20PinExpected = explicit20Pin || beforeDeletion;
  return Object.freeze({
    model: 'E39',
    legacy20PinExpected,
    recommendedHardware: legacy20PinExpected
      ? Object.freeze(['ICOM Next A', 'ICOM Next C'])
      : Object.freeze(['ICOM Next A']),
    pcLink: 'Ethernet/LAN',
    ecuVerified: false,
    writesEnabled: false,
    flashEnabled: false,
    note: legacy20PinExpected
      ? 'Starsza ścieżka E39: ICOM Next A + ICOM Next C. Sam sprzęt nie potwierdza ECU.'
      : 'Ścieżka 16-pin wymaga potwierdzenia dla konkretnego egzemplarza; ECU nadal niezweryfikowane.',
  });
}

export function assessIcomEvidence(input = {}) {
  const reachable = input.icomReachable === true;
  const adapterKnown = input.adapterKnown === true;
  const sessionId = typeof input.sessionId === 'string' ? input.sessionId : '';
  const identity = input.readOnlyIdentityEvidence;
  const ecuVerified = reachable && adapterKnown
    && sessionId.length >= 16
    && identity?.verified === true
    && identity.sessionId === sessionId
    && typeof identity.moduleId === 'string' && identity.moduleId.length > 0
    && typeof identity.identity === 'string' && identity.identity.trim().length >= 2;

  return Object.freeze({
    icomReachable: reachable,
    adapterKnown,
    ecuVerified,
    writesEnabled: false,
    flashEnabled: false,
    stage: ecuVerified ? 'ECU_VERIFIED' : reachable ? 'ICOM_REACHABLE' : 'ICOM_NOT_CONNECTED',
  });
}
