import { createHash } from 'node:crypto';
import { chmodSync, mkdtempSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { derivePreparedPtrLinuxBindings } from '../scripts/local-binding-runtime.mjs';
import {
  assertReproducibleLocalBindingCycles,
  parseLocalBindingWorkerResult,
  runLocalBindingBoundedProcess,
  verifyLocalBindingBootstrapSource,
  validateLocalBindingWorkerRequest,
  validateLocalBindingYamlManifest,
} from '../scripts/local-binding-runtime-core.mjs';
import { readLocalBindingBoundedFile } from '../scripts/local-binding-bounded-file.mjs';

const repositoryRoot = resolve(import.meta.dirname, '..');
const manifest = JSON.parse(readFileSync(
  join(repositoryRoot, 'scripts', 'local-binding-runtime-yaml-v1.json'), 'utf8',
));
const boundedFixture = join(repositoryRoot, 'tests', 'fixtures', 'localBindingBoundedFileFixture.mjs');
const processFixture = join(repositoryRoot, 'tests', 'fixtures', 'localBindingProcessFixture.mjs');

afterEach(() => {
  vi.doUnmock('../scripts/local-binding-runtime-core.mjs');
  vi.resetModules();
});

describe('fixed local PTR binding runtime', () => {
  it('exposes only the fixed no-argument candidate API and rejects authority arguments first', async () => {
    const module = await import('../scripts/local-binding-runtime.mjs');
    expect(Object.keys(module).sort()).toEqual([
      'LocalBindingRuntimeError', 'derivePreparedPtrLinuxBindings',
    ]);
    await expect((derivePreparedPtrLinuxBindings as unknown as (input: unknown) => Promise<unknown>)({
      root: '/tmp/other',
    })).rejects.toMatchObject({ code: 'LOCAL_BINDING_RUNTIME_ARGUMENTS_INVALID' });
    const direct = spawnSync(process.execPath, [
      join(repositoryRoot, 'scripts', 'local-binding-runtime.mjs'), '--root=/tmp/other',
    ], { encoding: 'utf8' });
    expect(direct.status).toBe(1);
    expect(direct.stdout).toBe('');
    expect(direct.stderr).toBe('LOCAL_BINDING_RUNTIME_ARGUMENTS_INVALID\n');
  });

  it('independently validates canonical YAML authority framing and rejects mutations', () => {
    expect(validateLocalBindingYamlManifest(`${JSON.stringify(manifest, null, 2)}\n`)).toEqual(manifest);
    const changed = structuredClone(manifest);
    changed.files[0].sha256 = '0'.repeat(64);
    expect(() => validateLocalBindingYamlManifest(`${JSON.stringify(changed, null, 2)}\n`))
      .toThrowError(expect.objectContaining({ code: 'LOCAL_BINDING_RUNTIME_YAML_MANIFEST_INVALID' }));
    expect(() => validateLocalBindingYamlManifest(JSON.stringify(manifest)))
      .toThrowError(expect.objectContaining({ code: 'LOCAL_BINDING_RUNTIME_YAML_MANIFEST_INVALID' }));
  });

  it('validates the fixed fd3 request schema and rejects injected coordinates', () => {
    const operation = `/home/snapmeter/.warpkeep/release-preparation-v1/runs/binding-${'9'.repeat(32)}`;
    const request = {
      schemaVersion: 1, profile: 'warpkeep-local-binding-worker-v1', nonce: 'a'.repeat(32),
      sourceCommit: '1'.repeat(40), sourceTree: '2'.repeat(40),
      repositoryRoot: `${operation}/source`,
      dependencyCacheRoot: '/home/snapmeter/.warpkeep/release-preparation-v1/cache/ptr',
      materializationRoot: `${operation}/cycle-1/builds`,
      nodePath: '/home/snapmeter/.warpkeep/release-preparation-v1/toolchain/node-v22.22.3-linux-x64/bin/node',
      cliPath: '/tmp/warpkeep-cli-attestation-abcdef/spacetimedb-cli',
      handoffPath: `${operation}/cycle-1/handoff/bundle.js`,
      graph: { root: `${operation}/source`, entry: 'scripts/ptr-binding-linux-locked-source-build.ts', modules: [
        { path: 'scripts/ptr-binding-linux-locked-source-build.ts', format: 'typescript', imports: [], bytes: 1, sha256: '3'.repeat(64), identity: {
          dev: '1', ino: '2', mode: '33152', uid: '1000', nlink: '1', size: '1', mtimeNs: '3', ctimeNs: '4',
        } },
      ] },
      yaml: { root: '/home/snapmeter/.warpkeep/release-preparation-v1/toolchain/yaml-2.9.0/package', entry: 'dist/index.js', files: [
        { path: 'dist/index.js', mode: 420, bytes: 1, sha256: '4'.repeat(64) },
      ] },
    };
    expect(validateLocalBindingWorkerRequest(request)).toEqual(request);
    expect(() => validateLocalBindingWorkerRequest({
      ...request,
      cliPath: '/home/snapmeter/.warpkeep/release-preparation-v1/toolchain/spacetime-2.6.1/spacetimedb-cli',
    })).toThrowError(expect.objectContaining({ code: 'LOCAL_BINDING_WORKER_REQUEST_INVALID' }));
    expect(() => validateLocalBindingWorkerRequest({ ...request, database: 'production' }))
      .toThrowError(expect.objectContaining({ code: 'LOCAL_BINDING_WORKER_REQUEST_INVALID' }));
  });

  it('accepts one canonical bounded worker result bound to nonce and handoff', () => {
    const handoff = '/home/snapmeter/.warpkeep/release-preparation-v1/runs/op/handoff/bundle.js';
    const result = {
      schemaVersion: 1, profile: 'warpkeep-local-binding-worker-result-v1', nonce: 'a'.repeat(32),
      sourceCommit: '1'.repeat(40), sourceTree: '2'.repeat(40), moduleTreeId: '3'.repeat(40),
      dependencyClosureDigest: '4'.repeat(64), bundleSha256: '5'.repeat(64), bundleBytes: 17,
      handoffPath: handoff,
    };
    expect(parseLocalBindingWorkerResult(`${JSON.stringify(result)}\n`, 'a'.repeat(32), handoff)).toEqual(result);
    expect(() => parseLocalBindingWorkerResult(`${JSON.stringify({ ...result, nonce: 'b'.repeat(32) })}\n`, 'a'.repeat(32), handoff))
      .toThrowError(expect.objectContaining({ code: 'LOCAL_BINDING_WORKER_RESULT_INVALID' }));
    expect(() => parseLocalBindingWorkerResult(`${JSON.stringify(result)}\nextra`, 'a'.repeat(32), handoff))
      .toThrowError(expect.objectContaining({ code: 'LOCAL_BINDING_WORKER_RESULT_INVALID' }));
  });

  it('requires byte-identical bundles, binding paths and bytes across two full cycles', () => {
    const cycle = {
      sourceCommit: '1'.repeat(40), sourceTree: '2'.repeat(40),
      dependencyClosureDigest: '3'.repeat(64), bundleSha256: '4'.repeat(64),
      bundle: Uint8Array.of(1, 2), bindings: [{ path: 'index.ts', bytes: Uint8Array.of(3) }],
    };
    expect(assertReproducibleLocalBindingCycles(cycle, structuredClone(cycle))).toEqual(cycle);
    const changed = structuredClone(cycle);
    changed.bindings[0].bytes[0] = 9;
    expect(() => assertReproducibleLocalBindingCycles(cycle, changed))
      .toThrowError(expect.objectContaining({ code: 'LOCAL_BINDING_RUNTIME_REPRODUCIBILITY_FAILED' }));
  });

  it('returns defensive candidates through the actual public entrypoint with its fixed core mocked', async () => {
    const internal = Uint8Array.of(7, 8, 9);
    vi.doMock('../scripts/local-binding-runtime-core.mjs', () => ({
      deriveFixedLocalBindingRuntime: async () => ({
        profile: 'warpkeep-spacetime-binding-final-preparation-linux-x64-v1',
        sourceCommit: '1'.repeat(40), sourceTree: '2'.repeat(40),
        bundleSha256: '3'.repeat(64), dependencyClosureDigest: '4'.repeat(64),
        bindings: [{ path: 'spacetimedb/ptr/generated-bindings/index.ts', bytes: internal }],
      }),
    }));
    const entrypoint = await import('../scripts/local-binding-runtime.mjs');
    const result = await entrypoint.derivePreparedPtrLinuxBindings();
    internal[0] = 99;
    expect(result).toEqual({
      profile: 'warpkeep-spacetime-binding-final-preparation-linux-x64-v1',
      sourceCommit: '1'.repeat(40), sourceTree: '2'.repeat(40),
      bundleSha256: '3'.repeat(64), dependencyClosureDigest: '4'.repeat(64),
      bindings: [{ path: 'spacetimedb/ptr/generated-bindings/index.ts', bytes: Uint8Array.of(7, 8, 9) }],
    });
  });

  it('bounds a descriptor read to checked size plus one byte when the file grows', async () => {
    const result = spawnSync(process.execPath, [
      '--experimental-test-module-mocks', boundedFixture, 'growth',
    ], { encoding: 'utf8' });
    expect(result.status, result.stderr).toBe(0);
    expect(JSON.parse(result.stdout)).toEqual({ code: 'LOCAL_BINDING_BOUNDED_FILE_CHANGED' });
  });

  it('preserves the primary bounded-read failure together with close failure', async () => {
    const result = spawnSync(process.execPath, [
      '--experimental-test-module-mocks', boundedFixture, 'combined',
    ], { encoding: 'utf8' });
    expect(result.status, result.stderr).toBe(0);
    expect(JSON.parse(result.stdout)).toEqual({
      primary: 'primary read failure', close: 'close failure',
    });
  });

  it('rejects a group/world-writable executable before use', () => {
    const result = spawnSync(process.execPath, [
      '--experimental-test-module-mocks', boundedFixture, 'writable-executable',
    ], { encoding: 'utf8' });
    expect(result.status, result.stderr).toBe(0);
    expect(JSON.parse(result.stdout)).toEqual({ code: 'LOCAL_BINDING_BOUNDED_FILE_INVALID' });
  });

  it('rejects a bounded executable digest mismatch before use', () => {
    const result = spawnSync(process.execPath, [
      '--experimental-test-module-mocks', boundedFixture, 'digest',
    ], { encoding: 'utf8' });
    expect(result.status, result.stderr).toBe(0);
    expect(JSON.parse(result.stdout)).toEqual({ code: 'LOCAL_BINDING_BOUNDED_FILE_CHANGED' });
  });

  it.each([
    ['output', 5, 1_000, 'LOCAL_BINDING_RUNTIME_PROCESS_OUTPUT_LIMIT'],
    ['nonzero', 1024, 1_000, 'LOCAL_BINDING_RUNTIME_PROCESS_FAILED'],
    ['signal', 1024, 1_000, 'LOCAL_BINDING_RUNTIME_PROCESS_FAILED'],
    ['timeout', 1024, 50, 'LOCAL_BINDING_RUNTIME_PROCESS_TIMEOUT'],
  ])('fails closed for bounded child %s behavior', async (scenario, maxOutput, timeout, code) => {
    await expect(runLocalBindingBoundedProcess(process.execPath, [processFixture, scenario], {
      cwd: repositoryRoot, env: { PATH: process.env.PATH }, maxOutput, timeout,
    })).rejects.toMatchObject({ code });
  });

  it('accepts only a clean zero-exit bounded child result', async () => {
    await expect(runLocalBindingBoundedProcess(process.execPath, [processFixture, 'success'], {
      cwd: repositoryRoot, env: { PATH: process.env.PATH }, maxOutput: 1024, timeout: 1_000,
    })).resolves.toEqual({ stdout: 'ok', stderr: '' });
  });

  it.skipIf(process.platform !== 'linux')(
    'rejects a captured bootstrap module replacement before worker evaluation',
    () => {
      const root = mkdtempSync(join(tmpdir(), 'warpkeep-bootstrap-identity-'));
      try {
        chmodSync(root, 0o700);
        const path = join(root, 'worker.mjs');
        const replacement = join(root, 'replacement.mjs');
        const body = Buffer.from('export const value = 1;\n');
        writeFileSync(path, body, { mode: 0o600 });
        const captured = readLocalBindingBoundedFile(path, {
          maximumBytes: 1024, expectedBytes: body.length,
          expectedSha256: createHash('sha256').update(body).digest('hex'), expectedUid: 1000,
        });
        captured.body.fill(0);
        const source = { root, bootstrap: [{
          path: 'worker.mjs', bytes: body.length,
          sha256: createHash('sha256').update(body).digest('hex'), identity: captured.identity,
        }] };
        expect(() => verifyLocalBindingBootstrapSource(source)).not.toThrow();
        writeFileSync(replacement, 'export const value = 2;\n', { mode: 0o600 });
        renameSync(replacement, path);
        expect(() => verifyLocalBindingBootstrapSource(source))
          .toThrowError(expect.objectContaining({ code: 'LOCAL_BINDING_BOUNDED_FILE_CHANGED' }));
      } finally {
        rmSync(root, { recursive: true, force: true });
      }
    },
  );
});
