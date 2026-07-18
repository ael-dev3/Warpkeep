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
  FOUNDER_ADMISSION_PROFILE_SOURCE_USE_APPROVAL,
  REVIEWED_FOUNDER_ADMISSION_PLAN_LIFETIME_MS,
  claimReviewedFounderAdmissionPlan,
  createReviewedFounderAdmissionPlan,
  parsePrivateFounderAdmissionRequest,
  parseReviewedFounderAdmissionPlanReference,
  readReviewedFounderAdmissionPlan,
  writeReviewedFounderAdmissionPlan,
} from '../scripts/profiles/founder-admission-plan';

const SOURCE_DIGEST = 'a'.repeat(64);
const TARGET_DIGEST = 'b'.repeat(64);
const POLICY_VERSION = 'trusted-snapchain-profile-v3';
const NOW = new Date('2026-07-18T18:00:00.000Z');
const PRIVATE_FID = 1_234_567n;
const PRIVATE_NOTE = 'approved founder fixture';
const PROFILE = Object.freeze({
  canonicalUsername: 'private-fixture.eth',
  displayName: 'Private Fixture',
  pfpUrl: 'https://images.example/private-fixture.png',
  publicBio: 'Private fixture bio',
});

const temporaryRoots: string[] = [];

function privateDirectory(): string {
  const root = mkdtempSync(join(tmpdir(), 'warpkeep-founder-admission-'));
  temporaryRoots.push(root);
  return join(root, 'private');
}

afterEach(() => {
  for (const root of temporaryRoots.splice(0)) {
    rmSync(root, { force: true, recursive: true });
  }
});

