import test from 'node:test';
import assert from 'node:assert/strict';
import { assessTuningAnalysis, createAnalysisSummary } from '../public/tuning-analysis-core.js';

test('empty evidence remains analysis-only and write locked', () => {
  const r = assessTuningAnalysis({});
  assert.equal(r.analysisReady, false);
  assert.equal(r.calibrationWriteReady, false);
  assert.equal(r.flashReady, false);
  assert.equal(r.writesEnabled, false);
});

test('complete read evidence enables analysis but never flashing', () => {
  const r = assessTuningAnalysis({
    ecuIdentity:true, stockHash:true, hardwareProfile:true,
    checksumReference:true, stableReadSession:true, loggedData:true,
  });
  assert.equal(r.analysisReady, true);
  assert.equal(r.liveLoggingReady, true);
  assert.equal(r.flashReady, false);
  assert.equal(r.writesEnabled, false);
  assert.equal(createAnalysisSummary(r).label, 'ANALIZA 6/6');
});

test('missing evidence is explicitly listed', () => {
  const r = assessTuningAnalysis({ ecuIdentity:true, stockHash:true });
  assert.ok(r.missing.includes('hardwareProfile'));
  assert.ok(r.missing.includes('stableReadSession'));
});
