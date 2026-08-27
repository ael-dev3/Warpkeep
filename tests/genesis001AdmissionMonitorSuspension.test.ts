import { createHash } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';

import {
  EXPECTED_MONITOR_PLIST_SHA256,
  EXPECTED_MONITOR_PROGRAM_SHA256,
  parseLaunchctlDisabledOutput,
  runGenesis001AdmissionMonitorSuspension,
  type Genesis001AdmissionMonitorSnapshot,
} from '../scripts/genesis001-admission-monitor-suspension';

function snapshot(
  overrides: Partial<Genesis001AdmissionMonitorSnapshot> = {},
): Genesis001AdmissionMonitorSnapshot {
  return Object.freeze({
    label: 'com.warpkeep.hermes-admission-monitor',
    domain: 'gui/501',
    disabled: false,
    loaded: true,
    plistSha256: EXPECTED_MONITOR_PLIST_SHA256,
    programSha256: EXPECTED_MONITOR_PROGRAM_SHA256,
    ...overrides,
  });
}

describe('Genesis 001 admission-monitor suspension', () => {
  it('parses only the exact launchctl disabled override', () => {
    expect(parseLaunchctlDisabledOutput(
      '{\n\t"com.warpkeep.hermes-admission-monitor" => disabled\n}',
      'com.warpkeep.hermes-admission-monitor',
    )).toBe(true);
    expect(parseLaunchctlDisabledOutput(
      '{\n\t"com.warpkeep.hermes-admission-monitor" => enabled\n}',
      'com.warpkeep.hermes-admission-monitor',
    )).toBe(false);
    expect(() => parseLaunchctlDisabledOutput(
      '{\n\t"com.warpkeep.hermes-admission-monitor-copy" => disabled\n}',
      'com.warpkeep.hermes-admission-monitor',
    )).toThrowError('GENESIS_001_ADMISSION_MONITOR_DISABLED_STATE_UNAVAILABLE');
    expect(() => parseLaunchctlDisabledOutput(
      '{\n\t"com.warpkeep.hermes-admission-monitor" => enabled\n'
        + '\t"com.warpkeep.hermes-admission-monitor" => disabled\n}',
      'com.warpkeep.hermes-admission-monitor',
    )).toThrowError('GENESIS_001_ADMISSION_MONITOR_DISABLED_STATE_AMBIGUOUS');
  });

  it('persistently disables, unloads, double-checks, and receipts the exact monitor', async () => {
    const states = [
      snapshot(),
      snapshot({ disabled: true }),
      snapshot({ disabled: true, loaded: false }),
      snapshot({ disabled: true, loaded: false }),
    ];
    const inspect = vi.fn(() => {
      const next = states.shift();
      if (!next) throw new Error('unexpected inspection');
      return next;
    });
    const disable = vi.fn();
    const bootout = vi.fn();
    const writeReceipt = vi.fn((body: string) => Object.freeze({
      basename: 'genesis001-admission-monitor-suspended.json',
      sha256: createHash('sha256').update(body).digest('hex'),
    }));

    const result = await runGenesis001AdmissionMonitorSuspension({
      sourceCommit: 'a'.repeat(40),
      now: new Date('2026-08-27T12:00:00.000Z'),
      inspect,
      disable,
      bootout,
      writeReceipt,
    });

    expect(inspect).toHaveBeenCalledTimes(4);
    expect(disable).toHaveBeenCalledTimes(1);
    expect(bootout).toHaveBeenCalledTimes(1);
    expect(writeReceipt).toHaveBeenCalledTimes(1);
    expect(JSON.parse(writeReceipt.mock.calls[0]![0])).toEqual({
      disabled: true,
      label: 'com.warpkeep.hermes-admission-monitor',
      loaded: false,
      monitorPlistSha256: EXPECTED_MONITOR_PLIST_SHA256,
      monitorProgramSha256: EXPECTED_MONITOR_PROGRAM_SHA256,
      profile: 'warpkeep-genesis001-admission-monitor-suspension-v1',
      realmId: 'GENESIS_001',
      release: '0.3.43',
      sourceCommit: 'a'.repeat(40),
      suspendedAt: '2026-08-27T12:00:00.000Z',
    });
    expect(result).toEqual({
      profile: 'warpkeep-genesis001-admission-monitor-suspension-v1',
      receiptBasename: 'genesis001-admission-monitor-suspended.json',
      receiptSha256: expect.stringMatching(/^[0-9a-f]{64}$/u),
    });
  });

  it('is idempotent when the exact monitor is already disabled and unloaded', async () => {
    const inspect = vi.fn()
      .mockReturnValueOnce(snapshot({ disabled: true, loaded: false }))
      .mockReturnValueOnce(snapshot({ disabled: true, loaded: false }));
    const disable = vi.fn();
    const bootout = vi.fn();
    const writeReceipt = vi.fn((body: string) => Object.freeze({
      basename: 'receipt.json',
      sha256: createHash('sha256').update(body).digest('hex'),
    }));

    await runGenesis001AdmissionMonitorSuspension({
      sourceCommit: 'c'.repeat(40),
      inspect,
      disable,
      bootout,
      writeReceipt,
    });

    expect(inspect).toHaveBeenCalledTimes(2);
    expect(disable).not.toHaveBeenCalled();
    expect(bootout).not.toHaveBeenCalled();
    expect(writeReceipt).toHaveBeenCalledTimes(1);
  });

  it('reconciles command errors only when the exact final state proves success', async () => {
    const states = [
      snapshot(),
      snapshot({ disabled: true }),
      snapshot({ disabled: true, loaded: false }),
      snapshot({ disabled: true, loaded: false }),
    ];
    const writeReceipt = vi.fn((body: string) => Object.freeze({
      basename: 'receipt.json',
      sha256: createHash('sha256').update(body).digest('hex'),
    }));

    await expect(runGenesis001AdmissionMonitorSuspension({
      sourceCommit: '7'.repeat(40),
      inspect: () => states.shift()!,
      disable: () => { throw new Error('ambiguous disable response'); },
      bootout: () => { throw new Error('ambiguous bootout response'); },
      writeReceipt,
    })).resolves.toMatchObject({ receiptSha256: expect.stringMatching(/^[0-9a-f]{64}$/u) });
    expect(writeReceipt).toHaveBeenCalledTimes(1);
  });

  it('fails closed before a receipt if the target changes or remains loaded', async () => {
    const writeReceipt = vi.fn();
    const changed = [
      snapshot(),
      snapshot({ disabled: true, programSha256: 'd'.repeat(64) }),
    ];
    await expect(runGenesis001AdmissionMonitorSuspension({
      sourceCommit: 'e'.repeat(40),
      inspect: () => changed.shift()!,
      disable: vi.fn(),
      bootout: vi.fn(),
      writeReceipt,
    })).rejects.toThrowError('GENESIS_001_ADMISSION_MONITOR_TARGET_CHANGED');
    expect(writeReceipt).not.toHaveBeenCalled();

    const stillLoaded = [
      snapshot(),
      snapshot({ disabled: true }),
      snapshot({ disabled: true }),
    ];
    await expect(runGenesis001AdmissionMonitorSuspension({
      sourceCommit: 'f'.repeat(40),
      inspect: () => stillLoaded.shift()!,
      disable: vi.fn(),
      bootout: vi.fn(),
      writeReceipt,
    })).rejects.toThrowError('GENESIS_001_ADMISSION_MONITOR_BOOTOUT_FAILED');
    expect(writeReceipt).not.toHaveBeenCalled();
  });

  it('rejects an invalid source commit and unexpected target state before mutation', async () => {
    const disable = vi.fn();
    const bootout = vi.fn();
    const writeReceipt = vi.fn();

    await expect(runGenesis001AdmissionMonitorSuspension({
      sourceCommit: 'main',
      inspect: () => snapshot(),
      disable,
      bootout,
      writeReceipt,
    })).rejects.toThrowError('GENESIS_001_ADMISSION_MONITOR_SOURCE_COMMIT_INVALID');

    await expect(runGenesis001AdmissionMonitorSuspension({
      sourceCommit: '1'.repeat(40),
      inspect: () => snapshot({ label: 'com.example.other' }),
      disable,
      bootout,
      writeReceipt,
    })).rejects.toThrowError('GENESIS_001_ADMISSION_MONITOR_TARGET_INVALID');
    expect(disable).not.toHaveBeenCalled();
    expect(bootout).not.toHaveBeenCalled();
    expect(writeReceipt).not.toHaveBeenCalled();
  });
});
