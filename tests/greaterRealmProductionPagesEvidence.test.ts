// @vitest-environment node

import { createHash } from 'node:crypto';
import {
  chmodSync,
  linkSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  realpathSync,
  rmSync,
  statSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import {
  ensureGreaterRealmProductionPagesEvidenceDirectory,
  GREATER_REALM_PRODUCTION_PAGES_EVIDENCE_KIND,
  GREATER_REALM_PRODUCTION_PAGES_EVIDENCE_TARGET,
  parseGreaterRealmProductionPagesEvidence,
  readPrivateGreaterRealmProductionPagesEvidence,
  writePrivateGreaterRealmProductionPagesEvidence,
  type GreaterRealmProductionPagesEvidence,
  type GreaterRealmProductionPagesEvidenceSourceRelease,
} from '../scripts/greater-realm-production-pages-evidence';
import type {
  GreaterRealmProductionVerificationReceipt,
} from '../scripts/greater-realm-production-verifier-core';

const NOW = new Date('2026-08-12T18:30:00.000Z');
const MAXIMUM_AGE_MILLISECONDS = 30 * 60 * 1_000;
const SOURCE_RELEASE = Object.freeze({
  atlasSourceCommit: 'a'.repeat(40),
  atlasId: 'GR-ATLAS-PAGES-EVIDENCE',
  publicReleaseId: 'GRR-PAGES-EVIDENCE',
  expectedReleaseSha256: 'b'.repeat(64),
  moduleSourceCommit: 'c'.repeat(40),
}) satisfies GreaterRealmProductionPagesEvidenceSourceRelease;
const temporaryDirectories: string[] = [];

function sha256(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}

function activeVerification(
  founderCount: number,
  overrides: Readonly<Record<string, unknown>> = {},
): GreaterRealmProductionVerificationReceipt {
  return {
    schemaVersion: 1,
    kind: 'warpkeep-greater-realm-production-active-verification-v1',
    atlasSourceCommit: SOURCE_RELEASE.atlasSourceCommit,
    atlasId: SOURCE_RELEASE.atlasId,
    publicReleaseId: SOURCE_RELEASE.publicReleaseId,
    expectedReleaseSha256: SOURCE_RELEASE.expectedReleaseSha256,
    moduleSourceCommit: SOURCE_RELEASE.moduleSourceCommit,
    expectedFounderCount: founderCount,
    founderCapacityRemaining: 600 - founderCount,
    admissionState: founderCount < 600 ? 'open' : 'at-capacity',
    activeClaimRows: founderCount.toString(),
    occupancyRows: founderCount.toString(),
    auditRows: '47',
    statusDigest: 'd'.repeat(64),
    ...overrides,
  } as GreaterRealmProductionVerificationReceipt;
}

function workspace(label = 'warpkeep-pages-evidence-'): Readonly<{
  parent: string;
  directory: string;
  repositoryRoot: string;
}> {
  const parent = mkdtempSync(join(realpathSync(tmpdir()), label));
  chmodSync(parent, 0o700);
  temporaryDirectories.push(parent);
  return Object.freeze({
    parent,
    directory: join(parent, 'active-v17'),
    repositoryRoot: realpathSync(process.cwd()),
  });
}

function writeEvidence(
  founderCount = 100,
  overrides: Readonly<{
    workspace?: ReturnType<typeof workspace>;
    activeVerification?: GreaterRealmProductionVerificationReceipt;
    expectedSourceRelease?: GreaterRealmProductionPagesEvidenceSourceRelease;
    expectedFounderCount?: number;
    maximumAgeMilliseconds?: number;
    verifiedAt?: Date;
  }> = {},
) {
  const targetWorkspace = overrides.workspace ?? workspace();
  return {
    workspace: targetWorkspace,
    result: writePrivateGreaterRealmProductionPagesEvidence({
      directory: targetWorkspace.directory,
      repositoryRoot: targetWorkspace.repositoryRoot,
      activeVerification:
        overrides.activeVerification ?? activeVerification(founderCount),
      expectedSourceRelease:
        overrides.expectedSourceRelease ?? SOURCE_RELEASE,
      expectedFounderCount:
        overrides.expectedFounderCount ?? founderCount,
      maximumAgeMilliseconds:
        overrides.maximumAgeMilliseconds ?? MAXIMUM_AGE_MILLISECONDS,
      verifiedAt: overrides.verifiedAt ?? NOW,
      randomBytesImpl: size => Buffer.alloc(size, 7),
    }),
  };
}

function parseEvidence(
  evidence: GreaterRealmProductionPagesEvidence,
  overrides: Readonly<{
    expectedSourceRelease?: GreaterRealmProductionPagesEvidenceSourceRelease;
    expectedFounderCount?: number;
    maximumAgeMilliseconds?: number;
    now?: Date;
  }> = {},
) {
  return parseGreaterRealmProductionPagesEvidence(evidence, {
    expectedSourceRelease:
      overrides.expectedSourceRelease ?? SOURCE_RELEASE,
    expectedFounderCount: overrides.expectedFounderCount
      ?? evidence.expectedFounderCount,
    maximumAgeMilliseconds: overrides.maximumAgeMilliseconds
      ?? MAXIMUM_AGE_MILLISECONDS,
    now: overrides.now ?? new Date(NOW.getTime() + 1),
  });
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe('Greater Realm active-v17 Pages evidence', () => {
  it('publishes canonical content-addressed 0700/0600 evidence without clobbering', () => {
    const targetWorkspace = workspace();
    const first = writeEvidence(100, { workspace: targetWorkspace }).result;
    const second = writeEvidence(100, { workspace: targetWorkspace }).result;

    expect(first.result).toBe('installed');
    expect(second).toMatchObject({
      result: 'unchanged',
      path: first.path,
      evidenceDigest: first.evidenceDigest,
    });
    expect(first.path).toBe(join(
      targetWorkspace.directory,
      `greater-realm-pages-active-v17-${first.evidenceDigest}.json`,
    ));
    expect(statSync(targetWorkspace.directory).mode & 0o7777).toBe(0o700);
    expect(statSync(first.path).mode & 0o7777).toBe(0o600);
    expect(statSync(first.path).nlink).toBe(1);

    const bytes = readFileSync(first.path);
    expect(sha256(bytes)).toBe(first.evidenceDigest);
    expect(bytes.at(-1)).toBe(0x0a);
    const raw = JSON.parse(bytes.toString('utf8')) as Record<string, unknown>;
    expect(Object.keys(raw)).toEqual([
      'schemaVersion', 'kind', 'recordedAt', 'expiresAt',
      'maximumAgeMilliseconds', 'target', 'sourceRelease',
      'expectedFounderCount', 'founderCapacityRemaining',
      'activeAdmissionEligible', 'activeVerification',
    ]);
    expect(Object.keys(raw.activeVerification as object)).toEqual([
      'schemaVersion', 'kind', 'atlasSourceCommit', 'atlasId',
      'publicReleaseId', 'expectedReleaseSha256', 'moduleSourceCommit',
      'expectedFounderCount', 'founderCapacityRemaining', 'admissionState',
      'activeClaimRows', 'occupancyRows', 'auditRows', 'statusDigest',
    ]);
    expect(raw).toMatchObject({
      kind: GREATER_REALM_PRODUCTION_PAGES_EVIDENCE_KIND,
      recordedAt: NOW.toISOString(),
      expiresAt: new Date(NOW.getTime() + MAXIMUM_AGE_MILLISECONDS).toISOString(),
      maximumAgeMilliseconds: MAXIMUM_AGE_MILLISECONDS,
      target: GREATER_REALM_PRODUCTION_PAGES_EVIDENCE_TARGET,
      sourceRelease: SOURCE_RELEASE,
      expectedFounderCount: 100,
      founderCapacityRemaining: 500,
      activeAdmissionEligible: true,
    });

    expect(readPrivateGreaterRealmProductionPagesEvidence({
      directory: targetWorkspace.directory,
      repositoryRoot: targetWorkspace.repositoryRoot,
      evidencePath: first.path,
      expectedEvidenceDigest: first.evidenceDigest,
      expectedSourceRelease: SOURCE_RELEASE,
      expectedFounderCount: 100,
      maximumAgeMilliseconds: MAXIMUM_AGE_MILLISECONDS,
      now: new Date(NOW.getTime() + 1),
    })).toEqual(first.evidence);
  });

  it.each([
    [1, 599, true, 'open'],
    [599, 1, true, 'open'],
    [600, 0, false, 'at-capacity'],
  ] as const)(
    'binds founder count %i to exact remaining capacity and eligibility',
    (founderCount, remaining, eligible, admissionState) => {
      const { result } = writeEvidence(founderCount);
      expect(result.evidence).toMatchObject({
        expectedFounderCount: founderCount,
        founderCapacityRemaining: remaining,
        activeAdmissionEligible: eligible,
        activeVerification: {
          expectedFounderCount: founderCount,
          founderCapacityRemaining: remaining,
          admissionState,
          activeClaimRows: founderCount.toString(),
          occupancyRows: founderCount.toString(),
        },
      });
    },
  );

  it('rejects invalid or self-described founder capacity and eligibility', () => {
    for (const founderCount of [0, 601, 1.5]) {
      expect(() => writeEvidence(100, {
        expectedFounderCount: founderCount,
      })).toThrow(/GREATER_REALM_PAGES_EVIDENCE_FOUNDER_COUNT_INVALID/);
    }
    expect(() => writeEvidence(100, {
      activeVerification: activeVerification(100, {
        founderCapacityRemaining: 499,
      }),
    })).toThrow(/GREATER_REALM_PAGES_EVIDENCE_ACTIVE_VERIFICATION_INVALID/);
    expect(() => writeEvidence(600, {
      activeVerification: activeVerification(600, {
        admissionState: 'open',
      }),
    })).toThrow(/GREATER_REALM_PAGES_EVIDENCE_ACTIVE_VERIFICATION_INVALID/);

    const evidence = writeEvidence().result.evidence;
    expect(() => parseEvidence({
      ...evidence,
      activeAdmissionEligible: false,
    })).toThrow(/GREATER_REALM_PAGES_EVIDENCE_CAPACITY_INVALID/);
  });

  it('requires exact source provenance, Maincloud target, and active verifier ABI', () => {
    const evidence = writeEvidence().result.evidence;
    expect(() => parseEvidence(evidence, {
      expectedSourceRelease: {
        ...SOURCE_RELEASE,
        moduleSourceCommit: 'e'.repeat(40),
      },
    })).toThrow(/GREATER_REALM_PAGES_EVIDENCE_SOURCE_MISMATCH/);
    expect(() => parseEvidence({
      ...evidence,
      target: {
        ...GREATER_REALM_PRODUCTION_PAGES_EVIDENCE_TARGET,
        database: 'lookalike',
      },
    } as unknown as GreaterRealmProductionPagesEvidence)).toThrow(
      /GREATER_REALM_PAGES_EVIDENCE_TARGET_INVALID/,
    );
    expect(() => parseEvidence({
      ...evidence,
      activeVerification: {
        ...evidence.activeVerification,
        statusDigest: 'not-a-digest',
      },
    })).toThrow(/GREATER_REALM_PAGES_EVIDENCE_ACTIVE_VERIFICATION_INVALID/);
    expect(() => parseEvidence({
      ...evidence,
      activeVerification: {
        ...evidence.activeVerification,
        unexpected: true,
      } as GreaterRealmProductionVerificationReceipt,
    })).toThrow(/GREATER_REALM_PAGES_EVIDENCE_ACTIVE_VERIFICATION_INVALID/);
  });

  it('enforces the caller-bound freshness interval and half-open validity window', () => {
    const evidence = writeEvidence().result.evidence;
    expect(() => parseEvidence(evidence, {
      maximumAgeMilliseconds: MAXIMUM_AGE_MILLISECONDS + 1,
    })).toThrow(/GREATER_REALM_PAGES_EVIDENCE_SHAPE_INVALID/);
    expect(() => parseEvidence(evidence, {
      now: new Date(NOW.getTime() - 1),
    })).toThrow(/GREATER_REALM_PAGES_EVIDENCE_NOT_YET_VALID/);
    expect(() => parseEvidence(evidence, {
      now: new Date(NOW.getTime() + MAXIMUM_AGE_MILLISECONDS),
    })).toThrow(/GREATER_REALM_PAGES_EVIDENCE_EXPIRED/);
    expect(() => parseEvidence({
      ...evidence,
      expiresAt: new Date(
        NOW.getTime() + MAXIMUM_AGE_MILLISECONDS - 1,
      ).toISOString(),
    })).toThrow(/GREATER_REALM_PAGES_EVIDENCE_FRESHNESS_WINDOW_INVALID/);
    expect(() => writeEvidence(100, {
      maximumAgeMilliseconds: 24 * 60 * 60 * 1_000 + 1,
    })).toThrow(/GREATER_REALM_PAGES_EVIDENCE_MAXIMUM_AGE_INVALID/);
  });

  it('rejects noncanonical bytes, renamed paths, and changed expected digests', () => {
    const { workspace: targetWorkspace, result } = writeEvidence();
    expect(() => readPrivateGreaterRealmProductionPagesEvidence({
      directory: targetWorkspace.directory,
      repositoryRoot: targetWorkspace.repositoryRoot,
      evidencePath: result.path,
      expectedEvidenceDigest: 'f'.repeat(64),
      expectedSourceRelease: SOURCE_RELEASE,
      expectedFounderCount: 100,
      maximumAgeMilliseconds: MAXIMUM_AGE_MILLISECONDS,
      now: new Date(NOW.getTime() + 1),
    })).toThrow(/GREATER_REALM_PAGES_EVIDENCE_PATH_INVALID/);

    const noncanonical = Buffer.from(JSON.stringify(result.evidence), 'utf8');
    const noncanonicalDigest = sha256(noncanonical);
    const noncanonicalPath = join(
      targetWorkspace.directory,
      `greater-realm-pages-active-v17-${noncanonicalDigest}.json`,
    );
    writeFileSync(noncanonicalPath, noncanonical, { mode: 0o600, flag: 'wx' });
    chmodSync(noncanonicalPath, 0o600);
    expect(() => readPrivateGreaterRealmProductionPagesEvidence({
      directory: targetWorkspace.directory,
      repositoryRoot: targetWorkspace.repositoryRoot,
      evidencePath: noncanonicalPath,
      expectedEvidenceDigest: noncanonicalDigest,
      expectedSourceRelease: SOURCE_RELEASE,
      expectedFounderCount: 100,
      maximumAgeMilliseconds: MAXIMUM_AGE_MILLISECONDS,
      now: new Date(NOW.getTime() + 1),
    })).toThrow(/GREATER_REALM_PAGES_EVIDENCE_BYTES_INVALID/);
  });

  it('refuses repository overlap, symlink leaves, weak modes, and foreign entries', () => {
    const targetWorkspace = workspace();
    expect(() => ensureGreaterRealmProductionPagesEvidenceDirectory({
      directory: join(targetWorkspace.repositoryRoot, '.pages-evidence'),
      repositoryRoot: targetWorkspace.repositoryRoot,
    })).toThrow(/GREATER_REALM_PAGES_EVIDENCE_REPOSITORY_OVERLAP/);

    const real = join(targetWorkspace.parent, 'real');
    const linked = join(targetWorkspace.parent, 'linked');
    mkdirSync(real, { mode: 0o700 });
    chmodSync(real, 0o700);
    symlinkSync(real, linked);
    expect(() => ensureGreaterRealmProductionPagesEvidenceDirectory({
      directory: linked,
      repositoryRoot: targetWorkspace.repositoryRoot,
    })).toThrow(/GREATER_REALM_PAGES_EVIDENCE_DIRECTORY_ANCESTOR_INVALID/);

    const weak = join(targetWorkspace.parent, 'weak');
    mkdirSync(weak, { mode: 0o700 });
    chmodSync(weak, 0o750);
    expect(() => ensureGreaterRealmProductionPagesEvidenceDirectory({
      directory: weak,
      repositoryRoot: targetWorkspace.repositoryRoot,
    })).toThrow(/GREATER_REALM_PAGES_EVIDENCE_DIRECTORY_INVALID/);

    const dedicated = join(targetWorkspace.parent, 'dedicated');
    mkdirSync(dedicated, { mode: 0o700 });
    chmodSync(dedicated, 0o700);
    writeFileSync(join(dedicated, 'foreign.txt'), 'no\n', { mode: 0o600 });
    expect(() => ensureGreaterRealmProductionPagesEvidenceDirectory({
      directory: dedicated,
      repositoryRoot: targetWorkspace.repositoryRoot,
    })).toThrow(/GREATER_REALM_PAGES_EVIDENCE_DIRECTORY_NOT_DEDICATED/);

    const modeWorkspace = workspace('warpkeep-pages-evidence-mode-');
    const modeEvidence = writeEvidence(100, { workspace: modeWorkspace }).result;
    chmodSync(modeEvidence.path, 0o640);
    expect(() => ensureGreaterRealmProductionPagesEvidenceDirectory({
      directory: modeWorkspace.directory,
      repositoryRoot: modeWorkspace.repositoryRoot,
    })).toThrow(/GREATER_REALM_PAGES_EVIDENCE_DIRECTORY_NOT_DEDICATED/);
  });

  it('repairs the hard-link publication suffix left by a crash', () => {
    const { workspace: targetWorkspace, result } = writeEvidence();
    const temporary = join(
      targetWorkspace.directory,
      `.greater-realm-pages-active-v17-${result.evidenceDigest}`
        + `-${'1'.repeat(24)}.json.tmp`,
    );
    linkSync(result.path, temporary);
    expect(lstatSync(result.path).nlink).toBe(2);
    expect(ensureGreaterRealmProductionPagesEvidenceDirectory({
      directory: targetWorkspace.directory,
      repositoryRoot: targetWorkspace.repositoryRoot,
    })).toBe(targetWorkspace.directory);
    expect(lstatSync(result.path).nlink).toBe(1);
    expect(readdirSync(targetWorkspace.directory)).toEqual([
      `greater-realm-pages-active-v17-${result.evidenceDigest}.json`,
    ]);
  });

  it('never replaces an existing digest destination with different bytes', () => {
    const targetWorkspace = workspace();
    const initial = writeEvidence(100, { workspace: targetWorkspace }).result;
    const before = readFileSync(initial.path);
    expect(() => writeEvidence(101, {
      workspace: targetWorkspace,
      verifiedAt: NOW,
    })).not.toThrow();
    expect(readFileSync(initial.path)).toEqual(before);

    const expectedWorkspace = workspace('warpkeep-pages-evidence-expected-');
    const expected = writeEvidence(100, { workspace: expectedWorkspace }).result;
    const poisonedWorkspace = workspace('warpkeep-pages-evidence-poisoned-');
    ensureGreaterRealmProductionPagesEvidenceDirectory({
      directory: poisonedWorkspace.directory,
      repositoryRoot: poisonedWorkspace.repositoryRoot,
    });
    const poisonedPath = join(
      poisonedWorkspace.directory,
      `greater-realm-pages-active-v17-${expected.evidenceDigest}.json`,
    );
    writeFileSync(poisonedPath, 'different\n', { mode: 0o600, flag: 'wx' });
    chmodSync(poisonedPath, 0o600);
    expect(() => writeEvidence(100, {
      workspace: poisonedWorkspace,
    })).toThrow(/GREATER_REALM_PAGES_EVIDENCE_CONTENT_ADDRESS_INVALID/);
    expect(readFileSync(poisonedPath, 'utf8')).toBe('different\n');
  });
});
