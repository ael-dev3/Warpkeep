import {
  chmodSync,
  linkSync,
  mkdtempSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  assertGenesis001FrozenFinalReceipt,
  assertFrozenDescriptorPreservesBaseline,
  assertGenesis001BaselineDescriptor,
  attestPrivateGenesis001Artifact,
  descriptorDigest,
  exactFrozenReceipt,
  GENESIS001_LEGACY_COUNTS,
  GENESIS001_PRODUCTION_TARGET,
  Genesis001PublishManualStopError,
  type Genesis001LiveSnapshot,
  publishArguments,
  publishGenesis001Frozen,
  sanitizeGenesis001ChildEnvironment,
} from '../scripts/genesis001-frozen-publisher-core';
import {
  G001_BASELINE,
  G001_BASELINE_ABI_SHA256,
  G001_FREEZE_NONCE,
} from '../scripts/genesis001-frozen-materializer.mjs';

const roots: string[] = [];

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

type MutableRecord = Record<string, unknown>;

function clone<T>(value: T): T {
  return structuredClone(value);
}

function descriptor(includeFrozenPolicy = false) {
  const types = [
    {
      Product: {
        elements: [{ name: { some: 'value' }, algebraic_type: { U64: [] } }],
      },
    },
    {
      Product: {
        elements: [{ name: { some: 'argument' }, algebraic_type: { Ref: 0 } }],
      },
    },
    ...(includeFrozenPolicy
      ? [{
          Product: {
            elements: [
              { name: { some: 'realm_id' }, algebraic_type: { String: [] } },
              { name: { some: 'freeze_release_nonce' }, algebraic_type: { String: [] } },
            ],
          },
        }]
      : []),
  ];
  return {
    typespace: { types },
    tables: Array.from({ length: GENESIS001_LEGACY_COUNTS.tables }, (_, index) => ({
      name: `legacy_table_${index.toString().padStart(2, '0')}`,
      product_type_ref: 0,
      table_access: { Public: [] },
      indexes: [],
      constraints: [],
      sequences: [],
    })),
    reducers: Array.from({ length: GENESIS001_LEGACY_COUNTS.reducers }, (_, index) => ({
      name: `legacy_reducer_${index.toString().padStart(2, '0')}`,
      params: { Ref: 1 },
      lifecycle: null,
    })),
    misc_exports: [
      ...Array.from({ length: GENESIS001_LEGACY_COUNTS.procedures }, (_, index) => ({
        Procedure: {
          name: `legacy_procedure_${index.toString().padStart(2, '0')}`,
          params: { Ref: 1 },
          return_type: { Ref: 0 },
        },
      })),
      ...(includeFrozenPolicy
        ? [{
            Procedure: {
              name: 'genesis_001_access_policy_v1',
              params: { Ref: 1 },
              return_type: { Ref: 2 },
            },
          }]
        : []),
    ],
    row_level_security: [{ sql: 'SELECT * FROM legacy_table_00' }],
  };
}

function frozenReceipt() {
  return Object.freeze({
    realmId: 'GENESIS_001',
    releaseVersion: '0.3.43',
    playerAccessEnabled: true,
    admissionStateMutationsEnabled: false,
    accessRequestSubmissionsEnabled: false,
    sourceBaselineCommit: G001_BASELINE,
    freezeReleaseNonce: G001_FREEZE_NONCE,
  });
}

function liveSnapshot(value: ReturnType<typeof descriptor>): Genesis001LiveSnapshot {
  return Object.freeze({
    uri: GENESIS001_PRODUCTION_TARGET.uri,
    databaseIdentity: GENESIS001_PRODUCTION_TARGET.database,
    descriptor: value,
  });
}

