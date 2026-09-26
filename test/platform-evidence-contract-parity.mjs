import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { EVIDENCE_CONTRACT_VERSION, EVIDENCE_STAGES } from '../public/evidence-contract.js';

const android = readFileSync(new URL('../android-usb-probe/app/src/main/java/app/hannaada/usbprobe/UnifiedEvidenceContract.java', import.meta.url), 'utf8');
const swift = readFileSync(new URL('../ios-native/Sources/EvidenceContract.swift', import.meta.url), 'utf8');
const iosView = readFileSync(new URL('../ios-native/Sources/WiredAccessoryView.swift', import.meta.url), 'utf8');

test('Android and iOS mirror every canonical evidence stage', () => {
  for (const stage of EVIDENCE_STAGES) {
    assert.match(android, new RegExp('"' + stage + '"'));
    assert.match(swift, new RegExp('"' + stage + '"'));
  }
});

test('Android and iOS evidence contract versions match the browser contract', () => {
  assert.match(android, new RegExp('VERSION\\s*=\\s*' + EVIDENCE_CONTRACT_VERSION));
  assert.match(swift, new RegExp('version\\s*=\\s*' + EVIDENCE_CONTRACT_VERSION));
});

test('platform mirrors keep identity verification as vocabulary only, not a transport success default', () => {
  assert.doesNotMatch(android, /return\s+READ_ONLY_IDENTITY_VERIFIED/);
  assert.match(swift, /transportMaximumStage:\s*EvidenceStage\s*=\s*\.frameCandidate/);
});

test('iOS ExternalAccessory observation is not promoted to USB_SEEN', () => {
  assert.match(iosView, /evidenceStage\s*=\s*\.noCable/);
  assert.doesNotMatch(iosView, /evidenceStage\s*=\s*accessories\.isEmpty\s*\?\s*\.noCable\s*:\s*\.usbSeen/);
  assert.match(iosView, /nie jest dowód USB K\+DCAN/i);
});
