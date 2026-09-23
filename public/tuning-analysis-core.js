// Analysis-only tuning readiness model for Hanna & Ada.
// This module never generates calibration bytes, writes ECUs, actuates hardware,
// clears faults or flashes firmware. It only evaluates diagnostic evidence.
const truth = v => v === true;

export function assessTuningAnalysis(input = {}) {
  const evidence = Object.freeze({
    ecuIdentity: truth(input.ecuIdentity),
    stockHash: truth(input.stockHash),
    hardwareProfile: truth(input.hardwareProfile),
    checksumReference: truth(input.checksumReference),
    stableReadSession: truth(input.stableReadSession),
    loggedData: truth(input.loggedData),
  });

  const missing = Object.entries(evidence).filter(([,ok]) => !ok).map(([key]) => key);
  const analysisReady = evidence.ecuIdentity && evidence.stockHash && evidence.hardwareProfile
    && evidence.checksumReference && evidence.stableReadSession;

  return Object.freeze({
    mode: 'ANALYSIS_ONLY',
    evidence,
    missing: Object.freeze(missing),
    analysisReady,
    liveLoggingReady: analysisReady && evidence.loggedData,
    calibrationWriteReady: false,
    flashReady: false,
    writesEnabled: false,
    nextStep: missing.length
      ? 'Uzupełnij wyłącznie brakujące dowody diagnostyczne.'
      : 'Dane nadają się do analizy porównawczej; zapis ECU nadal pozostaje zablokowany.',
  });
}

export function createAnalysisSummary(result) {
  if (!result || result.mode !== 'ANALYSIS_ONLY') throw new TypeError('Invalid tuning analysis result');
  const ok = Object.entries(result.evidence).filter(([,v]) => v).length;
  const total = Object.keys(result.evidence).length;
  return Object.freeze({
    completedEvidence: ok,
    totalEvidence: total,
    label: `ANALIZA ${ok}/${total}`,
    writesEnabled: false,
  });
}
