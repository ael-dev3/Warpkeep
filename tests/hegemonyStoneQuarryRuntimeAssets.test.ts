import { readFileSync, readdirSync, statSync } from 'node:fs';
import { basename, resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  HEGEMONY_STONE_QUARRY_RUNTIME_DIRECTORY,
  HEGEMONY_STONE_QUARRY_RUNTIME_PROFILES,
  HEGEMONY_STONE_QUARRY_RUNTIME_RECORD,
  HEGEMONY_STONE_QUARRY_SOURCE,
  verifyHegemonyStoneQuarryRuntimeBytes
} from '../scripts/hegemony-stone-quarry-runtime-contract.mjs';

const ROOT = resolve(import.meta.dirname, '..');

describe('Hegemony Stone Quarry runtime assets', () => {
  it('ships exactly the reviewed digest-bearing public LOD family', () => {
    const directory = resolve(ROOT, HEGEMONY_STONE_QUARRY_RUNTIME_DIRECTORY);
    expect(readdirSync(directory).sort()).toEqual(
      HEGEMONY_STONE_QUARRY_RUNTIME_PROFILES.map(({ filename }) => filename).sort()
    );

    for (const profile of HEGEMONY_STONE_QUARRY_RUNTIME_PROFILES) {
      const relativePath = HEGEMONY_STONE_QUARRY_RUNTIME_DIRECTORY + '/' + profile.filename;
      const path = resolve(ROOT, relativePath);
      const bytes = readFileSync(path);
      expect(statSync(path).isFile(), relativePath).toBe(true);
      expect(basename(path), relativePath).toBe(profile.filename);
      expect(profile.sha256.startsWith(
        basename(path).match(/-([a-f0-9]+)\.glb$/u)?.[1] ?? ''
      ), relativePath).toBe(true);
      expect(() => verifyHegemonyStoneQuarryRuntimeBytes(bytes, profile, relativePath))
        .not.toThrow();
    }
  });

  it('pins the delivery facts and keeps all runtime coordinates auditable', () => {
    const record = JSON.parse(readFileSync(resolve(ROOT, HEGEMONY_STONE_QUARRY_RUNTIME_RECORD), 'utf8'));
    expect(record).toMatchObject({
      schema: 'warpkeep.resource-node-runtime.v1',
      assetId: 'warpkeep.stone-quarry-node',
      sourcePackage: {
        packageDirectory: HEGEMONY_STONE_QUARRY_SOURCE.packageDirectory,
        runtimeRoot: HEGEMONY_STONE_QUARRY_SOURCE.runtimeRoot,
        manifest: HEGEMONY_STONE_QUARRY_SOURCE.manifest,
        sourceVersion: HEGEMONY_STONE_QUARRY_SOURCE.version,
        sourceRevision: HEGEMONY_STONE_QUARRY_SOURCE.revision,
        contract: { gltfUp: '+Y', frontFacing: '+Z', interactionPivot: 'footprint-center' }
      }
    });
    expect(record.authorization.scope).toContain('not merge, deployment, seeding, or production-world approval');
    expect(record.scopeBoundary).toContain('SpacetimeDB');
    expect(record.runtimeAssets).toEqual(HEGEMONY_STONE_QUARRY_RUNTIME_PROFILES.map((profile) => (
      expect.objectContaining({
        id: profile.id,
        sourceFilename: profile.sourceFilename,
        path: HEGEMONY_STONE_QUARRY_RUNTIME_DIRECTORY + '/' + profile.filename,
        bytes: profile.bytes,
        sha256: profile.sha256,
        triangles: profile.triangles,
        uploadedVertices: profile.vertices,
        derivation: 'exact owner-supplied runtime bytes'
      })
    )));
  });

  it('requires local verification rather than source acquisition during ordinary builds', () => {
    const packageJson = JSON.parse(readFileSync(resolve(ROOT, 'package.json'), 'utf8')) as {
      scripts: Record<string, string>;
    };
    expect(packageJson.scripts.build).toContain('verify-hegemony-stone-quarry-runtime-assets.mjs');
    expect(packageJson.scripts.build).not.toContain('install-hegemony-stone-quarry-runtime.mjs');
    expect(packageJson.scripts['prepare:hegemony-stone-quarry-runtime'])
      .toBe('node scripts/install-hegemony-stone-quarry-runtime.mjs');
    expect(packageJson.scripts['verify:hegemony-stone-quarry'])
      .toBe('node scripts/verify-hegemony-stone-quarry-runtime-assets.mjs');

    const notice = readFileSync(resolve(ROOT, 'ASSETS-LICENSE.md'), 'utf8');
    for (const profile of HEGEMONY_STONE_QUARRY_RUNTIME_PROFILES) {
      expect(notice).toContain(HEGEMONY_STONE_QUARRY_RUNTIME_DIRECTORY + '/' + profile.filename);
      expect(notice).toContain(profile.sha256);
    }
    expect(notice).toContain('LicenseRef-Warpkeep-Provenance-Required');
  });
});
