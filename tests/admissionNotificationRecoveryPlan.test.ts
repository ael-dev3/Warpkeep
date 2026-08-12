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
  REVIEWED_ADMISSION_NOTIFICATION_RECOVERY_PLAN_LIFETIME_MS,
  admissionNotificationRecoveryStateDigest,
  claimReviewedAdmissionNotificationRecoveryPlan,
  createReviewedAdmissionNotificationRecoveryPlan,
  parseReviewedAdmissionNotificationRecoveryPlanReference,
  readReviewedAdmissionNotificationRecoveryPlan,
  writeReviewedAdmissionNotificationRecoveryPlan,
} from '../scripts/admission-notifications/recovery-plan';

const TARGET_DIGEST = 'a'.repeat(64);
const STATE_DIGEST = 'b'.repeat(64);
const NOTIFICATION_RECEIPT_DIGEST = 'c'.repeat(64);
const NOTIFICATION_BRIDGE_COMMIT = 'd'.repeat(40);
const NOW = new Date('2026-08-11T13:00:00.000Z');
const FID = 123_456n;
const REQUESTED_AT_MICROS = 1_800_000_000_000_000n;
const temporaryRoots: string[] = [];

function privateDirectory(): string {
  const root = mkdtempSync(join(tmpdir(), 'warpkeep-notification-recovery-'));
  temporaryRoots.push(root);
  return join(root, 'private');
}

afterEach(() => {
  for (const root of temporaryRoots.splice(0)) {
    rmSync(root, { force: true, recursive: true });
  }
});

describe('private reviewed admission notification recovery plan', () => {
  it('writes, reads, and one-time claims one exact 0600 recovery CAS', () => {
    const directory = privateDirectory();
    const plan = createReviewedAdmissionNotificationRecoveryPlan({
      targetConfigurationDigest: TARGET_DIGEST,
      notificationPreparedReleaseBinding: {
        notificationPreparedReceiptDigest: NOTIFICATION_RECEIPT_DIGEST,
        notificationPreparedBridgeSourceCommit: NOTIFICATION_BRIDGE_COMMIT,
      },
      fid: FID,
      note: 'reviewed first-time founder delivery recovery',
      expectedRequestedAtMicros: REQUESTED_AT_MICROS,
      expectedNotificationStateDigest: STATE_DIGEST,
      now: NOW,
    });
    const reference = writeReviewedAdmissionNotificationRecoveryPlan({ directory, plan });
    const path = join(directory, reference.filename);

    expect(statSync(directory).mode & 0o777).toBe(0o700);
    expect(statSync(path).mode & 0o777).toBe(0o600);
    expect(reference.filename).not.toContain(FID.toString());
    expect(readFileSync(path, 'utf8')).toContain(REQUESTED_AT_MICROS.toString());
    expect(plan).toMatchObject({
      schemaVersion: 2,
      notificationPreparedReceiptDigest: NOTIFICATION_RECEIPT_DIGEST,
      notificationPreparedBridgeSourceCommit: NOTIFICATION_BRIDGE_COMMIT,
    });
    expect(readReviewedAdmissionNotificationRecoveryPlan({
      directory,
      reference,
      expectedTargetConfigurationDigest: TARGET_DIGEST,
      now: new Date(NOW.getTime() + 60_000),
    })).toEqual(plan);

    claimReviewedAdmissionNotificationRecoveryPlan({
      directory,
      plan,
      sha256: reference.sha256,
      now: new Date(NOW.getTime() + 60_000),
    });
    expect(() => claimReviewedAdmissionNotificationRecoveryPlan({
      directory,
      plan,
      sha256: reference.sha256,
      now: new Date(NOW.getTime() + 60_001),
    })).toThrow('ADMISSION_NOTIFICATION_RECOVERY_PLAN_ALREADY_CLAIMED');
  });

  it('rejects path traversal, target drift, expiry, and relaxed permissions', () => {
    expect(() => parseReviewedAdmissionNotificationRecoveryPlanReference({
      reviewedAdmissionNotificationRecoveryPlan: {
        filename: '../plan.json',
        sha256: TARGET_DIGEST,
      },
    })).toThrow('ADMISSION_NOTIFICATION_RECOVERY_PLAN_REFERENCE_INVALID');

    const directory = privateDirectory();
    const plan = createReviewedAdmissionNotificationRecoveryPlan({
      targetConfigurationDigest: TARGET_DIGEST,
      fid: FID,
      note: 'reviewed first-time founder delivery recovery',
      expectedRequestedAtMicros: REQUESTED_AT_MICROS,
      expectedNotificationStateDigest: STATE_DIGEST,
      now: NOW,
    });
    const reference = writeReviewedAdmissionNotificationRecoveryPlan({ directory, plan });
    expect(() => readReviewedAdmissionNotificationRecoveryPlan({
      directory,
      reference,
      expectedTargetConfigurationDigest: 'c'.repeat(64),
      now: NOW,
    })).toThrow('ADMISSION_NOTIFICATION_RECOVERY_PLAN_ATTESTATION_MISMATCH');
    expect(() => readReviewedAdmissionNotificationRecoveryPlan({
      directory,
      reference,
      expectedTargetConfigurationDigest: TARGET_DIGEST,
      now: new Date(
        NOW.getTime() + REVIEWED_ADMISSION_NOTIFICATION_RECOVERY_PLAN_LIFETIME_MS + 1,
      ),
    })).toThrow('ADMISSION_NOTIFICATION_RECOVERY_PLAN_EXPIRED');

    chmodSync(join(directory, reference.filename), 0o644);
    expect(() => readReviewedAdmissionNotificationRecoveryPlan({
      directory,
      reference,
      expectedTargetConfigurationDigest: TARGET_DIGEST,
      now: NOW,
    })).toThrow('ADMISSION_NOTIFICATION_RECOVERY_PLAN_FILE_PERMISSIONS');
  });

  it('binds every token-free delivery CAS field into one deterministic digest', () => {
    const diagnostics = {
      status: 'delivery-exhausted',
      generation: 'pending-request',
      requestedAtMicros: Number(REQUESTED_AT_MICROS),
      deliveryAttemptCount: 6,
      verificationFailureCount: 0,
      subscribed: true,
      recoveryCount: 0,
      retryReasons: ['upstream-server-status'],
      lastAttemptAt: 1_800_000_000_000,
      lastFailureReason: 'upstream-server-status',
    } as const;
    const digest = admissionNotificationRecoveryStateDigest(diagnostics);
    expect(digest).toMatch(/^[0-9a-f]{64}$/);
    expect(admissionNotificationRecoveryStateDigest(diagnostics)).toBe(digest);
    expect(admissionNotificationRecoveryStateDigest({
      ...diagnostics,
      deliveryAttemptCount: 5,
    })).not.toBe(digest);
  });

  it('rejects a partial prepared-notification receipt binding', () => {
    expect(() => createReviewedAdmissionNotificationRecoveryPlan({
      targetConfigurationDigest: TARGET_DIGEST,
      notificationPreparedReleaseBinding: {
        notificationPreparedReceiptDigest: NOTIFICATION_RECEIPT_DIGEST,
        notificationPreparedBridgeSourceCommit: null,
      },
      fid: FID,
      note: 'reviewed first-time founder delivery recovery',
      expectedRequestedAtMicros: REQUESTED_AT_MICROS,
      expectedNotificationStateDigest: STATE_DIGEST,
      now: NOW,
    })).toThrow('ADMISSION_NOTIFICATION_RECOVERY_PLAN_INVALID');
  });
});
