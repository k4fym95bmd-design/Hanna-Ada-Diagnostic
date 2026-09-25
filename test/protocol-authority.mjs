import assert from 'node:assert/strict';
import test from 'node:test';
import {
  ProtocolAuthorityError,
  classifyProtocolContract,
  protocolFamilyFromId,
  resolveProtocolAuthority,
  sanitizeProtocolDescription,
} from '../public/protocol-authority.js';
import { ConnectionDoctor } from '../public/connection-doctor.js';

test('ATDPN manual IDs 1-9,A,B,C remain manual and authoritative', () => {
  for (const id of ['1','2','3','4','5','6','7','8','9','A','B','C']) {
    const contract = resolveProtocolAuthority(`ATDPN\r${id}\r>`, 'ATDP\rDISPLAY ONLY\r>');
    assert.equal(contract.protocolId, id);
    assert.equal(contract.rawAtdpn, id);
    assert.equal(contract.isAutoDetected, false);
    assert.equal(contract.sourceAuthority, 'ATDPN');
    assert.equal(Object.isFrozen(contract), true);
  }
});

test('ATDPN auto prefix is distinguished from protocol A', () => {
  const vectors = [
    ['A1','1'], ['A6','6'], ['A9','9'], ['AA','A'], ['AB','B'], ['AC','C'],
  ];
  for (const [raw, id] of vectors) {
    const contract = resolveProtocolAuthority(`ATDPN\r${raw}\r>`);
    assert.equal(contract.protocolId, id);
    assert.equal(contract.isAutoDetected, true);
  }

  const manualA = resolveProtocolAuthority('ATDPN\rA\r>');
  assert.equal(manualA.protocolId, 'A');
  assert.equal(manualA.isAutoDetected, false);
});

test('ATDPN 0/A0, errors, searching state, garbage and mixed replies fail closed', () => {
  for (const raw of [
    'ATDPN\r0\r>',
    'ATDPN\rA0\r>',
    'ATDPN\rSEARCHING...\r>',
    'ATDPN\rERROR\r>',
    'ATDPN\r?\r>',
    'ATDPN\rA6\r6\r>',
    'ATDPN\rA6\rOK\r>',
    'ATDPN\rXYZ\r>',
    'ATDPN\0\rA6\r>',
  ]) {
    assert.throws(
      () => resolveProtocolAuthority(raw),
      error => error instanceof ProtocolAuthorityError,
      raw,
    );
  }
});

test('ATDP is presentation-only and can never override ATDPN', () => {
  const contract = resolveProtocolAuthority(
    'ATDPN\r3\r>',
    'ATDP\rISO 15765-4 CAN (11 bit ID, 500 kbaud)\r>',
  );
  assert.equal(contract.protocolId, '3');
  assert.equal(classifyProtocolContract(contract), 'legacy');
  assert.equal(contract.descriptionFallback, 'ISO 15765-4 CAN (11 bit ID, 500 kbaud)');
});

test('ATDP label sanitization is fail-soft and never establishes authority', () => {
  assert.equal(sanitizeProtocolDescription('ATDP\rAUTO, ISO 15765-4 CAN\r>'), 'AUTO, ISO 15765-4 CAN');
  assert.equal(sanitizeProtocolDescription('ATDP\rERROR\r>'), undefined);
  assert.equal(sanitizeProtocolDescription('ATDP\rCAN\rISO 9141-2\r>'), undefined);
  assert.equal(sanitizeProtocolDescription(null), undefined);
});

test('protocol family mapping does not promote J1939/custom CAN into generic OBD', () => {
  assert.equal(protocolFamilyFromId('3'), 'legacy');
  assert.equal(protocolFamilyFromId('6'), 'can');
  assert.equal(protocolFamilyFromId('A'), 'j1939');
  assert.equal(protocolFamilyFromId('B'), 'custom-can');
  assert.equal(protocolFamilyFromId('C'), 'custom-can');
  assert.equal(classifyProtocolContract(resolveProtocolAuthority('A')), 'unknown');
  assert.equal(classifyProtocolContract(resolveProtocolAuthority('B')), 'unknown');
});

test('ConnectionDoctor stores only a validated ATDPN contract and clears deterministically', () => {
  const doctor = new ConnectionDoctor();
  assert.throws(() => doctor.getActiveProtocol(), /not been established/i);

  const contract = doctor.resolveProtocolAuthority('ATDPN\rA6\r>', 'ATDP\rAUTO, ISO 15765-4 CAN\r>');
  assert.equal(doctor.getActiveProtocol(), contract);
  assert.equal(contract.protocolId, '6');

  doctor.clearProtocolAuthority();
  assert.throws(() => doctor.getActiveProtocol(), /not been established/i);
});
