import { describe, expect, it } from 'vitest';

import {
  parseDailyMarksArguments,
  projectDailyMarksStatus,
} from '../scripts/daily-marks-operator';

function status(overrides: Record<string, unknown> = {}) {
  return {
    policyVersion: 'admitted-daily-mark-v1',
    utcDay: 20_300n,
    allowedFids: 8n,
    enabledAllowedFids: 7n,
    markAccounts: 8n,
    dailyAccounts: 8n,
    legacyZeroAccounts: 0n,
    invalidAccounts: 0n,
    realmProfiles: 8n,
    profileProjectionViolations: 0n,
    missingFounderState: 0n,
    grants: 7n,
    currentDayGrants: 7n,
    grantInvariantViolations: 0n,
    grantAccountReconciliationViolations: 0n,
    scheduleRows: 1n,
    scheduleConfigValid: true,
    legacyCompatibilityRows: 0n,
    readyForBackfill: false,
    readyForActivation: false,
    active: true,
    ...overrides,
  };
}

describe('daily Marks production operator', () => {
  it('requires exact activation counts and UTC day', () => {
    expect(parseDailyMarksArguments([
      'activate',
      '--expected-founders', '8',
      '--expected-enabled', '7',
      '--expected-utc-day', '20300',
      '--confirm',
    ])).toMatchObject({
      command: 'activate',
      expectedFounders: 8n,
      expectedEnabled: 7n,
      expectedUtcDay: 20_300n,
      confirmed: true,
    });
    expect(() => parseDailyMarksArguments(['activate', '--expected-founders', '8']))
      .toThrow(/arguments|expected-enabled/i);
    expect(() => parseDailyMarksArguments([
      'activate',
      '--expected-founders', '8',
      '--expected-enabled', '9',
      '--expected-utc-day', '20300',
    ])).toThrow(/cannot exceed/);
  });

  it('keeps inspection read-only and rejects mutation-only arguments', () => {
    expect(parseDailyMarksArguments(['inspect'])).toMatchObject({
      command: 'inspect',
      confirmed: false,
      dryRun: false,
    });
    expect(() => parseDailyMarksArguments([
      'inspect', '--expected-founders', '8',
    ])).toThrow(/inspection does not accept/i);
  });

  it('accepts only internally consistent counts-only status', () => {
    expect(projectDailyMarksStatus(status())).toEqual(status());
    expect(() => projectDailyMarksStatus(status({ policyVersion: 'another-policy' })))
      .toThrow(/invalid aggregate/i);
    expect(() => projectDailyMarksStatus(status({ enabledAllowedFids: 9n })))
      .toThrow(/inconsistent aggregate/i);
    expect(() => projectDailyMarksStatus(status({ scheduleRows: 2n })))
      .toThrow(/inconsistent aggregate/i);
    expect(() => projectDailyMarksStatus(status({ grants: '7' })))
      .toThrow(/invalid aggregate/i);
    expect(() => projectDailyMarksStatus(status({ fid: 101n })))
      .toThrow(/invalid aggregate/i);
    expect(() => projectDailyMarksStatus(status({ balanceMicros: 1_000_000n })))
      .toThrow(/invalid aggregate/i);
  });
});
