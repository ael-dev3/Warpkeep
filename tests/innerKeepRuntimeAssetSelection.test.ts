import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import {
  INNER_KEEP_ASSET_AUTHORIZATION_INSTRUCTION,
  INNER_KEEP_ASSET_AUTHORIZATION_SCOPE_BOUNDARY,
  INNER_KEEP_ASSET_PROFILES,
  INNER_KEEP_ASSET_SELECTION,
  INNER_KEEP_ASSET_SELECTION_DIGEST,
  INNER_KEEP_ASSET_SELECTION_RECORD,
  INNER_KEEP_PLANNED_RUNTIME_PATHS,
  INNER_KEEP_SELECTED_ASSETS,
  INNER_KEEP_SELECTED_MODELS,
  INNER_KEEP_SELECTED_PREVIEWS,
  INNER_KEEP_SELECTED_SOURCE_MEMBERS,
  assertInnerKeepAssetSelectionRecord,
  assertInnerKeepRuntimeUseAuthorized,
  assertSafeInnerKeepArchiveMembers,
  calculateInnerKeepAssetSelectionDigest,
  verifyInnerKeepSelectedGlb,
  verifyInnerKeepSelectedPreview
} from '../scripts/inner-keep-runtime-asset-contract.mjs';
import { parseInnerKeepAssetPreparationMode } from '../scripts/install-inner-keep-runtime-assets.mjs';
import {
  parseInnerKeepAssetVerificationMode,
  verifyInnerKeepRuntimeAssetInstall
} from '../scripts/verify-inner-keep-runtime-assets.mjs';

const ROOT = resolve(import.meta.dirname, '..');
const TEMPORARY_DIRECTORIES: string[] = [];

function temporaryDirectory() {
  const directory = mkdtempSync(join(tmpdir(), 'warpkeep-inner-keep-static-'));
  TEMPORARY_DIRECTORIES.push(directory);
  return directory;
}

