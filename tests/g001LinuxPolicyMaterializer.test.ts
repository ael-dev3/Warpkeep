// @vitest-environment node
// Real materializer/filesystem lifecycle with explicit host, installed-builder
// and compiler fixtures. Native locked-builder tests own archive/UID attestation;
// these tests exercise its consumer without provider credentials or requests.
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

const fixture = vi.hoisted(() => ({
  home: '', materializedRoot: '', yamlRoot: '', typescriptRoot: '', compiler: '', operator: '',
  source: { sourceCommit: 'a'.repeat(40), sourceTree: 'b'.repeat(40), operatorBlob: 'c'.repeat(40), operatorSha256: 'd'.repeat(64) },
  compilerCalls: 0, outfiles: [] as string[], hookDisposals: 0, compilerFailure: false,
}));

vi.mock('../scripts/genesis001-linux-policy-boundary.mjs', () => ({
  get G001_POLICY_HOME() { return fixture.home; },
  G001_POLICY_ENV: { PATH: '/usr/bin:/bin' },
  attestPolicyHost: () => ({}),
  attestPolicySource: () => fixture.source,
  policyOperator: (kind: string) => kind === 'census'
    ? 'scripts/genesis001-linux-census-operator.ts' : 'scripts/genesis001-policy-observation-receipt.mjs',
  policyDigest: (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex'),
  policyFail: () => { throw Error('G001_LINUX_POLICY_NATIVE_FAILED'); },
  policyOwnedRun: () => {},
  policyGit: () => Buffer.from('{}\n'),
  readPolicyRequest: () => { throw Error('test must use the exported materializer'); },
}));
vi.mock('../scripts/local-binding-runtime-core.mjs', () => ({
  deriveGenesis002LocalBindingSourceGraph: () => ({}),
  validateLocalBindingYamlManifest: () => ({ entry: 'dist/index.js', files: [] }),
}));
vi.mock('../scripts/local-binding-native-ts-hooks.mjs', () => ({
  installLocalBindingNativeTsHooks: () => ({ deregister: () => { fixture.hookDisposals++; } }),
}));
vi.mock('../scripts/local-binding-bounded-file.mjs', async original => {
  const actual = await original<typeof import('../scripts/local-binding-bounded-file.mjs')>();
  return { ...actual, readLocalBindingBoundedFile: (path: string, options: Record<string, unknown>) => {
    if (path.endsWith('local-binding-runtime-yaml-v1.json')) return { body: Buffer.from('{}\n') };
    // Keep real byte/digest/identity validation, replacing only the installed
    // account and POSIX modes that this cross-platform fixture cannot attest.
    return actual.readLocalBindingBoundedFile(path, { ...options,
      expectedUid: undefined, expectedMode: process.platform === 'win32' ? undefined : options.expectedMode } as never);
  } };
});
vi.mock('node:fs', async original => {
  const actual = await original<typeof import('node:fs')>();
  return { ...actual, symlinkSync: (target: string, path: string) =>
    actual.symlinkSync(target, path, process.platform === 'win32' ? 'junction' : 'dir') };
});
vi.mock('warpkeep:genesis002-binding-entry', () => ({
  withGenesis002LinuxLockedSourceBuild: (input: { dependencyCacheRoot: string;
    materializationParent: string; operation: (context: { materializedRoot: string }) => unknown }) => {
    expect(input.dependencyCacheRoot).toBe(join(fixture.home, '.warpkeep', 'release-preparation-v1', 'cache', 'genesis002'));
    expect(existsSync(join(fixture.materializedRoot, 'spacetimedb', 'node_modules'))).toBe(false);
    // Matches the real GENESIS002_PROFILE's installed module root. A workspace
    // root node_modules tree is intentionally absent, as in the native builder.
    const result = input.operation({ materializedRoot: fixture.materializedRoot });
    expect(existsSync(join(fixture.materializedRoot, 'node_modules'))).toBe(false);
    expect(existsSync(join(fixture.materializedRoot, 'services', 'auth-bridge', 'node_modules'))).toBe(false);
    return { result, moduleTreeId: fixture.source.sourceTree, dependencyClosureDigest: 'e'.repeat(64) };
  },
}));
vi.mock('node:child_process', async original => {
  const actual = await original<typeof import('node:child_process')>();
  return { ...actual, spawnSync: (executable: string, args: string[], options: { cwd: string }) => {
    fixture.compilerCalls++;
    expect(executable).toBe(realpathSync(fixture.compiler));
    expect(readFileSync(executable, 'utf8')).toBe('locked compiler fixture');
    expect(options.cwd).toBe(fixture.materializedRoot);
    expect(readFileSync(join(options.cwd, 'node_modules', 'spacetimedb', 'index.js'), 'utf8')).toBe('locked SDK fixture');
    expect(realpathSync(join(options.cwd, 'node_modules', 'yaml'))).toBe(fixture.yamlRoot);
    expect(realpathSync(join(options.cwd, 'services', 'auth-bridge', 'node_modules', 'yaml'))).toBe(fixture.yamlRoot);
    expect(realpathSync(join(options.cwd, 'services', 'auth-bridge', 'node_modules', 'typescript')))
      .toBe(fixture.typescriptRoot);
    expect(args[0]).toBe(fixture.operator);
    if (fixture.compilerFailure) return { error: undefined, signal: null, status: 1,
      stdout: Buffer.alloc(0), stderr: Buffer.from('synthetic compiler failure') };
    const outfile = args.find(value => value.startsWith('--outfile='))!.slice('--outfile='.length);
    fixture.outfiles.push(outfile);
    const metafile = args.find(value => value.startsWith('--metafile='))!.slice('--metafile='.length);
    writeFileSync(outfile, 'export const fixture = true;\n', { mode: 0o600 });
    writeFileSync(metafile, JSON.stringify({ inputs: { [fixture.operator]: {} },
      outputs: { [outfile]: { imports: [{ path: 'node:fs', external: true }] } } }), { mode: 0o600 });
    return { error: undefined, signal: null, status: 0, stdout: Buffer.alloc(0), stderr: Buffer.alloc(0) };
  } };
});

let temporary = '';
const originalArgv = process.argv;
beforeEach(() => {
  temporary = realpathSync(mkdtempSync(join(tmpdir(), 'warpkeep-g001-materializer-test-')));
  fixture.home = join(temporary, 'home');
  fixture.materializedRoot = join(temporary, 'source');
  fixture.yamlRoot = join(fixture.home, '.warpkeep', 'release-preparation-v1', 'toolchain', 'yaml-2.9.0', 'package');
  fixture.typescriptRoot = join(fixture.home, '.warpkeep', 'release-preparation-v1', 'toolchain',
    'typescript-7.0.2-linux-x64', 'node_modules', 'typescript');
  fixture.compiler = join(fixture.materializedRoot, 'spacetimedb', 'genesis002', 'node_modules',
    '.pnpm', '@esbuild+linux-x64@0.25.12', 'node_modules', '@esbuild', 'linux-x64', 'bin', 'esbuild');
  fixture.compilerCalls = 0; fixture.outfiles = []; fixture.hookDisposals = 0; fixture.compilerFailure = false;
  for (const path of [fixture.yamlRoot, dirname(fixture.compiler), join(temporary, 'operation'),
    join(fixture.materializedRoot, 'scripts'),
    join(fixture.materializedRoot, 'services', 'auth-bridge'),
    fixture.typescriptRoot,
    join(fixture.materializedRoot, 'spacetimedb', 'genesis002', 'node_modules', 'spacetimedb')]) {
    mkdirSync(path, { recursive: true, mode: 0o700 });
  }
  fixture.yamlRoot = realpathSync(fixture.yamlRoot);
  fixture.typescriptRoot = realpathSync(fixture.typescriptRoot);
  writeFileSync(fixture.compiler, 'locked compiler fixture', { mode: 0o600 });
  writeFileSync(join(fixture.materializedRoot, 'spacetimedb', 'genesis002', 'node_modules', 'spacetimedb', 'index.js'),
    'locked SDK fixture', { mode: 0o600 });
  process.argv = [originalArgv[0]!, 'fixture-materializer'];
});
afterEach(() => {
  process.argv = originalArgv;
  rmSync(temporary, { recursive: true, force: true });
});

async function materialize(kind: 'policy' | 'census') {
  fixture.operator = kind === 'census'
    ? 'scripts/genesis001-linux-census-operator.ts' : 'scripts/genesis001-policy-observation-receipt.mjs';
  writeFileSync(join(fixture.materializedRoot, fixture.operator), 'export const source = true;\n', { mode: 0o600 });
  // This executable-only module deliberately has no TypeScript import surface.
  const entry = '../scripts/genesis001-linux-policy-materializer.mjs';
  const { materializeFixedLinuxG001Policy } = await import(entry);
  return materializeFixedLinuxG001Policy({ runId: 'f'.repeat(32), operationRoot: join(temporary, 'operation'),
    source: fixture.source, ...(kind === 'census' ? { kind } : {}) });
}

it.each(['policy', 'census'] as const)('compiles %s twice from the owning Genesis002 dependency tree and cleans resolution links', async kind => {
  const result = await materialize(kind);
  expect(result).toMatchObject({ bundleBytes: 29, dependencyClosureSha256: 'e'.repeat(64),
    bundleSha256: expect.stringMatching(/^[a-f0-9]{64}$/u), sourceClosureSha256: expect.stringMatching(/^[a-f0-9]{64}$/u) });
  expect(fixture.compilerCalls).toBe(2);
  expect(fixture.outfiles[0]).toBe(join(fixture.materializedRoot, 'spacetimedb', 'genesis002', 'dist', 'bundle.js'));
  expect(fixture.outfiles[1]).toBe(join(temporary, 'operation', 'second.mjs'));
  expect(readFileSync(join(temporary, 'operation', 'first.mjs'), 'utf8')).toBe('export const fixture = true;\n');
  expect(fixture.hookDisposals).toBe(1);
  expect(existsSync(join(fixture.materializedRoot, 'node_modules'))).toBe(false);
  expect(existsSync(join(fixture.materializedRoot, 'services', 'auth-bridge', 'node_modules'))).toBe(false);
  expect(existsSync(fixture.compiler)).toBe(true);
});

it('removes its resolution links and releases hooks after compiler refusal', async () => {
  fixture.compilerFailure = true;
  await expect(materialize('census')).rejects.toThrow('G001_LINUX_POLICY_NATIVE_FAILED');
  expect(fixture.compilerCalls).toBe(1);
  expect(fixture.hookDisposals).toBe(1);
  expect(existsSync(join(fixture.materializedRoot, 'node_modules'))).toBe(false);
  expect(existsSync(join(fixture.materializedRoot, 'services', 'auth-bridge', 'node_modules'))).toBe(false);
  expect(existsSync(fixture.compiler)).toBe(true);
});