describe('Genesis 001 target-locked publisher contract', () => {
  it('locks the exact production identity and uses the JavaScript artifact without deletion', () => {
    const args = publishArguments('/private/tmp/private-module.js');
    expect(GENESIS001_PRODUCTION_TARGET).toEqual({
      uri: 'https://maincloud.spacetimedb.com',
      database: 'c2001f161d44e50c0a75356d79a4d10fa4a9d77ea4eddd56cda7ac6af50b570e',
    });
    expect(args).toEqual([
      'publish',
      '--server', 'https://maincloud.spacetimedb.com',
      '--js-path', '/private/tmp/private-module.js',
      '--delete-data=never',
      '--yes=remote,skip-login',
      'c2001f161d44e50c0a75356d79a4d10fa4a9d77ea4eddd56cda7ac6af50b570e',
    ]);
    expect(args).not.toContain('--bin-path');
    expect(args).not.toContain('--break-clients');
  });

  it('requires the exact source-bound policy receipt and rejects extra fields', () => {
    const receipt = frozenReceipt();
    expect(exactFrozenReceipt(receipt)).toBe(true);
    expect(exactFrozenReceipt({ ...receipt, freezeReleaseNonce: '0'.repeat(64) })).toBe(false);
    expect(exactFrozenReceipt({ ...receipt, extra: true })).toBe(false);
  });

  it('compares every legacy ABI surface through nested referenced types', () => {
    const baseline = descriptor();
    const candidate = descriptor(true);
    expect(() => assertFrozenDescriptorPreservesBaseline(baseline, candidate)).not.toThrow();

    const changedTable = clone(candidate);
    ((changedTable.typespace.types[0] as MutableRecord).Product as MutableRecord).elements = [
      { name: { some: 'value' }, algebraic_type: { String: [] } },
    ];
    expect(() => assertFrozenDescriptorPreservesBaseline(baseline, changedTable))
      .toThrow(/table ABI changed/i);

    const changedReducer = clone(candidate);
    (changedReducer.reducers[0] as MutableRecord).params = { U64: [] };
    expect(() => assertFrozenDescriptorPreservesBaseline(baseline, changedReducer))
      .toThrow(/reducer ABI changed/i);

    const changedProcedure = clone(candidate);
    const procedure = changedProcedure.misc_exports[0]!.Procedure as MutableRecord;
    procedure.return_type = { String: [] };
    expect(() => assertFrozenDescriptorPreservesBaseline(baseline, changedProcedure))
      .toThrow(/legacy procedure ABI changed/i);

    const changedRls = clone(candidate);
    changedRls.row_level_security = [];
    expect(() => assertFrozenDescriptorPreservesBaseline(baseline, changedRls))
      .toThrow(/row-level security ABI changed/i);
  });

  it('requires exact baseline counts and a source-bound canonical digest', () => {
    const baseline = descriptor();
    const digest = descriptorDigest(baseline);
    expect(() => assertGenesis001BaselineDescriptor(baseline, digest)).not.toThrow();
    expect(() => assertGenesis001BaselineDescriptor({ ...baseline, reducers: [] }, digest))
      .toThrow(/baseline ABI/i);
    expect(() => assertGenesis001BaselineDescriptor(baseline, '0'.repeat(64)))
      .toThrow(/baseline ABI/i);
  });

  it('scrubs credentials, release inputs, and ambient runtime injection from child processes', () => {
    expect(sanitizeGenesis001ChildEnvironment({
      PATH: '/usr/bin:/bin',
      HOME: '/private/test-home',
      TMPDIR: '/private/test-tmp',
      LANG: 'C',
      LC_ALL: 'C',
      WARPKEEP_ADMIN_TOKEN_SECRET: 'MUST_NOT_PASS',
      WARPKEEP_ADMIN_TOKEN_SECRET_PATH: '/private/secret',
      SPACETIME_TOKEN: 'MUST_NOT_PASS',
      NODE_OPTIONS: '--require=/tmp/inject.js',
      GH_TOKEN: 'MUST_NOT_PASS',
    })).toEqual({
      HOME: '/private/test-home',
      LANG: 'C',
      LC_ALL: 'C',
      PATH: '/usr/bin:/bin',
      TMPDIR: '/private/test-tmp',
    });
  });

  it('holds and reattests one owner-private regular artifact by descriptor and pathname', () => {
    const root = mkdtempSync(join(tmpdir(), 'g001-artifact-'));
    roots.push(root);
    chmodSync(root, 0o700);
    const path = join(root, 'bundle.js');
    writeFileSync(path, 'exact frozen artifact\n', { mode: 0o600, flag: 'wx' });

    const artifact = attestPrivateGenesis001Artifact(path);
    try {
      expect(artifact.path).toBe(path);
      expect(artifact.mode).toBe('600');
      expect(artifact.nlink).toBe('1');
      expect(artifact.sha256).toMatch(/^[0-9a-f]{64}$/);
      expect(() => artifact.verify()).not.toThrow();

      chmodSync(path, 0o644);
      expect(() => artifact.verify()).toThrow(/artifact.*changed/i);
    } finally {
      artifact.close();
    }
  });

  it('rejects symlinked and hard-linked artifacts before publication', () => {
    const root = mkdtempSync(join(tmpdir(), 'g001-artifact-links-'));
    roots.push(root);
    chmodSync(root, 0o700);
    const path = join(root, 'bundle.js');
    writeFileSync(path, 'exact frozen artifact\n', { mode: 0o600, flag: 'wx' });
    const linked = join(root, 'linked.js');
    linkSync(path, linked);
    expect(() => attestPrivateGenesis001Artifact(path)).toThrow(/artifact.*invalid/i);
    rmSync(linked);
    const symlink = join(root, 'symlink.js');
    symlinkSync(path, symlink);
    expect(() => attestPrivateGenesis001Artifact(symlink)).toThrow(/artifact.*invalid/i);
  });
});

