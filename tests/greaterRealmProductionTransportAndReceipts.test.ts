// @vitest-environment node

import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  chmodSync,
  closeSync,
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  openSync,
  readFileSync,
  realpathSync,
  readdirSync,
  rmSync,
  symlinkSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  inspectGreaterRealmCutoverOperatorLock,
  inspectGreaterRealmCutoverOperatorJournalRecovery,
  recoverGreaterRealmCutoverOperatorLock,
  withGreaterRealmCutoverOperatorLock,
  writePrivateGreaterRealmCutoverReceipt,
} from '../scripts/greater-realm-cutover-receipts';
import {
  bindGreaterRealmProductionStatusTransport,
  createGreaterRealmAdminTransportSession,
  createGreaterRealmFreshAdminTransport,
  GREATER_REALM_PRODUCTION_TRANSPORT_TARGET,
  readGreaterRealmProductionAdminSecret,
  requireGreaterRealmProductionTransportTarget,
} from '../scripts/greater-realm-production-transport';
import { runGreaterRealmTrustedGit } from '../scripts/atlas/greater-realm-git';
import {
  cleanupGreaterRealmProductionCommitMaterialization,
  attestGreaterRealmProductionAppendApprovalOnlyDelta,
  attestGreaterRealmProductionGateOnlyDelta,
  attestGreaterRealmProductionSourceAncestry,
  greaterRealmProductionProvenanceTestSeams,
  resolveGreaterRealmProductionCommitTreeId,
} from '../scripts/greater-realm-production-provenance';
import {
  cleanupGreaterRealmRetainedImmutableArtifact,
  greaterRealmImmutableArtifactTestSeams,
  runGreaterRealmImmutableMigrationProof,
} from '../scripts/greater-realm-production-immutable-artifact';

const temporaryDirectories: string[] = [];

function temporaryDirectory(prefix: string): string {
  const directory = mkdtempSync(join(realpathSync(tmpdir()), prefix));
  chmodSync(directory, 0o700);
  temporaryDirectories.push(directory);
  return directory;
}

