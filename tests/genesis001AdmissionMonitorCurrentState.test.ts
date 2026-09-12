// @vitest-environment node

import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import {
  createGenesis001AdmissionMonitorCurrentStateReceiptForTesting,
  EXPECTED_MONITOR_PLIST_SHA256,
  EXPECTED_MONITOR_PROGRAM_SHA256,
  GENESIS001_ADMISSION_MONITOR_CURRENT_STATE_PROFILE,
  parseGenesis001AdmissionMonitorDisabledState,
} from '../scripts/genesis001-admission-monitor-current-state.mjs';

function snapshot(overrides: Record<string, unknown> = {}) {
  return {
    label: 'com.warpkeep.hermes-admission-monitor',
    domain: 'gui/501',
    disabled: true,
    loaded: false,
    plistSha256: EXPECTED_MONITOR_PLIST_SHA256,
    programSha256: EXPECTED_MONITOR_PROGRAM_SHA256,
    ...overrides,
  };
}

describe('Genesis 001 admission-monitor current-state observer', () => {
  it('constructs one exact source-bound canonical current-state receipt', () => {
    expect(createGenesis001AdmissionMonitorCurrentStateReceiptForTesting(
      snapshot(),
      'b'.repeat(40),
      new Date('2026-08-28T12:01:30.000Z'),
    )).toEqual({
      schemaVersion: 1,
      profile: GENESIS001_ADMISSION_MONITOR_CURRENT_STATE_PROFILE,
      realmId: 'GENESIS_001',
      release: '0.3.43',
      sourceCommit: 'b'.repeat(40),
      observedAt: '2026-08-28T12:01:30.000Z',
      label: 'com.warpkeep.hermes-admission-monitor',
      disabled: true,
      loaded: false,
      monitorPlistSha256: EXPECTED_MONITOR_PLIST_SHA256,
      monitorProgramSha256: EXPECTED_MONITOR_PROGRAM_SHA256,
    });
  });

  it('rejects changed targets, malformed timestamps, and production time injection', () => {
    for (const [patch, timestamp] of [
      [{ label: 'com.example.other' }, new Date('2026-08-28T12:01:30.000Z')],
      [{ plistSha256: '0'.repeat(64) }, new Date('2026-08-28T12:01:30.000Z')],
      [{ domain: 'system' }, new Date('2026-08-28T12:01:30.000Z')],
      [{}, new Date('invalid')],
    ] as const) {
      expect(() => createGenesis001AdmissionMonitorCurrentStateReceiptForTesting(
        snapshot(patch),
        'b'.repeat(40),
        timestamp,
      )).toThrow();
    }

    const previous = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';
    try {
      expect(() => createGenesis001AdmissionMonitorCurrentStateReceiptForTesting(
        snapshot(),
        'b'.repeat(40),
        new Date('2026-08-28T12:01:30.000Z'),
      )).toThrow(/TEST_TIME_FORBIDDEN/u);
    } finally {
      if (previous === undefined) delete process.env.NODE_ENV;
      else process.env.NODE_ENV = previous;
    }
  });

  it('parses exactly one fixed launchctl disabled state', () => {
    expect(parseGenesis001AdmissionMonitorDisabledState(
      '{\n\t"com.warpkeep.hermes-admission-monitor" => disabled\n}',
    )).toBe(true);
    expect(parseGenesis001AdmissionMonitorDisabledState(
      '{\n\t"com.warpkeep.hermes-admission-monitor" => enabled\n}',
    )).toBe(false);
    expect(() => parseGenesis001AdmissionMonitorDisabledState(
      '"com.warpkeep.hermes-admission-monitor-copy" => disabled\n',
    )).toThrow(/DISABLED_UNAVAILABLE/u);
    expect(() => parseGenesis001AdmissionMonitorDisabledState(
      '"com.warpkeep.hermes-admission-monitor" => disabled\n'
        + '"com.warpkeep.hermes-admission-monitor" => enabled\n',
    )).toThrow(/DISABLED_AMBIGUOUS/u);
  });

  it('parses the already attested plist bytes instead of reopening its path', () => {
    const source = readFileSync(resolve(
      import.meta.dirname,
      '../scripts/genesis001-admission-monitor-current-state.mjs',
    ), 'utf8');
    expect(source).toContain("], false, plist.body));");
    expect(source).toContain("'-',\n      '--',\n      '-',");
    expect(source).not.toContain("'-',\n      paths.plist,");
  });
});
