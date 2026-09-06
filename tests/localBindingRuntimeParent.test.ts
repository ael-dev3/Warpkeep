// @vitest-environment node

import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const FIXED_ROOT = '/home/snapmeter/.warpkeep/release-preparation-v1';
const boundary = vi.hoisted(() => ({
  physicalRoot: '',
  scenario: 'success',
  events: [] as string[],
  copies: [] as Array<readonly [string, string]>,
  generateArgs: [] as string[][],
}));

function translated(path: import('node:fs').PathLike): import('node:fs').PathLike {
  if (typeof path !== 'string') return path;
  const normalized = path.replaceAll('\\', '/');
  const fixed = '/home/snapmeter/.warpkeep/release-preparation-v1';
  const offset = normalized.endsWith(fixed) ? normalized.length - fixed.length
    : normalized.indexOf(`${fixed}/`);
  if (offset >= 0 && (offset === 0 || /^[A-Za-z]:$/u.test(normalized.slice(0, offset)))) {
    const suffix = normalized.slice(offset + fixed.length).replace(/^\//u, '');
    return suffix === '' ? boundary.physicalRoot
      : join(boundary.physicalRoot, ...suffix.split('/'));
  }
  return path;
}

vi.mock('node:fs', async () => {
  const actual = await vi.importActual<typeof import('node:fs')>('node:fs');
  const map = (path: import('node:fs').PathLike) => translated(path);
  const normalize = <T extends {
    mode: number | bigint;
    uid: number | bigint;
    isDirectory(): boolean;
    isFile(): boolean;
  }>(state: T): T => {
    if (process.platform !== 'win32') return state;
    Object.defineProperty(state, 'uid', { value: typeof state.uid === 'bigint' ? 1000n : 1000 });
    const permissions = state.isDirectory() ? 0o700 : state.isFile() ? 0o600 : 0o777;
    Object.defineProperty(state, 'mode', {
      value: typeof state.mode === 'bigint'
        ? (state.mode & ~0o7777n) | BigInt(permissions)
        : (state.mode & ~0o7777) | permissions,
    });
    return state;
  };
  return {
    ...actual,
    chmodSync(path: import('node:fs').PathLike, mode: number) { return actual.chmodSync(map(path), mode); },
    lstatSync(path: import('node:fs').PathLike, options?: { bigint?: boolean }) {
      return normalize(actual.lstatSync(map(path), options as never));
    },
    fstatSync(descriptor: number, options?: { bigint?: boolean }) {
      return normalize(actual.fstatSync(descriptor, options as never));
    },
    mkdirSync(path: import('node:fs').PathLike, options?: import('node:fs').MakeDirectoryOptions) {
      return actual.mkdirSync(map(path), options);
    },
    openSync(path: import('node:fs').PathLike, flags: number, mode?: number) {
      return actual.openSync(map(path), flags, mode);
    },
    readdirSync(path: import('node:fs').PathLike, options?: unknown) {
      return actual.readdirSync(map(path), options as never);
    },
    realpathSync(path: import('node:fs').PathLike) {
      actual.realpathSync(map(path));
      return path;
    },
    rmSync(path: import('node:fs').PathLike, options?: import('node:fs').RmDirOptions) {
      return actual.rmSync(map(path), options);
    },
  };
});

vi.mock('node:fs/promises', async () => {
  const actual = await vi.importActual<typeof import('node:fs/promises')>('node:fs/promises');
  return {
    ...actual,
    lstat(path: import('node:fs').PathLike, options?: { bigint?: boolean }) {
      return actual.lstat(translated(path), options as never);
    },
    open(path: import('node:fs').PathLike, flags: number) { return actual.open(translated(path), flags); },
    readdir(path: import('node:fs').PathLike, options?: unknown) {
      return actual.readdir(translated(path), options as never);
    },
    async realpath(path: import('node:fs').PathLike) {
      await actual.realpath(translated(path));
      return path;
    },
  };
});

vi.mock('../scripts/local-binding-runtime-process.mjs', async () => {
  const crypto = await vi.importActual<typeof import('node:crypto')>('node:crypto');
  const fs = await vi.importActual<typeof import('node:fs')>('node:fs');
  const path = await vi.importActual<typeof import('node:path')>('node:path');
  const map = (value: string) => translated(value) as string;
  return {
    async runLocalBindingBoundedProcess(executable: string, args: readonly string[], options: {
      fd3?: string;
    }) {
      if (options.fd3 !== undefined) {
        const request = JSON.parse(options.fd3) as Record<string, any>;
        const genesis002 = request.profile === 'warpkeep-local-binding-genesis002-worker-v1';
        const genesis001 = request.profile === 'warpkeep-local-binding-genesis001-worker-v1';
        boundary.events.push(genesis002
          ? `worker:genesis002:${path.basename(request.handoffPath)}`
          : genesis001 ? `worker:genesis001:${path.basename(request.handoffPath)}`
            : `worker:${path.basename(request.handoffPath)}`);
        expect(executable).toBe(`${FIXED_ROOT}/toolchain/node-v22.22.3-linux-x64/bin/node`);
        expect(args).toEqual(['--experimental-vm-modules', join(request.repositoryRoot, 'scripts', 'local-binding-runtime-worker.mjs')]);
        expect(`${JSON.stringify(request)}\n`).toBe(options.fd3);
        const cycle = request.handoffPath.includes('cycle-2') ? 2 : 1;
        const mismatchedLane = boundary.scenario === `${genesis002 ? 'genesis002' : 'ptr'}-bundle-mismatch`;
        const bundle = Buffer.from((boundary.scenario === 'bundle-mismatch' || mismatchedLane) && cycle === 2
          ? `bundle-${genesis002 ? 'genesis002-' : ''}2`
          : genesis002 ? 'bundle-genesis002' : 'bundle');
        fs.writeFileSync(map(request.handoffPath), bundle, { mode: 0o600 });
        const bundleSha256 = crypto.createHash('sha256').update(bundle).digest('hex');
        if (boundary.scenario === 'changed-handoff') fs.writeFileSync(map(request.handoffPath), 'changed');
        return { stdout: `${JSON.stringify({
          schemaVersion: 1,
          profile: genesis002
            ? 'warpkeep-local-binding-genesis002-worker-result-v1'
            : genesis001 ? 'warpkeep-local-binding-genesis001-worker-result-v1'
            : 'warpkeep-local-binding-worker-result-v1',
          nonce: boundary.scenario === 'forged-nonce' ? 'f'.repeat(32) : request.nonce,
          sourceCommit: request.sourceCommit,
          sourceTree: boundary.scenario === 'genesis002-source-substitution' && genesis002
            ? '8'.repeat(40) : request.sourceTree,
          moduleTreeId: '3'.repeat(40),
          dependencyClosureDigest: boundary.scenario === 'digest-mismatch' && cycle === 2
            ? '9'.repeat(64) : '4'.repeat(64),
          bundleSha256,
          bundleBytes: bundle.length,
          handoffPath: request.handoffPath,
        })}\n`, stderr: '' };
      }
      boundary.events.push('generate');
      const genesis002 = args.includes('--include-private');
      if (genesis002) boundary.events[boundary.events.length - 1] = 'generate:genesis002';
      boundary.generateArgs.push([...args]);
      if (boundary.scenario === 'generate-failure') {
        throw Object.assign(new Error('LOCAL_BINDING_RUNTIME_PROCESS_FAILED'), {
          code: 'LOCAL_BINDING_RUNTIME_PROCESS_FAILED',
        });
      }
      const output = args[args.indexOf('--out-dir') + 1]!;
      const cycle = output.includes('cycle-2') ? 2 : 1;
      fs.mkdirSync(map(output), { recursive: true, mode: 0o700 });
      fs.writeFileSync(path.join(map(output), 'index.ts'),
        boundary.scenario === 'binding-mismatch' && cycle === 2 ? 'binding-2'
          : genesis002 ? 'binding-genesis002' : 'binding',
        { mode: 0o600 });
      if (boundary.scenario === 'binding-path-mismatch' && cycle === 2) {
        fs.writeFileSync(path.join(map(output), 'other.ts'), 'export {};\n', { mode: 0o600 });
      }
      return { stdout: '', stderr: '' };
    },
  };
});

vi.mock('../scripts/local-binding-bounded-file.mjs', async () => {
  const actual = await vi.importActual<typeof import('../scripts/local-binding-bounded-file.mjs')>(
    '../scripts/local-binding-bounded-file.mjs',
  );
  const identity = Object.freeze({
    dev: '1', ino: '2', mode: String(0o100500), uid: '1000', nlink: '1',
    size: '1', mtimeNs: '3', ctimeNs: '4',
  });
  return {
    ...actual,
    copyLocalBindingBoundedFile(source: string, destination: string) {
      boundary.copies.push([source, destination]);
      return Object.freeze({ bytes: 1, sha256: '0'.repeat(64), identity });
    },
    readLocalBindingBoundedFile(path: string, options: { expectedBytes?: number; discardBody?: boolean }) {
      if (options.discardBody === true && [47905552, 130219584].includes(options.expectedBytes ?? -1)) {
        return Object.freeze({ body: Buffer.alloc(0), identity });
      }
      return actual.readLocalBindingBoundedFile(path, options as never);
    },
  };
});

import {
  executeFixedGenesis001LocalBindingParentCycles,
  executeFixedLocalBindingParentCycles,
  executeFixedPairedLocalBindingParentCycles,
  preserveLocalBindingRuntimePrimaryAndCleanup,
} from '../scripts/local-binding-runtime-core.mjs';
import { bindOperationOwnedCliSnapshot } from '../scripts/local-binding-runtime-cli-snapshot.mjs';
import { readSpacetimeBindingTree } from '../scripts/spacetime-binding-tree.mjs';

beforeEach(() => {
  boundary.physicalRoot = mkdtempSync(join(tmpdir(), 'warpkeep-parent-runtime-'));
  boundary.scenario = 'success';
  boundary.events.length = 0;
  boundary.copies.length = 0;
  boundary.generateArgs.length = 0;
});

afterEach(() => {
  rmSync(boundary.physicalRoot, { recursive: true, force: true });
});

function context(cli?: Readonly<{ path: string; verify(): void }>) {
  const operationRoot = join(`${FIXED_ROOT}/runs`, `binding-${'a'.repeat(32)}`);
  const sourceRoot = join(operationRoot, 'source');
  mkdirSync(operationRoot, { recursive: true, mode: 0o700 });
  mkdirSync(sourceRoot, { mode: 0o700 });
  if (cli === undefined) mkdirSync(join(operationRoot, 'cli'), { mode: 0o700 });
  const selectedCli = cli ?? { path: join(operationRoot, 'cli', 'spacetimedb-cli'), verify() {} };
  return {
    repositoryRoot: sourceRoot,
    operationRoot,
    environment: { PATH: '/usr/bin' },
    source: { root: sourceRoot, commit: '1'.repeat(40), tree: '2'.repeat(40), bootstrap: [] },
    graph: { root: sourceRoot, entry: 'scripts/ptr-binding-linux-locked-source-build.ts', modules: [{
      path: 'scripts/ptr-binding-linux-locked-source-build.ts', format: 'typescript', imports: [],
      bytes: 1, sha256: '3'.repeat(64), identity: {
        dev: '1', ino: '2', mode: '33152', uid: '1000', nlink: '1', size: '1', mtimeNs: '3', ctimeNs: '4',
      },
    }] },
    yaml: { root: `${FIXED_ROOT}/toolchain/yaml-2.9.0/package`, entry: 'dist/index.js', files: [
      { path: 'dist/index.js', mode: 420, bytes: 1, sha256: '4'.repeat(64) },
    ] },
    cli: selectedCli,
    readBindingTree: readSpacetimeBindingTree,
    verifyExecutables() {
      selectedCli.verify();
      boundary.events.push('verify-executables');
    },
  };
}

function pairedContext() {
  const value = context();
  const genesis002 = {
    ...value.graph,
    entry: 'scripts/genesis002-binding-linux-locked-source-build.ts',
    modules: [{
      ...value.graph.modules[0],
      path: 'scripts/genesis002-binding-linux-locked-source-build.ts',
    }],
  };
  return { ...value, graphs: { genesis002, ptr: value.graph } };
}

function genesis001Context() {
  const value = context();
  return {
    ...value,
    graph: {
      ...value.graph,
      entry: 'scripts/genesis001-binding-linux-locked-source-build.ts',
      modules: [{
        ...value.graph.modules[0],
        path: 'scripts/genesis001-binding-linux-locked-source-build.ts',
      }],
    },
  };
}

describe('production local binding parent cycles', () => {
  it('preserves the parent primary failure together with cleanup failure', () => {
    const primary = new Error('CONTROLLED_PARENT_PRIMARY');
    const cleanup = new Error('CONTROLLED_PARENT_CLEANUP');
    let error: unknown;
    try { preserveLocalBindingRuntimePrimaryAndCleanup(primary, cleanup); } catch (caught) { error = caught; }
    expect(error).toBeInstanceOf(AggregateError);
    expect((error as AggregateError).cause).toBe(primary);
    expect((error as AggregateError).errors).toEqual([primary, cleanup]);
  });

  it('binds a hostile ambient attester result to the exact operation-owned CLI path', () => {
    const operationRoot = join(`${FIXED_ROOT}/runs`, `binding-${'b'.repeat(32)}`);
    mkdirSync(operationRoot, { recursive: true, mode: 0o700 });
    let sourceVerifications = 0;
    const source = {
      directory: join('C:\\hostile-ambient-tmp', 'warpkeep-cli-attestation-attacker'),
      path: join('C:\\hostile-ambient-tmp', 'warpkeep-cli-attestation-attacker', 'spacetimedb-cli'),
      verify() { sourceVerifications += 1; },
    };
    const result = bindOperationOwnedCliSnapshot(source, operationRoot);
    expect(result.path).toBe(join(operationRoot, 'cli', 'spacetimedb-cli'));
    expect(result.directory).toBe(join(operationRoot, 'cli'));
    expect(boundary.copies).toEqual([
      [source.path, join(operationRoot, 'cli', 'spacetimedb-cli')],
      [join(source.directory, 'spacetimedb-standalone'), join(operationRoot, 'cli', 'spacetimedb-standalone')],
    ]);
    expect(sourceVerifications).toBeGreaterThanOrEqual(4);
  });

  it('keeps the real operation-owned CLI verifier valid through both production parent cycles', async () => {
    const operationRoot = join(`${FIXED_ROOT}/runs`, `binding-${'a'.repeat(32)}`);
    mkdirSync(operationRoot, { recursive: true, mode: 0o700 });
    let sourceVerifications = 0;
    const source = {
      directory: join('C:\\hostile-ambient-tmp', 'warpkeep-cli-attestation-cycle'),
      path: join('C:\\hostile-ambient-tmp', 'warpkeep-cli-attestation-cycle', 'spacetimedb-cli'),
      verify() { sourceVerifications += 1; },
    };
    const cli = bindOperationOwnedCliSnapshot(source, operationRoot);
    const result = await executeFixedLocalBindingParentCycles(context(cli));
    expect(Buffer.from(result.bindings[0]!.bytes).toString()).toBe('binding');
    expect(boundary.events.filter(event => event.startsWith('worker:'))).toHaveLength(2);
    expect(boundary.events.filter(event => event === 'generate')).toHaveLength(2);
    expect(boundary.events.filter(event => event === 'verify-executables')).toHaveLength(6);
    expect(sourceVerifications).toBe(10);
  });

  it('uses canonical fd3, reattests handoff, generates twice, and reads the strict tree', async () => {
    const result = await executeFixedLocalBindingParentCycles(context());
    expect(result.bundleSha256).toBe(createHash('sha256').update('bundle').digest('hex'));
    expect(Buffer.from(result.bindings[0]!.bytes).toString()).toBe('binding');
    expect(boundary.events).toEqual([
      'verify-executables', 'worker:bundle.js', 'verify-executables', 'generate', 'verify-executables',
      'verify-executables', 'worker:bundle.js', 'verify-executables', 'generate', 'verify-executables',
    ]);
  });

  it('runs two G001 cycles without private generation or frontend path projection', async () => {
    const result = await executeFixedGenesis001LocalBindingParentCycles(genesis001Context());
    expect(Buffer.from(result.bindings[0]!.bytes).toString()).toBe('binding');
    expect(result.bindings[0]!.path).toBe('index.ts');
    expect(boundary.generateArgs).toHaveLength(2);
    expect(boundary.generateArgs.every(args => !args.includes('--include-private'))).toBe(true);
    expect(boundary.events.filter(event => event.startsWith('worker:genesis001:'))).toHaveLength(2);
  });

  it.each([
    ['forged-nonce', 'LOCAL_BINDING_WORKER_RESULT_INVALID'],
    ['changed-handoff', 'LOCAL_BINDING_BOUNDED_FILE_CHANGED'],
    ['generate-failure', 'LOCAL_BINDING_RUNTIME_PROCESS_FAILED'],
    ['bundle-mismatch', 'LOCAL_BINDING_RUNTIME_REPRODUCIBILITY_FAILED'],
    ['binding-mismatch', 'LOCAL_BINDING_RUNTIME_REPRODUCIBILITY_FAILED'],
    ['binding-path-mismatch', 'LOCAL_BINDING_RUNTIME_REPRODUCIBILITY_FAILED'],
    ['digest-mismatch', 'LOCAL_BINDING_RUNTIME_REPRODUCIBILITY_FAILED'],
  ])('rejects parent boundary %s', async (scenario, code) => {
    boundary.scenario = scenario;
    await expect(executeFixedLocalBindingParentCycles(context())).rejects.toMatchObject({ code });
  });

  it('runs two disjoint cycles per fixed lane from one source and uses private generation only for G002', async () => {
    const result = await executeFixedPairedLocalBindingParentCycles(pairedContext());
    expect(result.genesis002.sourceCommit).toBe(result.ptr.sourceCommit);
    expect(result.genesis002.sourceTree).toBe(result.ptr.sourceTree);
    expect(Buffer.from(result.genesis002.bindings[0]!.bytes).toString()).toBe('binding-genesis002');
    expect(Buffer.from(result.ptr.bindings[0]!.bytes).toString()).toBe('binding');
    expect(result.genesis002.bindings.every(entry =>
      entry.path.startsWith('scripts/genesis002_module_bindings/'))).toBe(true);
    expect(result.ptr.bindings.every(entry =>
      entry.path.startsWith('spacetimedb/ptr/generated-bindings/'))).toBe(true);
    expect(boundary.events.filter(event => event.startsWith('worker:genesis002:'))).toHaveLength(2);
    expect(boundary.events.filter(event => event === 'worker:bundle.js')).toHaveLength(2);
    const genesisCommands = boundary.generateArgs.filter(args => args.includes('--include-private'));
    const ptrCommands = boundary.generateArgs.filter(args => !args.includes('--include-private'));
    expect(genesisCommands).toHaveLength(2);
    expect(ptrCommands).toHaveLength(2);
    expect(genesisCommands.every(args => args.filter(value => value === '--include-private').length === 1)).toBe(true);
    expect(ptrCommands.every(args => !args.includes('--include-private'))).toBe(true);
    expect(new Set(boundary.generateArgs.map(args => args[args.indexOf('--out-dir') + 1])).size).toBe(4);
  });

  it.each(['genesis002', 'ptr'] as const)(
    'rejects two-cycle nondeterminism in the %s lane',
    async lane => {
      boundary.scenario = `${lane}-bundle-mismatch`;
      await expect(executeFixedPairedLocalBindingParentCycles(pairedContext()))
        .rejects.toMatchObject({ code: 'LOCAL_BINDING_RUNTIME_REPRODUCIBILITY_FAILED' });
    },
  );

  it('rejects a different source identity reported by G002 before generating bindings', async () => {
    boundary.scenario = 'genesis002-source-substitution';
    await expect(executeFixedPairedLocalBindingParentCycles(pairedContext()))
      .rejects.toMatchObject({ code: 'LOCAL_BINDING_WORKER_RESULT_INVALID' });
    expect(boundary.events).not.toContain('generate:genesis002');
  });
});
