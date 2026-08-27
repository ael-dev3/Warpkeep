import { EventEmitter } from 'node:events';
import { createHash } from 'node:crypto';
import {
  chmodSync,
  linkSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawn } from 'node:child_process';

import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  createGenesis001FrozenRecoveryJournal,
  createGenesis001SignalLatch,
  genesis001FrozenPublisherRuntimeTestSeams,
  genesis001RuntimeConfiguration,
  inspectGenesis001FrozenFinalReceipt,
  inspectGenesis001FrozenRecoveryMetadata,
  prepareGenesis001SupervisedPublish,
  terminateGenesis001ProcessGroup,
  writeGenesis001FrozenFinalReceipt,
} from '../scripts/genesis001-frozen-publisher-runtime';
import {
  descriptorDigest,
  genesis001FrozenBuildProvenanceDigest,
  GENESIS001_FINAL_RECEIPT_PROFILE,
  GENESIS001_PRODUCTION_TARGET,
} from '../scripts/genesis001-frozen-publisher-core';
import {
  parseGenesis001FrozenPublisherCliArguments,
} from '../scripts/genesis001-frozen-publisher';
import {
  G001_BASELINE,
  G001_BASELINE_ABI_SHA256,
  G001_FREEZE_NONCE,
} from '../scripts/genesis001-frozen-materializer.mjs';

const roots: string[] = [];

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

function privateRoot(prefix: string): string {
  const root = realpathSync.native(mkdtempSync(join(tmpdir(), prefix)));
  roots.push(root);
  chmodSync(root, 0o700);
  return root;
}

function buildProvenance() {
  return Object.freeze({
    schemaVersion: 2 as const,
    profile: 'warpkeep-genesis-001-frozen-build-provenance-v2' as const,
    platform: 'darwin' as const,
    architecture: 'arm64' as const,
    nodeVersion: 'v24.19.0' as const,
    nodeExecutableSha256:
      '27db838bb204ef7c21df2931f5656e4c8fb32e6e947f363a402b49714d32b5b1',
    spacetimeCliVersion: '2.6.1' as const,
    spacetimeCliCommit: '052c83fe984a4c4eb7bb4f9afa5c6b1903891d87' as const,
    spacetimeCliExecutableSha256:
      '2e737ddbbd7d337bb19c8fc22da9de44be4b7b2062146e7f65aa3f298d7994d6' as const,
    spacetimeStandaloneExecutableSha256:
      '15a0965f1deec6b79f67fc04b616fd1a6b8f633301b0cfd2ebb7f961b919a8fa' as const,
    dependencyInstallerProfile:
      'warpkeep-genesis-001-historical-root-dependency-closure-v1' as const,
    dependencyLockfileSha256:
      '7bbf5d888143d6342219dbba9f501d15bcc9627a7bb6f2be07ea197760d4e234',
    lockedPackageCount: 16 as const,
    dependencyArchiveClosureSha256: 'd'.repeat(64),
    dependencyClosureSha256: 'e'.repeat(64),
    dependencyTreeEntryCount: 321,
  });
}

function recoveryFixture() {
  const workspaceRoot = privateRoot('g001-recovery-');
  const runRoot = join(workspaceRoot, 'run-00000000-0000-4000-8000-000000000001');
  writeFileSync(join(workspaceRoot, '.keep'), '', { mode: 0o600 });
  // mkdir via a second mkdtemp would not preserve the discoverable run name.
  mkdirSync(runRoot, { mode: 0o700 });
  chmodSync(runRoot, 0o700);
  const artifactPath = join(runRoot, 'bundle.js');
  const artifactBytes = Buffer.from('private artifact\n', 'utf8');
  const artifactSha256 = createHash('sha256').update(artifactBytes).digest('hex');
  writeFileSync(artifactPath, artifactBytes, { mode: 0o600, flag: 'wx' });
  const provenance = buildProvenance();
  const journal = createGenesis001FrozenRecoveryJournal({
    runRoot,
    protectedMainCommit: 'a'.repeat(40),
    artifactPath,
    artifactSha256,
    builtDescriptorSha256: 'c'.repeat(64),
    buildProvenance: provenance,
    buildProvenanceSha256: genesis001FrozenBuildProvenanceDigest(provenance),
  });
  return { workspaceRoot, runRoot, artifactPath, artifactSha256, journal };
}

