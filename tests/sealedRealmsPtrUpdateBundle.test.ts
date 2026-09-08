// @vitest-environment node
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'esbuild';
import { expect, it } from 'vitest';
import { buildSealedRealmOperationBundle } from '../scripts/sealed-realms-production-bundle-engine.mjs';

it('bundles the reachable PTR update artifact builder and imports it in plain Node', async () => {
  const artifact = await buildSealedRealmOperationBundle({ lane: 'ptr', sourceRoot: process.cwd(), build });
  expect(artifact.graphManifest.map(member => member.path)).toEqual(expect.arrayContaining([
    'scripts/ptr-production-existing-update-adapter.mjs',
    'scripts/ptr-production-publisher.mjs',
    'scripts/ptr-artifact-description.mjs',
    'scripts/ptr-binding-linux-locked-source-build.ts',
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
