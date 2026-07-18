import { readFileSync, readdirSync, statSync } from 'node:fs';
import { basename, resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  HEGEMONY_TREE_RUNTIME_ASSETS,
  HEGEMONY_TREE_RUNTIME_BUNDLE,
  HEGEMONY_TREE_RUNTIME_DIRECTORY,
  HEGEMONY_TREE_RUNTIME_PROFILES,
  HEGEMONY_TREE_RUNTIME_RECORD,
  HEGEMONY_TREE_TARGET_VISUAL_HEIGHT,
  verifyHegemonyTreeRuntimeBytes
} from '../scripts/hegemony-tree-runtime-contract.mjs';
import {
  HEGEMONY_TREE_RUNTIME_ASSETS as CLIENT_TREE_ASSETS,
  HEGEMONY_TREE_RUNTIME_LODS,
  HEGEMONY_TREE_TARGET_VISUAL_HEIGHT as CLIENT_TREE_TARGET_VISUAL_HEIGHT
} from '../src/components/realm/hegemonyTreeRuntimeAssets';

const ROOT = resolve(import.meta.dirname, '..');

describe('Hegemony environment-tree runtime assets', () => {
  it('ships exactly every reviewed digest-bearing tree LOD', () => {
    const directory = resolve(ROOT, HEGEMONY_TREE_RUNTIME_DIRECTORY);
    expect(readdirSync(directory).sort()).toEqual(
      HEGEMONY_TREE_RUNTIME_PROFILES.map((profile) => profile.filename).sort()
    );

    for (const profile of HEGEMONY_TREE_RUNTIME_PROFILES) {
      const relativePath = HEGEMONY_TREE_RUNTIME_DIRECTORY + '/' + profile.filename;
      const path = resolve(ROOT, relativePath);
      const bytes = readFileSync(path);
      expect(statSync(path).isFile(), relativePath).toBe(true);
      expect(basename(path), relativePath).toBe(
        'hegemony-tree-'
          + HEGEMONY_TREE_RUNTIME_ASSETS.find((asset) => asset.id === profile.assetId)?.slug
          + '-'
          + profile.id
          + '-'
          + profile.sha256.slice(0, 16)
          + '.glb'
      );
      expect(() => verifyHegemonyTreeRuntimeBytes(bytes, profile, relativePath))
        .not.toThrow();
    }
  });

  it('pins the supplied bundle, complete family, and narrow visual-only boundary', () => {
    const record = JSON.parse(readFileSync(resolve(ROOT, HEGEMONY_TREE_RUNTIME_RECORD), 'utf8'));
    expect(record).toMatchObject({
      schema: 'warpkeep.environment-tree-runtime.v1',
      assetFamilyId: 'hegemony-environment-trees',
      sourceBundle: {
        filename: HEGEMONY_TREE_RUNTIME_BUNDLE.filename,
        bytes: HEGEMONY_TREE_RUNTIME_BUNDLE.bytes,
        sha256: HEGEMONY_TREE_RUNTIME_BUNDLE.sha256,
        assetCount: 22,
        glbCount: 66,
        externalTextures: false
      }
    });
    expect(record.assets).toHaveLength(22);
    expect(record.assets.flatMap((asset: { models: unknown[] }) => asset.models)).toHaveLength(66);
    expect(record.runtimeContract.rendering).toContain('double-sided');
    expect(record.runtimeContract.targetVisualHeight).toBe(HEGEMONY_TREE_TARGET_VISUAL_HEIGHT);
    expect(record.runtimeContract.sourceManifestDiscrepancy).toContain('doubleSided=false');
    expect(record.authorization.scope).toContain('not merge or deployment approval');
    expect(record.scopeBoundary).toContain('SpacetimeDB');
  });

  it('keeps the client catalog aligned to every pinned runtime asset', () => {
    expect(HEGEMONY_TREE_RUNTIME_LODS).toEqual(['high', 'balanced', 'compact']);
    expect(CLIENT_TREE_TARGET_VISUAL_HEIGHT).toBe(HEGEMONY_TREE_TARGET_VISUAL_HEIGHT);
    expect(CLIENT_TREE_ASSETS.map((asset) => asset.id)).toEqual(
      HEGEMONY_TREE_RUNTIME_ASSETS.map((asset) => asset.id)
    );
    for (const asset of CLIENT_TREE_ASSETS) {
      const contractAsset = HEGEMONY_TREE_RUNTIME_ASSETS.find((candidate) => (
        candidate.id === asset.id
      ));
      expect(contractAsset).toBeDefined();
      expect(asset.biomes).toEqual(contractAsset?.biomes);
      expect(Object.values(asset.models).map((model) => model.sha256).sort()).toEqual(
        contractAsset?.models.map((model) => model.sha256).sort()
      );
      expect(Object.values(asset.models).map((model) => model.path).sort()).toEqual(
        contractAsset?.models.map((model) => model.path).sort()
      );
      expect(Object.values(asset.models).map((model) => model.normalizedFootprintDiameter).sort()).toEqual(
        contractAsset?.models.map((model) => model.normalizedFootprintDiameter).sort()
      );
      for (const model of Object.values(asset.models)) {
        expect(model.path).toMatch(/^public\/models\/hegemony\/environment\/trees\/hegemony-tree-[a-z0-9-]+-[a-f0-9]{16}\.glb$/);
        expect(model.path).not.toContain('..');
      }
    }
    const clientCatalog = readFileSync(
      resolve(ROOT, 'src/components/realm/hegemonyTreeRuntimeAssets.ts'),
      'utf8'
    );
    expect(clientCatalog).not.toContain('sourcePath');
    expect(clientCatalog).not.toContain('sourceDirectory');
    expect(clientCatalog).not.toMatch(/https?:\/\//u);
  });

  it('requires local verification, exact manual installation, and provenance-required licensing', () => {
    const packageJson = JSON.parse(readFileSync(resolve(ROOT, 'package.json'), 'utf8')) as {
      scripts: Record<string, string>;
    };
    expect(packageJson.scripts.build).toContain('verify-hegemony-tree-runtime-assets.mjs');
    expect(packageJson.scripts.build).not.toContain('install-hegemony-tree-runtime.mjs');
    expect(packageJson.scripts['prepare:hegemony-trees'])
      .toBe('node scripts/install-hegemony-tree-runtime.mjs');
    expect(packageJson.scripts['verify:hegemony-trees'])
      .toBe('node scripts/verify-hegemony-tree-runtime-assets.mjs');

    const installer = readFileSync(resolve(ROOT, 'scripts/install-hegemony-tree-runtime.mjs'), 'utf8');
    expect(installer).toContain('assertExactSourceMembers');
    expect(installer).toContain('assertChecksumList');
    expect(installer).toContain('installAtomicFileFamily');
    expect(installer).toContain('verifyHegemonyTreeRuntimeBytes');

    const notice = readFileSync(resolve(ROOT, 'ASSETS-LICENSE.md'), 'utf8');
    expect(notice).toContain(HEGEMONY_TREE_RUNTIME_BUNDLE.sha256);
    expect(notice).toContain('LicenseRef-Warpkeep-Provenance-Required');
    expect(notice).toContain('public/models/hegemony/environment/trees/hegemony-tree-*.glb');
  });
});
