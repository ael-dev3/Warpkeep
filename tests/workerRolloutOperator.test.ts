import { createHash } from 'node:crypto';
import {
  chmodSync,
  closeSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  openSync,
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

import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  CASTLE_WORKER_RESOURCE_CATALOG_DIGEST,
} from '../spacetimedb/src/castleWorkerRolloutPolicy';
import {
  attestCanonicalClientArtifactDirectory,
  buildWorkerRolloutPlan,
  canonicalWorkerRolloutTarget,
  digestCanonicalArtifactDirectory,
  executeWorkerRolloutCommand,
  parseWorkerRolloutArguments,
  verifyWorkerRolloutTransition,
  withWorkerRolloutOperatorLock,
  WorkerRolloutOperatorError,
  writePrivateWorkerRolloutActivationBuildProof,
  writePrivateWorkerRolloutMigrationProof,
  writePrivateWorkerRolloutReceipt,
  type WorkerRolloutExecutionRecord,
} from '../scripts/worker-rollout-operator-core';
import {
  attestExactProtectedWorkerRolloutMain,
  bindFreshActivationPagesBuildProof,
  bindFreshCompleteDrainMigrationProof,
  executeWorkerRolloutWithSingleAdminToken,
  readWorkerRolloutAdminSecret,
} from '../scripts/worker-rollout-operator';
// @ts-expect-error Repository JavaScript scripts intentionally expose test hooks.
import { ADDITIVE_MIGRATION_PROOF_MINIMUM_LIFECYCLE_MILLISECONDS } from '../scripts/spacetime-additive-migration-proof.mjs';
import type {
  WorkerRolloutOperatorStatus,
} from '../scripts/worker-rollout-controls';

const temporaryRoots: string[] = [];

