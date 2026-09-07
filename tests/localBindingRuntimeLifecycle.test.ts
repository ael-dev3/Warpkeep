// @vitest-environment node

import { createHash } from 'node:crypto';
import {
  cpSync,
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  realpathSync,
  readdirSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { basename, dirname, join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createPtrFixture, LINUX_PACKAGE_KEYS } from './fixtures/ptrLockedSourceBuildFixture';
import {
  createGenesis002Fixture,
} from './fixtures/genesis002LockedSourceBuildFixture';

const FIXED_ROOT = '/home/snapmeter/.warpkeep/release-preparation-v1';

const boundary = vi.hoisted(() => ({
  request: undefined as Record<string, unknown> | undefined,
  events: [] as string[],
  cleanupRoots: [] as string[],
  executableAttestations: 0,
  fixtureUid: 1000,
  executableFailureAt: 0,
  commandFailure: '' as '' | 'typecheck' | 'build',
  buildOutputScenario: 'success' as 'success' | 'existing-directory' | 'existing-file' | 'existing-link' | 'escaped-root',
  buildOutputWasPrecreated: false,
  observedBuildOutputMode: 0,
  observedPostBuildOutputMode: 0,
  deregisterFailure: false,
  typecheckArgs: [] as string[],
  typecheckConfig: undefined as Record<string, unknown> | undefined,
  builderKeys: [] as string[],
  commands: [] as Array<{ executable: string; args: readonly string[]; env?: NodeJS.ProcessEnv }>,
  executableRecords: [] as Array<{ path: string; options: Record<string, unknown> }>,
  compilerFailureAt: 0,
  compilerAttestations: 0,
  compilerNamespaceScenario: '' as '' | 'extra' | 'owner' | 'mode',
  compilerExecutableScenario: '' as '' | 'node22' | 'digest' | 'owner' | 'mode',
  compatibilityScenario: 'success' as 'success' | 'baseline-nondeterminism'
    | 'frozen-nondeterminism' | 'cross-lane-substitution' | 'artifact-mutation'
    | 'frozen-artifact-mutation' | 'artifact-link-substitution' | 'proof-failure'
    | 'build-command-failure',
  compatibilityBuilds: { baseline: 0, frozen: 0 },
  compatibilityProofInput: undefined as Record<string, any> | undefined,
}));

vi.mock('node:fs', async () => {
  const actual = await vi.importActual<typeof import('node:fs')>('node:fs');
  const compilerVersionRoot = '/home/snapmeter/.warpkeep/release-preparation-v1/toolchain/node-v24.19.0-linux-x64';
  const compilerBinRoot = `${compilerVersionRoot}/bin`;
  const compilerDirectories = new Set([compilerVersionRoot, compilerBinRoot]);
  const compilerDirectoryState = (path: string) => ({
    dev: 1n, ino: path === compilerVersionRoot ? 24n : 25n,
    mode: boundary.compilerNamespaceScenario === 'mode' ? 0o40755n : 0o40700n,
    uid: boundary.compilerNamespaceScenario === 'owner' ? 999n : 1000n,
    nlink: 2n, size: 1n, mtimeNs: 3n, ctimeNs: 4n,
    isDirectory: () => true, isFile: () => false, isSymbolicLink: () => false,
  });
  const normalize = <T extends { mode: number | bigint; uid: number | bigint; isDirectory(): boolean; isFile(): boolean }>(
    status: T,
  ): T => {
    // Controlled fixture identity is the approved runtime account, independent
    // of the ambient CI owner. Preserve native Linux modes and remaining stats.
    Object.defineProperty(status, 'uid', {
      value: typeof status.uid === 'bigint' ? BigInt(boundary.fixtureUid) : boundary.fixtureUid,
    });
    if (process.platform !== 'win32') return status;
    const permissions = status.isDirectory() ? 0o700 : status.isFile() ? 0o600 : 0o777;
    Object.defineProperty(status, 'mode', {
      value: typeof status.mode === 'bigint'
        ? (status.mode & ~0o7777n) | BigInt(permissions)
        : (status.mode & ~0o7777) | permissions,
    });
    return status;
  };
  return {
    ...actual,
    lstatSync(path: import('node:fs').PathLike, options?: { bigint?: boolean }) {
      if (typeof path === 'string' && compilerDirectories.has(path)) {
        return compilerDirectoryState(path);
      }
      const status = actual.lstatSync(path, options as never);
      return normalize(status);
    },
    fstatSync(descriptor: number, options?: { bigint?: boolean }) {
      const status = actual.fstatSync(descriptor, options as never);
      return normalize(status);
    },
    readdirSync(path: import('node:fs').PathLike, options?: unknown) {
      if (path === compilerVersionRoot) return boundary.compilerNamespaceScenario === 'extra'
        ? ['bin', 'hostile'] : ['bin'];
      if (path === compilerBinRoot) return ['node'];
      return actual.readdirSync(path, options as never);
    },
    realpathSync(path: import('node:fs').PathLike) {
      if (typeof path === 'string' && compilerDirectories.has(path)) return path;
      return actual.realpathSync(path);
    },
  };
});

vi.mock('../scripts/greater-realm-production-provenance', async () => {
  const fs = await vi.importActual<typeof import('node:fs')>('node:fs');
  return {
    createGreaterRealmProductionCommitMaterialization(input: Readonly<{
      repositoryRoot: string;
      moduleSourceCommit: string;
      destination: string;
    }>) {
      fs.cpSync(input.repositoryRoot, input.destination, { recursive: true, errorOnExist: true });
      // The real descriptor writer materializes every directory at 0700.
      // cpSync creates destination directories through the ambient umask on
      // Linux, so reproduce the production boundary before exercising it.
      const makeDirectoriesPrivate = (candidate: string) => {
        const state = fs.lstatSync(candidate);
        if (!state.isDirectory()) return;
        fs.chmodSync(candidate, 0o700);
        for (const name of fs.readdirSync(candidate)) {
          makeDirectoriesPrivate(join(candidate, name));
        }
      };
      makeDirectoriesPrivate(input.destination);
      let cleaned = false;
      return Object.freeze({
        root: input.destination,
        moduleSourceCommit: input.moduleSourceCommit,
        moduleTreeId: 'b'.repeat(40),
        verify(allowed?: Readonly<{ files?: readonly string[] }>) {
          const bundle = allowed?.files?.find(path => /^spacetimedb\/(?:ptr|genesis002)\/dist\/bundle\.js$/u.test(path));
          if (bundle !== undefined) {
            if (bundle.startsWith('spacetimedb/genesis002/')
                && fs.existsSync(join(input.destination, 'spacetimedb', 'node_modules'))) {
              throw new Error('LIFECYCLE_BUILD_RESOLUTION_LINK_RETAINED');
            }
            const dist = join(input.destination, ...dirname(bundle).split('/'));
            const mode = fs.lstatSync(dist).mode & 0o7777;
            if (process.platform !== 'win32' && mode !== 0o700) {
              throw new Error('LIFECYCLE_MATERIALIZATION_DIRECTORY_CHANGED');
            }
            boundary.events.push('materialization:verified-private-output');
          }
        },
        cleanup() {
          if (!cleaned) fs.rmSync(input.destination, { recursive: true, force: false });
          cleaned = true;
        },
      });
    },
  };
});

vi.mock('../scripts/greater-realm-openat', async () => {
  const fs = await vi.importActual<typeof import('node:fs')>('node:fs');
  const path = await vi.importActual<typeof import('node:path')>('node:path');
  return {
    stageGreaterRealmOpenAtHelper(input: Readonly<{ root: string }>) {
      const exact = (logical: string) => path.join(input.root, ...logical.split('/'));
      return Object.freeze({
        root: input.root,
        mkdir(logical: string) {
          fs.mkdirSync(exact(logical), { recursive: true, mode: 0o700 });
        },
        writeFile(logical: string, body: Buffer, mode: number) {
          fs.mkdirSync(path.dirname(exact(logical)), { recursive: true, mode: 0o700 });
          fs.writeFileSync(exact(logical), body, { flag: 'wx', mode });
        },
        symlink(logical: string, target: string, targetRootRelative: string) {
          const destination = exact(logical);
          const resolved = path.resolve(path.dirname(destination), target);
          if (path.relative(input.root, resolved).split(path.sep).join('/') !== targetRootRelative) {
            throw new Error('LIFECYCLE_LINK_ESCAPE');
          }
          fs.mkdirSync(path.dirname(destination), { recursive: true, mode: 0o700 });
          if (fs.lstatSync(resolved).isDirectory()) {
            fs.cpSync(resolved, destination, { recursive: true, errorOnExist: true });
          } else fs.copyFileSync(resolved, destination, fs.constants.COPYFILE_EXCL);
        },
        finish() {},
      });
    },
  };
});

vi.mock('../scripts/local-binding-bounded-file.mjs', async () => {
  const actual = await vi.importActual<typeof import('../scripts/local-binding-bounded-file.mjs')>(
    '../scripts/local-binding-bounded-file.mjs',
  );
  return {
    ...actual,
    readLocalBindingBoundedFile(path: string, options: Record<string, unknown>) {
      if (options.requireExecutable === true) {
        boundary.executableRecords.push({ path, options });
        if (path.endsWith('/node-v24.19.0-linux-x64/bin/node')) {
          boundary.compilerAttestations += 1;
          if (boundary.compilerAttestations === boundary.compilerFailureAt) {
            throw Object.assign(new Error('LOCAL_BINDING_BOUNDED_FILE_CHANGED'), {
              code: 'LOCAL_BINDING_BOUNDED_FILE_CHANGED',
            });
          }
          const node22 = boundary.compilerExecutableScenario === 'node22';
          const actual = {
            bytes: node22 ? 124819136 : 125989464,
            sha256: node22
              ? 'e6ec2c188d83d813f81f2de8aea084d74dce603ac1abedd0a30ad941b10087b2'
              : boundary.compilerExecutableScenario === 'digest' ? 'f'.repeat(64)
                : 'bc17c508ffeed0ec622934f9b7fa72f8e78da65350e63c3eceb56fa688aa5e12',
            uid: boundary.compilerExecutableScenario === 'owner' ? 999 : 1000,
            mode: boundary.compilerExecutableScenario === 'mode' ? 0o700 : 0o500,
          };
          const invalidMetadata = actual.uid !== options.expectedUid
            || actual.mode !== options.expectedMode;
          const changedBytes = actual.bytes !== options.expectedBytes
            || actual.sha256 !== options.expectedSha256;
          if (invalidMetadata || changedBytes) {
            const code = invalidMetadata
              ? 'LOCAL_BINDING_BOUNDED_FILE_INVALID'
              : 'LOCAL_BINDING_BOUNDED_FILE_CHANGED';
            throw Object.assign(new Error(code), { code });
          }
        }
        boundary.events.push(`attest:${path.split(/[\\/]/u).at(-1)}`);
        boundary.executableAttestations += 1;
        if (boundary.executableAttestations === boundary.executableFailureAt) {
          throw Object.assign(new Error('LOCAL_BINDING_BOUNDED_FILE_CHANGED'), {
            code: 'LOCAL_BINDING_BOUNDED_FILE_CHANGED',
          });
        }
        return Object.freeze({ body: Buffer.alloc(0), identity: Object.freeze({}) });
      }
      return actual.readLocalBindingBoundedFile(path, options as never);
    },
  };
});

vi.mock('../scripts/local-binding-native-ts-hooks.mjs', () => ({
  installLocalBindingNativeTsHooks() {
    boundary.events.push('hooks:register');
    return Object.freeze({ deregister() {
      boundary.events.push('hooks:deregister');
      if (boundary.deregisterFailure) throw new Error('CONTROLLED_DEREGISTER_FAILED');
    } });
  },
}));

vi.mock('node:child_process', async () => {
  const actual = await vi.importActual<typeof import('node:child_process')>('node:child_process');
  return {
    ...actual,
    spawnSync(executable: string, args: readonly string[], options: { cwd: string; env?: NodeJS.ProcessEnv }) {
      boundary.commands.push({ executable, args: [...args], env: options.env });
      if (args.includes('--noEmit')) {
        boundary.typecheckArgs = [...args];
        const project = args[args.indexOf('--project') + 1]!;
        if (basename(project) === 'genesis002-typecheck-v1.json') {
          boundary.typecheckConfig = JSON.parse(readFileSync(project, 'utf8'));
        }
        boundary.events.push('command:typecheck');
        if (boundary.commandFailure === 'typecheck') {
          return { status: 3, signal: null, error: undefined, stdout: Buffer.alloc(0), stderr: Buffer.from('failed') };
        }
        const dist = join(options.cwd, 'dist');
        if (boundary.buildOutputScenario === 'existing-directory') mkdirSync(dist, { mode: 0o700 });
        if (boundary.buildOutputScenario === 'existing-file') writeFileSync(dist, 'unexpected', { mode: 0o600 });
        if (boundary.buildOutputScenario === 'existing-link') {
          const target = join(dirname(options.cwd), 'unexpected-dist-target');
          mkdirSync(target, { mode: 0o700 });
          symlinkSync(target, dist, 'junction');
        }
      } else if (args[0] === 'build') {
        if (executable !== boundary.request?.cliPath) {
          throw new Error('LIFECYCLE_DID_NOT_EXECUTE_ATTESTED_CLI_SNAPSHOT');
        }
        if (boundary.commandFailure === 'build') {
          boundary.events.push('command:build-snapshot-cli');
          return { status: 4, signal: null, error: undefined, stdout: Buffer.alloc(0), stderr: Buffer.from('failed') };
        }
        const modulePath = args[args.indexOf('--module-path') + 1]!;
        if (modulePath === 'spacetimedb/genesis002') {
          const resolutionLink = join(options.cwd, 'spacetimedb', 'node_modules');
          if (!lstatSync(resolutionLink).isSymbolicLink()
              || realpathSync(resolutionLink) !== realpathSync(join(options.cwd, modulePath, 'node_modules'))) {
            throw new Error('LIFECYCLE_BUILD_RESOLUTION_LINK_MISSING');
          }
          boundary.events.push('build:resolution-link');
        }
        const dist = join(options.cwd, ...modulePath.split('/'), 'dist');
        boundary.buildOutputWasPrecreated = existsSync(dist);
        if (boundary.buildOutputWasPrecreated) {
          boundary.observedBuildOutputMode = lstatSync(dist).mode & 0o7777;
        }
        boundary.events.push('build-output:precreated');
        boundary.events.push('command:build-snapshot-cli');
        // Reproduce the real CLI's recursive mkdir under ambient umask 0022.
        // An already-private directory retains 0700; an absent one becomes 0755.
        mkdirSync(dist, { recursive: true, mode: 0o755 });
        boundary.observedPostBuildOutputMode = lstatSync(dist).mode & 0o7777;
        let bundle = 'controlled-bundle';
        if (boundary.request?.profile === 'warpkeep-local-binding-genesis001-compatibility-worker-v1') {
          const lane = options.cwd.includes('genesis001-baseline-locked-source-builds-v1')
            ? 'baseline' : 'frozen';
          boundary.compatibilityBuilds[lane] += 1;
          const ordinal = boundary.compatibilityBuilds[lane];
          bundle = boundary.compatibilityScenario === 'cross-lane-substitution'
            ? 'same-bundle'
            : `${lane}-bundle${boundary.compatibilityScenario === `${lane}-nondeterminism` && ordinal === 2
              ? '-changed' : ''}`;
        }
        writeFileSync(join(dist, 'bundle.js'), bundle, { mode: 0o600 });
      } else throw new Error(`UNEXPECTED_LIFECYCLE_COMMAND:${executable}:${args.join(' ')}`);
      return { status: 0, signal: null, error: undefined, stdout: Buffer.alloc(0), stderr: Buffer.alloc(0) };
    },
  };
});

vi.mock('warpkeep:ptr-binding-entry', async () => {
  const actual = await vi.importActual<typeof import('../scripts/ptr-binding-linux-locked-source-build')>(
    '../scripts/ptr-binding-linux-locked-source-build',
  );
  return {
    withPtrLinuxLockedSourceBuild(input: Parameters<typeof actual.withPtrLinuxLockedSourceBuild>[0]) {
      boundary.events.push('builder:enter');
      const operation = input.operation;
      const result = actual.withPtrLinuxLockedSourceBuild({
        ...input,
        operation(context) {
          boundary.events.push('builder:operation');
          const value = operation(boundary.buildOutputScenario === 'escaped-root'
            ? { ...context, materializedRoot: input.repositoryRoot }
            : context);
          boundary.events.push('builder:operation-return');
          return value;
        },
      });
      boundary.events.push('builder:cleanup-complete');
      return result;
    },
  };
});

vi.mock('warpkeep:genesis002-binding-entry', async () => {
  const actual = await vi.importActual<typeof import('../scripts/genesis002-binding-linux-locked-source-build')>(
    '../scripts/genesis002-binding-linux-locked-source-build',
  );
  return {
    withGenesis002LinuxLockedSourceBuild(input: Parameters<typeof actual.withGenesis002LinuxLockedSourceBuild>[0]) {
      boundary.events.push('builder:enter');
      const operation = input.operation;
      const result = actual.withGenesis002LinuxLockedSourceBuild({
        ...input,
        operation(context) {
          boundary.events.push('builder:operation');
          const value = operation(boundary.buildOutputScenario === 'escaped-root'
            ? { ...context, materializedRoot: input.repositoryRoot }
            : context);
          boundary.events.push('builder:operation-return');
          return value;
        },
      });
      boundary.events.push('builder:cleanup-complete');
      return result;
    },
  };
});

vi.mock('warpkeep:genesis001-binding-entry', async () => {
  const fs = await vi.importActual<typeof import('node:fs')>('node:fs');
  return {
    withGenesis001LinuxLockedSourceBuild(input: Readonly<Record<string, any>>) {
      boundary.builderKeys = Object.keys(input).sort();
      boundary.events.push('builder:enter');
      const root = join(input.materializationParent, 'genesis001-locked-source-builds-v1', 'e'.repeat(32));
      const moduleRoot = join(root, 'spacetimedb');
      fs.mkdirSync(join(moduleRoot, 'node_modules', 'typescript', 'bin'), { recursive: true, mode: 0o700 });
      boundary.events.push('builder:operation');
      const result = input.operation({
        materializedRoot: root,
        dependencyClosureDigest: '4'.repeat(64),
        moduleTreeId: '3'.repeat(40),
      });
      boundary.events.push('builder:operation-return');
      boundary.events.push('builder:cleanup-complete');
      return Object.freeze({ result, dependencyClosureDigest: '4'.repeat(64), moduleTreeId: '3'.repeat(40) });
    },
  };
});

vi.mock('warpkeep:genesis001-current-binding-entry', async () => {
  const actual = await vi.importActual<typeof import('../scripts/genesis001-current-binding-linux-locked-source-build')>(
    '../scripts/genesis001-current-binding-linux-locked-source-build',
  );
  return {
    withGenesis001CurrentLinuxLockedSourceBuild(
      input: Parameters<typeof actual.withGenesis001CurrentLinuxLockedSourceBuild>[0],
    ) {
      boundary.builderKeys = Object.keys(input).sort();
      boundary.events.push('builder:enter');
      const operation = input.operation;
      const result = actual.withGenesis001CurrentLinuxLockedSourceBuild({
        ...input,
        operation(context) {
          boundary.events.push('builder:operation');
          const value = operation(context);
          boundary.events.push('builder:operation-return');
          return value;
        },
      });
      boundary.events.push('builder:cleanup-complete');
      return result;
    },
  };
});

vi.mock('../scripts/local-binding-runtime-core.mjs', () => ({
  validateLocalBindingWorkerRequest(value: unknown) { return value; },
  async deriveFixedLocalBindingRuntime() {
    boundary.events.push('entrypoint:core');
    const { runFixedLocalBindingWorker } = await import('../scripts/local-binding-runtime-worker.mjs');
    const result = await runFixedLocalBindingWorker(boundary.request);
    if (!('handoffPath' in result)) throw new Error('LIFECYCLE_UNEXPECTED_COMPATIBILITY_RESULT');
    const bytes = readFileSync(result.handoffPath);
    return Object.freeze({
      profile: 'warpkeep-spacetime-binding-final-preparation-linux-x64-v1',
      sourceCommit: result.sourceCommit,
      sourceTree: result.sourceTree,
      bundleSha256: result.bundleSha256,
      dependencyClosureDigest: result.dependencyClosureDigest,
      bindings: Object.freeze([{ path: 'spacetimedb/ptr/generated-bindings/index.ts', bytes }]),
    });
  },
}));

vi.mock('warpkeep:genesis001-compatibility-entry', async () => {
  const fs = await vi.importActual<typeof import('node:fs')>('node:fs');
  const proof = await vi.importActual<typeof import('../scripts/genesis001-local-upgrade-proof.mjs')>(
    '../scripts/genesis001-local-upgrade-proof.mjs',
  );
  const build = (input: Readonly<Record<string, any>>, lane: 'baseline' | 'frozen') => {
    boundary.builderKeys = Object.keys(input).sort();
    const ordinal = boundary.compatibilityBuilds[lane] + 1;
    const stateChild = lane === 'baseline'
      ? 'genesis001-baseline-locked-source-builds-v1' : 'genesis001-locked-source-builds-v1';
    const root = join(input.materializationParent, stateChild, String(ordinal).padStart(32, lane === 'baseline' ? 'a' : 'b'));
    fs.mkdirSync(join(root, 'spacetimedb', 'node_modules', 'typescript', 'bin'), {
      recursive: true, mode: 0o700,
    });
    const dependencyClosureDigest = boundary.compatibilityScenario === 'cross-lane-substitution'
      ? '4'.repeat(64) : (lane === 'baseline' ? '5' : '4').repeat(64);
    const moduleTreeId = (lane === 'baseline' ? '6' : '3').repeat(40);
    const result = input.operation({ materializedRoot: root, dependencyClosureDigest, moduleTreeId });
    return Object.freeze({ result, dependencyClosureDigest, moduleTreeId });
  };
  return {
    withGenesis001BaselineLinuxLockedSourceBuild(input: Readonly<Record<string, any>>) {
      return build(input, 'baseline');
    },
    withGenesis001LinuxLockedSourceBuild(input: Readonly<Record<string, any>>) {
      return build(input, 'frozen');
    },
    async runGenesis001LocalUpgradeProof(input: Readonly<Record<string, any>>) {
      boundary.compatibilityProofInput = input;
      if (boundary.compatibilityScenario === 'proof-failure') {
        throw new Error('GENESIS001_LOCAL_PROOF_STARTUP_TIMEOUT');
      }
      if (boundary.compatibilityScenario === 'artifact-mutation') {
        fs.writeFileSync(input.baselineArtifact.path, 'mutated-bundle');
      }
      if (boundary.compatibilityScenario === 'frozen-artifact-mutation') {
        fs.writeFileSync(input.frozenArtifact.path, 'mutated-bundle');
      }
      if (boundary.compatibilityScenario === 'artifact-link-substitution') {
        fs.linkSync(input.baselineArtifact.path, `${input.baselineArtifact.path}.linked`);
      }
      proof.attestGenesis001LocalProofArtifact(input.baselineArtifact);
      proof.attestGenesis001LocalProofArtifact(input.frozenArtifact);
      return Object.freeze({
        baselineDescriptorSha256: '7'.repeat(64), frozenDescriptorSha256: '8'.repeat(64),
        checkedFrozenWriters: Object.freeze([
          'admin_allow_fid', 'admin_admit_founder_v1', 'admin_disable_fid',
          'admin_bump_auth_epoch', 'access_request_submit_v1', 'admin_reset_access_request_v1',
        ]),
      });
    },
  };
});

let restoreFixtureProcessOwner: (() => void) | undefined;
beforeEach(() => {
  // This controlled lifecycle uses simulated UID-1000 file metadata. The
  // in-process locked-source helper must observe the same simulated account,
  // not the ambient CI runner's UID. Native owner tests remain separate.
  if (process.getuid !== undefined) {
    const owner = vi.spyOn(process, 'getuid').mockReturnValue(1000);
    restoreFixtureProcessOwner = () => owner.mockRestore();
  }
});

afterEach(() => {
  restoreFixtureProcessOwner?.();
  restoreFixtureProcessOwner = undefined;
  boundary.request = undefined;
  boundary.events.length = 0;
  boundary.executableAttestations = 0;
  boundary.fixtureUid = 1000;
  boundary.executableFailureAt = 0;
  boundary.commandFailure = '';
  boundary.buildOutputScenario = 'success';
  boundary.buildOutputWasPrecreated = false;
  boundary.observedBuildOutputMode = 0;
  boundary.observedPostBuildOutputMode = 0;
  boundary.deregisterFailure = false;
  boundary.typecheckArgs.length = 0;
  boundary.typecheckConfig = undefined;
  boundary.builderKeys.length = 0;
  boundary.commands.length = 0;
  boundary.executableRecords.length = 0;
  boundary.compilerFailureAt = 0;
  boundary.compilerAttestations = 0;
  boundary.compilerNamespaceScenario = '';
  boundary.compilerExecutableScenario = '';
  boundary.compatibilityScenario = 'success';
  boundary.compatibilityBuilds.baseline = 0;
  boundary.compatibilityBuilds.frozen = 0;
  boundary.compatibilityProofInput = undefined;
  for (const root of boundary.cleanupRoots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe('controlled local binding runtime lifecycle', () => {
  it.each([999, 1001])('rejects a worker operation owned by UID %s before compiler commands', async uid => {
    prepareRequest();
    boundary.fixtureUid = uid;
    const { derivePreparedPtrLinuxBindings } = await import('../scripts/local-binding-runtime.mjs');
    await expect(derivePreparedPtrLinuxBindings()).rejects.toMatchObject({
      code: 'LOCAL_BINDING_WORKER_EXECUTABLE_INVALID',
    });
    expect(boundary.commands).toEqual([]);
  });

  function prepareRequest(lane: 'ptr' | 'genesis002' | 'genesis001' | 'current' | 'compatibility' = 'ptr') {
    const genesis002 = lane === 'genesis002';
    const genesis001 = lane === 'genesis001';
    const current = lane === 'current';
    const compatibility = lane === 'compatibility';
    const value = genesis002 || current
      ? createGenesis002Fixture()
      : createPtrFixture({ keys: LINUX_PACKAGE_KEYS });
    boundary.cleanupRoots.push(...value.cleanupRoots);
    const fixtureInput = 'input' in value ? value.input : {
      repositoryRoot: value.repositoryRoot,
      materializationParent: value.materializationParent,
      dependencyCacheRoot: value.dependencyCacheRoot,
      moduleSourceCommit: value.sourceCommit,
    };
    const sourceRoot = join(fixtureInput.materializationParent, 'source');
    cpSync(fixtureInput.repositoryRoot, sourceRoot, { recursive: true, errorOnExist: true });
    const snapshotRoot = join(fixtureInput.materializationParent, 'cli');
    mkdirSync(snapshotRoot, { mode: 0o700 });
    const cliPath = join(snapshotRoot, 'spacetimedb-cli');
    writeFileSync(cliPath, 'cli', { mode: 0o500 });
    writeFileSync(join(snapshotRoot, 'spacetimedb-standalone'), 'standalone', { mode: 0o500 });
    boundary.request = {
      schemaVersion: 1,
      profile: genesis002
        ? 'warpkeep-local-binding-genesis002-worker-v1'
        : current ? 'warpkeep-local-binding-genesis001-current-worker-v1'
        : compatibility ? 'warpkeep-local-binding-genesis001-compatibility-worker-v1'
        : genesis001 ? 'warpkeep-local-binding-genesis001-worker-v1'
          : 'warpkeep-local-binding-worker-v1',
      repositoryRoot: sourceRoot,
      sourceCommit: fixtureInput.moduleSourceCommit,
      sourceTree: 'c'.repeat(40),
      dependencyCacheRoot: fixtureInput.dependencyCacheRoot,
      materializationRoot: fixtureInput.materializationParent,
      nodePath: process.execPath,
      cliPath,
      handoffPath: join(fixtureInput.materializationParent, 'handoff.js'),
      nonce: 'd'.repeat(32), graph: {}, yaml: {},
    };
    if (genesis001 || compatibility) {
      for (const name of ['home', 'tmp']) mkdirSync(join(dirname(sourceRoot), name), { mode: 0o700 });
    }
    return { ...value, materializationParent: fixtureInput.materializationParent };
  }

  function messages(value: unknown): readonly string[] {
    const result: string[] = [];
    const visit = (error: unknown) => {
      if (error instanceof Error) result.push(error.message);
      if (error instanceof Error && error.cause !== undefined) visit(error.cause);
      if (error instanceof AggregateError) for (const nested of error.errors) visit(nested);
    };
    visit(value);
    return result;
  }

  function regularTree(root: string): readonly (readonly [string, string])[] {
    const result: [string, string][] = [];
    const visit = (directory: string, prefix: string) => {
      for (const name of readdirSync(directory).sort()) {
        const path = join(directory, name);
        const logical = prefix === '' ? name : `${prefix}/${name}`;
        if (lstatSync(path).isDirectory()) visit(path, logical);
        else result.push([logical, readFileSync(path).toString('base64')]);
      }
    };
    visit(root, '');
    return result;
  }

  it('aggregates an all-realm primary failure with CLI cleanup failure and retains diagnostics', async () => {
    prepareRequest('current');
    const operationRoot = dirname(boundary.request!.repositoryRoot as string);
    const diagnostics = join(operationRoot, 'diagnostics');
    mkdirSync(diagnostics, { mode: 0o700 });
    const primaryError = new Error('CONTROLLED_ALL_REALM_PRIMARY');
    const cleanupError = new Error('CONTROLLED_ALL_REALM_CLI_CLEANUP');
    const actualCore = await vi.importActual<typeof import('../scripts/local-binding-runtime-core.mjs')>(
      '../scripts/local-binding-runtime-core.mjs',
    );
    let resolved: unknown;
    let error: unknown;
    try {
      resolved = await actualCore.localBindingRuntimeTestSeams.runLocalBindingRuntimeLifecycle({
        async execute() { throw primaryError; },
        cleanupCli() { throw cleanupError; },
        retainDiagnosticsOnCleanupFailure: true,
        cleanupSuccess() { rmSync(operationRoot, { recursive: true, force: false }); },
      });
    } catch (caught) { error = caught; }

    expect(resolved).toBeUndefined();
    expect(error).toBeInstanceOf(AggregateError);
    expect((error as AggregateError).cause).toBe(primaryError);
    expect((error as AggregateError).errors).toEqual([primaryError, cleanupError]);
    expect(existsSync(diagnostics)).toBe(true);
  });

  it('preserves the first legacy cleanup failure when operation-root cleanup also fails', async () => {
    const cliCleanupError = new Error('CONTROLLED_LEGACY_CLI_CLEANUP');
    const operationRootCleanupError = new Error('CONTROLLED_LEGACY_OPERATION_ROOT_CLEANUP');
    const actualCore = await vi.importActual<typeof import('../scripts/local-binding-runtime-core.mjs')>(
      '../scripts/local-binding-runtime-core.mjs',
    );
    let cleanupSuccessCalls = 0;
    let resolved: unknown;
    let error: unknown;
    try {
      resolved = await actualCore.localBindingRuntimeTestSeams.runLocalBindingRuntimeLifecycle({
        async execute() { return 'prepared'; },
        cleanupCli() { throw cliCleanupError; },
        retainDiagnosticsOnCleanupFailure: false,
        cleanupSuccess() {
          cleanupSuccessCalls += 1;
          throw operationRootCleanupError;
        },
      });
    } catch (caught) { error = caught; }

    expect(cleanupSuccessCalls).toBe(1);
    expect(resolved).toBeUndefined();
    expect(error).toBeInstanceOf(AggregateError);
    expect((error as AggregateError).errors).toEqual([cliCleanupError]);
  });

  it('runs the public entrypoint through the actual worker and real locked-source helper', async () => {
    const value = prepareRequest();
    const liveBindings = join(process.cwd(), 'spacetimedb', 'ptr', 'generated-bindings');
    const beforeLiveBindings = regularTree(liveBindings);

    const { derivePreparedPtrLinuxBindings } = await import('../scripts/local-binding-runtime.mjs');
    const output = await derivePreparedPtrLinuxBindings();

    expect(Buffer.from(output.bindings[0]!.bytes).toString()).toBe('controlled-bundle');
    expect(boundary.buildOutputWasPrecreated).toBe(true);
    expect(boundary.observedBuildOutputMode).toBe(0o700);
    expect(boundary.observedPostBuildOutputMode).toBe(0o700);
    expect(regularTree(liveBindings)).toEqual(beforeLiveBindings);
    const nodeAttestation = `attest:${basename(process.execPath)}`;
    expect(boundary.events).toEqual([
      'entrypoint:core',
      nodeAttestation, 'attest:git', 'attest:spacetimedb-cli', 'attest:spacetimedb-standalone',
      'hooks:register',
      nodeAttestation, 'attest:git', 'attest:spacetimedb-cli', 'attest:spacetimedb-standalone',
      'builder:enter', 'builder:operation',
      nodeAttestation, 'attest:git', 'attest:spacetimedb-cli', 'attest:spacetimedb-standalone',
      'command:typecheck',
      nodeAttestation, 'attest:git', 'attest:spacetimedb-cli', 'attest:spacetimedb-standalone',
      'build-output:precreated',
      'command:build-snapshot-cli',
      nodeAttestation, 'attest:git', 'attest:spacetimedb-cli', 'attest:spacetimedb-standalone',
      'builder:operation-return', 'materialization:verified-private-output', 'builder:cleanup-complete',
      nodeAttestation, 'attest:git', 'attest:spacetimedb-cli', 'attest:spacetimedb-standalone',
      'hooks:deregister',
    ]);
    expect(existsSync(join(value.materializationParent, 'ptr-linux-builds'))).toBe(false);
  });

  it('dispatches the fixed G002 helper and compiles/builds only the Genesis 002 module', async () => {
    const value = prepareRequest('genesis002');
    const { runFixedLocalBindingWorker } = await import('../scripts/local-binding-runtime-worker.mjs');
    const result = await runFixedLocalBindingWorker(boundary.request);
    if (!('handoffPath' in result)) throw new Error('LIFECYCLE_UNEXPECTED_COMPATIBILITY_RESULT');
    expect(result.profile).toBe('warpkeep-local-binding-genesis002-worker-result-v1');
    expect(readFileSync(result.handoffPath, 'utf8')).toBe('controlled-bundle');
    expect(boundary.events).toContain('builder:operation');
    expect(boundary.events).toContain('command:typecheck');
    expect(boundary.typecheckArgs[boundary.typecheckArgs.indexOf('--project') + 1]).toBe(
      join(boundary.request!.materializationRoot as string, 'genesis002-typecheck-v1.json'),
    );
    expect(boundary.typecheckConfig).toEqual(expect.objectContaining({
      compilerOptions: {
        baseUrl: expect.stringContaining(join('spacetimedb', 'genesis002')),
        paths: {
          spacetimedb: [expect.stringMatching(/node_modules[\\/]spacetimedb[\\/]dist[\\/]index\.d\.ts$/u)],
          'spacetimedb/server': [expect.stringMatching(/node_modules[\\/]spacetimedb[\\/]dist[\\/]server[\\/]index\.d\.ts$/u)],
        },
      },
    }));
    expect(boundary.events).toContain('command:build-snapshot-cli');
    expect(readdirSync(join(value.materializationParent, 'genesis002-locked-source-builds-v1'))).toEqual([]);
  });

  it('dispatches G001 with four builder keys and a Node24-only clean compiler environment', async () => {
    prepareRequest('genesis001');
    const { runFixedLocalBindingWorker } = await import('../scripts/local-binding-runtime-worker.mjs');
    const result = await runFixedLocalBindingWorker(boundary.request);
    expect(result.profile).toBe('warpkeep-local-binding-genesis001-worker-result-v1');
    expect(boundary.builderKeys).toEqual([
      'dependencyCacheRoot', 'materializationParent', 'operation', 'repositoryRoot',
    ]);
    const compilerPath = `${FIXED_ROOT}/toolchain/node-v24.19.0-linux-x64/bin/node`;
    const typecheck = boundary.commands.find(command => command.args.includes('--noEmit'))!;
    const build = boundary.commands.find(command => command.args[0] === 'build')!;
    expect(typecheck.executable).toBe(compilerPath);
    expect(typecheck.executable).not.toBe(boundary.request!.nodePath);
    expect(typecheck.args).toEqual([
      expect.stringMatching(/node_modules[\\/]typescript[\\/]bin[\\/]tsc$/u),
      '--noEmit', '--project', expect.stringMatching(/spacetimedb[\\/]tsconfig\.json$/u),
    ]);
    expect(build.args).toEqual(['build', '--module-path', 'spacetimedb']);
    for (const command of [typecheck, build]) {
      expect(command.env).toEqual({
        HOME: join(dirname(boundary.request!.repositoryRoot as string), 'home'),
        TMPDIR: join(dirname(boundary.request!.repositoryRoot as string), 'tmp'),
        PATH: `${FIXED_ROOT}/toolchain/node-v24.19.0-linux-x64/bin`,
        LANG: 'C.UTF-8', LC_ALL: 'C.UTF-8', TZ: 'UTC',
      });
    }
    expect(boundary.executableRecords).toContainEqual(expect.objectContaining({
      path: compilerPath,
      options: expect.objectContaining({
        expectedBytes: 125989464,
        expectedSha256: 'bc17c508ffeed0ec622934f9b7fa72f8e78da65350e63c3eceb56fa688aa5e12',
        expectedUid: 1000,
        expectedMode: 0o500,
      }),
    }));
  });

  it('dispatches the current G001 root helper with five keys and Node22', async () => {
    const value = prepareRequest('current');
    const { runFixedLocalBindingWorker } = await import('../scripts/local-binding-runtime-worker.mjs');
    const result = await runFixedLocalBindingWorker(boundary.request);
    expect(result.profile).toBe('warpkeep-local-binding-genesis001-current-worker-result-v1');
    expect(boundary.builderKeys).toEqual([
      'dependencyCacheRoot', 'materializationParent', 'moduleSourceCommit', 'operation', 'repositoryRoot',
    ]);
    const typecheck = boundary.commands.find(command => command.args.includes('--noEmit'))!;
    const build = boundary.commands.find(command => command.args[0] === 'build')!;
    expect(typecheck.executable).toBe(boundary.request!.nodePath);
    expect(typecheck.args).toEqual([
      expect.stringMatching(/spacetimedb[\\/]node_modules[\\/]typescript[\\/]bin[\\/]tsc$/u),
      '--noEmit', '--project', expect.stringMatching(/spacetimedb[\\/]tsconfig\.json$/u),
    ]);
    expect(build.args).toEqual(['build', '--module-path', 'spacetimedb']);
    expect(boundary.executableRecords.some(record => record.path.includes('node-v24.19.0'))).toBe(false);
    expect(readdirSync(join(value.materializationParent, 'genesis001-current-locked-source-builds-v1'))).toEqual([]);
  });

  it.each(['typecheck', 'build'] as const)(
    'current G001 propagates %s failure without a handoff or result', async failedCommand => {
      prepareRequest('current');
      boundary.commandFailure = failedCommand;
      const { runFixedLocalBindingWorker } = await import('../scripts/local-binding-runtime-worker.mjs');
      let result: unknown;
      await expect(runFixedLocalBindingWorker(boundary.request).then(value => { result = value; }))
        .rejects.toThrow('LOCAL_BINDING_WORKER_COMMAND_FAILED');
      expect(result).toBeUndefined();
      expect(existsSync(boundary.request!.handoffPath as string)).toBe(false);
      if (failedCommand === 'typecheck') expect(boundary.events).not.toContain('command:build-snapshot-cli');
    },
  );

  it('current G001 rejects a pre-existing output namespace before build and handoff', async () => {
    prepareRequest('current');
    boundary.buildOutputScenario = 'existing-link';
    const { runFixedLocalBindingWorker } = await import('../scripts/local-binding-runtime-worker.mjs');
    await expect(runFixedLocalBindingWorker(boundary.request))
      .rejects.toThrow('LOCAL_BINDING_WORKER_BUILD_OUTPUT_INVALID');
    expect(boundary.events).not.toContain('command:build-snapshot-cli');
    expect(existsSync(boundary.request!.handoffPath as string)).toBe(false);
  });

  it('executes the actual fixed compatibility worker branch across four builds and the proof handoff', async () => {
    prepareRequest('compatibility');
    const { runFixedLocalBindingWorker } = await import('../scripts/local-binding-runtime-worker.mjs');
    const result = await runFixedLocalBindingWorker(boundary.request);
    expect(result).toEqual(expect.objectContaining({
      profile: 'warpkeep-local-binding-genesis001-compatibility-result-v1',
      baselineBundleSha256: createHash('sha256').update('baseline-bundle').digest('hex'),
      frozenBundleSha256: createHash('sha256').update('frozen-bundle').digest('hex'),
      baselineDescriptorSha256: '7'.repeat(64), frozenDescriptorSha256: '8'.repeat(64),
    }));
    expect(boundary.builderKeys).toEqual([
      'dependencyCacheRoot', 'materializationParent', 'operation', 'repositoryRoot',
    ]);
    expect(boundary.compatibilityBuilds).toEqual({ baseline: 2, frozen: 2 });
    expect(boundary.compatibilityProofInput).toEqual(expect.objectContaining({
      baselineArtifact: expect.objectContaining({ bytes: Buffer.byteLength('baseline-bundle') }),
      frozenArtifact: expect.objectContaining({ bytes: Buffer.byteLength('frozen-bundle') }),
    }));
  });

  it.each([
    ['baseline-nondeterminism', 'LOCAL_BINDING_RUNTIME_REPRODUCIBILITY_FAILED'],
    ['frozen-nondeterminism', 'LOCAL_BINDING_RUNTIME_REPRODUCIBILITY_FAILED'],
    ['cross-lane-substitution', 'LOCAL_BINDING_WORKER_CROSS_LANE_SUBSTITUTION'],
    ['artifact-mutation', 'GENESIS001_LOCAL_PROOF_ARTIFACT_CHANGED'],
    ['frozen-artifact-mutation', 'GENESIS001_LOCAL_PROOF_ARTIFACT_CHANGED'],
    ['artifact-link-substitution', 'GENESIS001_LOCAL_PROOF_ARTIFACT_INVALID'],
    ['proof-failure', 'GENESIS001_LOCAL_PROOF_STARTUP_TIMEOUT'],
    ['build-command-failure', 'LOCAL_BINDING_WORKER_COMMAND_FAILED'],
  ] as const)('rejects compatibility orchestration %s without a worker result', async (scenario, code) => {
    prepareRequest('compatibility');
    boundary.compatibilityScenario = scenario;
    if (scenario === 'build-command-failure') boundary.commandFailure = 'build';
    const { runFixedLocalBindingWorker } = await import('../scripts/local-binding-runtime-worker.mjs');
    await expect(runFixedLocalBindingWorker(boundary.request)).rejects.toThrow(code);
  });

  it.each(['extra', 'owner', 'mode'] as const)(
    'rejects compatibility compiler namespace mutation %s without a worker result', async scenario => {
      prepareRequest('compatibility');
      boundary.compilerNamespaceScenario = scenario;
      const { runFixedLocalBindingWorker } = await import('../scripts/local-binding-runtime-worker.mjs');
      let result: unknown;
      try { result = await runFixedLocalBindingWorker(boundary.request); } catch (error) {
        expect(error).toMatchObject({ code: 'LOCAL_BINDING_WORKER_COMPILER_INVALID' });
      }
      expect(result).toBeUndefined();
      expect(boundary.compatibilityBuilds).toEqual({ baseline: 0, frozen: 0 });
      expect(boundary.compatibilityProofInput).toBeUndefined();
    },
  );

  it('rejects a changed Node24 compiler identity after typecheck and before build output', async () => {
    prepareRequest('genesis001');
    boundary.compilerFailureAt = 4;
    const { runFixedLocalBindingWorker } = await import('../scripts/local-binding-runtime-worker.mjs');
    await expect(runFixedLocalBindingWorker(boundary.request))
      .rejects.toMatchObject({ code: 'LOCAL_BINDING_WORKER_EXECUTABLE_CHANGED' });
    expect(boundary.events).toContain('command:typecheck');
    expect(boundary.events).not.toContain('build-output:precreated');
    expect(boundary.events).not.toContain('command:build-snapshot-cli');
    expect(boundary.compilerAttestations).toBe(4);
    expect(existsSync(boundary.request!.handoffPath as string)).toBe(false);
  });

  it.each([
    ['Node22 substitution', 'node22'],
    ['wrong digest', 'digest'],
    ['wrong executable owner', 'owner'],
    ['wrong executable mode', 'mode'],
  ] as const)(
    'rejects compiler %s before entering the source builder or producing a handoff',
    async (_label, scenario) => {
      prepareRequest('genesis001');
      boundary.compilerExecutableScenario = scenario;
      const { runFixedLocalBindingWorker } = await import('../scripts/local-binding-runtime-worker.mjs');
      await expect(runFixedLocalBindingWorker(boundary.request)).rejects.toMatchObject({
        code: expect.stringMatching(/^LOCAL_BINDING_WORKER_EXECUTABLE_(?:INVALID|CHANGED)$/u),
      });
      expect(boundary.events).not.toContain('builder:enter');
      expect(boundary.events).not.toContain('command:typecheck');
      expect(boundary.events).not.toContain('command:build-snapshot-cli');
      expect(boundary.compilerAttestations).toBe(1);
      expect(existsSync(boundary.request!.handoffPath as string)).toBe(false);
    },
  );

  it('rejects compiler identity replacement after build and before handoff consumption', async () => {
    prepareRequest('genesis001');
    boundary.compilerFailureAt = 5;
    const { runFixedLocalBindingWorker } = await import('../scripts/local-binding-runtime-worker.mjs');
    await expect(runFixedLocalBindingWorker(boundary.request))
      .rejects.toMatchObject({ code: 'LOCAL_BINDING_WORKER_EXECUTABLE_CHANGED' });
    expect(boundary.events).toContain('builder:enter');
    expect(boundary.events).toContain('command:typecheck');
    expect(boundary.events).toContain('command:build-snapshot-cli');
    expect(boundary.compilerAttestations).toBe(5);
    expect(existsSync(boundary.request!.handoffPath as string)).toBe(false);
  });

  it.each(['extra', 'owner', 'mode'] as const)(
    'rejects an invalid Node24 compiler %s namespace before entering the source builder',
    async scenario => {
      prepareRequest('genesis001');
      boundary.compilerNamespaceScenario = scenario;
      const { runFixedLocalBindingWorker } = await import('../scripts/local-binding-runtime-worker.mjs');
      await expect(runFixedLocalBindingWorker(boundary.request))
        .rejects.toMatchObject({ code: 'LOCAL_BINDING_WORKER_COMPILER_INVALID' });
      expect(boundary.events).not.toContain('builder:enter');
      expect(boundary.events).not.toContain('command:typecheck');
      expect(boundary.events).not.toContain('command:build-snapshot-cli');
      expect(existsSync(boundary.request!.handoffPath as string)).toBe(false);
    },
  );

  it.each([
    ['existing-directory', true],
    ['existing-file', true],
    ['existing-link', true],
    ['escaped-root', false],
  ] as const)('rejects %s before the CLI build', async (scenario, typecheckRuns) => {
    prepareRequest();
    boundary.buildOutputScenario = scenario;
    const { runFixedLocalBindingWorker } = await import('../scripts/local-binding-runtime-worker.mjs');
    let error: unknown;
    try { await runFixedLocalBindingWorker(boundary.request); } catch (caught) { error = caught; }
    expect(messages(error)).toContain('LOCAL_BINDING_WORKER_BUILD_OUTPUT_INVALID');
    expect(boundary.events.includes('command:typecheck')).toBe(typecheckRuns);
    expect(boundary.events).not.toContain('command:build-snapshot-cli');
    expect(boundary.events.at(-1)).toBe('hooks:deregister');
  });

  it.each([
    ['Node', 9, /attest:(?:node|node\.exe)$/u],
    ['Git', 10, /attest:git$/u],
    ['CLI snapshot', 11, /attest:spacetimedb-cli$/u],
    ['CLI companion', 12, /attest:spacetimedb-standalone$/u],
  ] as const)('rejects a %s identity change at the operation boundary before typecheck',
    async (_label, failureAt, lastAttestation) => {
      prepareRequest();
      boundary.executableFailureAt = failureAt;
      const { derivePreparedPtrLinuxBindings } = await import('../scripts/local-binding-runtime.mjs');
      let error: unknown;
      try { await derivePreparedPtrLinuxBindings(); } catch (caught) { error = caught; }
      expect(messages(error)).toContain('LOCAL_BINDING_WORKER_EXECUTABLE_CHANGED');
      expect(boundary.events).toContain('builder:operation');
      expect(boundary.events).not.toContain('command:typecheck');
      expect(boundary.events.at(-2)).toMatch(lastAttestation);
      expect(boundary.events.at(-1)).toBe('hooks:deregister');
    });

  it.each(['typecheck', 'build'] as const)(
    'propagates %s failure, stops later commands, and deregisters hooks',
    async failedCommand => {
      prepareRequest();
      boundary.commandFailure = failedCommand;
      const { derivePreparedPtrLinuxBindings } = await import('../scripts/local-binding-runtime.mjs');
      let error: unknown;
      try { await derivePreparedPtrLinuxBindings(); } catch (caught) { error = caught; }
      expect(messages(error)).toContain('LOCAL_BINDING_WORKER_COMMAND_FAILED');
      if (failedCommand === 'typecheck') expect(boundary.events).not.toContain('command:build-snapshot-cli');
      expect(boundary.events.at(-1)).toBe('hooks:deregister');
    },
  );

  it('preserves a command primary failure together with hook deregistration failure', async () => {
    prepareRequest();
    boundary.commandFailure = 'build';
    boundary.deregisterFailure = true;
    const { runFixedLocalBindingWorker } = await import('../scripts/local-binding-runtime-worker.mjs');
    let error: unknown;
    try { await runFixedLocalBindingWorker(boundary.request); } catch (caught) { error = caught; }
    expect(error).toBeInstanceOf(AggregateError);
    expect(messages(error)).toEqual(expect.arrayContaining([
      'LOCAL_BINDING_WORKER_COMMAND_FAILED', 'CONTROLLED_DEREGISTER_FAILED',
    ]));
    expect((error as AggregateError).cause).toBe((error as AggregateError).errors[0]);
  });
});