describe('private reviewed founder admission plan', () => {
  it('accepts only exact private stdin request and reference envelopes', () => {
    expect(parsePrivateFounderAdmissionRequest({
      founderAdmission: {
        fid: PRIVATE_FID.toString(),
        note: PRIVATE_NOTE,
        profileSourceUseApproval: FOUNDER_ADMISSION_PROFILE_SOURCE_USE_APPROVAL,
      },
    })).toEqual({
      fid: PRIVATE_FID,
      note: PRIVATE_NOTE,
      profileSourceUseApproval: FOUNDER_ADMISSION_PROFILE_SOURCE_USE_APPROVAL,
    });
    expect(() => parsePrivateFounderAdmissionRequest({
      founderAdmission: { fid: PRIVATE_FID.toString(), note: PRIVATE_NOTE },
    })).toThrow('FOUNDER_ADMISSION_PROFILE_SOURCE_USE_NOT_APPROVED');
    expect(() => parsePrivateFounderAdmissionRequest({
      founderAdmission: {
        fid: PRIVATE_FID.toString(),
        note: PRIVATE_NOTE,
        profileSourceUseApproval: FOUNDER_ADMISSION_PROFILE_SOURCE_USE_APPROVAL,
        profile: PROFILE,
      },
    })).toThrow('FOUNDER_ADMISSION_PRIVATE_INPUT_INVALID');
    expect(() => parsePrivateFounderAdmissionRequest({
      founderAdmission: {
        fid: '0',
        note: PRIVATE_NOTE,
        profileSourceUseApproval: FOUNDER_ADMISSION_PROFILE_SOURCE_USE_APPROVAL,
      },
    })).toThrow('FOUNDER_ADMISSION_FID_INVALID');
    expect(() => parsePrivateFounderAdmissionRequest({
      founderAdmission: {
        fid: PRIVATE_FID.toString(),
        note: 'unsafe\nline',
        profileSourceUseApproval: FOUNDER_ADMISSION_PROFILE_SOURCE_USE_APPROVAL,
      },
    })).toThrow('FOUNDER_ADMISSION_NOTE_INVALID');

    expect(() => parseReviewedFounderAdmissionPlanReference({
      reviewedAdmissionPlan: { filename: '../plan.json', sha256: SOURCE_DIGEST },
    })).toThrow('FOUNDER_ADMISSION_PLAN_REFERENCE_INVALID');
  });

  it('writes one exact content-attested 0600 plan in an owner-only directory', () => {
    const directory = privateDirectory();
    const plan = createReviewedFounderAdmissionPlan({
      sourceConfigurationDigest: SOURCE_DIGEST,
      targetConfigurationDigest: TARGET_DIGEST,
      profilePolicyVersion: POLICY_VERSION,
      profileSourceUseApproval: FOUNDER_ADMISSION_PROFILE_SOURCE_USE_APPROVAL,
      fid: PRIVATE_FID,
      note: PRIVATE_NOTE,
      profile: PROFILE,
      now: NOW,
    });
    const reference = writeReviewedFounderAdmissionPlan({ directory, plan });
    const path = join(directory, reference.filename);

    expect(statSync(directory).mode & 0o777).toBe(0o700);
    expect(statSync(path).mode & 0o777).toBe(0o600);
    expect(reference.sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(reference.filename).not.toContain(PRIVATE_FID.toString());
    expect(JSON.stringify(reference)).not.toContain('private-fixture');

    const privateArtifact = readFileSync(path, 'utf8');
    expect(privateArtifact).toContain(PRIVATE_FID.toString());
    expect(privateArtifact).toContain(PROFILE.canonicalUsername);
    expect(privateArtifact).toContain(PRIVATE_NOTE);

    expect(readReviewedFounderAdmissionPlan({
      directory,
      reference,
      expectedSourceConfigurationDigest: SOURCE_DIGEST,
      expectedTargetConfigurationDigest: TARGET_DIGEST,
      expectedProfilePolicyVersion: POLICY_VERSION,
      now: new Date(NOW.getTime() + 60_000),
    })).toEqual(plan);
  });

  it('fails closed on attestation drift, expiry, permission drift, and plan reuse', () => {
    const directory = privateDirectory();
    const plan = createReviewedFounderAdmissionPlan({
      sourceConfigurationDigest: SOURCE_DIGEST,
      targetConfigurationDigest: TARGET_DIGEST,
      profilePolicyVersion: POLICY_VERSION,
      profileSourceUseApproval: FOUNDER_ADMISSION_PROFILE_SOURCE_USE_APPROVAL,
      fid: PRIVATE_FID,
      note: PRIVATE_NOTE,
      profile: PROFILE,
      now: NOW,
    });
    const reference = writeReviewedFounderAdmissionPlan({ directory, plan });

    expect(() => readReviewedFounderAdmissionPlan({
      directory,
      reference,
      expectedSourceConfigurationDigest: 'c'.repeat(64),
      expectedTargetConfigurationDigest: TARGET_DIGEST,
      expectedProfilePolicyVersion: POLICY_VERSION,
      now: NOW,
    })).toThrow('FOUNDER_ADMISSION_PLAN_ATTESTATION_MISMATCH');
    expect(() => readReviewedFounderAdmissionPlan({
      directory,
      reference,
      expectedSourceConfigurationDigest: SOURCE_DIGEST,
      expectedTargetConfigurationDigest: TARGET_DIGEST,
      expectedProfilePolicyVersion: POLICY_VERSION,
      now: new Date(NOW.getTime() + REVIEWED_FOUNDER_ADMISSION_PLAN_LIFETIME_MS + 1),
    })).toThrow('FOUNDER_ADMISSION_PLAN_EXPIRED');

    claimReviewedFounderAdmissionPlan({
      directory,
      plan,
      sha256: reference.sha256,
      now: new Date(NOW.getTime() + 60_000),
    });
    expect(() => claimReviewedFounderAdmissionPlan({
      directory,
      plan,
      sha256: reference.sha256,
      now: new Date(NOW.getTime() + 60_001),
    })).toThrow('FOUNDER_ADMISSION_PLAN_ALREADY_CLAIMED');

    chmodSync(join(directory, reference.filename), 0o644);
    expect(() => readReviewedFounderAdmissionPlan({
      directory,
      reference,
      expectedSourceConfigurationDigest: SOURCE_DIGEST,
      expectedTargetConfigurationDigest: TARGET_DIGEST,
      expectedProfilePolicyVersion: POLICY_VERSION,
      now: NOW,
    })).toThrow('FOUNDER_ADMISSION_PLAN_FILE_PERMISSIONS');
  });
});
