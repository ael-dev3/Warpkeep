import {
  copyFileSync,
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
  INNER_KEEP_POPULATION_ACTORS,
  INNER_KEEP_POPULATION_MODELS,
  INNER_KEEP_POPULATION_RUNTIME_PATHS,
  INNER_KEEP_POPULATION_SELECTION,
  INNER_KEEP_POPULATION_SELECTION_DIGEST,
  INNER_KEEP_POPULATION_SELECTION_RECORD,
  assertInnerKeepPopulationRuntimeUseAuthorized,
  assertInnerKeepPopulationSelectionRecord,
  calculateInnerKeepPopulationSelectionDigest,
  innerKeepPopulationSha256,
  verifyInnerKeepPopulationGlb
} from '../scripts/inner-keep-population-runtime-contract.mjs';
import { parseInnerKeepPopulationPreparationMode } from '../scripts/install-inner-keep-population-assets.mjs';
import {
  parseInnerKeepPopulationVerificationMode,
  verifyInnerKeepPopulationRuntimeInstall
} from '../scripts/verify-inner-keep-population-assets.mjs';

const ROOT = resolve(import.meta.dirname, '..');
const TEMPORARY_DIRECTORIES: string[] = [];

function temporaryDirectory() {
  const directory = mkdtempSync(join(tmpdir(), 'warpkeep-inner-keep-population-'));
  TEMPORARY_DIRECTORIES.push(directory);
  return directory;
}

