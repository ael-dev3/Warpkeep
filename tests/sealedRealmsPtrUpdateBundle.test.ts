// @vitest-environment node
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'esbuild';
import { describe, expect, it } from 'vitest';
import { buildSealedRealmOperationBundle } from '../scripts/sealed-realms-production-bundle-engine.mjs';

const observationPaths = [
  'services/release-recovery/src/config.ts',
  'services/release-recovery/src/crypto.ts',
  'services/release-recovery/src/http.ts',
  'services/release-recovery/src/protocol.ts',
  'services/release-recovery/src/ptrObservation.ts',
  'services/release-recovery/src/recoveryPublicKey.ts',
];

describe.each(['activation', 'g002', 'ptr'] as const)('%s observation bundle graph', lane => {
  it('accepts the actual closed observation graph', async () => {
    const artifact = await buildSealedRealmOperationBundle({ lane, sourceRoot: process.cwd(), build });
    const paths = artifact.graphManifest.map(member => member.path);
    expect(paths.filter(path => path.startsWith('services/'))).toEqual(observationPaths);
    expect(paths).toEqual(expect.arrayContaining([
      'scripts/ptr-production-existing-update-adapter.mjs',
      'scripts/ptr-production-state-observation.mjs',
    ]));
  });

  it.each(['foreign-service', 'missing-verifier'])('rejects a connected graph with %s', async scenario => {
    const alteredBuild: typeof build = async options => {
      const result = await build(options);
      const inputs = result.metafile!.inputs;
      const entry = inputs[`scripts/sealed-realms-production-${lane}-workflow-entry.mjs`];
      if (scenario === 'foreign-service') {
        // An existing, connected source defeats rejection for an orphan or ENOENT.
        const foreign = 'services/release-recovery/src/realmEvidence.ts';
        expect(Object.hasOwn(inputs, foreign)).toBe(false);
        inputs[foreign] = { bytes: readFileSync(join(process.cwd(), foreign)).length, imports: [] };
        entry.imports.push({ path: foreign, kind: 'import-statement' });
      } else {
        const verifier = 'services/release-recovery/src/ptrObservation.ts';
        expect(Object.hasOwn(inputs, verifier)).toBe(true);
        const dependencies = inputs[verifier].imports;
        delete inputs[verifier];
        for (const input of Object.values(inputs)) {
          input.imports = input.imports.filter(edge => edge.path !== verifier);
        }
        // Keep its dependencies reachable so the missing required verifier is
        // rejected even when all remaining edges resolve and the graph is closed.
        entry.imports.push(...dependencies);
      }
      return result;
    };
    await expect(buildSealedRealmOperationBundle({ lane, sourceRoot: process.cwd(), build: alteredBuild }))
      .rejects.toThrow('SEALED_REALMS_BUNDLES_SOURCE_GRAPH_INVALID');
  });
});

it('keeps G001 free of service inputs and rejects an otherwise authorized observation path', async () => {
  const baseline = await buildSealedRealmOperationBundle({ lane: 'g001', sourceRoot: process.cwd(), build });
  expect(baseline.graphManifest.some(member => member.path.startsWith('services/'))).toBe(false);
  const alteredBuild: typeof build = async options => {
    const result = await build(options);
    const verifier = 'services/release-recovery/src/ptrObservation.ts';
    const inputs = result.metafile!.inputs;
    expect(Object.hasOwn(inputs, verifier)).toBe(false);
    inputs[verifier] = { bytes: readFileSync(join(process.cwd(), verifier)).length, imports: [] };
    inputs['scripts/sealed-realms-production-g001-workflow-entry.mjs'].imports.push({ path: verifier, kind: 'import-statement' });
    return result;
  };
  await expect(buildSealedRealmOperationBundle({ lane: 'g001', sourceRoot: process.cwd(), build: alteredBuild }))
    .rejects.toThrow('SEALED_REALMS_BUNDLES_SOURCE_GRAPH_INVALID');
});

it('bundles the reachable PTR update artifact builder and imports it in plain Node', async () => {
  const artifact = await buildSealedRealmOperationBundle({ lane: 'ptr', sourceRoot: process.cwd(), build });
  expect(Buffer.from(artifact.bytes).toString('utf8')).not.toMatch(/["'`]\/home\//u);
  expect(artifact.graphManifest.map(member => member.path)).toEqual(expect.arrayContaining([
    'scripts/ptr-production-existing-update-adapter.mjs',
    'scripts/ptr-production-publisher.mjs',
    'scripts/ptr-artifact-description.mjs',
    'scripts/ptr-binding-linux-locked-source-build.ts',
    'scripts/ptr-production-state-observation.mjs',
    'services/release-recovery/src/config.ts',
    'services/release-recovery/src/crypto.ts',
    'services/release-recovery/src/http.ts',
    'services/release-recovery/src/protocol.ts',
    'services/release-recovery/src/ptrObservation.ts',
    'services/release-recovery/src/recoveryPublicKey.ts',
  ]));
  const directory = mkdtempSync(join(tmpdir(), 'warpkeep-ptr-bundle-import-'));
  try {
    const file = join(directory, artifact.basename);
    writeFileSync(file, artifact.bytes);
    const program = `
      const module = await import(${JSON.stringify(pathToFileURL(file).href)});
      try {
        await module.createSealedRealmsProductionPtrWorkflowRuntime({});
        throw new Error('Factory accepted invalid input');
      } catch (error) {
        if (error.code !== 'SEALED_REALMS_PTR_WORKFLOW_INPUT_INVALID') throw error;
      }
      process.stdout.write('bundle-imported');
    `;
    const result = spawnSync(process.execPath, ['--input-type=module', '--eval', program], {
      encoding: 'utf8', timeout: 15_000, maxBuffer: 64 * 1024, windowsHide: true,
    });
    expect(result.error).toBeUndefined();
    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toBe('bundle-imported');
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}, 30_000);
