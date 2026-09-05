// @vitest-environment node

import { cpSync, existsSync, lstatSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { createPtrFixture, LINUX_PACKAGE_KEYS } from './fixtures/ptrLockedSourceBuildFixture';

const boundary = vi.hoisted(() => ({
  request: undefined as Record<string, unknown> | undefined,
  events: [] as string[],
  cleanupRoots: [] as string[],
  executableAttestations: 0,
  executableFailureAt: 0,
  commandFailure: '' as '' | 'typecheck' | 'build',
  deregisterFailure: false,
}));

vi.mock('node:fs', async () => {
  const actual = await vi.importActual<typeof import('node:fs')>('node:fs');
  const normalize = <T extends { mode: number | bigint; uid: number | bigint; isDirectory(): boolean; isFile(): boolean }>(
    status: T,
  ): T => {
    const permissions = status.isDirectory() ? 0o700 : status.isFile() ? 0o600 : 0o777;
    Object.defineProperty(status, 'mode', {
      value: typeof status.mode === 'bigint'
        ? (status.mode & ~0o7777n) | BigInt(permissions)
        : (status.mode & ~0o7777) | permissions,
    });
    Object.defineProperty(status, 'uid', {
      value: typeof status.uid === 'bigint' ? 1000n : 1000,
    });
    return status;
  };
  return {
    ...actual,
    lstatSync(path: import('node:fs').PathLike, options?: { bigint?: boolean }) {
      const status = actual.lstatSync(path, options as never);
      return process.platform === 'win32' ? normalize(status) : status;
    },
    fstatSync(descriptor: number, options?: { bigint?: boolean }) {
      const status = actual.fstatSync(descriptor, options as never);
      return process.platform === 'win32' ? normalize(status) : status;
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
      let cleaned = false;
      return Object.freeze({
        root: input.destination,
        moduleSourceCommit: input.moduleSourceCommit,
        moduleTreeId: 'b'.repeat(40),
        verify() {},
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
    spawnSync(executable: string, args: readonly string[], options: { cwd: string }) {
      if (args.includes('--noEmit')) {
        boundary.events.push('command:typecheck');
        if (boundary.commandFailure === 'typecheck') {
          return { status: 3, signal: null, error: undefined, stdout: Buffer.alloc(0), stderr: Buffer.from('failed') };
        }
      } else if (args[0] === 'build') {
        if (executable !== boundary.request?.cliPath) {
          throw new Error('LIFECYCLE_DID_NOT_EXECUTE_ATTESTED_CLI_SNAPSHOT');
        }
        boundary.events.push('command:build-snapshot-cli');
        if (boundary.commandFailure === 'build') {
          return { status: 4, signal: null, error: undefined, stdout: Buffer.alloc(0), stderr: Buffer.from('failed') };
        }
        const dist = join(options.cwd, 'spacetimedb', 'ptr', 'dist');
        mkdirSync(dist, { recursive: true, mode: 0o700 });
        writeFileSync(join(dist, 'bundle.js'), 'controlled-bundle', { mode: 0o600 });
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

afterEach(() => {
  boundary.request = undefined;
  boundary.events.length = 0;
  boundary.executableAttestations = 0;
  boundary.executableFailureAt = 0;
  boundary.commandFailure = '';
  boundary.deregisterFailure = false;
  for (const root of boundary.cleanupRoots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe('controlled local binding runtime lifecycle', () => {
  function prepareRequest() {
    const value = createPtrFixture({ keys: LINUX_PACKAGE_KEYS });
    boundary.cleanupRoots.push(...value.cleanupRoots);
    const sourceRoot = join(value.materializationParent, 'source');
    cpSync(value.repositoryRoot, sourceRoot, { recursive: true, errorOnExist: true });
    const snapshotRoot = join(value.materializationParent, 'cli');
    mkdirSync(snapshotRoot, { mode: 0o700 });
    const cliPath = join(snapshotRoot, 'spacetimedb-cli');
    writeFileSync(cliPath, 'cli', { mode: 0o500 });
    writeFileSync(join(snapshotRoot, 'spacetimedb-standalone'), 'standalone', { mode: 0o500 });
    boundary.request = {
      repositoryRoot: sourceRoot,
      sourceCommit: value.sourceCommit,
      sourceTree: 'c'.repeat(40),
      dependencyCacheRoot: value.dependencyCacheRoot,
      materializationRoot: value.materializationParent,
      nodePath: process.execPath,
      cliPath,
      handoffPath: join(value.materializationParent, 'handoff.js'),
      nonce: 'd'.repeat(32), graph: {}, yaml: {},
    };
    return value;
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

  it('runs the public entrypoint through the actual worker and real locked-source helper', async () => {
    const value = prepareRequest();
    const liveBindings = join(process.cwd(), 'spacetimedb', 'ptr', 'generated-bindings');
    const beforeLiveBindings = regularTree(liveBindings);

    const { derivePreparedPtrLinuxBindings } = await import('../scripts/local-binding-runtime.mjs');
    const output = await derivePreparedPtrLinuxBindings();

    expect(Buffer.from(output.bindings[0]!.bytes).toString()).toBe('controlled-bundle');
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
      'command:build-snapshot-cli',
      nodeAttestation, 'attest:git', 'attest:spacetimedb-cli', 'attest:spacetimedb-standalone',
      'builder:operation-return', 'builder:cleanup-complete',
      nodeAttestation, 'attest:git', 'attest:spacetimedb-cli', 'attest:spacetimedb-standalone',
      'hooks:deregister',
    ]);
    expect(existsSync(join(value.materializationParent, 'ptr-linux-builds'))).toBe(false);
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