function copyProductionPopulationFixture() {
  const directory = temporaryDirectory();
  for (const model of INNER_KEEP_POPULATION_MODELS) {
    const relativePath = model.destinationPath.replace(/^public\//u, '');
    const destination = resolve(directory, relativePath);
    mkdirSync(dirname(destination), { recursive: true });
    copyFileSync(resolve(ROOT, model.destinationPath), destination);
  }
  return directory;
}

function syntheticGlb(json: object) {
  const unpaddedJson = Buffer.from(JSON.stringify(json), 'utf8');
  const jsonLength = Math.ceil(unpaddedJson.byteLength / 4) * 4;
  const bytes = Buffer.alloc(20 + jsonLength, 0x20);
  bytes.write('glTF', 0, 'ascii');
  bytes.writeUInt32LE(2, 4);
  bytes.writeUInt32LE(bytes.byteLength, 8);
  bytes.writeUInt32LE(jsonLength, 12);
  bytes.writeUInt32LE(0x4e4f534a, 16);
  unpaddedJson.copy(bytes, 20);
  return bytes;
}

afterEach(() => {
  for (const directory of TEMPORARY_DIRECTORIES.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe('Inner Keep population runtime asset selection', () => {
  it('pins both trusted releases and all four exact source archive hashes', () => {
    expect(INNER_KEEP_POPULATION_SELECTION_RECORD).toBe(
      'docs/reference/assets/2026-08-04-inner-keep-population/manifest.json'
    );
    expect(INNER_KEEP_POPULATION_SELECTION_DIGEST).toBe(
      '79237fbe85a4db7a0592eb0c27cc00f8e72e85e58be867bec4dd35992f0b87f7'
    );
    expect(calculateInnerKeepPopulationSelectionDigest(
      INNER_KEEP_POPULATION_SELECTION
    )).toBe(INNER_KEEP_POPULATION_SELECTION_DIGEST);
    expect(INNER_KEEP_POPULATION_SELECTION.sources).toEqual([
      expect.objectContaining({
        tag: 'hegemony-unit-corps-2026-08-03',
        repositoryMainCommit: '10c84fbcc339f143ee6f25dfe7a0682660e0e458',
        releaseCommit: 'b074ffb6317ff9a581f5b7fc7f0a0760e721a9b6',
        trustedReleaseManifest: {
          repositoryPath: 'releases/hegemony-unit-corps-2026-08-03/manifest.json',
          bytes: 54_417,
          sha256: '983c7dbede5220a0b020a73ea7cf51f8cdd72fbe235417d890b34eabae3acaaf'
        },
        attachments: [
          expect.objectContaining({
            sha256: '953fcca256324f2a73b3f13e2ca04911349a0f69934337e6ac7161041a2d4ba0'
          }),
          expect.objectContaining({
            sha256: '310b0feaf21f0619f1d10f154facd64f98ce3ad1658cf80bb4dd68f5847a0391'
          }),
          expect.objectContaining({
            sha256: '9d411ee308abacfd7ca93b1e96594cc4f9e8af613f6d18aca3128b49dfb9a48b'
          })
        ]
      }),
      expect.objectContaining({
        tag: 'hegemony-citizens-keep-services-2026-08-03',
        repositoryMainCommit: '10c84fbcc339f143ee6f25dfe7a0682660e0e458',
        releaseCommit: '9f99751f691581ce4f33a31dd56c818cfa455b61',
        trustedReleaseManifest: {
          repositoryPath: 'releases/hegemony-citizens-keep-services-2026-08-03/manifest.json',
          bytes: 33_008,
          sha256: '2472aea6dc43780f6ee11692b65fe138a2355373a9e72d96156bc0f9290cb34b'
        },
        attachments: [
          expect.objectContaining({
            sha256: '14a8bda3848ede5b398a7fc4ec10e56d98ae06584c42f4683cb2635c5bbb6aeb'
          })
        ]
      })
    ]);
  });

  it('keeps the grant exact, presentation-only, and outside the source license', () => {
    expect(INNER_KEEP_POPULATION_SELECTION.authorization).toMatchObject({
      archiveDistributionAuthorized: true,
      officialRepositoryRuntimeUseAuthorized: true,
      status: 'authorized-owner-runtime-use',
      recordedAt: '2026-08-04'
    });
    expect(INNER_KEEP_POPULATION_SELECTION.authorization.scopeBoundary).toContain(
      'does not relicense the source archives'
    );
    expect(INNER_KEEP_POPULATION_SELECTION.authorization.scopeBoundary).toContain(
      'approve merge, or approve deployment'
    );
    expect(INNER_KEEP_POPULATION_SELECTION.licenseBoundary).toEqual({
      sourceStatus: 'public-archive-authorized-no-separate-open-license',
      integrationGrant: 'owner-authorized-official-warpkeep-runtime-use-only',
      redistributionOrRelicensingGranted: false
    });
    expect(INNER_KEEP_POPULATION_SELECTION.runtimePolicy).toEqual({
      animatedTier: 'LOD1_Balanced',
      staticFallbackTier: 'LOD2_Compact',
      ordinaryBuildMayReadArchive: false,
      ordinaryBuildMayUseNetwork: false,
      clientPresentationOnly: true,
      gameplayAuthorityClaimed: false
    });
    expect(() => assertInnerKeepPopulationRuntimeUseAuthorized()).not.toThrow();
  });

  it('selects 20 actors, 40 bounded models, six mounts, and exact clip sets', () => {
    expect(INNER_KEEP_POPULATION_ACTORS).toHaveLength(20);
    expect(INNER_KEEP_POPULATION_MODELS).toHaveLength(40);
    expect(INNER_KEEP_POPULATION_RUNTIME_PATHS).toHaveLength(40);
    expect(new Set(INNER_KEEP_POPULATION_RUNTIME_PATHS).size).toBe(40);
    expect(INNER_KEEP_POPULATION_SELECTION.counts).toEqual({
      actors: 20,
      selectedModels: 40,
      mountedActors: 6,
      families: { citizen: 8, infantry: 4, ranged: 4, cavalry: 4 },
      selectedBytes: 8_705_628,
      selectedTriangles: { balanced: 58_792, compact: 37_506 }
    });
    const clips = {
      citizen: ['Greet', 'Idle', 'Walk', 'Work'],
      infantry: ['Attack', 'Idle', 'Walk'],
      ranged: ['Attack', 'Idle', 'Special', 'Walk'],
      cavalry: ['Attack', 'Idle', 'Special', 'Walk']
    } as const;
    for (const actor of INNER_KEEP_POPULATION_ACTORS) {
      expect(actor.models.map((model: { profile: string }) => model.profile)).toEqual([
        'balanced',
        'compact'
      ]);
      expect(actor.models[0].animations).toEqual(clips[actor.family as keyof typeof clips]);
      expect(actor.models[1].animations).toEqual([]);
      expect(actor.models[0]).toMatchObject({ mode: 'animated', tier: 'LOD1_Balanced' });
      expect(actor.models[1]).toMatchObject({ mode: 'static', tier: 'LOD2_Compact' });
    }
    expect(INNER_KEEP_POPULATION_ACTORS.filter((actor) => actor.mounted).map(
      (actor) => actor.id
    )).toEqual([
      'astral-lancer',
      'dusk-outrider',
      'horseguard',
      'imperial-cataphract',
      'emberfoot-courier',
      'shellback-shrine-tender'
    ]);
    expect(Math.max(...INNER_KEEP_POPULATION_MODELS.map((model) => model.bytes))).toBeLessThan(
      5 * 1024 * 1024
    );
  });

  it('verifies all 40 installed GLBs, hashes, triangles, animations, and skin modes', () => {
    const result = verifyInnerKeepPopulationRuntimeInstall({ mode: 'repository' });
    expect(result).toEqual({
      mode: 'repository',
      files: 40,
      bytes: 8_705_628,
      digest: INNER_KEEP_POPULATION_SELECTION_DIGEST,
      presentationOnly: true
    });
    for (const model of INNER_KEEP_POPULATION_MODELS) {
      const bytes = readFileSync(resolve(ROOT, model.destinationPath));
      const gltf = verifyInnerKeepPopulationGlb(bytes, model, model.destinationPath);
      expect(gltf.skins?.length ?? 0).toBe(model.mode === 'animated' ? 1 : 0);
      expect((gltf.animations ?? []).map((animation: { name?: string }) => animation.name).sort())
        .toEqual(model.animations);
    }
  });

  it('maps the same exact allowlist into production output and rejects extra files', () => {
    const outputRoot = copyProductionPopulationFixture();
    expect(verifyInnerKeepPopulationRuntimeInstall({
      mode: 'production-dist',
      outputRoot
    })).toMatchObject({ mode: 'production-dist', files: 40, bytes: 8_705_628 });
    const extra = resolve(
      outputRoot,
      'models/hegemony/inner-keep/population/citizen/unreviewed.glb'
    );
    writeFileSync(extra, 'not authorized', 'utf8');
    expect(() => verifyInnerKeepPopulationRuntimeInstall({
      mode: 'production-dist',
      outputRoot
    })).toThrow(/exact 40-file allowlist/i);
  });

  it('rejects changed authorization, archive hashes, gameplay authority, and paths', () => {
    const mutations = [
      {
        changesDigest: false,
        mutate: (record: any) => {
          record.authorization.officialRepositoryRuntimeUseAuthorized = false;
        }
      },
      {
        changesDigest: false,
        mutate: (record: any) => {
          record.authorization.scopeBoundary = record.authorization.scopeBoundary.replace(
            ', or approve deployment',
            ''
          );
        }
      },
      {
        changesDigest: false,
        mutate: (record: any) => {
          record.licenseBoundary.redistributionOrRelicensingGranted = true;
        }
      },
      {
        changesDigest: true,
        mutate: (record: any) => { record.runtimePolicy.gameplayAuthorityClaimed = true; }
      },
      {
        changesDigest: true,
        mutate: (record: any) => {
          record.sources[0].attachments[0].sha256 = '0'.repeat(64);
        }
      },
      {
        changesDigest: true,
        mutate: (record: any) => { record.actors[0].models[0].sourcePath = '../escape.glb'; }
      },
      {
        changesDigest: true,
        mutate: (record: any) => {
        record.actors[0].models[0].destinationPath =
          'public/models/hegemony/inner-keep/population/../escape.glb';
        }
      }
    ];
    for (const { changesDigest, mutate } of mutations) {
      const record = structuredClone(INNER_KEEP_POPULATION_SELECTION);
      mutate(record);
      expect(() => assertInnerKeepPopulationSelectionRecord(record)).toThrow();
      const digest = calculateInnerKeepPopulationSelectionDigest(record);
      if (changesDigest) expect(digest).not.toBe(INNER_KEEP_POPULATION_SELECTION_DIGEST);
      else expect(digest).toBe(INNER_KEEP_POPULATION_SELECTION_DIGEST);
    }
  });

  it('rejects byte substitution and malformed animation, skin, and primitive contracts', () => {
    const selected = INNER_KEEP_POPULATION_MODELS[0];
    const substituted = readFileSync(resolve(ROOT, selected.destinationPath));
    substituted[substituted.byteLength - 1] ^= 0xff;
    expect(() => verifyInnerKeepPopulationGlb(
      substituted,
      selected,
      'tampered selected population model'
    )).toThrow(/exact selected bytes/i);

    const invalid = [
      {
        mode: 'animated',
        animations: ['Idle'],
        json: {
          asset: { version: '2.0' },
          accessors: [{ count: 3 }],
          meshes: [{ primitives: [{ attributes: { POSITION: 0 } }] }],
          animations: [{ name: 'Idle' }],
          skins: []
        }
      },
      {
        mode: 'static',
        animations: [],
        json: {
          asset: { version: '2.0' },
          accessors: [{ count: 3 }],
          meshes: [{ primitives: [{ mode: 1, attributes: { POSITION: 0 } }] }],
          animations: [],
          skins: []
        }
      }
    ];
    for (const candidate of invalid) {
      const bytes = syntheticGlb(candidate.json);
      expect(() => verifyInnerKeepPopulationGlb(bytes, {
        bytes: bytes.byteLength,
        sha256: innerKeepPopulationSha256(bytes),
        triangles: 1,
        animations: candidate.animations,
        mode: candidate.mode
      }, 'synthetic invalid GLB')).toThrow(/embedded animation and mesh contract/i);
    }
  });

  it('accepts only explicit preparation and verification modes', () => {
    expect(parseInnerKeepPopulationPreparationMode(['--audit-only'])).toBe('--audit-only');
    expect(parseInnerKeepPopulationPreparationMode(['--install'])).toBe('--install');
    expect(() => parseInnerKeepPopulationPreparationMode([])).toThrow(/exactly one mode/i);
    expect(() => parseInnerKeepPopulationPreparationMode([
      '--audit-only',
      '--install'
    ])).toThrow(/exactly one mode/i);
    expect(parseInnerKeepPopulationVerificationMode([])).toBe('repository');
    expect(parseInnerKeepPopulationVerificationMode(['--production-dist'])).toBe(
      'production-dist'
    );
    expect(() => parseInnerKeepPopulationVerificationMode(['--unknown'])).toThrow(
      /production-dist/i
    );
  });

  it('keeps ordinary verification local-only and acquisition-free', () => {
    const installer = readFileSync(
      resolve(ROOT, 'scripts/install-inner-keep-population-assets.mjs'),
      'utf8'
    );
    const verifier = readFileSync(
      resolve(ROOT, 'scripts/verify-inner-keep-population-assets.mjs'),
      'utf8'
    );
    const generator = readFileSync(
      resolve(ROOT, 'scripts/generate-inner-keep-population-selection.mjs'),
      'utf8'
    );
    expect(installer).not.toMatch(/\bfetch\s*\(|https?:\/\//u);
    expect(verifier).not.toMatch(/\bfetch\s*\(|https?:\/\/|\.cache\/warpkeep-assets/u);
    expect(installer).toContain('WARPKEEP_INNER_KEEP_POPULATION_ARCHIVE_ROOT');
    expect(installer).toContain('resolveAttestedSystemUnzip()');
    expect(installer).toContain("mkdtempSync(resolve(tmpdir(), 'warpkeep-inner-keep-population-'))");
    expect(installer).toContain("writeFileSync(snapshotPath, bytes, { flag: 'wx', mode: 0o600 })");
    expect(installer).toContain('archive.snapshotPath');
    expect(installer).not.toContain('archive.path');
    expect(installer).toContain('env: createAssetToolEnvironment(workspace)');
    expect(generator).toContain(
      INNER_KEEP_POPULATION_SELECTION.authorization.scopeBoundary
    );

    const packageJson = JSON.parse(readFileSync(resolve(ROOT, 'package.json'), 'utf8'));
    expect(packageJson.scripts.build).toContain(
      'verify-inner-keep-population-assets.mjs'
    );
    expect(packageJson.scripts.build).toContain(
      'verify-inner-keep-population-assets.mjs --production-dist'
    );
    expect(packageJson.scripts.build).not.toMatch(
      /install-inner-keep-population|generate-inner-keep-population|WARPKEEP_INNER_KEEP_POPULATION_ARCHIVE/u
    );
  });
});
