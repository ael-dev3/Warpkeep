import { readFileSync, readdirSync, statSync } from 'node:fs';
import { basename, resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  HEGEMONY_WHEAT_FARM_RUNTIME_DIRECTORY,
  HEGEMONY_WHEAT_FARM_RUNTIME_PROFILES,
  HEGEMONY_WHEAT_FARM_RUNTIME_RECORD,
  HEGEMONY_WHEAT_FARM_SOURCE,
  verifyHegemonyWheatFarmRuntimeBytes
} from '../scripts/hegemony-wheat-farm-runtime-contract.mjs';
import { HEGEMONY_WHEAT_FARM_RUNTIME_ASSETS } from '../src/components/realm/loadHegemonyExpeditionAssets';

const ROOT = resolve(import.meta.dirname, '..');

describe('Hegemony Wheat Farm runtime assets', () => {
  it('ships exactly the reviewed digest-bearing public LOD family', () => {
    const directory = resolve(ROOT, HEGEMONY_WHEAT_FARM_RUNTIME_DIRECTORY);
    expect(readdirSync(directory).sort()).toEqual(
      HEGEMONY_WHEAT_FARM_RUNTIME_PROFILES.map(({ filename }) => filename).sort()
    );

    for (const profile of HEGEMONY_WHEAT_FARM_RUNTIME_PROFILES) {
      const relativePath = `${HEGEMONY_WHEAT_FARM_RUNTIME_DIRECTORY}/${profile.filename}`;
      const path = resolve(ROOT, relativePath);
      const bytes = readFileSync(path);
      expect(statSync(path).isFile(), relativePath).toBe(true);
      const filename = basename(path);
      const digestPrefix = filename.match(/-([a-f0-9]+)\.glb$/u)?.[1];
      expect(filename, relativePath).toBe(profile.filename);
      expect(digestPrefix, relativePath).toBeDefined();
      expect(profile.sha256.startsWith(digestPrefix ?? '')).toBe(true);
      expect(digestPrefix?.length).toBeGreaterThanOrEqual(15);
      expect(() => verifyHegemonyWheatFarmRuntimeBytes(bytes, profile, relativePath))
        .not.toThrow();
    }
  });

  it('pins the owner delivery and keeps the client catalog aligned to exact runtime bytes', () => {
    const record = JSON.parse(readFileSync(resolve(ROOT, HEGEMONY_WHEAT_FARM_RUNTIME_RECORD), 'utf8'));
    expect(record).toMatchObject({
      schema: 'warpkeep.resource-node-runtime.v1',
      assetId: 'warpkeep.wheat-farm-node',
      sourcePackage: {
        packageDirectory: HEGEMONY_WHEAT_FARM_SOURCE.packageDirectory,
        runtimeRoot: HEGEMONY_WHEAT_FARM_SOURCE.runtimeRoot,
        manifest: HEGEMONY_WHEAT_FARM_SOURCE.manifest,
        sourceVersion: HEGEMONY_WHEAT_FARM_SOURCE.version,
        sourceRevision: HEGEMONY_WHEAT_FARM_SOURCE.revision,
        contract: { gltfUp: '+Y', frontFacing: '+Z' }
      }
    });
    expect(record.authorization.scope).toContain('not merge, deployment, seeding, or production-world approval');
    expect(record.scopeBoundary).toContain('SpacetimeDB');
    expect(record.runtimeAssets).toEqual(HEGEMONY_WHEAT_FARM_RUNTIME_PROFILES.map((profile) => (
      expect.objectContaining({
        id: profile.id,
        sourceFilename: profile.sourceFilename,
        path: `${HEGEMONY_WHEAT_FARM_RUNTIME_DIRECTORY}/${profile.filename}`,
        bytes: profile.bytes,
        sha256: profile.sha256,
        triangles: profile.triangles,
        uploadedVertices: profile.vertices,
        derivation: expect.stringContaining('exact owner-supplied')
      })
    )));

    for (const profile of HEGEMONY_WHEAT_FARM_RUNTIME_PROFILES) {
      expect(HEGEMONY_WHEAT_FARM_RUNTIME_ASSETS[profile.id]).toEqual({
        path: `${HEGEMONY_WHEAT_FARM_RUNTIME_DIRECTORY}/${profile.filename}`.replace(/^public\//u, ''),
        bytes: profile.bytes,
        sha256: profile.sha256
      });
    }
  });

  it('requires local verification rather than source acquisition during ordinary builds', () => {
    const packageJson = JSON.parse(readFileSync(resolve(ROOT, 'package.json'), 'utf8')) as {
      scripts: Record<string, string>;
    };
    expect(packageJson.scripts.build).toContain('verify-hegemony-wheat-farm-runtime-assets.mjs');
    expect(packageJson.scripts['verify:hegemony-wheat-farm'])
      .toBe('node scripts/verify-hegemony-wheat-farm-runtime-assets.mjs');

    const notice = readFileSync(resolve(ROOT, 'ASSETS-LICENSE.md'), 'utf8');
    for (const profile of HEGEMONY_WHEAT_FARM_RUNTIME_PROFILES) {
      expect(notice).toContain(`${HEGEMONY_WHEAT_FARM_RUNTIME_DIRECTORY}/${profile.filename}`);
      expect(notice).toContain(profile.sha256);
    }
    expect(notice).toContain('LicenseRef-Warpkeep-Provenance-Required');
  });
});