afterEach(() => {
  vi.restoreAllMocks();
  for (const root of temporaryRoots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

function temporaryRoot() {
  const root = mkdtempSync(join(realpathSync(tmpdir()), 'warpkeep-worker-operator-'));
  temporaryRoots.push(root);
  return root;
}

function status(overrides: Partial<WorkerRolloutOperatorStatus> = {}):
WorkerRolloutOperatorStatus {
  const legacyGoldExpeditions = overrides.legacyGoldExpeditions ?? 0n;
  const legacyFoodExpeditions = overrides.legacyFoodExpeditions ?? 0n;
  const legacyWoodExpeditions = overrides.legacyWoodExpeditions ?? 0n;
  const legacyStoneExpeditions = overrides.legacyStoneExpeditions ?? 0n;
  const legacyGoldOccupations = overrides.legacyGoldOccupations ?? 0n;
  const legacyFoodOccupations = overrides.legacyFoodOccupations ?? 0n;
  const legacyWoodOccupations = overrides.legacyWoodOccupations ?? 0n;
  const legacyStoneOccupations = overrides.legacyStoneOccupations ?? 0n;
  const legacyGoldSchedules = overrides.legacyGoldSchedules ?? 0n;
  const legacyFoodSchedules = overrides.legacyFoodSchedules ?? 0n;
  const legacyWoodSchedules = overrides.legacyWoodSchedules ?? 0n;
  const legacyStoneSchedules = overrides.legacyStoneSchedules ?? 0n;
  return Object.freeze({
    phase: 'staged',
    systemRows: 1n,
    systemConfigValid: true,
    expectedCastleCount: 2,
    expectedWorkerCount: 8,
    actualCastleCount: 2n,
    actualWorkerCount: 8n,
    rosterDigest: '1111111111111111',
    expectedRosterDigest: '1111111111111111',
    malformedWorkerGraphRows: 0n,
    resourceAccounts: 2n,
    missingResourceAccounts: 0n,
    orphanedResourceAccounts: 0n,
    resourceInvariantViolations: 0n,
    resourceRosterDigest: '2222222222222222',
    canonicalResourceCatalog: true,
    resourceCatalogDigest: CASTLE_WORKER_RESOURCE_CATALOG_DIGEST,
    legacyExpeditions: legacyGoldExpeditions
      + legacyFoodExpeditions
      + legacyWoodExpeditions
      + legacyStoneExpeditions,
    legacyOccupations: legacyGoldOccupations
      + legacyFoodOccupations
      + legacyWoodOccupations
      + legacyStoneOccupations,
    legacySchedules: legacyGoldSchedules
      + legacyFoodSchedules
      + legacyWoodSchedules
      + legacyStoneSchedules,
    legacyGoldExpeditions,
    legacyFoodExpeditions,
    legacyWoodExpeditions,
    legacyStoneExpeditions,
    legacyGoldOccupations,
    legacyFoodOccupations,
    legacyWoodOccupations,
    legacyStoneOccupations,
    legacyGoldSchedules,
    legacyFoodSchedules,
    legacyWoodSchedules,
    legacyStoneSchedules,
    genericAssignments: 0n,
    genericOccupations: 0n,
    genericSchedules: 0n,
    genericCommandReceipts: 0n,
    ...overrides,
  });
}

function absentStatus(): WorkerRolloutOperatorStatus {
  return status({
    phase: 'absent',
    systemRows: 0n,
    systemConfigValid: false,
    expectedCastleCount: 0,
    expectedWorkerCount: 0,
    actualWorkerCount: 0n,
    rosterDigest: '',
    malformedWorkerGraphRows: 2n,
  });
}

describe('worker rollout arguments and target', () => {
  it('requires one exact explicit confirmation for every mutation', () => {
    expect(parseWorkerRolloutArguments(['inspect'])).toEqual({
      command: 'inspect',
      confirmed: false,
    });
    expect(parseWorkerRolloutArguments(['stage', '--confirm'])).toEqual({
      command: 'stage',
      confirmed: true,
    });
    expect(() => parseWorkerRolloutArguments(['stage']))
      .toThrow(/CONFIRMATION_REQUIRED/);
    expect(() => parseWorkerRolloutArguments(['inspect', '--confirm']))
      .toThrow(/ARGUMENTS_INVALID/);
    expect(() => parseWorkerRolloutArguments(['stage', '--confirm', '--confirm']))
      .toThrow(/ARGUMENTS_INVALID/);
  });

  it('allows no mutable production target override', () => {
    expect(canonicalWorkerRolloutTarget({}).database)
      .toMatch(/^[0-9a-f]{64}$/);
    expect(() => canonicalWorkerRolloutTarget({
      WARPKEEP_SPACETIMEDB_DATABASE: 'warpkeep-89e4u',
    })).toThrow(/TARGET_OVERRIDE_REJECTED/);
    expect(() => canonicalWorkerRolloutTarget({
      WARPKEEP_AUTH_BRIDGE_URL: 'https://example.com',
    })).toThrow(/TARGET_OVERRIDE_REJECTED/);
  });

  it('attests exact HEAD against the canonical live origin main, not a cached ref', () => {
    const sourceCommit = 'a'.repeat(40);
    const outputs = new Map<string, string>([
      ['symbolic-ref\0--quiet\0--short\0HEAD', 'main\n'],
      ['rev-parse\0--verify\0HEAD^{commit}', `${sourceCommit}\n`],
      [
        'config\0--local\0--get-all\0remote.origin.url',
        'https://github.com/ael-dev3/Warpkeep.git\n',
      ],
      [
        'remote\0get-url\0--all\0origin',
        'https://github.com/ael-dev3/Warpkeep.git\n',
      ],
      [
        'ls-remote\0--exit-code\0origin\0refs/heads/main',
        `${sourceCommit}\trefs/heads/main\n`,
      ],
      ['status\0--porcelain=v1\0--untracked-files=all', ''],
    ]);
    const reader = vi.fn((args: readonly string[]) => {
      const output = outputs.get(args.join('\0'));
      if (output === undefined) throw new Error('unexpected git invocation');
      return output;
    });
    expect(attestExactProtectedWorkerRolloutMain('/controlled/repo', reader))
      .toBe(sourceCommit);
    expect(reader.mock.calls.map(([args]) => args)).toContainEqual([
      'ls-remote',
      '--exit-code',
      'origin',
      'refs/heads/main',
    ]);
    expect(reader.mock.calls.flatMap(([args]) => args))
      .not.toContain('refs/remotes/origin/main^{commit}');

    outputs.set(
      'ls-remote\0--exit-code\0origin\0refs/heads/main',
      `${'b'.repeat(40)}\trefs/heads/main\n`,
    );
    expect(() => attestExactProtectedWorkerRolloutMain(
      '/controlled/repo',
      reader,
    )).toThrow(/GIT_ATTESTATION_MISMATCH/);
  });

  it('fails closed on ambiguous origins and unavailable protected-main reads', () => {
    const sourceCommit = 'a'.repeat(40);
    const canonicalOrigin = 'https://github.com/ael-dev3/Warpkeep.git';
    const base = new Map<string, string>([
      ['symbolic-ref\0--quiet\0--short\0HEAD', 'main\n'],
      ['rev-parse\0--verify\0HEAD^{commit}', `${sourceCommit}\n`],
      [
        'config\0--local\0--get-all\0remote.origin.url',
        `${canonicalOrigin}\n${canonicalOrigin}\n`,
      ],
      ['remote\0get-url\0--all\0origin', `${canonicalOrigin}\n`],
      [
        'ls-remote\0--exit-code\0origin\0refs/heads/main',
        `${sourceCommit}\trefs/heads/main\n`,
      ],
      ['status\0--porcelain=v1\0--untracked-files=all', ''],
    ]);
    expect(() => attestExactProtectedWorkerRolloutMain(
      '/controlled/repo',
      args => base.get(args.join('\0')) ?? '',
    )).toThrow(/GIT_ATTESTATION_MISMATCH/);
    expect(() => attestExactProtectedWorkerRolloutMain(
      '/controlled/repo',
      args => {
        if (args[0] === 'ls-remote') {
          throw Object.assign(new Error('bounded timeout'), {
            code: 'ETIMEDOUT',
          });
        }
        base.set(
          'config\0--local\0--get-all\0remote.origin.url',
          `${canonicalOrigin}\n`,
        );
        return base.get(args.join('\0')) ?? '';
      },
    )).toThrow(/GIT_ATTESTATION_UNAVAILABLE/);
  });
});

describe('worker rollout plans', () => {
  it('builds exact no-argument stage and backfill envelopes', () => {
    expect(buildWorkerRolloutPlan('stage', absentStatus())).toEqual({
      reducer: 'admin_stage_worker_system_v1',
      envelope: {},
      alreadySatisfied: false,
    });
    const stagedEmpty = status({
      actualWorkerCount: 0n,
      malformedWorkerGraphRows: 2n,
    });
    expect(buildWorkerRolloutPlan('backfill', stagedEmpty)).toEqual({
      reducer: 'admin_backfill_worker_roster_v1',
      envelope: {},
      alreadySatisfied: false,
    });
  });

  it('binds complete-drain to all twelve v2 per-resource counts', () => {
    const before = status({
      phase: 'draining',
      legacyGoldExpeditions: 1n,
      legacyFoodExpeditions: 2n,
      legacyWoodExpeditions: 3n,
      legacyStoneExpeditions: 4n,
      legacyGoldOccupations: 1n,
      legacyFoodOccupations: 2n,
      legacyWoodOccupations: 3n,
      legacyStoneOccupations: 4n,
      legacyGoldSchedules: 2n,
      legacyFoodSchedules: 4n,
      legacyWoodSchedules: 6n,
      legacyStoneSchedules: 8n,
    });
    const plan = buildWorkerRolloutPlan('complete-drain', before, {
      sourceCommit: 'a'.repeat(40),
      moduleArtifactDigest: 'b'.repeat(64),
    });
    expect(plan.reducer).toBe('admin_complete_worker_legacy_drain_v1');
    expect(plan.envelope).toEqual({
      capability: 'genesis-001-worker-legacy-drain-v1',
      sourceCommit: 'a'.repeat(40),
      moduleArtifactDigest: 'b'.repeat(64),
      expectedCastleCount: 2,
      expectedWorkerCount: 8,
      rosterDigest: '1111111111111111',
      resourceRosterDigest: '2222222222222222',
      resourceCatalogDigest: CASTLE_WORKER_RESOURCE_CATALOG_DIGEST,
      goldExpeditions: 1,
      foodExpeditions: 2,
      woodExpeditions: 3,
      stoneExpeditions: 4,
      goldOccupations: 1,
      foodOccupations: 2,
      woodOccupations: 3,
      stoneOccupations: 4,
      goldSchedules: 2,
      foodSchedules: 4,
      woodSchedules: 6,
      stoneSchedules: 8,
    });
  });

  it('builds the exact activation attestation only from a ready v2 aggregate', () => {
    const before = status({ phase: 'draining' });
    const plan = buildWorkerRolloutPlan('activate', before, {
      sourceCommit: 'c'.repeat(40),
      clientRelease: 'alpha-0.3.18',
      clientArtifactDigest: 'd'.repeat(64),
    });
    expect(plan).toMatchObject({
      reducer: 'admin_activate_worker_system_v1',
      alreadySatisfied: false,
      envelope: {
        sourceCommit: 'c'.repeat(40),
        clientRelease: 'alpha-0.3.18',
        clientArtifactDigest: 'd'.repeat(64),
        expectedCastleCount: 2,
        expectedWorkerCount: 8,
        rosterDigest: '1111111111111111',
        resourceRosterDigest: '2222222222222222',
      },
    });
    expect(() => buildWorkerRolloutPlan('activate', status({
      phase: 'draining',
      legacyGoldExpeditions: 1n,
    }), {
      sourceCommit: 'c'.repeat(40),
      clientRelease: 'alpha-0.3.18',
      clientArtifactDigest: 'd'.repeat(64),
    })).toThrow(/ACTIVATION_BLOCKED/);
  });
});

describe('worker rollout execution', () => {
  it('uses a fresh v2 pre/post inspection and submits exactly once', async () => {
    const before = absentStatus();
    const after = status({
      actualWorkerCount: 0n,
      malformedWorkerGraphRows: 2n,
    });
    const inspect = vi.fn()
      .mockResolvedValueOnce(before)
      .mockResolvedValueOnce(after);
    const submit = vi.fn().mockResolvedValue(undefined);
    const record = await executeWorkerRolloutCommand({
      command: 'stage',
      confirmed: true,
      inspect,
      submit,
    });
    expect(inspect).toHaveBeenCalledTimes(2);
    expect(submit).toHaveBeenCalledExactlyOnceWith(
      'admin_stage_worker_system_v1',
      {},
    );
    expect(record.outcome).toBe('verified');
  });

  it('never blindly retries an ambiguous submission and trusts only post-state', async () => {
    const before = absentStatus();
    const after = status({
      actualWorkerCount: 0n,
      malformedWorkerGraphRows: 2n,
    });
    const submit = vi.fn().mockRejectedValue(new Error('controlled timeout'));
    const record = await executeWorkerRolloutCommand({
      command: 'stage',
      confirmed: true,
      inspect: vi.fn()
        .mockResolvedValueOnce(before)
        .mockResolvedValueOnce(after),
      submit,
    });
    expect(submit).toHaveBeenCalledTimes(1);
    expect(record.outcome).toBe('verified-after-submission-error');
    expect(record.reasonCode).toBe(
      'WORKER_ROLLOUT_SUBMISSION_ERROR_VERIFIED_BY_AGGREGATE',
    );
  });

  it('records but does not resubmit an unverified mutation', async () => {
    const before = absentStatus();
    const submit = vi.fn().mockRejectedValue(new Error('controlled timeout'));
    let thrown: unknown;
    try {
      await executeWorkerRolloutCommand({
        command: 'stage',
        confirmed: true,
        inspect: vi.fn()
          .mockResolvedValueOnce(before)
          .mockResolvedValueOnce(before),
        submit,
      });
    } catch (error) {
      thrown = error;
    }
    expect(submit).toHaveBeenCalledTimes(1);
    expect(thrown).toBeInstanceOf(WorkerRolloutOperatorError);
    expect((thrown as WorkerRolloutOperatorError).record).toMatchObject({
      outcome: 'mutation-unverified',
      submitted: true,
      reducer: 'admin_stage_worker_system_v1',
    });
  });

  it('does not submit a completed drain twice', async () => {
    const complete = status({ phase: 'draining' });
    const submit = vi.fn();
    const record = await executeWorkerRolloutCommand({
      command: 'complete-drain',
      confirmed: true,
      inspect: vi.fn().mockResolvedValue(complete),
      submit,
    });
    expect(submit).not.toHaveBeenCalled();
    expect(record.outcome).toBe('already-satisfied');
  });

  it('allows active generic rows in the activation postcondition', () => {
    const before = status({ phase: 'draining' });
    const after = status({
      phase: 'active',
      genericAssignments: 1n,
      genericOccupations: 1n,
      genericSchedules: 3n,
      genericCommandReceipts: 1n,
    });
    expect(verifyWorkerRolloutTransition('activate', before, after).phase)
      .toBe('active');
  });

  it('builds the envelope from the fresh post-proof pre-submit v2 snapshot', async () => {
    const fresh = status({
      phase: 'draining',
      legacyGoldExpeditions: 1n,
      legacyGoldOccupations: 1n,
      legacyGoldSchedules: 3n,
    });
    const after = status({ phase: 'draining' });
    const events: string[] = [];
    const inspect = vi.fn()
      .mockImplementationOnce(async () => {
        events.push('inspect-fresh');
        return fresh;
      })
      .mockImplementationOnce(async () => {
        events.push('inspect-post');
        return after;
      });
    const submit = vi.fn(async (
      _reducer: unknown,
      envelope: unknown,
    ) => {
      events.push('submit');
      expect(envelope).toMatchObject({
        goldExpeditions: 1,
        goldOccupations: 1,
        goldSchedules: 3,
      });
    });
    const record = await executeWorkerRolloutCommand({
      command: 'complete-drain',
      confirmed: true,
      inspect,
      submit,
      localAttestation: {
        sourceCommit: 'a'.repeat(40),
        moduleArtifactDigest: 'b'.repeat(64),
      },
    });
    expect(events).toEqual([
      'inspect-fresh',
      'submit',
      'inspect-post',
    ]);
    expect(inspect).toHaveBeenCalledTimes(2);
    expect(submit).toHaveBeenCalledTimes(1);
    expect(record.before?.legacyGoldExpeditions).toBe(1n);
    expect(record.outcome).toBe('verified');
  });

  it('fails generically before inspection when the sole mutation token is unavailable', async () => {
    const inspect = vi.fn();
    const submit = vi.fn();
    const prepare = vi.fn().mockResolvedValue({
      sourceCommit: 'a'.repeat(40),
    });
    await expect(executeWorkerRolloutWithSingleAdminToken({
      command: 'stage',
      confirmed: true,
      inspect,
      submit: async (_token, reducer, envelope) => submit(reducer, envelope),
      prepareLocalAttestation: prepare,
      requestToken: vi.fn().mockRejectedValue(
        new Error('controlled unavailable authority'),
      ),
    })).rejects.toMatchObject({
      code: 'WORKER_ROLLOUT_ADMIN_AUTHORITY_UNAVAILABLE',
      record: {
        command: 'stage',
        outcome: 'blocked',
        submitted: false,
        reasonCode: 'WORKER_ROLLOUT_ADMIN_AUTHORITY_UNAVAILABLE',
      },
    });
    expect(prepare).toHaveBeenCalledTimes(1);
    expect(inspect).not.toHaveBeenCalled();
    expect(submit).not.toHaveBeenCalled();
  });

  it('uses at most one token for each of all five rollout mutations', async () => {
    const sourceCommit = 'a'.repeat(40);
    const moduleArtifactDigest = 'b'.repeat(64);
    const clientArtifactDigest = 'c'.repeat(64);
    const mutationCases = [
      {
        command: 'stage' as const,
        before: absentStatus(),
        after: status({
          actualWorkerCount: 0n,
          malformedWorkerGraphRows: 2n,
        }),
      },
      {
        command: 'backfill' as const,
        before: status({
          actualWorkerCount: 0n,
          malformedWorkerGraphRows: 2n,
        }),
        after: status(),
      },
      {
        command: 'begin-drain' as const,
        before: status(),
        after: status({ phase: 'draining' }),
      },
      {
        command: 'complete-drain' as const,
        before: status({
          phase: 'draining',
          legacyGoldExpeditions: 1n,
          legacyGoldOccupations: 1n,
          legacyGoldSchedules: 3n,
        }),
        after: status({ phase: 'draining' }),
      },
      {
        command: 'activate' as const,
        before: status({ phase: 'draining' }),
        after: status({ phase: 'active' }),
      },
    ];
    let activeAdminOperations = 0;
    let peakAdminOperations = 0;
    const serialAdminOperation = async <T>(operation: () => Promise<T>) => {
      activeAdminOperations += 1;
      peakAdminOperations = Math.max(peakAdminOperations, activeAdminOperations);
      try {
        return await operation();
      } finally {
        activeAdminOperations -= 1;
      }
    };
    const requestToken = vi.fn(async () => serialAdminOperation(async () => (
      `token-${requestToken.mock.calls.length}`
    )));
    const prepareLocalAttestation = vi.fn(async (command: string) => ({
      sourceCommit,
      ...(command === 'complete-drain' ? { moduleArtifactDigest } : {}),
      ...(command === 'activate' ? {
        clientRelease: 'alpha-0.3.18',
        clientArtifactDigest,
      } : {}),
    }));
    for (const mutation of mutationCases) {
      const inspect = vi.fn()
        .mockResolvedValueOnce(mutation.before)
        .mockResolvedValueOnce(mutation.after);
      const submit = vi.fn().mockResolvedValue(undefined);
      const record = await executeWorkerRolloutWithSingleAdminToken({
        command: mutation.command,
        confirmed: true,
        prepareLocalAttestation,
        requestToken,
        inspect: async token => serialAdminOperation(async () => {
          expect(token).toMatch(/^token-\d$/);
          return inspect();
        }),
        submit: async (token, reducer, envelope) => serialAdminOperation(async () => {
          expect(token).toMatch(/^token-\d$/);
          return submit(reducer, envelope);
        }),
      });
      expect(record.outcome).toBe('verified');
      expect(inspect).toHaveBeenCalledTimes(2);
      expect(submit).toHaveBeenCalledTimes(1);
    }
    expect(activeAdminOperations).toBe(0);
    expect(peakAdminOperations).toBe(1);
    expect(prepareLocalAttestation).toHaveBeenCalledTimes(5);
    expect(requestToken).toHaveBeenCalledTimes(5);
    for (let index = 0; index < mutationCases.length; index += 1) {
      expect(
        prepareLocalAttestation.mock.invocationCallOrder[index]!,
      ).toBeLessThan(requestToken.mock.invocationCallOrder[index]!);
    }
    // Publication consumes two serial token mints, then stage/backfill/
    // begin-drain consume three: five of the bridge's six slots, leaving one
    // residual. Complete-drain's mandatory real nine-minute route plus one
    // gathering minute runs before its token, clearing the five-minute window;
    // complete-drain and activate then consume only two slots in the clean one.
    expect(2 + 3).toBe(5);
    expect(6 - (2 + 3)).toBe(1);
    expect(ADDITIVE_MIGRATION_PROOF_MINIMUM_LIFECYCLE_MILLISECONDS)
      .toBeGreaterThan(5 * 60 * 1_000);
    expect(2).toBeLessThanOrEqual(6);
  });

  it('runs even an already-satisfied mutation proof before its sole token', async () => {
    const events: string[] = [];
    const record = await executeWorkerRolloutWithSingleAdminToken({
      command: 'complete-drain',
      confirmed: true,
      prepareLocalAttestation: async () => {
        events.push('proof');
        return {
          sourceCommit: 'a'.repeat(40),
          moduleArtifactDigest: 'b'.repeat(64),
        };
      },
      requestToken: async () => {
        events.push('token');
        return 'one-token';
      },
      inspect: async token => {
        events.push(`inspect:${token}`);
        return status({ phase: 'draining' });
      },
      submit: async () => {
        events.push('submit');
      },
    });
    expect(record.outcome).toBe('already-satisfied');
    expect(events).toEqual(['proof', 'token', 'inspect:one-token']);
  });
});

describe('local credentials, artifacts, and private receipts', () => {
  it('accepts the admin credential only through bounded stdin', () => {
    const root = temporaryRoot();
    const secretPath = join(root, 'secret');
    writeFileSync(secretPath, 'x'.repeat(32), { mode: 0o600 });
    const descriptor = openSync(secretPath, 'r');
    try {
      expect(readWorkerRolloutAdminSecret({
        WARPKEEP_ADMIN_TOKEN_SECRET_STDIN: '1',
      }, descriptor)).toBe('x'.repeat(32));
    } finally {
      closeSync(descriptor);
    }
    expect(() => readWorkerRolloutAdminSecret({
      WARPKEEP_ADMIN_TOKEN_SECRET: 'x'.repeat(32),
      WARPKEEP_ADMIN_TOKEN_SECRET_STDIN: '1',
    })).toThrow(/SECRET_ENV_REJECTED/);

    writeFileSync(secretPath, `${'y'.repeat(32)}\n`, { mode: 0o600 });
    const newlineDescriptor = openSync(secretPath, 'r');
    try {
      expect(readWorkerRolloutAdminSecret({
        WARPKEEP_ADMIN_TOKEN_SECRET_STDIN: '1',
      }, newlineDescriptor)).toBe('y'.repeat(32));
    } finally {
      closeSync(newlineDescriptor);
    }
  });

  it('hashes a sorted ordinary-file dist tree and rejects symlinks', () => {
    const root = temporaryRoot();
    const first = join(root, 'first');
    const second = join(root, 'second');
    mkdirSync(join(first, 'assets'), { recursive: true });
    mkdirSync(join(second, 'assets'), { recursive: true });
    writeFileSync(join(first, 'z.txt'), 'z');
    writeFileSync(join(first, 'assets', 'a.js'), 'alpha');
    writeFileSync(join(second, 'assets', 'a.js'), 'alpha');
    writeFileSync(join(second, 'z.txt'), 'z');
    const firstDigest = digestCanonicalArtifactDirectory(first);
    const secondDigest = digestCanonicalArtifactDirectory(second);
    expect(firstDigest.digest).toBe(secondDigest.digest);
    expect(firstDigest.relativeFiles).toEqual(['assets/a.js', 'z.txt']);

    symlinkSync(join(first, 'z.txt'), join(first, 'linked.txt'));
    expect(() => digestCanonicalArtifactDirectory(first))
      .toThrow(/SYMLINK_REJECTED/);
  });

  it('binds the client digest and embedded full build commit in one snapshot', () => {
    const root = temporaryRoot();
    const dist = join(root, 'dist');
    mkdirSync(dist);
    const sourceCommit = 'a'.repeat(40);
    writeFileSync(
      join(dist, 'index.js'),
      `${'x'.repeat((64 * 1024) - 20)}${sourceCommit}`,
    );
    const attested = attestCanonicalClientArtifactDirectory(dist, sourceCommit);
    expect(attested.digest).toBe(digestCanonicalArtifactDirectory(dist).digest);
    expect(() => attestCanonicalClientArtifactDirectory(dist, 'b'.repeat(40)))
      .toThrow(/CLIENT_ARTIFACT_SOURCE_MISMATCH/);
  });

  it('writes aggregate-only receipts outside the repo with exact private modes', () => {
    const root = temporaryRoot();
    const repositoryRoot = join(root, 'repository');
    const receiptDirectory = join(root, 'private-receipts');
    mkdirSync(repositoryRoot, { mode: 0o700 });
    chmodSync(repositoryRoot, 0o700);
    const aggregate = status({ phase: 'draining' });
    const record: WorkerRolloutExecutionRecord = Object.freeze({
      command: 'inspect',
      outcome: 'inspected',
      submitted: false,
      before: aggregate,
      after: aggregate,
    });
    const receipt = writePrivateWorkerRolloutReceipt({
      directory: receiptDirectory,
      repositoryRoot,
      record,
      now: new Date('2026-07-24T12:00:00.000Z'),
    });
    expect(statSync(receiptDirectory).mode & 0o777).toBe(0o700);
    expect(statSync(receipt.path).mode & 0o777).toBe(0o600);
    const content = readFileSync(receipt.path, 'utf8');
    expect(content).toContain('"legacyGoldExpeditions": "0"');
    expect(content).toContain(
      '"database": "c2001f161d44e50c0a75356d79a4d10fa4a9d77ea4eddd56cda7ac6af50b570e"'
    );
    expect(content).not.toMatch(/authorization|credential|identity|secret|token|fid|qr/i);
    expect(receipt.digest).toMatch(/^[0-9a-f]{64}$/);

    expect(() => writePrivateWorkerRolloutReceipt({
      directory: join(repositoryRoot, 'receipts'),
      repositoryRoot,
      record,
    })).toThrow(/INSIDE_REPOSITORY/);
  });

  it('writes generic private receipts for every pre-inspection failure boundary', async () => {
    const root = temporaryRoot();
    const repositoryRoot = join(root, 'repository');
    const receiptDirectory = join(root, 'private-receipts');
    mkdirSync(repositoryRoot, { mode: 0o700 });
    const rawProofFailure = 'raw-proof-failure-private-value';
    const rawAuthorityFailure = 'raw-authority-failure-private-value';
    const rawInspectionFailure = 'raw-inspection-failure-private-value';
    const issuedAuthority = 'private-issued-authority-value';
    const failures: Array<{
      error: WorkerRolloutOperatorError;
      reasonCode: string;
      rawValues: readonly string[];
    }> = [];
    for (const operation of [
      executeWorkerRolloutWithSingleAdminToken({
        command: 'stage',
        confirmed: true,
        prepareLocalAttestation: async () => {
          throw new Error(rawProofFailure);
        },
        requestToken: vi.fn(),
        inspect: vi.fn(),
        submit: vi.fn(),
      }),
      executeWorkerRolloutWithSingleAdminToken({
        command: 'inspect',
        confirmed: false,
        prepareLocalAttestation: vi.fn(),
        requestToken: async () => {
          throw new Error(rawAuthorityFailure);
        },
        inspect: vi.fn(),
        submit: vi.fn(),
      }),
      executeWorkerRolloutWithSingleAdminToken({
        command: 'stage',
        confirmed: true,
        prepareLocalAttestation: async () => ({
          sourceCommit: 'a'.repeat(40),
        }),
        requestToken: async () => issuedAuthority,
        inspect: async () => {
          throw new Error(rawInspectionFailure);
        },
        submit: vi.fn(),
      }),
    ]) {
      try {
        await operation;
        throw new Error('expected controlled preflight failure');
      } catch (error) {
        expect(error).toBeInstanceOf(WorkerRolloutOperatorError);
        const operatorError = error as WorkerRolloutOperatorError;
        failures.push({
          error: operatorError,
          reasonCode: operatorError.code,
          rawValues: [
            rawProofFailure,
            rawAuthorityFailure,
            rawInspectionFailure,
            issuedAuthority,
          ],
        });
      }
    }
    expect(failures.map(failure => failure.reasonCode)).toEqual([
      'WORKER_ROLLOUT_LOCAL_PROOF_UNAVAILABLE',
      'WORKER_ROLLOUT_ADMIN_AUTHORITY_UNAVAILABLE',
      'WORKER_ROLLOUT_INITIAL_INSPECTION_UNAVAILABLE',
    ]);
    for (const failure of failures) {
      expect(failure.error.record).toEqual({
        command: failure.reasonCode ===
          'WORKER_ROLLOUT_ADMIN_AUTHORITY_UNAVAILABLE'
          ? 'inspect'
          : 'stage',
        outcome: 'blocked',
        submitted: false,
        reasonCode: failure.reasonCode,
      });
      const receipt = writePrivateWorkerRolloutReceipt({
        directory: receiptDirectory,
        repositoryRoot,
        record: failure.error.record!,
      });
      const content = readFileSync(receipt.path, 'utf8');
      for (const rawValue of failure.rawValues) {
        expect(content).not.toContain(rawValue);
      }
      expect(content).not.toContain('"before"');
      expect(content).not.toContain('"after"');
      expect(content).not.toContain('"reducer"');
      expect(content).not.toContain('"envelope"');
      expect(statSync(receipt.path).mode & 0o777).toBe(0o600);
    }
  });

  it('rejects every broader no-before receipt shape', () => {
    const root = temporaryRoot();
    const repositoryRoot = join(root, 'repository');
    const receiptDirectory = join(root, 'private-receipts');
    mkdirSync(repositoryRoot, { mode: 0o700 });
    for (const unsafe of [
      {
        command: 'inspect',
        outcome: 'blocked',
        submitted: false,
        reasonCode: 'WORKER_ROLLOUT_LOCAL_PROOF_UNAVAILABLE',
      },
      {
        command: 'stage',
        outcome: 'blocked',
        submitted: false,
        reducer: 'admin_stage_worker_system_v1',
        reasonCode: 'WORKER_ROLLOUT_ADMIN_AUTHORITY_UNAVAILABLE',
      },
      {
        command: 'stage',
        outcome: 'verified',
        submitted: false,
        reasonCode: 'WORKER_ROLLOUT_INITIAL_INSPECTION_UNAVAILABLE',
      },
      {
        command: 'stage',
        outcome: 'blocked',
        submitted: false,
        reasonCode: 'WORKER_ROLLOUT_UNREVIEWED_PREFLIGHT_REASON',
      },
    ]) {
      expect(() => writePrivateWorkerRolloutReceipt({
        directory: receiptDirectory,
        repositoryRoot,
        record: unsafe as unknown as WorkerRolloutExecutionRecord,
      })).toThrow(/RECEIPT_RECORD_INVALID/);
    }
    expect(existsSync(receiptDirectory)).toBe(false);
  });

  it('rejects reverse repository containment and never chmods an existing leaf', () => {
    const root = temporaryRoot();
    const repositoryRoot = join(root, 'repository');
    mkdirSync(repositoryRoot, { mode: 0o700 });
    const aggregate = status();
    const record: WorkerRolloutExecutionRecord = Object.freeze({
      command: 'inspect',
      outcome: 'inspected',
      submitted: false,
      before: aggregate,
      after: aggregate,
    });
    expect(() => writePrivateWorkerRolloutReceipt({
      directory: root,
      repositoryRoot,
      record,
    })).toThrow(/CONTAINS_REPOSITORY/);

    const existingLeaf = join(root, 'existing-receipts');
    mkdirSync(existingLeaf, { mode: 0o755 });
    chmodSync(existingLeaf, 0o755);
    expect(() => writePrivateWorkerRolloutReceipt({
      directory: existingLeaf,
      repositoryRoot,
      record,
    })).toThrow(/DIRECTORY_PERMISSIONS/);
    expect(statSync(existingLeaf).mode & 0o777).toBe(0o755);
  });

  it('securely creates private dedicated receipt ancestors and rejects reused leaves', () => {
    const root = temporaryRoot();
    const repositoryRoot = join(root, 'repository');
    mkdirSync(repositoryRoot, { mode: 0o700 });
    const aggregate = status();
    const record: WorkerRolloutExecutionRecord = Object.freeze({
      command: 'inspect',
      outcome: 'inspected',
      submitted: false,
      before: aggregate,
      after: aggregate,
    });
    const privateParent = join(root, 'operator-private');
    const receiptDirectory = join(privateParent, 'worker-rollout-receipts');
    writePrivateWorkerRolloutReceipt({
      directory: receiptDirectory,
      repositoryRoot,
      record,
    });
    expect(statSync(privateParent).mode & 0o777).toBe(0o700);
    expect(statSync(receiptDirectory).mode & 0o777).toBe(0o700);

    const reusedLeaf = join(root, 'other-private');
    mkdirSync(reusedLeaf, { mode: 0o700 });
    writeFileSync(join(reusedLeaf, 'unrelated.txt'), 'not a receipt', {
      mode: 0o600,
    });
    expect(() => writePrivateWorkerRolloutReceipt({
      directory: reusedLeaf,
      repositoryRoot,
      record,
    })).toThrow(/NOT_DEDICATED/);
  });

  it('binds complete-drain to a fresh source-stable migration artifact receipt', () => {
    const root = temporaryRoot();
    const repositoryRoot = join(root, 'repository');
    const receiptDirectory = join(root, 'private-receipts');
    const artifactPath = join(root, 'bundle.js');
    mkdirSync(repositoryRoot, { mode: 0o700 });
    writeFileSync(artifactPath, 'fresh compiled module', { mode: 0o600 });
    const artifactDigest = createHash('sha256')
      .update('fresh compiled module')
      .digest('hex');
    const sourceCommit = 'a'.repeat(40);
    const result = bindFreshCompleteDrainMigrationProof({
      sourceCommit,
      receiptDirectory,
      repositoryRoot,
      artifactPath,
      runMigrationProof: () => ({
        artifactDigest,
        v11TableSchemaDigest: 'b'.repeat(64),
        v12TableSchemaDigest: 'c'.repeat(64),
      }),
      attestSourceAfterProof: () => sourceCommit,
    });
    expect(result).toEqual({ moduleArtifactDigest: artifactDigest });
    const proofPath = readdirSync(receiptDirectory)
      .find(name => name.startsWith('worker-rollout-migration-proof-'));
    expect(proofPath).toBeDefined();
    const proof = readFileSync(join(receiptDirectory, proofPath!), 'utf8');
    expect(proof).toContain(`"sourceCommit": "${sourceCommit}"`);
    expect(proof).toContain(`"moduleArtifactDigest": "${artifactDigest}"`);
    expect(proof).toContain('"proofScope": "loopback-only"');
    expect(proof).toContain('"dataDeletion": "never"');
    expect(proof).not.toMatch(/authorization|credential|identity|secret|token|fid|qr/i);

    expect(() => bindFreshCompleteDrainMigrationProof({
      sourceCommit,
      receiptDirectory,
      repositoryRoot,
      artifactPath,
      runMigrationProof: () => ({
        artifactDigest: 'd'.repeat(64),
        v11TableSchemaDigest: 'b'.repeat(64),
        v12TableSchemaDigest: 'c'.repeat(64),
      }),
      attestSourceAfterProof: () => sourceCommit,
    })).toThrow(/FRESH_MIGRATION_PROOF_MISMATCH/);
    expect(() => bindFreshCompleteDrainMigrationProof({
      sourceCommit,
      receiptDirectory,
      repositoryRoot,
      artifactPath,
      runMigrationProof: () => ({
        artifactDigest,
        v11TableSchemaDigest: 'b'.repeat(64),
        v12TableSchemaDigest: 'c'.repeat(64),
      }),
      attestSourceAfterProof: () => 'e'.repeat(40),
    })).toThrow(/FRESH_MIGRATION_PROOF_MISMATCH/);
  });

  it('writes only validated private migration proof records', () => {
    const root = temporaryRoot();
    const repositoryRoot = join(root, 'repository');
    const receiptDirectory = join(root, 'private-receipts');
    mkdirSync(repositoryRoot, { mode: 0o700 });
    const proof = writePrivateWorkerRolloutMigrationProof({
      directory: receiptDirectory,
      repositoryRoot,
      sourceCommit: 'a'.repeat(40),
      moduleArtifactDigest: 'b'.repeat(64),
      v11TableSchemaDigest: 'c'.repeat(64),
      v12TableSchemaDigest: 'd'.repeat(64),
      now: new Date('2026-07-24T12:00:00.000Z'),
    });
    expect(statSync(proof.path).mode & 0o777).toBe(0o600);
    expect(() => writePrivateWorkerRolloutMigrationProof({
      directory: receiptDirectory,
      repositoryRoot,
      sourceCommit: 'not-a-commit',
      moduleArtifactDigest: 'b'.repeat(64),
      v11TableSchemaDigest: 'c'.repeat(64),
      v12TableSchemaDigest: 'd'.repeat(64),
    })).toThrow(/MIGRATION_PROOF_INVALID/);
  });

  it('binds activation to a fresh immutable canonical Pages build', () => {
    const root = temporaryRoot();
    const repositoryRoot = join(root, 'repository');
    const receiptDirectory = join(root, 'private-receipts');
    const artifactDirectory = join(repositoryRoot, 'dist');
    const sourceCommit = 'a'.repeat(40);
    mkdirSync(repositoryRoot, { mode: 0o700 });
    writeFileSync(
      join(repositoryRoot, 'package.json'),
      JSON.stringify({ version: '0.3.18' }),
      { mode: 0o600 },
    );
    mkdirSync(artifactDirectory);
    writeFileSync(join(artifactDirectory, 'stale.js'), 'stale');
    const phases: string[] = [];
    const runPagesBuild = vi.fn((
      phase: 'validate' | 'build',
      environment: Readonly<Record<string, string>>,
    ) => {
      phases.push(phase);
      expect(environment).toMatchObject({
        CI: 'true',
        DEPLOY_BASE: '/',
        GITHUB_PAGES: 'true',
        VITE_WARPKEEP_RELEASE_CHANNEL: 'alpha',
        VITE_WARPKEEP_BUILD_SHA: sourceCommit,
        VITE_WARPKEEP_REPOSITORY_URL:
          'https://github.com/ael-dev3/Warpkeep',
        VITE_WARPKEEP_CANONICAL_ORIGIN: 'https://warpkeep.com',
        VITE_WARPKEEP_SHARED_ALPHA_ENABLED: 'true',
        VITE_WARPKEEP_AUTH_BRIDGE_URL: 'https://auth.warpkeep.com',
        VITE_WARPKEEP_OIDC_ISSUER: 'https://auth.warpkeep.com',
        VITE_WARPKEEP_OIDC_AUDIENCE: 'warpkeep-spacetimedb',
        VITE_SPACETIMEDB_URI: 'https://maincloud.spacetimedb.com',
        VITE_SPACETIMEDB_DATABASE:
          'c2001f161d44e50c0a75356d79a4d10fa4a9d77ea4eddd56cda7ac6af50b570e',
      });
      expect(environment.VITE_UNREVIEWED_VALUE).toBeUndefined();
      expect(existsSync(join(artifactDirectory, 'stale.js'))).toBe(false);
      if (phase === 'build') {
        mkdirSync(artifactDirectory);
        writeFileSync(
          join(artifactDirectory, 'index.js'),
          `canonical build ${sourceCommit}`,
        );
      }
    });
    const result = bindFreshActivationPagesBuildProof({
      sourceCommit,
      receiptDirectory,
      repositoryRoot,
      artifactDirectory,
      sourceEnvironment: {
        PATH: '/controlled/path',
        VITE_UNREVIEWED_VALUE: 'must-not-cross-boundary',
      },
      runPagesBuild,
      attestSourceAfterBuild: () => sourceCommit,
    });
    expect(phases).toEqual(['validate', 'build']);
    expect(result.clientRelease).toBe('alpha-0.3.18');
    expect(result.clientArtifactDigest).toMatch(/^[0-9a-f]{64}$/);
    const proofPath = readdirSync(receiptDirectory)
      .find(name => name.startsWith(
        'worker-rollout-activation-build-proof-',
      ));
    expect(proofPath).toBeDefined();
    const proof = readFileSync(join(receiptDirectory, proofPath!), 'utf8');
    expect(proof).toContain(`"sourceCommit": "${sourceCommit}"`);
    expect(proof).toContain(
      `"clientArtifactDigest": "${result.clientArtifactDigest}"`,
    );
    expect(proof).toContain('"sharedAlphaEnabled": true');
    expect(proof).not.toMatch(
      /authorization|credential|identity|secret|token|fid|qr/i,
    );

    expect(() => bindFreshActivationPagesBuildProof({
      sourceCommit,
      receiptDirectory,
      repositoryRoot,
      artifactDirectory,
      sourceEnvironment: { PATH: '/controlled/path' },
      runPagesBuild,
      attestSourceAfterBuild: () => 'b'.repeat(40),
    })).toThrow(/ACTIVATION_BUILD_PROOF_MISMATCH/);
  });

  it('fails activation closed on local config, build failure, and invalid proofs', () => {
    const root = temporaryRoot();
    const repositoryRoot = join(root, 'repository');
    const receiptDirectory = join(root, 'private-receipts');
    const artifactDirectory = join(repositoryRoot, 'dist');
    const sourceCommit = 'a'.repeat(40);
    mkdirSync(repositoryRoot, { mode: 0o700 });
    writeFileSync(
      join(repositoryRoot, 'package.json'),
      JSON.stringify({ version: '0.3.18' }),
      { mode: 0o600 },
    );
    writeFileSync(join(repositoryRoot, '.env.production.local'), 'ignored=1');
    const runner = vi.fn();
    expect(() => bindFreshActivationPagesBuildProof({
      sourceCommit,
      receiptDirectory,
      repositoryRoot,
      artifactDirectory,
      sourceEnvironment: { PATH: '/controlled/path' },
      runPagesBuild: runner,
      attestSourceAfterBuild: () => sourceCommit,
    })).toThrow(/ACTIVATION_BUILD_LOCAL_CONFIG_REJECTED/);
    expect(runner).not.toHaveBeenCalled();
    rmSync(join(repositoryRoot, '.env.production.local'));

    expect(() => bindFreshActivationPagesBuildProof({
      sourceCommit,
      receiptDirectory,
      repositoryRoot,
      artifactDirectory,
      sourceEnvironment: { PATH: '/controlled/path' },
      runPagesBuild: () => {
        throw new Error('controlled build failure');
      },
      attestSourceAfterBuild: () => sourceCommit,
    })).toThrow(/ACTIVATION_BUILD_FAILED/);

    expect(() => writePrivateWorkerRolloutActivationBuildProof({
      directory: receiptDirectory,
      repositoryRoot,
      sourceCommit,
      clientRelease: 'not-a-release',
      clientArtifactDigest: 'b'.repeat(64),
      pagesConfigurationDigest: 'c'.repeat(64),
    })).toThrow(/ACTIVATION_BUILD_PROOF_INVALID/);
  });

  it('rejects activation artifact path hazards before deleting any sentinel', () => {
    const root = temporaryRoot();
    const repositoryRoot = join(root, 'repository');
    const receiptDirectory = join(root, 'private-receipts');
    const sourceCommit = 'a'.repeat(40);
    mkdirSync(repositoryRoot, { mode: 0o700 });
    writeFileSync(
      join(repositoryRoot, 'package.json'),
      JSON.stringify({ version: '0.3.18' }),
      { mode: 0o600 },
    );
    const repositorySentinel = join(repositoryRoot, 'repository-sentinel');
    const ancestorSentinel = join(root, 'ancestor-sentinel');
    writeFileSync(repositorySentinel, 'preserve repository');
    writeFileSync(ancestorSentinel, 'preserve ancestor');
    const runner = vi.fn();
    for (const dangerousPath of [repositoryRoot, root]) {
      expect(() => bindFreshActivationPagesBuildProof({
        sourceCommit,
        receiptDirectory,
        repositoryRoot,
        artifactDirectory: dangerousPath,
        sourceEnvironment: { PATH: '/controlled/path' },
        runPagesBuild: runner,
        attestSourceAfterBuild: () => sourceCommit,
      })).toThrow(/ACTIVATION_ARTIFACT_DIRECTORY_INVALID/);
      expect(readFileSync(repositorySentinel, 'utf8'))
        .toBe('preserve repository');
      expect(readFileSync(ancestorSentinel, 'utf8'))
        .toBe('preserve ancestor');
    }

    const exactDist = join(repositoryRoot, 'dist');
    writeFileSync(exactDist, 'preserve non-directory');
    expect(() => bindFreshActivationPagesBuildProof({
      sourceCommit,
      receiptDirectory,
      repositoryRoot,
      artifactDirectory: exactDist,
      sourceEnvironment: { PATH: '/controlled/path' },
      runPagesBuild: runner,
      attestSourceAfterBuild: () => sourceCommit,
    })).toThrow(/ACTIVATION_ARTIFACT_DIRECTORY_INVALID/);
    expect(readFileSync(exactDist, 'utf8')).toBe('preserve non-directory');
    rmSync(exactDist);

    const externalDirectory = join(root, 'external-dist');
    const externalSentinel = join(externalDirectory, 'external-sentinel');
    mkdirSync(externalDirectory);
    writeFileSync(externalSentinel, 'preserve symlink target');
    symlinkSync(externalDirectory, exactDist);
    expect(() => bindFreshActivationPagesBuildProof({
      sourceCommit,
      receiptDirectory,
      repositoryRoot,
      artifactDirectory: exactDist,
      sourceEnvironment: { PATH: '/controlled/path' },
      runPagesBuild: runner,
      attestSourceAfterBuild: () => sourceCommit,
    })).toThrow(/ACTIVATION_ARTIFACT_DIRECTORY_INVALID/);
    expect(readFileSync(externalSentinel, 'utf8'))
      .toBe('preserve symlink target');
    expect(runner).not.toHaveBeenCalled();
  });

  it('rejects unknown receipt fields before any private file can be written', () => {
    const root = temporaryRoot();
    const repositoryRoot = join(root, 'repository');
    const receiptDirectory = join(root, 'private-receipts');
    mkdirSync(repositoryRoot, { mode: 0o700 });
    const unsafeRecord = {
      command: 'inspect',
      outcome: 'inspected',
      submitted: false,
      before: {
        ...status(),
        token: 'controlled-test-only-value',
      },
      after: status(),
    } as unknown as WorkerRolloutExecutionRecord;
    expect(() => writePrivateWorkerRolloutReceipt({
      directory: receiptDirectory,
      repositoryRoot,
      record: unsafeRecord,
    })).toThrow(/RECEIPT_STATUS_INVALID/);
  });

  it('enforces one owner-local process through the private receipt lock', async () => {
    const root = temporaryRoot();
    const repositoryRoot = join(root, 'repository');
    const receiptDirectory = join(root, 'private-receipts');
    mkdirSync(repositoryRoot, { mode: 0o700 });
    await withWorkerRolloutOperatorLock(
      receiptDirectory,
      repositoryRoot,
      async () => {
        await expect(withWorkerRolloutOperatorLock(
          receiptDirectory,
          repositoryRoot,
          async () => undefined,
        )).rejects.toThrow(/ALREADY_RUNNING/);
      },
    );
  });
});
