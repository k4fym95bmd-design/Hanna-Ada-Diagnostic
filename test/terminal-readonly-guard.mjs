import assert from 'node:assert/strict';
import test from 'node:test';
import { isReadOnlyELMCommand } from '../public/terminal-readonly-guard.js';

test('terminal admits only explicitly approved read-oriented commands', () => {
  for (const command of ['ATI', 'ATDP', 'ATDPN', 'ATRV', '0100', '010C', '01FF', '03', '07', '0A', '  ati  ']) {
    assert.equal(isReadOnlyELMCommand(command), true, command);
  }
});

test('terminal rejects mutations, unknown AT, hex injection and shell syntax', () => {
  for (const command of ['', '04', '14', '2F0100', '3101', '27', '34', '36', 'ATSH123', 'ATSP0', 'ATZ', '09', '03\r04', '03;04', '01', '010G', '1234', 'ATDPN\n04', null, undefined]) {
    assert.equal(isReadOnlyELMCommand(command), false, String(command));
  }
});
