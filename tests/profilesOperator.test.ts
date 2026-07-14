import { mkdtempSync, readFileSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  parseProfileRequest,
  parseProfilesArguments,
  parseReviewedPlanReference,
  planProfileUpdates,
  resolveTrustedProfiles,
  runProfileReducerWithDeadline,
} from '../scripts/profiles/profiles-operator';
import {
  CONTROLLED_PROFILE_FIXTURE_SOURCE_ID,
  TRUSTED_PRODUCTION_PROFILE_SOURCE_ID,
  validateProfileSource,
} from '../scripts/profiles/profile-transport';
import {
  REVIEWED_PROFILE_PLAN_LIFETIME_MS,
  claimReviewedProfilePlan,
  createReviewedProfilePlan,
  readReviewedProfilePlan,
  writeReviewedProfilePlan,
} from '../scripts/profiles/profile-plan-artifact';
import { writeProfileApplyAuditEvent } from '../scripts/profiles/profile-apply-audit';

const FID = 123n;
const temporaryDirectories: string[] = [];

afterEach(() => {
  vi.useRealTimers();
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

function privateDirectory(): string {
  const directory = mkdtempSync(join(tmpdir(), 'warpkeep-profiles-test-'));
  temporaryDirectories.push(directory);
  return directory;
}

describe('trusted profile operator boundary', () => {
  it('requires stdin dry-run for refresh and stdin confirmation for apply', () => {
    expect(parseProfilesArguments(['refresh', '--input-stdin', '--dry-run'])).toMatchObject({
      command: 'refresh',
      inputStdin: true,
      dryRun: true,
      confirm: false,
    });
    expect(parseProfilesArguments(['apply', '--input-stdin', '--confirm'])).toMatchObject({
      command: 'apply',
      inputStdin: true,
      confirm: true,
    });
    expect(() => parseProfilesArguments(['refresh', '--input-stdin']))
      .toThrow('PROFILES_REFRESH_DRY_RUN_REQUIRED');
    expect(() => parseProfilesArguments(['apply', '--input-stdin']))
      .toThrow('PROFILES_APPLY_CONFIRMATION_REQUIRED');
  });

  it('rejects FIDs, endpoints, and credential-shaped values in argv', () => {
    expect(() => parseProfilesArguments(['refresh', '--input-stdin', '--dry-run', 'https://source.example']))
      .toThrow('PROFILES_PRIVATE_INPUT_IN_ARGV');
    expect(() => parseProfilesArguments(['apply', '--fid=123', '--confirm']))
      .toThrow('PROFILES_PRIVATE_INPUT_IN_ARGV');
    expect(() => parseProfilesArguments(['apply', '--api-key', 'private', '--confirm']))
      .toThrow('PROFILES_PRIVATE_INPUT_IN_ARGV');
  });

  it('constructs exact bounded typed Snapchain reads without wallet endpoints', async () => {
    const fetchImpl = vi.fn<typeof fetch>(async (input, init) => {
      const url = new URL(input instanceof Request ? input.url : input.toString());
      expect(url.pathname).toBe('/v1/userDataByFid');
      expect(url.searchParams.get('fid')).toBe(FID.toString());
      expect(init).toMatchObject({ method: 'GET', redirect: 'error', cache: 'no-store' });
      const type = url.searchParams.get('user_data_type') as string;
      return new Response(JSON.stringify({
        data: {
          type: 'MESSAGE_TYPE_USER_DATA_ADD',
          fid: Number(FID),
          timestamp: 10,
          network: 'FARCASTER_NETWORK_MAINNET',
          userDataBody: { type, value: type === 'USER_DATA_TYPE_USERNAME' ? 'keeper.eth' : 'Value' },
        },
      }), { headers: { 'content-type': 'application/json' } });
    });

    const profiles = await resolveTrustedProfiles({
      source: { sourceId: CONTROLLED_PROFILE_FIXTURE_SOURCE_ID },
      fids: [FID],
    }, fetchImpl);

    expect(fetchImpl).toHaveBeenCalledTimes(4);
    expect(new URL(String(fetchImpl.mock.calls[0][0])).origin)
      .toBe('https://profile-fixture.invalid');
    expect(profiles[0]).toMatchObject({ fid: FID, canonicalUsername: 'keeper.eth' });
    for (const [input] of fetchImpl.mock.calls) {
      expect(String(input)).not.toMatch(/custody|verification|wallet|burn/i);
    }
  });

  it('fails closed without an owner-reviewed production source and rejects operator-selected origins', () => {
    expect(() => validateProfileSource({ sourceId: TRUSTED_PRODUCTION_PROFILE_SOURCE_ID }))
      .toThrow('PROFILE_SOURCE_ATTESTATION_PENDING');
    expect(() => validateProfileSource({ sourceId: 'https://attacker.example' }))
      .toThrow('PROFILE_SOURCE_NOT_PINNED');
    expect(() => parseProfileRequest({
      source: {
        sourceId: TRUSTED_PRODUCTION_PROFILE_SOURCE_ID,
        baseUrl: 'https://attacker.example',
      },
      fids: ['123'],
    })).toThrow('PROFILES_SOURCE_INVALID');
    expect(() => parseProfileRequest({
      source: { sourceId: TRUSTED_PRODUCTION_PROFILE_SOURCE_ID },
      fids: ['123'],
    })).toThrow('PROFILE_SOURCE_ATTESTATION_PENDING');
    expect(() => parseProfileRequest({
      source: { sourceId: CONTROLLED_PROFILE_FIXTURE_SOURCE_ID },
      fids: ['123'],
    })).toThrow('PROFILE_SOURCE_NOT_PINNED');
  });

  it('accepts apply input only as an exact reviewed-plan reference', () => {
    expect(parseReviewedPlanReference({
      reviewedPlan: { filename: 'profiles-reviewed-plan-file.json', sha256: 'a'.repeat(64) },
    })).toEqual({ filename: 'profiles-reviewed-plan-file.json', sha256: 'a'.repeat(64) });
    expect(() => parseReviewedPlanReference({
      reviewedPlan: { filename: 'plan.json', sha256: 'a'.repeat(64), source: {} },
    })).toThrow('PROFILES_REVIEWED_PLAN_REFERENCE_INVALID');
    expect(() => parseProfileRequest({
      source: { sourceId: TRUSTED_PRODUCTION_PROFILE_SOURCE_ID },
      fids: ['123'],
      reviewedPlan: {},
    })).toThrow('PROFILES_PRIVATE_INPUT_INVALID');
  });

  it('preserves last-known-good fields and plans only changed profile reducers', () => {
    const current = new Map([[FID, {
      canonicalUsername: 'keeper.eth',
      displayName: 'Keeper',
      pfpUrl: 'https://images.example/stable.png',
      publicBio: 'Stable bio',
    }]]);
    const planned = planProfileUpdates([{
      fid: FID,
      canonicalUsername: 'keeper.eth',
      displayName: 'Keeper Prime',
    }], current);

    expect(planned.updates).toEqual([{
      fid: FID,
      canonicalUsername: 'keeper.eth',
      displayName: 'Keeper Prime',
      pfpUrl: 'https://images.example/stable.png',
      publicBio: 'Stable bio',
      farcasterProfileUrl: 'https://farcaster.xyz/keeper.eth',
    }]);
    expect(planned.lastKnownGoodFieldsPreserved).toBe(2);
  });

  it('fails before mutation planning when an input is not a current founded profile', () => {
    expect(() => planProfileUpdates([{
      fid: FID,
      canonicalUsername: 'keeper.eth',
    }], new Map())).toThrow('PROFILES_FOUNDER_STATE_MISMATCH');
  });

  it('writes a mode-0600 content-attested short-lived reviewed plan and claims it once', () => {
    const reportDirectory = privateDirectory();
    const now = new Date('2026-07-14T10:00:00.000Z');
    const sourceConfigurationDigest = 'a'.repeat(64);
    const targetConfigurationDigest = 'b'.repeat(64);
    const plan = createReviewedProfilePlan({
      sourceConfigurationDigest,
      targetConfigurationDigest,
      policyVersion: 'policy-v1',
      fetchedProfiles: 1,
      unchangedProfiles: 0,
      lastKnownGoodFieldsPreserved: 2,
      updates: [{
        fid: FID.toString(),
        expectedCurrent: { displayName: 'Keeper' },
        intended: { displayName: 'Keeper Prime', pfpUrl: 'https://images.example/pfp.png' },
      }],
      now,
    });
    const artifact = writeReviewedProfilePlan({ reportDirectory, plan });
    expect(statSync(join(reportDirectory, artifact.filename)).mode & 0o777).toBe(0o600);
    expect(readFileSync(join(reportDirectory, artifact.filename), 'utf8')).toContain('Keeper Prime');
    expect(readReviewedProfilePlan({
      reportDirectory,
      filename: artifact.filename,
      expectedSha256: artifact.sha256,
      sourceConfigurationDigest,
      targetConfigurationDigest,
      policyVersion: 'policy-v1',
      now: new Date(now.getTime() + 1_000),
    }).updates[0].intended.displayName).toBe('Keeper Prime');
    expect(() => readReviewedProfilePlan({
      reportDirectory,
      filename: artifact.filename,
      expectedSha256: 'c'.repeat(64),
      sourceConfigurationDigest,
      targetConfigurationDigest,
      policyVersion: 'policy-v1',
      now,
    })).toThrow('PROFILES_REVIEWED_PLAN_ATTESTATION_MISMATCH');
    expect(() => readReviewedProfilePlan({
      reportDirectory,
      filename: artifact.filename,
      expectedSha256: artifact.sha256,
      sourceConfigurationDigest,
      targetConfigurationDigest,
      policyVersion: 'policy-v1',
      now: new Date(now.getTime() + REVIEWED_PROFILE_PLAN_LIFETIME_MS + 1),
    })).toThrow('PROFILES_REVIEWED_PLAN_EXPIRED');
    claimReviewedProfilePlan({ reportDirectory, plan, sha256: artifact.sha256 });
    expect(() => claimReviewedProfilePlan({ reportDirectory, plan, sha256: artifact.sha256 }))
      .toThrow('PROFILES_REVIEWED_PLAN_ALREADY_CLAIMED');
  });

  it('bounds reducer calls and records success before a simultaneous disconnect', async () => {
    const succeeded = await runProfileReducerWithDeadline({
      operation: Promise.resolve(),
      disconnected: Promise.resolve({ unexpected: true, errorObserved: true }),
      timeoutMs: 100,
    });
    expect(succeeded).toEqual({ kind: 'succeeded', reason: 'none' });

    const failed = await runProfileReducerWithDeadline({
      operation: Promise.reject(new Error('private reducer detail')),
      disconnected: new Promise(() => undefined),
      timeoutMs: 100,
    });
    expect(failed).toEqual({ kind: 'failed', reason: 'reducer-rejected' });

    vi.useFakeTimers();
    const timed = runProfileReducerWithDeadline({
      operation: new Promise(() => undefined),
      disconnected: new Promise(() => undefined),
      timeoutMs: 100,
    });
    await vi.advanceTimersByTimeAsync(100);
    await expect(timed).resolves.toEqual({ kind: 'ambiguous', reason: 'reducer-deadline' });
  });

  it('writes immutable mode-0600 incremental audit events without profile identity data', () => {
    const reportDirectory = privateDirectory();
    const planId = 'd'.repeat(32);
    writeProfileApplyAuditEvent({
      reportDirectory,
      planId,
      sequence: 0,
      stage: 'reducer-submitted',
      outcome: 'pending',
      updateIndex: 0,
      totalUpdates: 1,
    });
    const path = join(reportDirectory, `profiles-apply-audit-${planId}-0000.json`);
    expect(statSync(path).mode & 0o777).toBe(0o600);
    const body = readFileSync(path, 'utf8');
    expect(body).not.toMatch(/fid|profileUrl|authorization|token/i);
    expect(() => writeProfileApplyAuditEvent({
      reportDirectory,
      planId,
      sequence: 0,
      stage: 'reducer-succeeded',
      outcome: 'succeeded',
      updateIndex: 0,
      totalUpdates: 1,
    })).toThrow();
  });
});
