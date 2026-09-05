import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';

import { derivePreparedPtrLinuxBindings } from '../scripts/local-binding-runtime.mjs';
import {
  assertReproducibleLocalBindingCycles,
  parseLocalBindingWorkerResult,
  validateLocalBindingWorkerRequest,
  validateLocalBindingYamlManifest,
} from '../scripts/local-binding-runtime-core.mjs';

const repositoryRoot = resolve(import.meta.dirname, '..');
const manifest = JSON.parse(readFileSync(
  join(repositoryRoot, 'scripts', 'local-binding-runtime-yaml-v1.json'), 'utf8',
));

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
      cliPath: '/home/snapmeter/.warpkeep/release-preparation-v1/toolchain/spacetime-2.6.1/spacetimedb-cli',
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

  it('wires only the reviewed builder and exact build/generate command shapes', () => {
    const worker = readFileSync(join(repositoryRoot, 'scripts', 'local-binding-runtime-worker.mjs'), 'utf8');
    const parent = readFileSync(join(repositoryRoot, 'scripts', 'local-binding-runtime-core.mjs'), 'utf8');
    expect(worker).toContain("await import('warpkeep:ptr-binding-entry')");
    expect(worker).toContain('builder.withPtrLinuxLockedSourceBuild({');
    expect(worker).toContain("['build', '--module-path', 'spacetimedb/ptr']");
    expect(parent).toContain("'generate', '--lang', 'typescript', '--yes', '--no-config', '--js-path'");
    expect(parent).not.toContain("'--include-private'");
  });
});
