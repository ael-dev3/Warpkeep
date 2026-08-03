import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  INNER_KEEP_ASSET_PROFILES,
  INNER_KEEP_ASSET_SELECTION,
  INNER_KEEP_ASSET_SELECTION_DIGEST,
  INNER_KEEP_ASSET_SELECTION_RECORD,
  INNER_KEEP_PLANNED_RUNTIME_PATHS,
  INNER_KEEP_SELECTED_ASSETS,
  INNER_KEEP_SELECTED_MODELS,
  INNER_KEEP_SELECTED_PREVIEWS,
  INNER_KEEP_SELECTED_SOURCE_MEMBERS,
  assertInnerKeepRuntimeUseAuthorized,
  assertSafeInnerKeepArchiveMembers,
  calculateInnerKeepAssetSelectionDigest,
  verifyInnerKeepSelectedGlb,
  verifyInnerKeepSelectedPreview
} from '../scripts/inner-keep-runtime-asset-contract.mjs';
import {
  main as runInnerKeepAssetPreparation,
  parseInnerKeepAssetPreparationMode
} from '../scripts/install-inner-keep-runtime-assets.mjs';

const ROOT = resolve(import.meta.dirname, '..');

describe('Inner Keep archive-only asset selection', () => {
  it('pins the exact release, trusted manifest, and canonical selection digest', () => {
    expect(INNER_KEEP_ASSET_SELECTION_RECORD).toBe(
      'docs/reference/assets/2026-08-02-inner-keep-3d-library/manifest.json'
    );
    expect(INNER_KEEP_ASSET_SELECTION.sourceRelease).toMatchObject({
      repository: 'ael-dev3/Warpkeep-Assets',
      repositoryMainCommit: 'b074ffb6317ff9a581f5b7fc7f0a0760e721a9b6',
      releaseCommit: '74033ebffb7f0a3ec371ccdabac10974bbe413b9',
      tag: 'inner-keep-3d-asset-library-2026-08-02',
      attachment: {
        name: 'inner-keep-3d-asset-library-2026-08-02-v1.zip',
        bytes: 234_962_670,
        sha256: 'f13bc9e7b8e32a6767b1959307a202d894123f384e11fd19550d75e0dfe5f6c9',
        entries: 1_347
      },
      trustedReleaseManifest: {
        bytes: 552_321,
        sha256: '67a31bee8c63718143a9071e9cb906f2229b9776c55d9d6fce3fd87bf2f032ae'
      }
    });
    expect(calculateInnerKeepAssetSelectionDigest(INNER_KEEP_ASSET_SELECTION)).toBe(
      INNER_KEEP_ASSET_SELECTION_DIGEST
    );
    expect(INNER_KEEP_ASSET_SELECTION_DIGEST).toBe(
      '6763aeb1755d800b817a0d5174182474d3836a928c59beb4b4fdf65f5d1f6ec3'
    );
  });

  it('selects a bounded three-quality set and four consistent building previews', () => {
    expect(INNER_KEEP_ASSET_PROFILES).toEqual(['high', 'balanced', 'compact']);
    expect(INNER_KEEP_SELECTED_ASSETS).toHaveLength(36);
    expect(INNER_KEEP_SELECTED_MODELS).toHaveLength(108);
    expect(INNER_KEEP_SELECTED_PREVIEWS).toHaveLength(4);
    expect(INNER_KEEP_SELECTED_SOURCE_MEMBERS).toHaveLength(148);
    expect(INNER_KEEP_PLANNED_RUNTIME_PATHS).toHaveLength(112);
    expect(new Set(INNER_KEEP_SELECTED_SOURCE_MEMBERS).size).toBe(148);
    expect(new Set(INNER_KEEP_PLANNED_RUNTIME_PATHS).size).toBe(112);

    expect(
      Object.fromEntries(
        ['buildings', 'palisade', 'trees', 'town-items', 'stone'].map((family) => [
          family,
          INNER_KEEP_SELECTED_ASSETS.filter((asset) => asset.family === family).length
        ])
      )
    ).toEqual({ buildings: 4, palisade: 6, trees: 3, 'town-items': 19, stone: 4 });

    expect(INNER_KEEP_ASSET_SELECTION.qualityTotals).toEqual({
      high: { bytes: 5_891_104, triangles: 63_034 },
      balanced: { bytes: 3_634_852, triangles: 37_156 },
      compact: { bytes: 1_790_392, triangles: 15_445 }
    });
    expect(INNER_KEEP_ASSET_SELECTION.selectedModelBytesAllProfiles).toBe(11_316_348);
    expect(INNER_KEEP_ASSET_SELECTION.selectedPreviewBytes).toBe(634_685);

    for (const asset of INNER_KEEP_SELECTED_ASSETS) {
      expect(asset.models.map((model: { profile: string }) => model.profile)).toEqual(
        INNER_KEEP_ASSET_PROFILES
      );
      for (const model of asset.models) {
        expect(model.destinationPath).toContain(model.sha256.slice(0, 16));
        expect(model.sourcePath).not.toMatch(/LOD3|Catalogue|catalogue/u);
      }
      if (asset.family === 'buildings') {
        expect(asset.preview).toMatchObject({ width: 320, height: 320 });
        expect(asset.preview.destinationPath).toContain(asset.preview.sha256.slice(0, 16));
      } else {
        expect(asset.preview).toBeUndefined();
      }
    }
  });

  it('excludes locked buildings, inspection catalogues, editable sources, and map LODs', () => {
    const selected = JSON.stringify(INNER_KEEP_SELECTED_ASSETS);
    expect(selected).not.toContain('Warpkeep_CityBarracks_GameReady');
    expect(selected).not.toContain('Warpkeep_GrandCovenantCathedral_GameReady');
    expect(selected).not.toMatch(/\.blend|inspection|catalogue\.glb|LOD3_Map/u);
    expect(INNER_KEEP_ASSET_SELECTION.selectionPolicy).toMatchObject({
      excludedProfiles: ['LOD3_Map'],
      inspectionCataloguesAllowed: false,
      editableSourcesAllowed: false,
      ordinaryBuildMayReadArchive: false,
      ordinaryBuildMayUseNetwork: false
    });
  });

  it('records but does not duplicate three already-authorized Realm trees', () => {
    expect(
      INNER_KEEP_ASSET_SELECTION.existingRuntimeReuse
        .map((entry: { assetId: string }) => entry.assetId)
        .sort()
    ).toEqual([
      'warpkeep.tree.cypress.ancient-dark',
      'warpkeep.tree.oak.spring-broad',
      'warpkeep.tree.spruce.deep-narrow'
    ]);
    expect(INNER_KEEP_SELECTED_ASSETS.map((asset) => asset.sourceAssetId)).not.toContain(
      'warpkeep.tree.oak.spring-broad'
    );
  });

  it('keeps runtime copying fail-closed until an exact owner authorization exists', () => {
    expect(INNER_KEEP_ASSET_SELECTION.authorization).toMatchObject({
      archiveDistributionAuthorized: true,
      officialRepositoryRuntimeUseAuthorized: false,
      status: 'pending-owner-runtime-use-authorization'
    });
    expect(() => assertInnerKeepRuntimeUseAuthorized()).toThrow(/owner authorization/i);
    expect(() => runInnerKeepAssetPreparation(['--install'])).toThrow(/owner authorization/i);

    for (const path of INNER_KEEP_PLANNED_RUNTIME_PATHS) {
      expect(existsSync(resolve(ROOT, path)), path).toBe(false);
    }
  });

  it('accepts only explicit preparation modes and rejects unsafe archive membership', () => {
    expect(parseInnerKeepAssetPreparationMode(['--audit-only'])).toBe('--audit-only');
    expect(parseInnerKeepAssetPreparationMode(['--install'])).toBe('--install');
    expect(() => parseInnerKeepAssetPreparationMode([])).toThrow(/exactly one mode/i);
    expect(() => parseInnerKeepAssetPreparationMode(['--audit-only', '--install'])).toThrow(
      /exactly one mode/i
    );

    const root = INNER_KEEP_ASSET_SELECTION.sourceRelease.attachment.packageRoot;
    const safe = [`${root}/3d/example.glb`, `${root}/manifest.json`];
    expect(() => assertSafeInnerKeepArchiveMembers(safe, safe, root)).not.toThrow();
    expect(() => assertSafeInnerKeepArchiveMembers(
      [`${root}/../escape.glb`],
      [`${root}/../escape.glb`],
      root
    )).toThrow(/unsafe member/i);
    expect(() => assertSafeInnerKeepArchiveMembers(
      [`${root}/3d/Example.glb`, `${root}/3d/example.glb`],
      [`${root}/3d/Example.glb`, `${root}/3d/example.glb`],
      root
    )).toThrow(/collision/i);
  });

  it('rejects substituted selected GLBs and previews before any install', () => {
    expect(() => verifyInnerKeepSelectedGlb(
      Buffer.from('not a GLB'),
      INNER_KEEP_SELECTED_MODELS[0],
      'substituted model'
    )).toThrow(/exact selected bytes/i);
    expect(() => verifyInnerKeepSelectedPreview(
      Buffer.from('not a PNG'),
      INNER_KEEP_SELECTED_PREVIEWS[0],
      'substituted preview'
    )).toThrow(/exact selected PNG/i);
  });

  it('keeps the preparer local-only and out of ordinary build acquisition', () => {
    const installer = readFileSync(
      resolve(ROOT, 'scripts/install-inner-keep-runtime-assets.mjs'),
      'utf8'
    );
    expect(installer).not.toMatch(/\bfetch\s*\(|https?:\/\//u);
    expect(installer).toContain('WARPKEEP_INNER_KEEP_ARCHIVE');
    expect(installer).toContain('WARPKEEP_INNER_KEEP_RELEASE_MANIFEST');
    expect(installer).toContain("resolveAttestedSystemUnzip()");
    expect(installer).toContain("if (mode === '--install') assertInnerKeepRuntimeUseAuthorized()");
  });
});