afterEach(() => {
  vi.restoreAllMocks();
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

function trustedGit(repositoryRoot: string, arguments_: readonly string[]): string {
  const result = runGreaterRealmTrustedGit(
    arguments_,
    repositoryRoot,
  );
  if (result.error !== undefined || result.status !== 0) {
    throw new Error('GREATER_REALM_TEST_COMMIT_UNAVAILABLE');
  }
  normalizeTrustedGitFixture(repositoryRoot);
  if (arguments_[0] === 'worktree' && arguments_[1] === 'add') {
    const linkedRoot = arguments_.at(-2);
    if (linkedRoot === undefined) throw new Error('GREATER_REALM_TEST_WORKTREE_UNAVAILABLE');
    normalizeTrustedGitFixture(linkedRoot);
  }
  return result.stdout.trim();
}

function normalizeTrustedGitFixture(repositoryRoot: string): void {
  const root = realpathSync(repositoryRoot);
  chmodSync(root, 0o700);
  const dotGit = join(root, '.git');
  if (!existsSync(dotGit)) return;
  const dotGitStatus = lstatSync(dotGit);
  let gitDirectory: string;
  if (dotGitStatus.isDirectory()) {
    gitDirectory = realpathSync(dotGit);
  } else if (dotGitStatus.isFile()) {
    chmodSync(dotGit, 0o600);
    const match = readFileSync(dotGit, 'utf8').match(/^gitdir: (\/[^\0\r\n]+)\n?$/u);
    if (match?.[1] === undefined) throw new Error('GREATER_REALM_TEST_GITDIR_UNAVAILABLE');
    gitDirectory = realpathSync(match[1]);
  } else {
    throw new Error('GREATER_REALM_TEST_GITDIR_UNAVAILABLE');
  }
  const commonPointer = join(gitDirectory, 'commondir');
  let commonDirectory = gitDirectory;
  if (existsSync(commonPointer)) {
    chmodSync(commonPointer, 0o600);
    commonDirectory = realpathSync(resolve(gitDirectory, readFileSync(commonPointer, 'utf8').trim()));
  }
  for (const directory of [
    gitDirectory,
    commonDirectory,
    join(commonDirectory, 'info'),
    join(commonDirectory, 'objects', 'info'),
  ]) {
    if (existsSync(directory)) chmodSync(directory, 0o700);
  }
  for (const contextFile of [
    join(commonDirectory, 'config'),
    join(gitDirectory, 'config.worktree'),
    join(commonDirectory, 'info', 'exclude'),
  ]) {
    if (existsSync(contextFile)) chmodSync(contextFile, 0o600);
  }
}

function trustedCommit(reference: string, repositoryRoot = process.cwd()): string {
  return trustedGit(repositoryRoot, ['rev-parse', '--verify', `${reference}^{commit}`]);
}

const TEST_TOKEN_BUDGET = Object.freeze({
  reserve: async (slots: number) => Object.freeze({
    reservationId: 'a'.repeat(32),
    remaining: slots,
  }),
  ensure: async (reservationId: string, minimumRemaining: number) => Object.freeze({
    reservationId,
    remaining: minimumRemaining,
  }),
  release: async (reservationId: string) => Object.freeze({
    reservationId,
    released: 0,
  }),
});

function testOperatorAuthority(parent: string) {
  const receiptDirectory = join(parent, 'receipts');
  mkdirSync(receiptDirectory, { mode: 0o700 });
  const identity = lstatSync(receiptDirectory);
  return Object.freeze({
    receiptDirectory,
    lockIdentity: Object.freeze({
      lockId: 'e'.repeat(32),
      pid: process.pid,
      processStartIdentity: 'test-process-start',
      createdAtMs: 0,
      expiresAtMs: 1,
      dev: identity.dev,
      ino: identity.ino,
    }),
  });
}

describe('Greater Realm atlas/module source ancestry', () => {
  it('builds the published artifact from an immutable commit materialization', () => {
    const parent = temporaryDirectory('warpkeep-gr-immutable-artifact-');
    const repositoryRoot = join(parent, 'repository');
    const materializationParent = join(parent, 'private-state');
    mkdirSync(repositoryRoot, { mode: 0o700 });
    mkdirSync(materializationParent, { mode: 0o700 });
    mkdirSync(join(repositoryRoot, 'spacetimedb'), { mode: 0o700 });
    writeFileSync(join(repositoryRoot, 'source.txt'), 'committed-source\n', { mode: 0o600 });
    writeFileSync(join(repositoryRoot, 'package-lock.json'), JSON.stringify({
      lockfileVersion: 3, packages: {},
    }), { mode: 0o600 });
    trustedGit(repositoryRoot, ['init', '--quiet']);
    trustedGit(repositoryRoot, ['add', '.']);
    trustedGit(repositoryRoot, [
      '-c', 'user.name=Warpkeep Test',
      '-c', 'user.email=warpkeep-test@example.invalid',
      'commit', '--quiet', '-m', 'immutable source',
    ]);
    const moduleSourceCommit = trustedCommit('HEAD', repositoryRoot);
    const digest = 'd'.repeat(64);
    const operatorAuthority = testOperatorAuthority(parent);
    const proof = runGreaterRealmImmutableMigrationProof({
      repositoryRoot,
      moduleSourceCommit,
      executable: '/test-only/spacetime',
      materializationParent,
      operatorAuthority,
      testOnlyInstallDependencies: root => {
        mkdirSync(join(root, 'spacetimedb', 'node_modules'), { recursive: true, mode: 0o700 });
        writeFileSync(
          join(root, 'spacetimedb', 'node_modules', 'closure.txt'),
          'locked\n',
          { mode: 0o600 },
        );
        return digest;
      },
      testOnlyRunProof: root => {
        const committed = readFileSync(join(root, 'source.txt'));
        writeFileSync(join(repositoryRoot, 'source.txt'), 'hostile-transient-source\n');
        mkdirSync(join(root, 'spacetimedb', 'dist'), { recursive: true, mode: 0o700 });
        writeFileSync(join(root, 'spacetimedb', 'dist', 'bundle.js'), committed, { mode: 0o600 });
        writeFileSync(join(repositoryRoot, 'source.txt'), 'committed-source\n');
        return 'test-only-proof';
      },
      testOnlyParseProof: (_output, artifactPath) => {
        return Object.freeze({
          artifactPath,
          v11TableSchemaDigest: digest,
          v12TableSchemaDigest: digest,
          v13TableSchemaDigest: digest,
          v14TableSchemaDigest: digest,
          v15TableSchemaDigest: digest,
          v16TableSchemaDigest: digest,
          v17TableSchemaDigest: digest,
          currentCandidateTableSchemaDigest: digest,
          artifactDigest: createHash('sha256').update(readFileSync(artifactPath)).digest('hex'),
        });
      },
    });
    expect(proof).toMatchObject({ moduleSourceCommit, dependencyClosureDigest: digest });
    expect(readFileSync(proof.artifactReceipt.artifactPath, 'utf8')).toBe('committed-source\n');
    expect(readFileSync(join(repositoryRoot, 'source.txt'), 'utf8')).toBe('committed-source\n');
    const intentParent = join(materializationParent, 'immutable-publish-materializations');
    const intentPath = join(intentParent, readdirSync(intentParent).find(name => (
      name.startsWith('.greater-realm-immutable-build-') && name.endsWith('.json')
    ))!);
    expect(JSON.parse(readFileSync(intentPath, 'utf8')).phase).toBe('artifact-ready');
    proof.adoptJournalRetention({
      lockIdentity: operatorAuthority.lockIdentity,
      groupDigest: '9'.repeat(64),
    });
    expect(JSON.parse(readFileSync(intentPath, 'utf8'))).toMatchObject({
      phase: 'journal-adopted',
      journalGroupDigest: '9'.repeat(64),
    });
    expect(() => cleanupGreaterRealmRetainedImmutableArtifact({
      repositoryRoot,
      record: proof.retentionRecord,
      testOnlyAfterArtifactUnlink: () => { throw new Error('INJECTED_AFTER_ARTIFACT_UNLINK'); },
    })).toThrowError('INJECTED_AFTER_ARTIFACT_UNLINK');
    expect(() => cleanupGreaterRealmRetainedImmutableArtifact({
      repositoryRoot,
      record: proof.retentionRecord,
      testOnlyAfterTreeRemoved: () => { throw new Error('INJECTED_AFTER_TREE_REMOVED'); },
    })).toThrowError('INJECTED_AFTER_TREE_REMOVED');
    proof.cleanup();
    expect(existsSync(proof.artifactReceipt.artifactPath)).toBe(false);
    expect(existsSync(intentPath)).toBe(false);

    const orphan = runGreaterRealmImmutableMigrationProof({
      repositoryRoot,
      moduleSourceCommit,
      executable: '/test-only/spacetime',
      materializationParent,
      operatorAuthority,
      testOnlyInstallDependencies: root => {
        mkdirSync(join(root, 'spacetimedb', 'node_modules'), { recursive: true, mode: 0o700 });
        writeFileSync(join(root, 'spacetimedb', 'node_modules', 'closure.txt'), 'locked\n', {
          mode: 0o600,
        });
        return digest;
      },
      testOnlyRunProof: root => {
        mkdirSync(join(root, 'spacetimedb', 'dist'), { recursive: true, mode: 0o700 });
        writeFileSync(join(root, 'spacetimedb', 'dist', 'bundle.js'), 'orphan\n', {
          mode: 0o600,
        });
        return 'orphan-proof';
      },
      testOnlyParseProof: (_output, artifactPath) => Object.freeze({
        artifactPath,
        v11TableSchemaDigest: digest,
        v12TableSchemaDigest: digest,
        v13TableSchemaDigest: digest,
        v14TableSchemaDigest: digest,
        v15TableSchemaDigest: digest,
        v16TableSchemaDigest: digest,
        v17TableSchemaDigest: digest,
        currentCandidateTableSchemaDigest: digest,
        artifactDigest: createHash('sha256').update(readFileSync(artifactPath)).digest('hex'),
      }),
    });
    const groupMarker = join(
      operatorAuthority.receiptDirectory,
      `.greater-realm-cutover-command-group-${operatorAuthority.lockIdentity.lockId}-00000001-started.json`,
    );
    writeFileSync(groupMarker, '{}\n', { mode: 0o600 });
    expect(() => greaterRealmImmutableArtifactTestSeams.recoverDeadBuildIntents({
      parent: intentParent,
      repositoryRoot,
      processIdentityProbe: () => Object.freeze({ state: 'absent' as const }),
    })).toThrow(/ARTIFACT_RECOVERY_REQUIRED/);
    expect(existsSync(orphan.artifactPath)).toBe(true);
    unlinkSync(groupMarker);
    greaterRealmImmutableArtifactTestSeams.recoverDeadBuildIntents({
      parent: intentParent,
      repositoryRoot,
      processIdentityProbe: () => Object.freeze({ state: 'absent' as const }),
    });
    expect(existsSync(orphan.artifactPath)).toBe(false);
    expect(readdirSync(intentParent).filter(name => name.includes('immutable-build'))).toEqual([]);
  });

  it('orders every retained-tree fsync boundary before artifact-ready publication', () => {
    const parent = temporaryDirectory('warpkeep-gr-immutable-durability-');
    const repositoryRoot = join(parent, 'repository');
    const materializationParent = join(parent, 'private-state');
    mkdirSync(join(repositoryRoot, 'spacetimedb', 'migration-fixtures', 'production-v1'), {
      recursive: true,
      mode: 0o700,
    });
    mkdirSync(materializationParent, { mode: 0o700 });
    writeFileSync(join(repositoryRoot, 'source.txt'), 'durable-source\n', { mode: 0o600 });
    writeFileSync(
      join(repositoryRoot, 'spacetimedb', 'migration-fixtures', 'production-v1', 'source.ts'),
      'export const fixture = true;\n',
      { mode: 0o600 },
    );
    writeFileSync(join(repositoryRoot, 'package-lock.json'), JSON.stringify({
      lockfileVersion: 3, packages: {},
    }), { mode: 0o600 });
    trustedGit(repositoryRoot, ['init', '--quiet']);
    trustedGit(repositoryRoot, ['add', '.']);
    trustedGit(repositoryRoot, [
      '-c', 'user.name=Warpkeep Test',
      '-c', 'user.email=warpkeep-test@example.invalid',
      'commit', '--quiet', '-m', 'durability fixture',
    ]);
    const moduleSourceCommit = trustedCommit('HEAD', repositoryRoot);
    const digest = 'd'.repeat(64);
    const operatorAuthority = testOperatorAuthority(parent);
    const durabilitySteps = [
      'artifact-durable',
      'generated-output-removals-durable',
      'dependency-removals-durable',
      'retained-tree-durable',
    ] as const;
    for (const injectedStep of durabilitySteps) {
      const observed: string[] = [];
      expect(() => runGreaterRealmImmutableMigrationProof({
        repositoryRoot,
        moduleSourceCommit,
        executable: '/test-only/spacetime',
        materializationParent,
        operatorAuthority,
        testOnlyInstallDependencies: root => {
          const modules = join(root, 'spacetimedb', 'node_modules');
          mkdirSync(modules, { recursive: true, mode: 0o700 });
          writeFileSync(join(modules, 'closure.txt'), 'locked\n', { mode: 0o600 });
          return digest;
        },
        testOnlyRunProof: root => {
          const mainDist = join(root, 'spacetimedb', 'dist');
          const fixtureDist = join(
            root,
            'spacetimedb',
            'migration-fixtures',
            'production-v1',
            'dist',
          );
          mkdirSync(mainDist, { recursive: true, mode: 0o700 });
          mkdirSync(fixtureDist, { recursive: true, mode: 0o700 });
          writeFileSync(join(mainDist, 'bundle.js'), 'durable-main\n', { mode: 0o600 });
          writeFileSync(join(fixtureDist, 'bundle.js'), 'durable-fixture\n', { mode: 0o600 });
          return 'durability-proof';
        },
        testOnlyParseProof: (_output, artifactPath) => Object.freeze({
          artifactPath,
          v11TableSchemaDigest: digest,
          v12TableSchemaDigest: digest,
          v13TableSchemaDigest: digest,
          v14TableSchemaDigest: digest,
          v15TableSchemaDigest: digest,
          v16TableSchemaDigest: digest,
          v17TableSchemaDigest: digest,
          currentCandidateTableSchemaDigest: digest,
          artifactDigest: createHash('sha256').update(readFileSync(artifactPath)).digest('hex'),
        }),
        testOnlyDurabilityStep: step => {
          observed.push(step);
          const intentParent = join(
            materializationParent,
            'immutable-publish-materializations',
          );
          const intentName = readdirSync(intentParent).find(name => (
            name.startsWith('.greater-realm-immutable-build-') && name.endsWith('.json')
          ));
          expect(intentName).toBeDefined();
          const intent = JSON.parse(readFileSync(join(intentParent, intentName!), 'utf8'));
          expect(intent.phase).toBe('building');
          if (step === 'generated-output-removals-durable') {
            expect(existsSync(join(
              intent.materializationRoot,
              'spacetimedb',
              'migration-fixtures',
              'production-v1',
              'dist',
            ))).toBe(false);
          }
          if (step === 'dependency-removals-durable') {
            expect(existsSync(join(
              intent.materializationRoot,
              'spacetimedb',
              'node_modules',
            ))).toBe(false);
          }
          if (step === injectedStep) throw new Error(`INJECTED_${step}`);
        },
      })).toThrow(`INJECTED_${injectedStep}`);
      expect(observed).toEqual(durabilitySteps.slice(
        0,
        durabilitySteps.indexOf(injectedStep) + 1,
      ));
      const intentParent = join(materializationParent, 'immutable-publish-materializations');
      expect(readdirSync(intentParent)).toEqual([]);
    }
  });

  it('resumably removes partial dependency and generated-output subtrees before retention', () => {
    const parent = temporaryDirectory('warpkeep-gr-immutable-partial-build-');
    const repositoryRoot = join(parent, 'repository');
    const materializationParent = join(parent, 'private-state');
    mkdirSync(repositoryRoot, { mode: 0o700 });
    mkdirSync(materializationParent, { mode: 0o700 });
    mkdirSync(join(repositoryRoot, 'spacetimedb'), { mode: 0o700 });
    writeFileSync(join(repositoryRoot, 'package-lock.json'), '{"lockfileVersion":3,"packages":{}}\n');
    trustedGit(repositoryRoot, ['init', '--quiet']);
    trustedGit(repositoryRoot, ['add', '.']);
    trustedGit(repositoryRoot, [
      '-c', 'user.name=Warpkeep Test',
      '-c', 'user.email=warpkeep-test@example.invalid',
      'commit', '--quiet', '-m', 'partial build cleanup',
    ]);
    const moduleSourceCommit = trustedCommit('HEAD', repositoryRoot);
    const operatorAuthority = testOperatorAuthority(parent);
    let failure: unknown;
    try {
      runGreaterRealmImmutableMigrationProof({
      repositoryRoot,
      moduleSourceCommit,
      executable: '/test-only/spacetime',
      materializationParent,
      operatorAuthority,
      testOnlyInstallDependencies: root => {
        const modules = join(root, 'spacetimedb', 'node_modules');
        mkdirSync(modules, { recursive: true, mode: 0o700 });
        writeFileSync(join(modules, 'partial.txt'), 'partial\n', { mode: 0o600 });
        return 'f'.repeat(64);
      },
      testOnlyRunProof: root => {
        const dist = join(root, 'spacetimedb', 'dist');
        mkdirSync(dist, { recursive: true, mode: 0o700 });
        writeFileSync(join(dist, '.partial-bundle.tmp'), 'partial\n', { mode: 0o600 });
        throw new Error('INJECTED_PROOF_CRASH');
      },
      });
    } catch (error) {
      failure = error;
    }
    expect(failure).toBeInstanceOf(Error);
    expect(String(failure)).toMatch(/INJECTED_PROOF_CRASH/);
    const intentParent = join(materializationParent, 'immutable-publish-materializations');
    expect(readdirSync(intentParent)).toEqual([]);
  });

  it('removes a partial expected tracked leaf only under allocated cleanup authority', () => {
    const parent = temporaryDirectory('warpkeep-gr-immutable-partial-blob-');
    const repositoryRoot = join(parent, 'repository');
    const destination = join(parent, 'materialization');
    mkdirSync(repositoryRoot, { mode: 0o700 });
    writeFileSync(join(repositoryRoot, 'source.txt'), 'complete tracked bytes\n', { mode: 0o644 });
    trustedGit(repositoryRoot, ['init', '--quiet']);
    trustedGit(repositoryRoot, ['add', '.']);
    trustedGit(repositoryRoot, [
      '-c', 'user.name=Warpkeep Test',
      '-c', 'user.email=warpkeep-test@example.invalid',
      'commit', '--quiet', '-m', 'partial blob cleanup',
    ]);
    const moduleSourceCommit = trustedCommit('HEAD', repositoryRoot);
    const moduleTreeId = resolveGreaterRealmProductionCommitTreeId({
      repositoryRoot,
      moduleSourceCommit,
    });
    mkdirSync(destination, { mode: 0o700 });
    writeFileSync(join(destination, 'source.txt'), 'partial', { mode: 0o644 });
    const identity = lstatSync(destination);
    expect(() => cleanupGreaterRealmProductionCommitMaterialization({
      repositoryRoot,
      moduleSourceCommit,
      moduleTreeId,
      destination,
      expectedRootIdentity: { dev: identity.dev, ino: identity.ino },
    })).toThrow(/TRACKED_FILE/);
    expect(() => cleanupGreaterRealmProductionCommitMaterialization({
      repositoryRoot,
      moduleSourceCommit,
      moduleTreeId,
      destination,
      expectedRootIdentity: { dev: identity.dev, ino: identity.ino },
      allowPartialTracked: true,
    })).not.toThrow();
    expect(existsSync(destination)).toBe(false);
  });

  it('rejects every extra untracked file in an immutable proof materialization', () => {
    const parent = temporaryDirectory('warpkeep-gr-immutable-hostile-');
    const repositoryRoot = join(parent, 'repository');
    const materializationParent = join(parent, 'private-state');
    mkdirSync(repositoryRoot, { mode: 0o700 });
    mkdirSync(materializationParent, { mode: 0o700 });
    mkdirSync(join(repositoryRoot, 'spacetimedb'), { mode: 0o700 });
    writeFileSync(join(repositoryRoot, 'package-lock.json'), '{"lockfileVersion":3,"packages":{}}\n');
    trustedGit(repositoryRoot, ['init', '--quiet']);
    trustedGit(repositoryRoot, ['add', '.']);
    trustedGit(repositoryRoot, [
      '-c', 'user.name=Warpkeep Test',
      '-c', 'user.email=warpkeep-test@example.invalid',
      'commit', '--quiet', '-m', 'immutable source',
    ]);
    const moduleSourceCommit = trustedCommit('HEAD', repositoryRoot);
    const operatorAuthority = testOperatorAuthority(parent);
    expect(() => runGreaterRealmImmutableMigrationProof({
      repositoryRoot,
      moduleSourceCommit,
      executable: '/test-only/spacetime',
      materializationParent,
      operatorAuthority,
      testOnlyInstallDependencies: root => {
        mkdirSync(join(root, 'spacetimedb', 'node_modules'), { recursive: true, mode: 0o700 });
        return 'd'.repeat(64);
      },
      testOnlyRunProof: root => {
        writeFileSync(join(root, 'hostile-extra.txt'), 'hostile\n');
        mkdirSync(join(root, 'spacetimedb', 'dist'), { recursive: true, mode: 0o700 });
        writeFileSync(join(root, 'spacetimedb', 'dist', 'bundle.js'), 'artifact\n');
        return 'test-only-proof';
      },
      testOnlyParseProof: () => { throw new Error('must-not-parse'); },
    })).toThrow(/MATERIALIZATION_UNTRACKED_FILE_REJECTED/);
  });

  it('binds a real linked worktree gitdir/common-dir and rejects a hostile gitdir file', () => {
    const parent = temporaryDirectory('warpkeep-gr-linked-worktree-');
    const primary = join(parent, 'primary');
    const linked = join(parent, 'linked');
    mkdirSync(primary, { mode: 0o700 });
    trustedGit(primary, ['init', '--quiet']);
    writeFileSync(join(primary, 'source.txt'), 'linked\n', { mode: 0o600 });
    trustedGit(primary, ['add', 'source.txt']);
    trustedGit(primary, [
      '-c', 'user.name=Warpkeep Test',
      '-c', 'user.email=warpkeep-test@example.invalid',
      'commit', '--quiet', '-m', 'linked source',
    ]);
    trustedGit(primary, ['worktree', 'add', '--quiet', '--detach', linked, 'HEAD']);
    const sourceCommit = trustedCommit('HEAD', linked);
    expect(() => attestGreaterRealmProductionSourceAncestry({
      repositoryRoot: linked,
      atlasSourceCommit: sourceCommit,
      moduleSourceCommit: sourceCommit,
    })).not.toThrow();

    const gitFile = join(linked, '.git');
    const original = readFileSync(gitFile);
    writeFileSync(gitFile, 'gitdir: ../primary/.git\n', { mode: 0o600 });
    expect(() => attestGreaterRealmProductionSourceAncestry({
      repositoryRoot: linked,
      atlasSourceCommit: sourceCommit,
      moduleSourceCommit: sourceCommit,
    })).toThrowError('GREATER_REALM_PRODUCTION_GIT_CONTEXT_INVALID');
    writeFileSync(gitFile, original, { mode: 0o600 });

    const commonConfig = join(primary, '.git', 'config');
    for (const mode of [0o640, 0o660]) {
      chmodSync(commonConfig, mode);
      expect(() => attestGreaterRealmProductionSourceAncestry({
        repositoryRoot: linked,
        atlasSourceCommit: sourceCommit,
        moduleSourceCommit: sourceCommit,
      })).toThrowError('GREATER_REALM_PRODUCTION_GIT_CONTEXT_INVALID');
    }
    chmodSync(commonConfig, 0o600);

    trustedGit(primary, ['config', '--local', 'url.https://attacker.invalid/.insteadOf',
      'https://github.com/']);
    expect(() => attestGreaterRealmProductionSourceAncestry({
      repositoryRoot: linked,
      atlasSourceCommit: sourceCommit,
      moduleSourceCommit: sourceCommit,
    })).toThrowError('GREATER_REALM_PRODUCTION_GIT_CONTEXT_INVALID');
  });

  it('attests clean exact main and its remote with trusted Git under hostile process controls', () => {
    const parent = temporaryDirectory('warpkeep-gr-protected-main-');
    const remote = join(parent, 'canonical.git');
    const repositoryRoot = join(parent, 'work');
    mkdirSync(repositoryRoot, { recursive: true, mode: 0o700 });
    trustedGit(parent, ['init', '--bare', '--quiet', remote]);
    trustedGit(repositoryRoot, ['init', '--quiet']);
    trustedGit(repositoryRoot, ['symbolic-ref', 'HEAD', 'refs/heads/main']);
    writeFileSync(join(repositoryRoot, 'source.txt'), 'exact\n', { mode: 0o644 });
    trustedGit(repositoryRoot, ['add', 'source.txt']);
    trustedGit(repositoryRoot, [
      '-c', 'user.name=Warpkeep Test',
      '-c', 'user.email=warpkeep-test@example.invalid',
      'commit', '--quiet', '-m', 'protected main',
    ]);
    trustedGit(repositoryRoot, ['remote', 'add', 'origin', remote]);
    trustedGit(repositoryRoot, ['push', '--quiet', 'origin', 'main:main']);
    const sourceCommit = trustedCommit('HEAD', repositoryRoot);
    const hostile = Object.freeze({
      PATH: '/private/tmp/hostile-git-path',
      GIT_CONFIG_GLOBAL: '/private/tmp/hostile-git-config',
      GIT_CONFIG_COUNT: '1',
      GIT_CONFIG_KEY_0: 'url.file:///private/tmp/hostile/.insteadOf',
      GIT_CONFIG_VALUE_0: remote,
      GIT_REPLACE_REF_BASE: 'refs/hostile-replacements',
      GIT_DIR: '/private/tmp/hostile-git-dir',
      GIT_OBJECT_DIRECTORY: '/private/tmp/hostile-git-objects',
    });
    const prior = Object.fromEntries(Object.keys(hostile).map(key => [key, process.env[key]]));
    try {
      Object.assign(process.env, hostile);
      expect(greaterRealmProductionProvenanceTestSeams.attestProtectedMainAgainstOrigin({
        repositoryRoot,
        expectedOriginUrl: remote,
      })).toBe(sourceCommit);
    } finally {
      for (const [key, value] of Object.entries(prior)) {
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
      }
    }

    const decoy = join(parent, 'decoy-worktree');
    mkdirSync(decoy, { mode: 0o700 });
    trustedGit(repositoryRoot, ['config', '--local', 'core.worktree', decoy]);
    expect(() => greaterRealmProductionProvenanceTestSeams.attestProtectedMainAgainstOrigin({
      repositoryRoot,
      expectedOriginUrl: remote,
    })).toThrowError('GREATER_REALM_PRODUCTION_GIT_CONTEXT_INVALID');
    trustedGit(repositoryRoot, ['config', '--local', '--unset', 'core.worktree']);
    trustedGit(repositoryRoot, ['config', '--local', 'http.proxy', 'http://127.0.0.1:9']);
    expect(() => greaterRealmProductionProvenanceTestSeams.attestProtectedMainAgainstOrigin({
      repositoryRoot,
      expectedOriginUrl: remote,
    })).toThrowError('GREATER_REALM_PRODUCTION_GIT_CONTEXT_INVALID');
    trustedGit(repositoryRoot, ['config', '--local', '--unset', 'http.proxy']);

    writeFileSync(join(repositoryRoot, 'untracked.txt'), 'dirty\n', { mode: 0o600 });
    expect(() => greaterRealmProductionProvenanceTestSeams.attestProtectedMainAgainstOrigin({
      repositoryRoot,
      expectedOriginUrl: remote,
    })).toThrowError('GREATER_REALM_PRODUCTION_PROTECTED_MAIN_MISMATCH');
    trustedGit(repositoryRoot, ['add', 'untracked.txt']);
    trustedGit(repositoryRoot, [
      '-c', 'user.name=Warpkeep Test',
      '-c', 'user.email=warpkeep-test@example.invalid',
      'commit', '--quiet', '-m', 'not on remote',
    ]);
    expect(() => greaterRealmProductionProvenanceTestSeams.attestProtectedMainAgainstOrigin({
      repositoryRoot,
      expectedOriginUrl: remote,
    })).toThrowError('GREATER_REALM_PRODUCTION_PROTECTED_MAIN_MISMATCH');
  });

  it('uses trusted Git and ignores hostile path, config, and replace-object controls', () => {
    const repositoryRoot = temporaryDirectory('warpkeep-gr-ancestry-');
    trustedGit(repositoryRoot, ['init', '--quiet']);
    writeFileSync(join(repositoryRoot, 'source.txt'), 'atlas\n', { mode: 0o600 });
    trustedGit(repositoryRoot, ['add', 'source.txt']);
    trustedGit(repositoryRoot, [
      '-c', 'user.name=Warpkeep Test',
      '-c', 'user.email=warpkeep-test@example.invalid',
      'commit', '--quiet', '-m', 'atlas',
    ]);
    const atlasSourceCommit = trustedCommit('HEAD', repositoryRoot);
    writeFileSync(join(repositoryRoot, 'source.txt'), 'module\n', { mode: 0o600 });
    trustedGit(repositoryRoot, ['add', 'source.txt']);
    trustedGit(repositoryRoot, [
      '-c', 'user.name=Warpkeep Test',
      '-c', 'user.email=warpkeep-test@example.invalid',
      'commit', '--quiet', '-m', 'module',
    ]);
    const moduleSourceCommit = trustedCommit('HEAD', repositoryRoot);
    const hostile = Object.freeze({
      PATH: '/definitely/not/a/trusted/path',
      GIT_CONFIG_GLOBAL: '/private/tmp/hostile-git-config',
      GIT_CONFIG_COUNT: '1',
      GIT_CONFIG_KEY_0: 'core.replaceRefs',
      GIT_CONFIG_VALUE_0: 'true',
      GIT_REPLACE_REF_BASE: 'refs/hostile-replacements',
      GIT_DIR: '/private/tmp/hostile-git-dir',
      GIT_OBJECT_DIRECTORY: '/private/tmp/hostile-git-objects',
    });
    const prior = Object.fromEntries(Object.keys(hostile).map(key => [key, process.env[key]]));
    try {
      Object.assign(process.env, hostile);
      expect(() => attestGreaterRealmProductionSourceAncestry({
        repositoryRoot,
        atlasSourceCommit,
        moduleSourceCommit,
      })).not.toThrow();
    } finally {
      for (const [key, value] of Object.entries(prior)) {
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
      }
    }
    expect(() => attestGreaterRealmProductionSourceAncestry({
      repositoryRoot,
      atlasSourceCommit: moduleSourceCommit,
      moduleSourceCommit: atlasSourceCommit,
    })).toThrowError('GREATER_REALM_PRODUCTION_SOURCE_ANCESTRY_INVALID');
  });

  it.each(['import', 'activation'] as const)(
    'accepts only the exact %s-gate-only module delta',
    gate => {
      const repositoryRoot = temporaryDirectory(`warpkeep-gr-${gate}-gate-`);
      const sourceDirectory = join(repositoryRoot, 'spacetimedb', 'src');
      const scriptsDirectory = join(repositoryRoot, 'scripts');
      mkdirSync(sourceDirectory, { recursive: true, mode: 0o700 });
      mkdirSync(scriptsDirectory, { recursive: true, mode: 0o700 });
      const policyPath = join(sourceDirectory, 'greaterRealmV17Policy.ts');
      const publisherPath = join(scriptsDirectory, 'greater-realm-production-publisher-core.ts');
      const policy = (importAllowed: boolean, activationAllowed: boolean) => [
        `export const GREATER_REALM_V17_IMPORT_MUTATIONS_ALLOWED = ${importAllowed};`,
        `export const GREATER_REALM_V17_ACTIVATION_MUTATIONS_ALLOWED = ${activationAllowed};`,
        '',
      ].join('\n');
      const publisher = (selectedGate: 'none' | 'import' | 'activation') => [
        'export const GREATER_REALM_PRODUCTION_RELEASE_FLAGS = Object.freeze({',
        `  entryAgreementApproved: ${selectedGate === 'none' ? 'false' : 'true'},`,
        `  additivePublishApproved: ${selectedGate === 'none' ? 'false' : 'true'},`,
        `  importForwardFixApproved: ${selectedGate === 'import' ? 'true' : 'false'},`,
        `  activationForwardFixApproved: ${selectedGate === 'activation' ? 'true' : 'false'},`,
        '  clientActivationApproved: false,',
        '  admissionNotificationsApproved: false,',
        '});',
        '',
      ].join('\n');
      writeFileSync(policyPath, policy(false, false), { mode: 0o600 });
      writeFileSync(publisherPath, publisher('none'), { mode: 0o600 });
      trustedGit(repositoryRoot, ['init', '--quiet']);
      trustedGit(repositoryRoot, ['add',
        'spacetimedb/src/greaterRealmV17Policy.ts',
        'scripts/greater-realm-production-publisher-core.ts',
      ]);
      trustedGit(repositoryRoot, [
        '-c', 'user.name=Warpkeep Test',
        '-c', 'user.email=warpkeep-test@example.invalid',
        'commit', '--quiet', '-m', 'atlas source',
      ]);
      const atlasSourceCommit = trustedCommit('HEAD', repositoryRoot);
      writeFileSync(
        policyPath,
        policy(gate === 'import', gate === 'activation'),
        { mode: 0o600 },
      );
      writeFileSync(publisherPath, publisher(gate), { mode: 0o600 });
      trustedGit(repositoryRoot, ['add',
        'spacetimedb/src/greaterRealmV17Policy.ts',
        'scripts/greater-realm-production-publisher-core.ts',
      ]);
      trustedGit(repositoryRoot, [
        '-c', 'user.name=Warpkeep Test',
        '-c', 'user.email=warpkeep-test@example.invalid',
        'commit', '--quiet', '-m', `${gate} gate`,
      ]);
      const moduleSourceCommit = trustedCommit('HEAD', repositoryRoot);
      expect(() => attestGreaterRealmProductionGateOnlyDelta({
        repositoryRoot,
        atlasSourceCommit,
        moduleSourceCommit,
        gate,
      })).not.toThrow();
      expect(() => attestGreaterRealmProductionGateOnlyDelta({
        repositoryRoot,
        atlasSourceCommit,
        moduleSourceCommit,
        gate: gate === 'import' ? 'activation' : 'import',
      })).toThrowError('GREATER_REALM_PRODUCTION_GATE_DELTA_INVALID');
      trustedGit(repositoryRoot, ['update-index', '--chmod=+x',
        'scripts/greater-realm-production-publisher-core.ts']);
      trustedGit(repositoryRoot, [
        '-c', 'user.name=Warpkeep Test',
        '-c', 'user.email=warpkeep-test@example.invalid',
        'commit', '--quiet', '-m', `${gate} hostile mode drift`,
      ]);
      const modeDriftCommit = trustedCommit('HEAD', repositoryRoot);
      expect(() => attestGreaterRealmProductionGateOnlyDelta({
        repositoryRoot,
        atlasSourceCommit,
        moduleSourceCommit: modeDriftCommit,
        gate,
      })).toThrowError('GREATER_REALM_PRODUCTION_GATE_DELTA_INVALID');
    },
  );

  it.each([
    ['approval-only', true],
    ['publisher-script-extra', false],
    ['publisher-mode-drift', false],
    ['unrelated-script', false],
    ['server-delta', false],
  ] as const)('enforces the inert append %s delta', (variant, accepted) => {
    const repositoryRoot = temporaryDirectory(`warpkeep-gr-append-${variant}-`);
    const scriptsDirectory = join(repositoryRoot, 'scripts');
    mkdirSync(scriptsDirectory, { recursive: true, mode: 0o700 });
    const publisherPath = join(scriptsDirectory, 'greater-realm-production-publisher-core.ts');
    const publisher = (approved: boolean, extra = '') => [
      'export const GREATER_REALM_PRODUCTION_RELEASE_FLAGS = Object.freeze({',
      `  entryAgreementApproved: ${approved},`,
      `  additivePublishApproved: ${approved},`,
      '  importForwardFixApproved: false,',
      '  activationForwardFixApproved: false,',
      '  clientActivationApproved: false,',
      '  admissionNotificationsApproved: false,',
      '});',
      extra,
      '',
    ].join('\n');
    writeFileSync(publisherPath, publisher(false), { mode: 0o600 });
    trustedGit(repositoryRoot, ['init', '--quiet']);
    trustedGit(repositoryRoot, ['add', 'scripts/greater-realm-production-publisher-core.ts']);
    trustedGit(repositoryRoot, [
      '-c', 'user.name=Warpkeep Test',
      '-c', 'user.email=warpkeep-test@example.invalid',
      'commit', '--quiet', '-m', 'reviewed atlas source',
    ]);
    const atlasSourceCommit = trustedCommit('HEAD', repositoryRoot);
    writeFileSync(
      publisherPath,
      publisher(true, variant === 'publisher-script-extra' ? 'export const extra = true;' : ''),
      { mode: 0o600 },
    );
    if (variant === 'publisher-mode-drift') chmodSync(publisherPath, 0o700);
    if (variant === 'unrelated-script') {
      writeFileSync(join(scriptsDirectory, 'unrelated.ts'), 'export const unrelated = true;\n');
    }
    if (variant === 'server-delta') {
      const serverDirectory = join(repositoryRoot, 'spacetimedb', 'src');
      mkdirSync(serverDirectory, { recursive: true, mode: 0o700 });
      writeFileSync(join(serverDirectory, 'unrelated.ts'), 'export const serverDelta = true;\n');
    }
    trustedGit(repositoryRoot, ['add', '.']);
    trustedGit(repositoryRoot, [
      '-c', 'user.name=Warpkeep Test',
      '-c', 'user.email=warpkeep-test@example.invalid',
      'commit', '--quiet', '-m', variant,
    ]);
    const moduleSourceCommit = trustedCommit('HEAD', repositoryRoot);
    const attest = () => attestGreaterRealmProductionAppendApprovalOnlyDelta({
      repositoryRoot,
      atlasSourceCommit,
      moduleSourceCommit,
    });
    if (accepted) expect(attest).not.toThrow();
    else expect(attest).toThrowError('GREATER_REALM_PRODUCTION_APPEND_APPROVAL_DELTA_INVALID');
  });
});

describe('Greater Realm fresh administrator transport', () => {
  it('reuses one serialized session across a complete import call budget', async () => {
    const requestToken = vi.fn(async () => `aaa.${'b'.repeat(24)}.ccc`);
    const procedure = vi.fn(async () => ({ state: 'ready' }));
    const authorityProcedure = vi.fn(async () => ({ releaseState: 'ready' }));
    const reducer = vi.fn(async () => undefined);
    const disconnect = vi.fn();
    const connectDatabase = vi.fn(async () => ({
      isDisconnectRequested: false,
      disconnect,
      procedures: {
        adminGetGreaterRealmStatusV1: procedure,
        adminGetGreaterRealmCutoverStatusV1: authorityProcedure,
      },
      reducers: { adminVerifyGreaterRealmBatchV1: reducer },
    }));
    const session = createGreaterRealmAdminTransportSession({
      adminSecret: 's'.repeat(32),
      requestToken: requestToken as never,
      connectDatabase: connectDatabase as never,
      tokenBudget: TEST_TOKEN_BUDGET,
      readTrustedTime: async () => Date.now(),
    });
    const transport = bindGreaterRealmProductionStatusTransport(
      session,
      'admin_get_greater_realm_status_v1',
    );
    const authority = bindGreaterRealmProductionStatusTransport(
      session,
      'admin_get_greater_realm_cutover_status_v_1',
    );

    for (let index = 0; index < 17; index += 1) {
      await expect(transport.inspect()).resolves.toEqual({ state: 'ready' });
      await expect(authority.inspect()).resolves.toEqual({ releaseState: 'ready' });
    }
    for (let index = 0; index < 120; index += 1) {
      await transport.submit(
        'admin_verify_greater_realm_batch_v1',
        { atlasId: 'GREATER_REALM_V1', importEpoch: 7n, requestedRows: 256 },
        () => undefined,
      );
      await expect(transport.inspect()).resolves.toEqual({ state: 'ready' });
    }

    expect(requestToken).toHaveBeenCalledTimes(2);
    expect(connectDatabase).toHaveBeenCalledTimes(1);
    expect(disconnect).not.toHaveBeenCalled();
    expect(procedure).toHaveBeenCalledTimes(137);
    expect(authorityProcedure).toHaveBeenCalledTimes(17);
    expect(reducer).toHaveBeenCalledTimes(120);
    await session.close();
    expect(disconnect).toHaveBeenCalledTimes(1);
    await expect(transport.inspect()).rejects.toThrow(/SESSION_CLOSED/);
  });

  it('never retries a failed reducer and reconnects only for explicit reconciliation', async () => {
    const requestToken = vi.fn(async () => `aaa.${'b'.repeat(24)}.ccc`);
    const reducer = vi.fn(async () => { throw new Error('connection broke'); });
    const disconnects = [vi.fn(), vi.fn()];
    let connections = 0;
    const connectDatabase = vi.fn(async () => {
      const index = connections++;
      return {
        isDisconnectRequested: false,
        disconnect: disconnects[index]!,
        procedures: {
          adminGetGreaterRealmStatusV1: vi.fn(async () => ({ state: 'advanced' })),
        },
        reducers: { adminVerifyGreaterRealmBatchV1: reducer },
      };
    });
    const transport = createGreaterRealmFreshAdminTransport({
      adminSecret: 's'.repeat(32),
      statusProcedure: 'admin_get_greater_realm_status_v1',
      requestToken: requestToken as never,
      connectDatabase: connectDatabase as never,
      tokenBudget: TEST_TOKEN_BUDGET,
      readTrustedTime: async () => Date.now(),
    });
    await expect(transport.submit(
      'admin_verify_greater_realm_batch_v1',
      {},
      () => undefined,
    ))
      .rejects.toThrow(/TRANSPORT_UNAVAILABLE/);
    expect(reducer).toHaveBeenCalledTimes(1);
    expect(requestToken).toHaveBeenCalledTimes(2);
    await expect(transport.inspect()).resolves.toEqual({ state: 'advanced' });
    expect(reducer).toHaveBeenCalledTimes(1);
    expect(requestToken).toHaveBeenCalledTimes(2);
    expect(connectDatabase).toHaveBeenCalledTimes(2);
    await transport.close();
    expect(disconnects[0]).toHaveBeenCalledTimes(1);
    expect(disconnects[1]).toHaveBeenCalledTimes(1);
  });

  it('refreshes an aged contingency token before starting the next reducer', async () => {
    let now = 1_000;
    const requestToken = vi.fn(async () => `aaa.${'b'.repeat(24)}.ccc`);
    const reducer = vi.fn(async () => undefined);
    const session = createGreaterRealmAdminTransportSession({
      adminSecret: 's'.repeat(32),
      requestToken: requestToken as never,
      connectDatabase: vi.fn(async () => ({
        isDisconnectRequested: false,
        disconnect: vi.fn(),
        procedures: {},
        reducers: { adminVerifyGreaterRealmBatchV1: reducer },
      })) as never,
      now: () => now,
      tokenBudget: TEST_TOKEN_BUDGET,
      readTrustedTime: async () => now,
    });
    const transport = bindGreaterRealmProductionStatusTransport(
      session,
      'admin_get_greater_realm_status_v1',
    );
    await transport.submit('admin_verify_greater_realm_batch_v1', {}, () => undefined);
    expect(requestToken).toHaveBeenCalledTimes(2);
    now += 150_001;
    await transport.submit('admin_verify_greater_realm_batch_v1', {}, () => undefined);
    expect(requestToken).toHaveBeenCalledTimes(3);
    expect(reducer).toHaveBeenCalledTimes(2);
    await session.close();
  });

  it('brands post-ambiguity contingency replenishment exhaustion as zero-write', async () => {
    let tokenRequests = 0;
    const requestToken = vi.fn(async () => {
      tokenRequests += 1;
      if (tokenRequests === 3) throw new Error('budget exhausted');
      return `aaa.${'b'.repeat(24)}.ccc`;
    });
    const reducer = vi.fn(async () => { throw new Error('ambiguous reducer'); });
    const connections = [
      {
        isDisconnectRequested: false,
        disconnect: vi.fn(),
        procedures: { adminGetGreaterRealmStatusV1: vi.fn(async () => ({ state: 'before' })) },
        reducers: { adminVerifyGreaterRealmBatchV1: reducer },
      },
      {
        isDisconnectRequested: false,
        disconnect: vi.fn(),
        procedures: { adminGetGreaterRealmStatusV1: vi.fn(async () => ({ state: 'after' })) },
        reducers: { adminVerifyGreaterRealmBatchV1: reducer },
      },
    ];
    let connectionIndex = 0;
    const session = createGreaterRealmAdminTransportSession({
      adminSecret: 's'.repeat(32),
      requestToken: requestToken as never,
      connectDatabase: vi.fn(async () => connections[connectionIndex++]!) as never,
      tokenBudget: TEST_TOKEN_BUDGET,
      readTrustedTime: async () => Date.now(),
    });
    const transport = bindGreaterRealmProductionStatusTransport(
      session,
      'admin_get_greater_realm_status_v1',
    );
    await expect(transport.submit(
      'admin_verify_greater_realm_batch_v1', {}, () => undefined,
    )).rejects.toThrow(/TRANSPORT_UNAVAILABLE/);
    await expect(transport.inspect()).resolves.toEqual({ state: 'after' });
    let boundError: unknown;
    const permit = Object.assign(() => undefined, {
      bindWriteNotStartedError(error: unknown) { boundError = error; },
    });
    let observedError: unknown;
    try {
      await transport.submit('admin_verify_greater_realm_batch_v1', {}, permit);
    } catch (error) {
      observedError = error;
    }
    expect(observedError).toMatchObject({
      name: 'GreaterRealmCutoverWriteNotStartedError',
      writeStarted: false,
      code: 'GREATER_REALM_PRODUCTION_SUBMISSION_PREPARATION_FAILED',
    });
    expect(boundError).toBe(observedError);
    expect(reducer).toHaveBeenCalledTimes(1);
    expect(requestToken).toHaveBeenCalledTimes(3);
    await session.close();
  });

  it.each(['primary-connect', 'contingency-mint'] as const)(
    'contains SIGTERM during %s and invokes zero reducers',
    async boundary => {
      const directory = temporaryDirectory(`warpkeep-gr-submit-signal-${boundary}-`);
      let tokenRequests = 0;
      const requestToken = vi.fn(async () => {
        tokenRequests += 1;
        if (boundary === 'contingency-mint' && tokenRequests === 2) {
          process.emit('SIGTERM');
        }
        return `aaa.${'b'.repeat(24)}.ccc`;
      });
      const reducer = vi.fn(async () => undefined);
      const disconnect = vi.fn();
      const connectDatabase = vi.fn(async () => {
        if (boundary === 'primary-connect') process.emit('SIGTERM');
        return {
          isDisconnectRequested: false,
          disconnect,
          procedures: {},
          reducers: { adminVerifyGreaterRealmBatchV1: reducer },
        };
      });
      const session = createGreaterRealmAdminTransportSession({
        adminSecret: 's'.repeat(32),
        requestToken: requestToken as never,
        connectDatabase: connectDatabase as never,
        tokenBudget: TEST_TOKEN_BUDGET,
        readTrustedTime: async () => Date.now(),
      });
      const transport = bindGreaterRealmProductionStatusTransport(
        session,
        'admin_get_greater_realm_status_v1',
      );
      let operationCompleted = false;
      try {
        await expect(withGreaterRealmCutoverOperatorLock({
          directory,
          repositoryRoot: process.cwd(),
          operation: async control => {
            await transport.submit(
              'admin_verify_greater_realm_batch_v1',
              {},
              control.assertCanStartWrite,
            );
            operationCompleted = true;
          },
        })).rejects.toThrow(/GREATER_REALM_CUTOVER_OPERATOR_INTERRUPTED_SIGTERM/);
      } finally {
        await session.close();
      }
      expect(operationCompleted).toBe(false);
      expect(reducer).not.toHaveBeenCalled();
      expect(requestToken).toHaveBeenCalledTimes(2);
      expect(connectDatabase).toHaveBeenCalledTimes(1);
    },
  );

  it('rejects target overrides and environment-carried credentials', () => {
    expect(requireGreaterRealmProductionTransportTarget({})).toBe(
      GREATER_REALM_PRODUCTION_TRANSPORT_TARGET,
    );
    expect(() => requireGreaterRealmProductionTransportTarget({
      WARPKEEP_SPACETIMEDB_DATABASE: 'warpkeep',
    })).toThrow(/TARGET_OVERRIDE_REJECTED/);
    expect(() => createGreaterRealmFreshAdminTransport({
      adminSecret: 's'.repeat(32),
      statusProcedure: 'invalid-name!',
    })).toThrow(/WIRE_NAME_INVALID/);
    expect(() => readGreaterRealmProductionAdminSecret({
      WARPKEEP_ADMIN_TOKEN_SECRET: 's'.repeat(32),
      WARPKEEP_ADMIN_TOKEN_SECRET_STDIN: '1',
    })).toThrow(/STDIN_REQUIRED/);
  });

  it('reads only one bounded private stdin credential and rejects trailing controls', () => {
    const directory = temporaryDirectory('warpkeep-gr-secret-');
    const valid = join(directory, 'valid');
    writeFileSync(valid, `${'s'.repeat(32)}\n`, { mode: 0o600 });
    const descriptor = openSync(valid, 'r');
    try {
      expect(readGreaterRealmProductionAdminSecret({
        WARPKEEP_ADMIN_TOKEN_SECRET_STDIN: '1',
      }, descriptor)).toBe('s'.repeat(32));
    } finally {
      closeSync(descriptor);
    }

    const invalid = join(directory, 'invalid');
    writeFileSync(invalid, `${'s'.repeat(32)}\t\n`, { mode: 0o600 });
    const invalidDescriptor = openSync(invalid, 'r');
    try {
      expect(() => readGreaterRealmProductionAdminSecret({
        WARPKEEP_ADMIN_TOKEN_SECRET_STDIN: '1',
      }, invalidDescriptor)).toThrow(/CONTROL_CHARACTER_REJECTED/);
    } finally {
      closeSync(invalidDescriptor);
    }
  });
});

describe('Greater Realm private cutover receipts', () => {
  const record = Object.freeze({
    outcome: 'verified',
    artifactDigest: 'a'.repeat(64),
    tableCount: 84,
    importMutationsCompiled: false,
    activationMutationsCompiled: false,
  });

  it('writes an owner-only no-clobber receipt outside the repository', () => {
    const parent = temporaryDirectory('warpkeep-gr-receipt-');
    const directory = join(parent, 'dedicated');
    const now = new Date('2026-08-11T12:00:00.000Z');
    const first = writePrivateGreaterRealmCutoverReceipt({
      directory,
      repositoryRoot: process.cwd(),
      kind: 'warpkeep-greater-realm-production-publish-v1',
      record,
      now,
    });
    const second = writePrivateGreaterRealmCutoverReceipt({
      directory,
      repositoryRoot: process.cwd(),
      kind: 'warpkeep-greater-realm-production-publish-v1',
      record,
      now,
    });
    expect(first.result).toBe('installed');
    expect(second).toMatchObject({
      result: 'unchanged',
      path: first.path,
      receiptDigest: first.receiptDigest,
    });
  });

  it('rejects private identifiers, repository overlap, and symlink destinations', () => {
    const parent = temporaryDirectory('warpkeep-gr-receipt-hostile-');
    expect(() => writePrivateGreaterRealmCutoverReceipt({
      directory: join(parent, 'private-field'),
      repositoryRoot: process.cwd(),
      kind: 'warpkeep-greater-realm-production-import-v1',
      record: { ...record, actorSubject: 'must-not-persist' },
    })).toThrow(/PRIVATE_FIELD_REJECTED/);
    expect(() => writePrivateGreaterRealmCutoverReceipt({
      directory: join(process.cwd(), '.receipts'),
      repositoryRoot: process.cwd(),
      kind: 'warpkeep-greater-realm-production-import-v1',
      record,
    })).toThrow(/REPOSITORY_OVERLAP/);

    const actual = join(parent, 'actual');
    const linked = join(parent, 'linked');
    writeFileSync(join(parent, 'placeholder'), 'x');
    // Create the real private directory before replacing only the requested
    // leaf with a symbolic alias.
    const created = writePrivateGreaterRealmCutoverReceipt({
      directory: actual,
      repositoryRoot: process.cwd(),
      kind: 'warpkeep-greater-realm-production-relocation-v1',
      record,
    });
    expect(created.result).toBe('installed');
    symlinkSync(actual, linked);
    expect(() => writePrivateGreaterRealmCutoverReceipt({
      directory: linked,
      repositoryRoot: process.cwd(),
      kind: 'warpkeep-greater-realm-production-relocation-v1',
      record,
    })).toThrow(/SYMLINK_REJECTED/);
  });

  it('serializes cutover writers while still allowing an atomic receipt inside the lock', async () => {
    const parent = temporaryDirectory('warpkeep-gr-lock-');
    const directory = join(parent, 'dedicated');
    await withGreaterRealmCutoverOperatorLock({
      directory,
      repositoryRoot: process.cwd(),
      operation: async () => {
        await expect(withGreaterRealmCutoverOperatorLock({
          directory,
          repositoryRoot: process.cwd(),
          operation: async () => undefined,
        })).rejects.toThrow(/OPERATOR_ALREADY_RUNNING/);
        expect(writePrivateGreaterRealmCutoverReceipt({
          directory,
          repositoryRoot: process.cwd(),
          kind: 'warpkeep-greater-realm-production-import-v1',
          record,
        }).result).toBe('installed');
      },
    });
    await expect(withGreaterRealmCutoverOperatorLock({
      directory,
      repositoryRoot: process.cwd(),
      operation: async () => 'released',
    })).resolves.toBe('released');
  });

  it.each([
    'before-directory',
    'after-directory',
    'after-record',
    'after-temp-open',
    'after-write',
    'after-fsync',
    'after-chmod',
    'after-link',
    'after-directory-fsync',
    'after-temp-unlink',
    'before-operation',
  ])('contains SIGTERM at the %s boundary and performs no protected operation', async step => {
    const parent = temporaryDirectory(`warpkeep-gr-lock-signal-${step}-`);
    const directory = join(parent, 'dedicated');
    const operation = vi.fn(async () => undefined);
    const sigintListeners = process.listenerCount('SIGINT');
    const sigtermListeners = process.listenerCount('SIGTERM');
    await expect(withGreaterRealmCutoverOperatorLock({
      directory,
      repositoryRoot: process.cwd(),
      operation,
      testOnlyStep: current => {
        if (current === step) process.emit('SIGTERM');
      },
    })).rejects.toThrow(/INTERRUPTED_SIGTERM/);
    expect(operation).not.toHaveBeenCalled();
    expect(process.listenerCount('SIGINT')).toBe(sigintListeners);
    expect(process.listenerCount('SIGTERM')).toBe(sigtermListeners);
    if (existsSync(directory)) {
      expect(readdirSync(directory).filter(name => name.includes('lock'))).toEqual([]);
    }
  });

  it.each([
    'before-directory',
    'after-directory',
    'after-record',
    'after-temp-open',
    'after-write',
    'after-fsync',
    'after-chmod',
    'after-link',
    'after-directory-fsync',
    'after-temp-unlink',
  ])('surfaces injected setup failure at %s without leaking a lock', async step => {
    const parent = temporaryDirectory(`warpkeep-gr-lock-failure-${step}-`);
    const directory = join(parent, 'dedicated');
    await expect(withGreaterRealmCutoverOperatorLock({
      directory,
      repositoryRoot: process.cwd(),
      operation: async () => undefined,
      testOnlyStep: current => {
        if (current === step) throw new Error(`injected-${step}`);
      },
    })).rejects.toThrow(`injected-${step}`);
    await expect(withGreaterRealmCutoverOperatorLock({
      directory,
      repositoryRoot: process.cwd(),
      operation: async () => 'recovered',
    })).resolves.toBe('recovered');
  });

  it('requires exact dead-owner and one-use confirmation for lock-only recovery', async () => {
    const parent = temporaryDirectory('warpkeep-gr-lock-recovery-');
    const directory = join(parent, 'dedicated');
    const now = Date.parse('2026-08-11T12:00:00.000Z');
    const tsxCli = join(process.cwd(), 'node_modules', 'tsx', 'dist', 'cli.mjs');
    const modulePath = join(process.cwd(), 'scripts', 'greater-realm-cutover-receipts.ts');
    const child = spawnSync(process.execPath, [tsxCli, '-e', [
      `import { withGreaterRealmCutoverOperatorLock } from ${JSON.stringify(modulePath)};`,
      `withGreaterRealmCutoverOperatorLock({directory:${JSON.stringify(directory)},repositoryRoot:${JSON.stringify(process.cwd())},now:()=>${now},operation:async()=>{process.exit(0);}});`,
    ].join('\n')], { encoding: 'utf8', env: process.env });
    expect(child.status).toBe(0);
    expect(inspectGreaterRealmCutoverOperatorLock({
      directory,
      repositoryRoot: process.cwd(),
      now: () => now + 24 * 60 * 60 * 1_000 - 1,
    })).toMatchObject({ ownerState: 'dead', expired: false, recoveryEligible: true });
    expect(() => recoverGreaterRealmCutoverOperatorLock({
      directory,
      repositoryRoot: process.cwd(),
      now: () => now + 24 * 60 * 60 * 1_000 - 1,
      confirmationDigest: '0'.repeat(64),
    })).toThrow(/RECOVERY_REJECTED/);
    const inspection = inspectGreaterRealmCutoverOperatorJournalRecovery({
      directory,
      repositoryRoot: process.cwd(),
      now: () => now + 24 * 60 * 60 * 1_000 - 1,
    });
    expect(inspection).toMatchObject({
      recoveryMode: 'lock-only',
      recoveryEligible: true,
      confirmationDigest: expect.stringMatching(/^[0-9a-f]{64}$/u),
    });
    expect(recoverGreaterRealmCutoverOperatorLock({
      directory,
      repositoryRoot: process.cwd(),
      now: () => now + 24 * 60 * 60 * 1_000 - 1,
      confirmationDigest: inspection.confirmationDigest!,
    })).toMatchObject({ ownerState: 'dead', expired: false, recoveryEligible: true });
    expect(readdirSync(directory).filter(name => name.includes('lock'))).toEqual([]);
  });

  it('surfaces cleanup failure and preserves a replacement lock inode', async () => {
    const parent = temporaryDirectory('warpkeep-gr-lock-replaced-');
    const directory = join(parent, 'dedicated');
    const lockPath = join(directory, '.greater-realm-cutover.lock');
    await expect(withGreaterRealmCutoverOperatorLock({
      directory,
      repositoryRoot: process.cwd(),
      operation: async () => {
        unlinkSync(lockPath);
        writeFileSync(lockPath, 'replacement\n', { mode: 0o600 });
        return 'must-not-succeed';
      },
    })).rejects.toThrow(/LOCK_REPLACED/);
    expect(readFileSync(lockPath, 'utf8')).toBe('replacement\n');
    unlinkSync(lockPath);
  });
});