function copyProductionStaticFixture() {
  const directory = temporaryDirectory();
  for (const path of INNER_KEEP_PLANNED_RUNTIME_PATHS) {
    const relativePath = path.replace(/^public\//u, '');
    const destination = resolve(directory, relativePath);
    mkdirSync(dirname(destination), { recursive: true });
    copyFileSync(resolve(ROOT, path), destination);
  }
  return directory;
}

afterEach(() => {
  for (const directory of TEMPORARY_DIRECTORIES.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe('Inner Keep authorized runtime asset selection', () => {
  it('pins the exact release, trusted manifest, and canonical selection digest', () => {
    expect(INNER_KEEP_ASSET_SELECTION_RECORD).toBe(
      'docs/reference/assets/2026-08-02-inner-keep-3d-library/manifest.json'
    );
    expect(INNER_KEEP_ASSET_SELECTION.sourceRelease).toMatchObject({
      repository: 'ael-dev3/Warpkeep-Assets',
      repositoryMainCommit: '10c84fbcc339f143ee6f25dfe7a0682660e0e458',
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
      '00304c5dbf819cec6cb656996c1105f64efcf36acf8099c431f5b04b822679f0'
    );
  });

  it('selects a bounded three-quality set with buildable and landmark previews', () => {
    expect(INNER_KEEP_ASSET_PROFILES).toEqual(['high', 'balanced', 'compact']);
    expect(INNER_KEEP_SELECTED_ASSETS).toHaveLength(38);
    expect(INNER_KEEP_SELECTED_MODELS).toHaveLength(114);
    expect(INNER_KEEP_SELECTED_PREVIEWS).toHaveLength(6);
    expect(INNER_KEEP_SELECTED_SOURCE_MEMBERS).toHaveLength(158);
    expect(INNER_KEEP_PLANNED_RUNTIME_PATHS).toHaveLength(120);
    expect(new Set(INNER_KEEP_SELECTED_SOURCE_MEMBERS).size).toBe(158);
    expect(new Set(INNER_KEEP_PLANNED_RUNTIME_PATHS).size).toBe(120);

    expect(
      Object.fromEntries(
        ['buildings', 'landmarks', 'palisade', 'trees', 'town-items', 'stone'].map((family) => [
          family,
          INNER_KEEP_SELECTED_ASSETS.filter((asset) => asset.family === family).length
        ])
      )
    ).toEqual({
      buildings: 4,
      landmarks: 2,
      palisade: 6,
      trees: 3,
      'town-items': 19,
      stone: 4
    });

    expect(INNER_KEEP_ASSET_SELECTION.qualityTotals).toEqual({
      high: { bytes: 19_570_592, triangles: 159_914 },
      balanced: { bytes: 10_074_464, triangles: 85_284 },
      compact: { bytes: 5_991_748, triangles: 42_671 }
    });
    expect(INNER_KEEP_ASSET_SELECTION.selectedModelBytesAllProfiles).toBe(35_636_804);
    expect(INNER_KEEP_ASSET_SELECTION.selectedPreviewBytes).toBe(928_374);

    for (const asset of INNER_KEEP_SELECTED_ASSETS) {
      expect(asset.models.map((model: { profile: string }) => model.profile)).toEqual(
        INNER_KEEP_ASSET_PROFILES
      );
      for (const model of asset.models) {
        expect(model.destinationPath).toContain(model.sha256.slice(0, 16));
        expect(model.sourcePath).not.toMatch(/LOD3|Catalogue|catalogue/u);
      }
      if (asset.family === 'buildings' || asset.family === 'landmarks') {
        expect(asset.preview).toMatchObject({ width: 320, height: 320 });
        expect(asset.preview.destinationPath).toContain(asset.preview.sha256.slice(0, 16));
      } else {
        expect(asset.preview).toBeUndefined();
      }
    }
  });

  it('includes the authorized cathedral and barracks while excluding non-runtime material', () => {
    const selected = JSON.stringify(INNER_KEEP_SELECTED_ASSETS);
    expect(selected).toContain('Warpkeep_CityBarracks_GameReady');
    expect(selected).toContain('Warpkeep_GrandCovenantCathedral_GameReady');
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

  it('records the exact runtime-use authorization and installs only pinned outputs', () => {
    expect(INNER_KEEP_ASSET_SELECTION.authorization).toMatchObject({
      archiveDistributionAuthorized: true,
      officialRepositoryRuntimeUseAuthorized: true,
      status: 'authorized-owner-runtime-use',
      recordedAt: '2026-08-04',
      instruction: INNER_KEEP_ASSET_AUTHORIZATION_INSTRUCTION,
      scopeBoundary: INNER_KEEP_ASSET_AUTHORIZATION_SCOPE_BOUNDARY
    });
    expect(() => assertInnerKeepRuntimeUseAuthorized()).not.toThrow();
    expect(verifyInnerKeepRuntimeAssetInstall({ mode: 'repository' })).toEqual({
      mode: 'repository',
      files: 120,
      models: 114,
      previews: 6,
      bytes: 36_565_178,
      digest: INNER_KEEP_ASSET_SELECTION_DIGEST,
      reusedTrees: 3
    });

    for (const model of INNER_KEEP_SELECTED_MODELS) {
      const path = resolve(ROOT, model.destinationPath);
      expect(existsSync(path), model.destinationPath).toBe(true);
      expect(() => verifyInnerKeepSelectedGlb(
        readFileSync(path),
        model,
        model.destinationPath
      )).not.toThrow();
    }
    for (const preview of INNER_KEEP_SELECTED_PREVIEWS) {
      const path = resolve(ROOT, preview.destinationPath);
      expect(existsSync(path), preview.destinationPath).toBe(true);
      expect(() => verifyInnerKeepSelectedPreview(
        readFileSync(path),
        preview,
        preview.destinationPath
      )).not.toThrow();
    }
  });

  it('rejects appended claims that broaden the exact static authorization', () => {
    const mutations = [
      (record: any) => {
        record.authorization.instruction += ' All unrelated runtime assets are approved.';
      },
      (record: any) => {
        record.authorization.scopeBoundary += ' General redistribution is authorized.';
      },
      (record: any) => {
        record.authorization.scopeBoundary = record.authorization.scopeBoundary.replace(
          ', or approve deployment',
          ''
        );
      }
    ];
    for (const mutate of mutations) {
      const record = structuredClone(INNER_KEEP_ASSET_SELECTION);
      mutate(record);
      expect(calculateInnerKeepAssetSelectionDigest(record)).toBe(
        INNER_KEEP_ASSET_SELECTION_DIGEST
      );
      expect(() => assertInnerKeepAssetSelectionRecord(record)).toThrow(
        /exact owner runtime-use authorization/u
      );
    }
  });

  it('maps the same exact static allowlist into production output and rejects extras', () => {
    const outputRoot = copyProductionStaticFixture();
    expect(verifyInnerKeepRuntimeAssetInstall({
      mode: 'production-dist',
      outputRoot
    })).toMatchObject({
      mode: 'production-dist',
      files: 120,
      models: 114,
      previews: 6,
      bytes: 36_565_178
    });
    const extra = resolve(
      outputRoot,
      'models/hegemony/inner-keep/town-items/unreviewed.glb'
    );
    writeFileSync(extra, 'not authorized', 'utf8');
    expect(() => verifyInnerKeepRuntimeAssetInstall({
      mode: 'production-dist',
      outputRoot
    })).toThrow(/exact 120-file allowlist/i);
  });

  it('accepts only explicit preparation modes and rejects unsafe archive membership', () => {
    expect(parseInnerKeepAssetPreparationMode(['--audit-only'])).toBe('--audit-only');
    expect(parseInnerKeepAssetPreparationMode(['--install'])).toBe('--install');
    expect(() => parseInnerKeepAssetPreparationMode([])).toThrow(/exactly one mode/i);
    expect(() => parseInnerKeepAssetPreparationMode(['--audit-only', '--install'])).toThrow(
      /exactly one mode/i
    );
    expect(parseInnerKeepAssetVerificationMode([])).toBe('repository');
    expect(parseInnerKeepAssetVerificationMode(['--production-dist'])).toBe(
      'production-dist'
    );
    expect(() => parseInnerKeepAssetVerificationMode(['--unknown'])).toThrow(
      /production-dist/i
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
    const generator = readFileSync(
      resolve(ROOT, 'scripts/generate-inner-keep-static-selection.mjs'),
      'utf8'
    );
    expect(installer).not.toMatch(/\bfetch\s*\(|https?:\/\//u);
    expect(installer).toContain('WARPKEEP_INNER_KEEP_ARCHIVE');
    expect(installer).toContain('WARPKEEP_INNER_KEEP_RELEASE_MANIFEST');
    expect(installer).toContain("resolveAttestedSystemUnzip()");
    expect(installer).toContain("if (mode === '--install') assertInnerKeepRuntimeUseAuthorized()");
    expect(generator).toContain(INNER_KEEP_ASSET_AUTHORIZATION_SCOPE_BOUNDARY);
    const verifier = readFileSync(
      resolve(ROOT, 'scripts/verify-inner-keep-runtime-assets.mjs'),
      'utf8'
    );
    expect(verifier).not.toMatch(/\bfetch\s*\(|https?:\/\/|\.cache\/warpkeep-assets/u);

    const packageJson = JSON.parse(readFileSync(resolve(ROOT, 'package.json'), 'utf8'));
    expect(packageJson.scripts.build).toContain('verify-inner-keep-runtime-assets.mjs');
    expect(packageJson.scripts.build).toContain(
      'verify-inner-keep-runtime-assets.mjs --production-dist'
    );
    expect(packageJson.scripts.build).not.toMatch(
      /install-inner-keep-runtime|generate-inner-keep-static|WARPKEEP_INNER_KEEP_ARCHIVE/u
    );
  });
});