function pinnedCliSnapshot(onVerify?: () => void) {
  return Object.freeze({
    path: '/private/spacetime',
    digest: '2e737ddbbd7d337bb19c8fc22da9de44be4b7b2062146e7f65aa3f298d7994d6',
    provenance: Object.freeze({
      version: '2.6.1' as const,
      commit: '052c83fe984a4c4eb7bb4f9afa5c6b1903891d87' as const,
      cliExecutableSha256:
        '2e737ddbbd7d337bb19c8fc22da9de44be4b7b2062146e7f65aa3f298d7994d6' as const,
      standaloneExecutableSha256:
        '15a0965f1deec6b79f67fc04b616fd1a6b8f633301b0cfd2ebb7f961b919a8fa' as const,
    }),
    verify: vi.fn(() => onVerify?.()),
    cleanup: vi.fn(),
  });
}

function finalReceiptFixture(protectedMainCommit = 'a'.repeat(40)) {
  const livePolicyReceipt = Object.freeze({
    realmId: 'GENESIS_001',
    releaseVersion: '0.3.43',
    playerAccessEnabled: true,
    admissionStateMutationsEnabled: false,
    accessRequestSubmissionsEnabled: false,
    sourceBaselineCommit: G001_BASELINE,
    freezeReleaseNonce: G001_FREEZE_NONCE,
  });
  const provenance = buildProvenance();
  return Object.freeze({
    schemaVersion: 2 as const,
    profile: GENESIS001_FINAL_RECEIPT_PROFILE,
    outcome: 'published' as const,
    target: GENESIS001_PRODUCTION_TARGET,
    protectedMainCommit,
    sourceBaselineCommit: G001_BASELINE,
    baselineAbiSha256: G001_BASELINE_ABI_SHA256,
    freezeReleaseNonce: G001_FREEZE_NONCE,
    artifactSha256: 'b'.repeat(64),
    candidateDescriptorSha256: 'c'.repeat(64),
    postflightDescriptorSha256: 'c'.repeat(64),
    buildProvenance: provenance,
    buildProvenanceSha256: genesis001FrozenBuildProvenanceDigest(provenance),
    livePolicyReceipt,
    livePolicyReceiptSha256: descriptorDigest(livePolicyReceipt),
  });
}

