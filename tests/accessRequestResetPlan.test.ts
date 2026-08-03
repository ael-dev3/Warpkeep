import {
  chmodSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import {
  REVIEWED_ACCESS_REQUEST_RESET_PLAN_LIFETIME_MS,
  claimReviewedAccessRequestResetPlan,
  createReviewedAccessRequestResetPlan,
  parseReviewedAccessRequestResetPlanReference,
  readReviewedAccessRequestResetPlan,
  writeReviewedAccessRequestResetPlan,
} from '../scripts/access-requests/reset-plan';

const TARGET_DIGEST = 'b'.repeat(64);
const NOW = new Date('2026-08-03T13:00:00.000Z');
const FID = 123_456n;
const NOTE = 'controlled owner canary reset';
const temporaryRoots: string[] = [];

function privateDirectory(): string {
  const root = mkdtempSync(join(tmpdir(), 'warpkeep-access-reset-'));
  temporaryRoots.push(root);
  return join(root, 'private');
}

afterEach(() => {
  for (const root of temporaryRoots.splice(0)) {
    rmSync(root, { force: true, recursive: true });
  }
});

describe('private reviewed access request reset plan', () => {
  it('writes and reads one exact content-attested 0600 CAS plan', () => {
    const directory = privateDirectory();
    const plan = createReviewedAccessRequestResetPlan({
      targetConfigurationDigest: TARGET_DIGEST,
      fid: FID,
      note: NOTE,
      expectedEnabled: false,
      expectedAuthEpoch: 7,
      expectedRequestCycle: 8n,
      expectedRequestedAtMicros: 1_720_000_000_000_000n,
      now: NOW,
    });
    const reference = writeReviewedAccessRequestResetPlan({ directory, plan });
    const path = join(directory, reference.filename);

    expect(statSync(directory).mode & 0o777).toBe(0o700);
    expect(statSync(path).mode & 0o777).toBe(0o600);
    expect(reference.filename).not.toContain(FID.toString());
    expect(reference.sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(readFileSync(path, 'utf8')).toContain(FID.toString());
    expect(readReviewedAccessRequestResetPlan({
      directory,
      reference,
      expectedTargetConfigurationDigest: TARGET_DIGEST,
      now: new Date(NOW.getTime() + 60_000),
    })).toEqual(plan);
  });

  it('rejects malformed tuples, references, target drift, expiry, and reuse', () => {
    expect(() => createReviewedAccessRequestResetPlan({
      targetConfigurationDigest: TARGET_DIGEST,
      fid: FID,
      note: NOTE,
      expectedEnabled: false,
      expectedAuthEpoch: 7,
      expectedRequestCycle: 8n,
      expectedRequestedAtMicros: undefined,
      now: NOW,
    })).toThrow('ACCESS_REQUEST_RESET_PLAN_CAS_INVALID');
    expect(() => parseReviewedAccessRequestResetPlanReference({
      reviewedAccessRequestResetPlan: {
        filename: '../plan.json',
        sha256: TARGET_DIGEST,
      },
    })).toThrow('ACCESS_REQUEST_RESET_PLAN_REFERENCE_INVALID');

    const directory = privateDirectory();
    const plan = createReviewedAccessRequestResetPlan({
      targetConfigurationDigest: TARGET_DIGEST,
      fid: FID,
      note: NOTE,
      expectedEnabled: true,
      expectedAuthEpoch: 7,
      expectedRequestCycle: undefined,
      expectedRequestedAtMicros: undefined,
      now: NOW,
    });
    const reference = writeReviewedAccessRequestResetPlan({ directory, plan });
    expect(() => readReviewedAccessRequestResetPlan({
      directory,
      reference,
      expectedTargetConfigurationDigest: 'c'.repeat(64),
      now: NOW,
    })).toThrow('ACCESS_REQUEST_RESET_PLAN_ATTESTATION_MISMATCH');
    expect(() => readReviewedAccessRequestResetPlan({
      directory,
      reference,
      expectedTargetConfigurationDigest: TARGET_DIGEST,
      now: new Date(NOW.getTime() + REVIEWED_ACCESS_REQUEST_RESET_PLAN_LIFETIME_MS + 1),
    })).toThrow('ACCESS_REQUEST_RESET_PLAN_EXPIRED');

    claimReviewedAccessRequestResetPlan({
      directory,
      plan,
      sha256: reference.sha256,
      now: new Date(NOW.getTime() + 60_000),
    });
    expect(() => claimReviewedAccessRequestResetPlan({
      directory,
      plan,
      sha256: reference.sha256,
      now: new Date(NOW.getTime() + 60_001),
    })).toThrow('ACCESS_REQUEST_RESET_PLAN_ALREADY_CLAIMED');

    chmodSync(join(directory, reference.filename), 0o644);
    expect(() => readReviewedAccessRequestResetPlan({
      directory,
      reference,
      expectedTargetConfigurationDigest: TARGET_DIGEST,
      now: NOW,
    })).toThrow('ACCESS_REQUEST_RESET_PLAN_FILE_PERMISSIONS');
  });
});