describe('Genesis 001 one-shot publish orchestration', () => {
  function harness(input: Readonly<{
    cleanupError?: Error;
    completionError?: Error;
    postSnapshot?: ReturnType<typeof liveSnapshot>;
    postPolicy?: unknown;
    postPolicyError?: Error;
    sourceCommits?: readonly string[];
  }> = {}) {
    const events: string[] = [];
    const baseline = descriptor();
    const candidate = descriptor(true);
    const sourceCommits = [...(input.sourceCommits ?? [
      'a'.repeat(40),
      'a'.repeat(40),
      'a'.repeat(40),
    ])];
    let liveRead = 0;
    const artifact = Object.freeze({
      path: '/private/g001/bundle.js',
      sha256: 'b'.repeat(64),
      builtDescriptor: candidate,
      builtPolicy: frozenReceipt(),
      verify: vi.fn(() => { events.push('artifact-verify'); }),
      close: vi.fn(() => { events.push('artifact-close'); }),
      cleanup: vi.fn(() => { events.push('artifact-cleanup'); }),
    });
    const authority = Object.freeze({
      preparePostflight: vi.fn(async () => { events.push('authority-prepare-postflight'); }),
      readPolicyFresh: vi.fn(async () => {
        events.push('policy-postflight');
        if (input.postPolicyError !== undefined) throw input.postPolicyError;
        return input.postPolicy ?? frozenReceipt();
      }),
      close: vi.fn(async () => { events.push('authority-close'); }),
    });
    const supervisor = Object.freeze({
      release: vi.fn(async () => { events.push('supervisor-release'); }),
      completion: vi.fn(async () => {
        events.push('supervisor-completion');
        if (input.completionError !== undefined) throw input.completionError;
      }),
      cleanup: vi.fn(async () => {
        events.push('supervisor-cleanup');
        if (input.cleanupError !== undefined) throw input.cleanupError;
      }),
    });
    const dependencies = Object.freeze({
      verifyProtectedCurrentMain: vi.fn(async () => {
        events.push('protected-main');
        const next = sourceCommits.shift();
        if (next === undefined) throw new Error('unexpected protected-main check');
        return next;
      }),
      readLiveSnapshot: vi.fn(async () => {
        liveRead += 1;
        events.push(liveRead === 1 ? 'live-preflight' : 'live-postflight');
        return liveRead === 1
          ? liveSnapshot(baseline)
          : (input.postSnapshot ?? liveSnapshot(candidate));
      }),
      verifyExactBaseline: vi.fn((value: unknown) => {
        events.push('baseline-verified');
        expect(value).toEqual(baseline);
      }),
      buildImmutableArtifact: vi.fn(async () => {
        events.push('artifact-build');
        return artifact;
      }),
      acquirePublishAuthority: vi.fn(async () => {
        events.push('authority-acquire');
        return authority;
      }),
      prepareSupervisedPublish: vi.fn(async (arguments_: readonly string[]) => {
        events.push('supervisor-prepare');
        expect(arguments_).toEqual(publishArguments(artifact.path));
        return supervisor;
      }),
      persistFinalReceipt: vi.fn(async (receipt: unknown) => {
        events.push('receipt-persist');
        assertGenesis001FrozenFinalReceipt(receipt);
        return Object.freeze({
          receiptBasename: 'genesis-001-freeze-publish-00000000-0000-4000-8000-000000000001.json',
          receiptSha256: 'd'.repeat(64),
        });
      }),
    });
    return { events, baseline, candidate, artifact, authority, supervisor, dependencies };
  }

  it('keeps all credentials behind build/ABI gates and releases one supervised publish', async () => {
    const state = harness();
    await expect(publishGenesis001Frozen(state.dependencies)).resolves.toEqual({
      receiptBasename: 'genesis-001-freeze-publish-00000000-0000-4000-8000-000000000001.json',
      receiptSha256: 'd'.repeat(64),
    });
    expect(state.events).toEqual([
      'protected-main',
      'live-preflight',
      'baseline-verified',
      'artifact-build',
      'artifact-verify',
      'protected-main',
      'authority-acquire',
      'authority-prepare-postflight',
      'supervisor-prepare',
      'artifact-verify',
      'protected-main',
      'artifact-verify',
      'supervisor-release',
      'supervisor-completion',
      'live-postflight',
      'policy-postflight',
      'artifact-verify',
      'receipt-persist',
      'supervisor-cleanup',
      'authority-close',
      'artifact-close',
      'artifact-cleanup',
    ]);
    expect(state.dependencies.acquirePublishAuthority).toHaveBeenCalledTimes(1);
    expect(state.dependencies.prepareSupervisedPublish).toHaveBeenCalledTimes(1);
    expect(state.supervisor.release).toHaveBeenCalledTimes(1);
    expect(state.dependencies.persistFinalReceipt).toHaveBeenCalledWith({
      schemaVersion: 1,
      profile: 'warpkeep-genesis-001-freeze-publish-final-receipt-v1',
      outcome: 'published',
      target: GENESIS001_PRODUCTION_TARGET,
      protectedMainCommit: 'a'.repeat(40),
      sourceBaselineCommit: G001_BASELINE,
      baselineAbiSha256: G001_BASELINE_ABI_SHA256,
      freezeReleaseNonce: G001_FREEZE_NONCE,
      artifactSha256: 'b'.repeat(64),
      candidateDescriptorSha256: descriptorDigest(state.candidate),
      postflightDescriptorSha256: descriptorDigest(state.candidate),
      livePolicyReceipt: frozenReceipt(),
      livePolicyReceiptSha256: descriptorDigest(frozenReceipt()),
    });
  });

  it('reconciles an outcome-ambiguous child failure only from a fresh exact identity/ABI/policy read', async () => {
    const state = harness({ completionError: new Error('connection dropped after submit') });
    await expect(publishGenesis001Frozen(state.dependencies)).resolves.toEqual({
      receiptBasename: 'genesis-001-freeze-publish-00000000-0000-4000-8000-000000000001.json',
      receiptSha256: 'd'.repeat(64),
    });
    expect(state.supervisor.release).toHaveBeenCalledTimes(1);
    expect(state.dependencies.prepareSupervisedPublish).toHaveBeenCalledTimes(1);
    expect(state.dependencies.readLiveSnapshot).toHaveBeenCalledTimes(2);
    expect(state.authority.readPolicyFresh).toHaveBeenCalledTimes(1);
    expect(state.dependencies.persistFinalReceipt).toHaveBeenCalledWith(
      expect.objectContaining({ outcome: 'reconciled' }),
    );
  });

  it('never reconciles a child process-group containment failure as success', async () => {
    const containment = Object.assign(new Error('process group remains live'), {
      nonReconcilable: true,
    });
    const state = harness({ completionError: containment });
    const error = await publishGenesis001Frozen(state.dependencies).catch(value => value);
    expect(error).toBeInstanceOf(Genesis001PublishManualStopError);
    expect(error.code).toBe(
      'GENESIS_001_PUBLISH_OUTCOME_AMBIGUOUS_MANUAL_RECONCILIATION_REQUIRED',
    );
    expect(state.dependencies.persistFinalReceipt).not.toHaveBeenCalled();
    expect(state.artifact.cleanup).not.toHaveBeenCalled();
  });

  it('classifies containment as ambiguous even when the database still has the baseline', async () => {
    const containment = Object.assign(new Error('process group remains live'), {
      nonReconcilable: true,
    });
    const state = harness({
      completionError: containment,
      postSnapshot: liveSnapshot(descriptor()),
      postPolicyError: new Error('procedure unavailable'),
    });
    const error = await publishGenesis001Frozen(state.dependencies).catch(value => value);
    expect(error).toBeInstanceOf(Genesis001PublishManualStopError);
    expect(error.code).toBe(
      'GENESIS_001_PUBLISH_OUTCOME_AMBIGUOUS_MANUAL_RECONCILIATION_REQUIRED',
    );
    expect(state.dependencies.persistFinalReceipt).not.toHaveBeenCalled();
  });

  it('manual-stops and retains the artifact if postflight cleanup containment fails', async () => {
    const cleanupError = Object.assign(new Error('cleanup group remains live'), {
      nonReconcilable: true,
    });
    const state = harness({ cleanupError });
    const error = await publishGenesis001Frozen(state.dependencies).catch(value => value);
    expect(error).toBeInstanceOf(Genesis001PublishManualStopError);
    expect(error.code).toBe(
      'GENESIS_001_PUBLISH_OUTCOME_AMBIGUOUS_MANUAL_RECONCILIATION_REQUIRED',
    );
    expect(state.dependencies.persistFinalReceipt).toHaveBeenCalledTimes(1);
    expect(state.artifact.cleanup).not.toHaveBeenCalled();
  });

  it('persists no success receipt for an ambiguous or absent outcome', async () => {
    const state = harness({
      completionError: new Error('connection dropped'),
      postSnapshot: liveSnapshot(descriptor()),
      postPolicyError: new Error('procedure unavailable'),
    });
    await expect(publishGenesis001Frozen(state.dependencies)).rejects
      .toBeInstanceOf(Genesis001PublishManualStopError);
    expect(state.dependencies.persistFinalReceipt).not.toHaveBeenCalled();
  });

  it('manual-stops and retains recovery state if the exact success receipt cannot be persisted', async () => {
    const state = harness();
    state.dependencies.persistFinalReceipt.mockRejectedValueOnce(new Error('disk unavailable'));
    const error = await publishGenesis001Frozen(state.dependencies).catch(value => value);
    expect(error).toBeInstanceOf(Genesis001PublishManualStopError);
    expect(error.code).toBe(
      'GENESIS_001_PUBLISH_RECEIPT_PERSISTENCE_MANUAL_RECONCILIATION_REQUIRED',
    );
    expect(error.artifactPath).toBe(state.artifact.path);
    expect(state.artifact.cleanup).not.toHaveBeenCalled();
    expect(state.artifact.close).toHaveBeenCalledTimes(1);
  });

  it('manual-stops an unchanged postflight and never retries a possibly absent publish', async () => {
    const state = harness({
      completionError: new Error('connection dropped'),
      postSnapshot: liveSnapshot(descriptor()),
      postPolicyError: new Error('procedure unavailable'),
    });
    const error = await publishGenesis001Frozen(state.dependencies).catch(value => value);
    expect(error).toBeInstanceOf(Genesis001PublishManualStopError);
    expect(error.code).toBe('GENESIS_001_PUBLISH_OUTCOME_ABSENT_MANUAL_RETRY_REQUIRED');
    expect(error.artifactPath).toBe(state.artifact.path);
    expect(state.dependencies.prepareSupervisedPublish).toHaveBeenCalledTimes(1);
    expect(state.supervisor.release).toHaveBeenCalledTimes(1);
    expect(state.artifact.cleanup).not.toHaveBeenCalled();
    expect(state.artifact.close).toHaveBeenCalledTimes(1);
  });

  it('manual-stops wrong-target or drifted postflight state and retains the exact artifact', async () => {
    const wrongTarget = liveSnapshot(descriptor(true));
    const state = harness({
      completionError: new Error('connection dropped'),
      postSnapshot: { ...wrongTarget, databaseIdentity: 'f'.repeat(64) },
    });
    const error = await publishGenesis001Frozen(state.dependencies).catch(value => value);
    expect(error).toBeInstanceOf(Genesis001PublishManualStopError);
    expect(error.code).toBe(
      'GENESIS_001_PUBLISH_OUTCOME_AMBIGUOUS_MANUAL_RECONCILIATION_REQUIRED',
    );
    expect(state.dependencies.prepareSupervisedPublish).toHaveBeenCalledTimes(1);
    expect(state.artifact.cleanup).not.toHaveBeenCalled();
  });

  it('fails closed before credentials when protected main advances during preparation', async () => {
    const state = harness({ sourceCommits: ['a'.repeat(40), 'c'.repeat(40)] });
    await expect(publishGenesis001Frozen(state.dependencies))
      .rejects.toThrow(/protected main advanced/i);
    expect(state.dependencies.acquirePublishAuthority).not.toHaveBeenCalled();
    expect(state.dependencies.prepareSupervisedPublish).not.toHaveBeenCalled();
    expect(state.artifact.cleanup).toHaveBeenCalledTimes(1);
  });

  it('fails closed before release when protected main advances at the final gate', async () => {
    const state = harness({
      sourceCommits: ['a'.repeat(40), 'a'.repeat(40), 'c'.repeat(40)],
    });
    await expect(publishGenesis001Frozen(state.dependencies))
      .rejects.toThrow(/protected main advanced/i);
    expect(state.supervisor.release).not.toHaveBeenCalled();
    expect(state.artifact.cleanup).toHaveBeenCalledTimes(1);
  });
});