describe('Genesis 001 durable final receipts', () => {
  it('writes one owner-private privacy-safe receipt and reattests its exact digest', () => {
    const workspaceRoot = privateRoot('g001-final-receipt-');
    const record = finalReceiptFixture();
    const pointer = writeGenesis001FrozenFinalReceipt({ workspaceRoot, record });
    expect(Object.keys(pointer).sort()).toEqual(['receiptBasename', 'receiptSha256']);
    expect(pointer.receiptBasename).toMatch(
      /^genesis-001-freeze-publish-[0-9a-f-]{36}\.json$/,
    );
    expect(pointer.receiptSha256).toMatch(/^[0-9a-f]{64}$/);
    const path = join(workspaceRoot, 'receipts', pointer.receiptBasename);
    const status = lstatSync(path);
    expect(status.isFile()).toBe(true);
    expect(status.isSymbolicLink()).toBe(false);
    expect(status.nlink).toBe(1);
    expect((status.mode & 0o777).toString(8)).toBe('600');
    expect(inspectGenesis001FrozenFinalReceipt({ workspaceRoot, ...pointer })).toEqual(record);
    expect(readFileSync(path, 'utf8')).not.toMatch(/\"(?:fid|founders|requests|rows|token|secret)\"/i);
  });

  it('never overwrites an existing receipt basename', () => {
    const workspaceRoot = privateRoot('g001-final-no-overwrite-');
    const receiptId = '00000000-0000-4000-8000-000000000001';
    const pointer = writeGenesis001FrozenFinalReceipt({
      workspaceRoot,
      record: finalReceiptFixture(),
      receiptId,
    });
    const path = join(workspaceRoot, 'receipts', pointer.receiptBasename);
    const before = readFileSync(path);
    expect(() => writeGenesis001FrozenFinalReceipt({
      workspaceRoot,
      record: finalReceiptFixture('e'.repeat(40)),
      receiptId,
    })).toThrow();
    expect(readFileSync(path)).toEqual(before);
    expect(inspectGenesis001FrozenFinalReceipt({ workspaceRoot, ...pointer }))
      .toEqual(finalReceiptFixture());
  });

  it('rejects a receipt changed after its digest was issued', () => {
    const workspaceRoot = privateRoot('g001-final-tamper-');
    const pointer = writeGenesis001FrozenFinalReceipt({
      workspaceRoot,
      record: finalReceiptFixture(),
    });
    const path = join(workspaceRoot, 'receipts', pointer.receiptBasename);
    const tampered = readFileSync(path, 'utf8').replace(
      '"outcome":"published"',
      '"outcome":"reconciled"',
    );
    writeFileSync(path, tampered, { encoding: 'utf8', flag: 'w' });
    expect(() => inspectGenesis001FrozenFinalReceipt({ workspaceRoot, ...pointer }))
      .toThrow(/digest|changed/i);
  });
});

describe('Genesis 001 retained artifact recovery metadata', () => {
  it('durably records exact target/source/artifact identity without private game state', () => {
    const state = recoveryFixture();
    expect((lstatSync(state.journal.path).mode & 0o777).toString(8)).toBe('600');
    expect(inspectGenesis001FrozenRecoveryMetadata(state.workspaceRoot)).toEqual([
      expect.objectContaining({
        schemaVersion: 2,
        profile: 'warpkeep-genesis-001-frozen-publish-recovery-v2',
        state: 'prepared',
        protectedMainCommit: 'a'.repeat(40),
        artifactPath: state.artifactPath,
        artifactSha256: state.artifactSha256,
        builtDescriptorSha256: 'c'.repeat(64),
        buildProvenance: buildProvenance(),
        buildProvenanceSha256:
          genesis001FrozenBuildProvenanceDigest(buildProvenance()),
        target: {
          uri: 'https://maincloud.spacetimedb.com',
          database: 'c2001f161d44e50c0a75356d79a4d10fa4a9d77ea4eddd56cda7ac6af50b570e',
        },
      }),
    ]);
    const body = JSON.stringify(state.journal.record());
    expect(body).not.toMatch(/fid|player|request|row|token|secret/i);
  });

  it('rejects extra nested supervisor fields that could carry private state', () => {
    const state = recoveryFixture();
    const supervisorId = 'd'.repeat(32);
    state.journal.markSupervisorBound(Object.freeze({
      schemaVersion: 1,
      profile: 'warpkeep-greater-realm-publish-supervisor-v1',
      supervisorId,
      supervisorDirectory: join(state.workspaceRoot, 'supervisors', `publish-${supervisorId}`),
    }));
    const tampered = JSON.parse(readFileSync(state.journal.path, 'utf8')) as Record<string, unknown>;
    (tampered.supervisorIdentity as Record<string, unknown>).privateRows = ['must-not-pass'];
    writeFileSync(state.journal.path, `${JSON.stringify(tampered)}\n`, {
      encoding: 'utf8',
      flag: 'w',
    });
    expect(() => inspectGenesis001FrozenRecoveryMetadata(state.workspaceRoot))
      .toThrow(/supervisor identity is invalid/i);
  });

  it('rejects missing, extra, or digest-mutated build provenance in recovery metadata', () => {
    for (const mutation of [
      (record: Record<string, unknown>) => { delete record.buildProvenance; },
      (record: Record<string, unknown>) => {
        (record.buildProvenance as Record<string, unknown>).privateRows = ['must-not-pass'];
      },
      (record: Record<string, unknown>) => {
        record.buildProvenanceSha256 = '9'.repeat(64);
      },
    ]) {
      const state = recoveryFixture();
      const tampered = JSON.parse(readFileSync(state.journal.path, 'utf8')) as Record<string, unknown>;
      mutation(tampered);
      writeFileSync(state.journal.path, `${JSON.stringify(tampered)}\n`, {
        encoding: 'utf8',
        flag: 'w',
      });
      expect(() => inspectGenesis001FrozenRecoveryMetadata(state.workspaceRoot))
        .toThrow(/recovery.*(?:metadata|provenance).*invalid/i);
    }
  });

  it('rejects recovery metadata whose artifact escapes its retained run root', () => {
    const state = recoveryFixture();
    const outsideRoot = privateRoot('g001-recovery-outside-');
    const outsideArtifact = join(outsideRoot, 'bundle.js');
    writeFileSync(outsideArtifact, 'private artifact\n', { mode: 0o600, flag: 'wx' });
    const tampered = JSON.parse(readFileSync(state.journal.path, 'utf8')) as Record<string, unknown>;
    tampered.artifactPath = outsideArtifact;
    writeFileSync(state.journal.path, `${JSON.stringify(tampered)}\n`, {
      encoding: 'utf8',
      flag: 'w',
    });
    expect(() => inspectGenesis001FrozenRecoveryMetadata(state.workspaceRoot))
      .toThrow(/recovery metadata is invalid/i);
  });

  it('rejects recovery metadata whose supervisor escapes the exact workspace root', () => {
    const state = recoveryFixture();
    const supervisorId = 'd'.repeat(32);
    state.journal.markSupervisorBound(Object.freeze({
      schemaVersion: 1,
      profile: 'warpkeep-greater-realm-publish-supervisor-v1',
      supervisorId,
      supervisorDirectory: join(state.workspaceRoot, 'supervisors', `publish-${supervisorId}`),
    }));
    const outsideRoot = privateRoot('g001-supervisor-outside-');
    const tampered = JSON.parse(readFileSync(state.journal.path, 'utf8')) as Record<string, unknown>;
    (tampered.supervisorIdentity as Record<string, unknown>).supervisorDirectory = join(
      outsideRoot,
      'supervisors',
      `publish-${supervisorId}`,
    );
    writeFileSync(state.journal.path, `${JSON.stringify(tampered)}\n`, {
      encoding: 'utf8',
      flag: 'w',
    });
    expect(() => inspectGenesis001FrozenRecoveryMetadata(state.workspaceRoot))
      .toThrow(/supervisor identity is invalid/i);
  });

  it('reattests the retained artifact digest when recovery metadata is inspected', () => {
    const state = recoveryFixture();
    writeFileSync(state.artifactPath, 'tampered artifact\n', { encoding: 'utf8', flag: 'w' });
    expect(() => inspectGenesis001FrozenRecoveryMetadata(state.workspaceRoot))
      .toThrow(/artifact.*(?:changed|digest|invalid)/i);
  });

  it('fsyncs release-uncertain metadata before opening the one-shot gate', async () => {
    const state = recoveryFixture();
    const events: string[] = [];
    const signalProcess = new EventEmitter() as EventEmitter & Pick<NodeJS.Process, 'on' | 'off'>;
    const signalLatch = createGenesis001SignalLatch(signalProcess);
    const cli = pinnedCliSnapshot(() => events.push('cli-verify'));
    const identity = Object.freeze({
      schemaVersion: 1 as const,
      profile: 'warpkeep-greater-realm-publish-supervisor-v1' as const,
      supervisorId: 'd'.repeat(32),
      supervisorDirectory: join(state.workspaceRoot, 'supervisors', `publish-${'d'.repeat(32)}`),
    });
    const plan = Object.freeze({
      identity,
      allocate: vi.fn(),
      start: vi.fn(async () => ({ pid: 999_999, kill: vi.fn() })),
      release: vi.fn(async () => {
        events.push('gate-open');
        expect(state.journal.record().state).toBe('release-uncertain');
      }),
      cleanup: vi.fn(async () => { events.push('cleanup'); }),
      executionState: vi.fn(() => ({})),
    });
    const supervisorRoot = join(state.workspaceRoot, 'supervisors');
    mkdirSync(supervisorRoot, { mode: 0o700 });
    chmodSync(supervisorRoot, 0o700);
    try {
      const supervisor = await prepareGenesis001SupervisedPublish({
        configuration: {
          repositoryRoot: process.cwd(),
          workspaceRoot: state.workspaceRoot,
          nodeExecutablePath: '/private/node',
          dependencyCacheRoot: '/private/dependencies',
          cliConfigPath: '/private/cli.toml',
          adminSecretPath: '/private/admin.secret',
          childEnvironment: {},
        },
        cli,
        arguments_: ['publish'],
        recovery: state.journal,
        signalLatch,
        planSupervisor: (() => plan) as never,
        monitor: (async () => { events.push('monitor'); }) as never,
      });
      await supervisor.release();
      await supervisor.completion();
      await supervisor.cleanup();
      const gateIndex = events.indexOf('gate-open');
      expect(gateIndex).toBeGreaterThan(0);
      expect(events[gateIndex - 1]).toBe('cli-verify');
      expect(events[gateIndex + 1]).toBe('cli-verify');
      expect(cli.verify).toHaveBeenCalledTimes(5);
      expect(events.at(-1)).toBe('cleanup');
      expect(inspectGenesis001FrozenRecoveryMetadata(state.workspaceRoot)[0]?.state)
        .toBe('release-uncertain');
    } finally {
      signalLatch.close();
    }
  });
});

describe('Genesis 001 concrete publisher CLI', () => {
  it('requires the exact source-bound nonce and rejects every extra argument', () => {
    expect(parseGenesis001FrozenPublisherCliArguments([
      'publish',
      `--confirm-freeze-nonce=${G001_FREEZE_NONCE}`,
    ])).toEqual({ command: 'publish', confirmation: G001_FREEZE_NONCE });
    for (const arguments_ of [
      [],
      ['publish'],
      ['publish', '--confirm-freeze-nonce=wrong'],
      ['publish', `--confirm-freeze-nonce=${G001_FREEZE_NONCE}`, '--retry'],
    ]) expect(() => parseGenesis001FrozenPublisherCliArguments(arguments_)).toThrow(/Usage:/);
  });

  it('uses only the exact Node runtime and verified archive cache for dependency construction', () => {
    const workspaceParent = privateRoot('g001-runtime-config-');
    const workspaceRoot = join(workspaceParent, 'workspace');
    mkdirSync(workspaceRoot, { mode: 0o700 });
    chmodSync(workspaceRoot, 0o700);
    const configuration = genesis001RuntimeConfiguration({
      repositoryRoot: process.cwd(),
      workspaceRoot,
      nodeExecutablePath: '/private/toolchain/node',
      dependencyCacheRoot: '/private/dependencies',
      cliConfigPath: '/private/cli.toml',
      adminSecretPath: '/private/admin.secret',
      environment: {
        HOME: '/private/home',
        PATH: '/ambient/homebrew/bin:/usr/bin:/bin',
        WKG001_PNPM_EXECUTABLE_PATH: '/must/not/pass',
        WKG001_PNPM_STORE_PATH: '/must/not/pass',
      },
    });
    expect(configuration).toMatchObject({
      nodeExecutablePath: '/private/toolchain/node',
      dependencyCacheRoot: '/private/dependencies',
    });
    expect(configuration).not.toHaveProperty('pnpmExecutablePath');
    expect(configuration).not.toHaveProperty('pnpmStorePath');
    expect(configuration.childEnvironment.PATH).toBe('/usr/bin:/bin');

    const source = readFileSync('scripts/genesis001-frozen-publisher.ts', 'utf8');
    const runtime = readFileSync('scripts/genesis001-frozen-publisher-runtime.ts', 'utf8');
    expect(source).toContain('WKG001_NODE_EXECUTABLE_PATH');
    expect(source).toContain('WKG001_PRODUCTION_DEPENDENCY_CACHE_ROOT');
    expect(`${source}\n${runtime}`).not.toContain('WKG001_PNPM_EXECUTABLE_PATH');
    expect(`${source}\n${runtime}`).not.toContain('WKG001_PNPM_STORE_PATH');
    expect(runtime).not.toContain("executable: '/bin/bash'");
  });

  it('rejects substituted or mutable Node executables and reattests identity', () => {
    const root = privateRoot('g001-node-attestation-');
    const executable = join(root, 'node');
    const bytes = Buffer.from('test-only-node-runtime\n', 'utf8');
    writeFileSync(executable, bytes, { mode: 0o500, flag: 'wx' });
    chmodSync(executable, 0o500);
    const sha256 = createHash('sha256').update(bytes).digest('hex');
    const snapshot = genesis001FrozenPublisherRuntimeTestSeams.attestBuildNode(
      executable,
      Object.freeze({
        expectedPath: executable,
        expectedVersion: 'v24.19.0',
        expectedSha256: sha256,
        expectedPlatform: process.platform,
        expectedArchitecture: process.arch,
        readVersion: () => 'v24.19.0',
      }),
    );
    expect(snapshot.provenance).toMatchObject({
      platform: process.platform,
      architecture: process.arch,
      nodeVersion: 'v24.19.0',
      nodeExecutableSha256: sha256,
    });
    expect(() => snapshot.verify()).not.toThrow();

    chmodSync(executable, 0o755);
    expect(() => snapshot.verify()).toThrow(/Node.*changed|runtime.*invalid/i);
  });

  it('rejects wrong Node bytes/version plus symlinked and hard-linked runtimes', () => {
    const root = privateRoot('g001-node-rejections-');
    const executable = join(root, 'node');
    const bytes = Buffer.from('test-only-node-runtime\n', 'utf8');
    writeFileSync(executable, bytes, { mode: 0o500, flag: 'wx' });
    chmodSync(executable, 0o500);
    const sha256 = createHash('sha256').update(bytes).digest('hex');
    const expectation = Object.freeze({
      expectedPath: executable,
      expectedVersion: 'v24.19.0',
      expectedSha256: sha256,
      expectedPlatform: process.platform,
      expectedArchitecture: process.arch,
      readVersion: () => 'v24.19.0',
    });
    expect(() => genesis001FrozenPublisherRuntimeTestSeams.attestBuildNode(
      executable,
      { ...expectation, expectedSha256: '9'.repeat(64) },
    )).toThrow(/Node runtime is invalid/i);
    expect(() => genesis001FrozenPublisherRuntimeTestSeams.attestBuildNode(
      executable,
      { ...expectation, readVersion: () => 'v24.18.0' },
    )).toThrow(/Node runtime is invalid/i);

    const hardlink = join(root, 'node-hardlink');
    linkSync(executable, hardlink);
    expect(() => genesis001FrozenPublisherRuntimeTestSeams.attestBuildNode(
      executable,
      expectation,
    )).toThrow(/Node runtime is invalid/i);
    rmSync(hardlink);

    const symlink = join(root, 'node-symlink');
    symlinkSync(executable, symlink);
    expect(() => genesis001FrozenPublisherRuntimeTestSeams.attestBuildNode(
      symlink,
      { ...expectation, expectedPath: symlink },
    )).toThrow(/Node runtime is invalid/i);
  });
});

describe('Genesis 001 interruption containment', () => {
  it('turns SIGTERM into one abort latch instead of allowing a later gate release', async () => {
    const signalProcess = new EventEmitter() as EventEmitter & Pick<NodeJS.Process, 'on' | 'off'>;
    const latch = createGenesis001SignalLatch(signalProcess);
    const abort = vi.fn(async () => undefined);
    latch.bindAbort(abort);
    signalProcess.emit('SIGTERM', 'SIGTERM');
    signalProcess.emit('SIGINT', 'SIGINT');
    await new Promise(resolvePromise => setImmediate(resolvePromise));
    expect(abort).toHaveBeenCalledTimes(1);
    expect(latch.signal()).toBe('SIGTERM');
    expect(() => latch.throwIfAborted()).toThrow(/interrupted by SIGTERM/i);
    latch.close();
  });

  it('terminates a detached child process group including descendants', async () => {
    const child = spawn('/bin/sh', ['-c', "trap '' TERM; sleep 30 & wait"], {
      detached: process.platform !== 'win32',
      stdio: 'ignore',
    });
    await new Promise(resolvePromise => setTimeout(resolvePromise, 100));
    try {
      await terminateGenesis001ProcessGroup(child, 150);
      if (process.platform !== 'win32' && child.pid !== undefined) {
        expect(() => process.kill(-child.pid!, 0)).toThrow();
      }
    } finally {
      if (child.pid !== undefined) {
        try { process.kill(-child.pid, 'SIGKILL'); } catch { /* Already contained. */ }
      }
    }
  });

  it('cleans the allocated supervisor if startup fails before it can be returned', async () => {
    const state = recoveryFixture();
    const signalProcess = new EventEmitter() as EventEmitter & Pick<NodeJS.Process, 'on' | 'off'>;
    const signalLatch = createGenesis001SignalLatch(signalProcess);
    const cli = pinnedCliSnapshot();
    const plan = Object.freeze({
      identity: Object.freeze({
        schemaVersion: 1 as const,
        profile: 'warpkeep-greater-realm-publish-supervisor-v1' as const,
        supervisorId: 'd'.repeat(32),
        supervisorDirectory: join(state.workspaceRoot, 'supervisors', `publish-${'d'.repeat(32)}`),
      }),
      allocate: vi.fn(),
      start: vi.fn(async () => { throw new Error('startup failed'); }),
      release: vi.fn(),
      cleanup: vi.fn(async () => undefined),
      executionState: vi.fn(() => ({})),
    });
    const supervisorRoot = join(state.workspaceRoot, 'supervisors');
    mkdirSync(supervisorRoot, { mode: 0o700 });
    chmodSync(supervisorRoot, 0o700);
    try {
      await expect(prepareGenesis001SupervisedPublish({
        configuration: {
          repositoryRoot: process.cwd(),
          workspaceRoot: state.workspaceRoot,
          nodeExecutablePath: '/private/node',
          dependencyCacheRoot: '/private/dependencies',
          cliConfigPath: '/private/cli.toml',
          adminSecretPath: '/private/admin.secret',
          childEnvironment: {},
        },
        cli,
        arguments_: ['publish'],
        recovery: state.journal,
        signalLatch,
        planSupervisor: (() => plan) as never,
      })).rejects.toThrow(/startup failed/i);
      expect(plan.cleanup).toHaveBeenCalledTimes(1);
      expect(cli.verify).toHaveBeenCalledTimes(1);
      expect(state.journal.record().state).toBe('prepared');
    } finally {
      signalLatch.close();
    }
  });
});
