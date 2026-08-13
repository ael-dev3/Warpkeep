import {
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, resolve } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import {
  INNER_KEEP_RABBIT_MODELS,
  INNER_KEEP_RABBIT_RUNTIME_PATHS,
  INNER_KEEP_RABBIT_SELECTION,
  INNER_KEEP_RABBIT_SELECTION_DIGEST,
  assertInnerKeepRabbitRuntimeUseAuthorized,
  calculateInnerKeepRabbitSelectionDigest,
  verifyInnerKeepRabbitGlb,
} from '../scripts/inner-keep-rabbit-runtime-contract.mjs';
import { verifyInnerKeepRabbitRuntimeInstall } from '../scripts/verify-inner-keep-rabbit-assets.mjs';
import {
  INNER_KEEP_RABBIT_ANIMATION_CLIPS,
  INNER_KEEP_RABBIT_RUNTIME_ASSETS,
  INNER_KEEP_RABBIT_RUNTIME_SELECTION_DIGEST,
  innerKeepRabbitLodForQuality,
} from '../src/components/inner-keep/innerKeepRabbitRuntimeAssets';
import { REALM_RABBIT_RUNTIME_ASSET } from '../src/components/realm/realmRabbitRuntimeAsset';

const ROOT = resolve(import.meta.dirname, '..');
const temporaryDirectories: string[] = [];

afterEach(() => {
  temporaryDirectories.splice(0).forEach((directory) => {
    rmSync(directory, { force: true, recursive: true });
  });
});

function productionFixture() {
  const outputRoot = mkdtempSync(resolve(tmpdir(), 'warpkeep-rabbit-dist-'));
  temporaryDirectories.push(outputRoot);
  for (const model of INNER_KEEP_RABBIT_MODELS) {
    const destination = resolve(outputRoot, model.destinationPath.replace(/^public\//u, ''));
    mkdirSync(dirname(destination), { recursive: true });
    copyFileSync(resolve(ROOT, model.destinationPath), destination);
  }
  return outputRoot;
}

describe('Inner Keep Lowlands Rabbit runtime selection', () => {
  it('pins the exact release, narrow authorization, and three-model budget', () => {
    expect(INNER_KEEP_RABBIT_SELECTION_DIGEST).toBe(
      '39ff0df2a78e475f1a8caaeac3fe48505c812905e894fe9eb282f01deb1a7eb0',
    );
    expect(calculateInnerKeepRabbitSelectionDigest(INNER_KEEP_RABBIT_SELECTION)).toBe(
      INNER_KEEP_RABBIT_SELECTION_DIGEST,
    );
    expect(INNER_KEEP_RABBIT_SELECTION).toMatchObject({
      recordedAt: '2026-08-04',
      authorization: {
        officialRepositoryRuntimeUseAuthorized: true,
        status: 'authorized-owner-runtime-use',
      },
      licenseBoundary: {
        sourceStatus: 'public-archive-authorized-no-separate-open-license',
        redistributionOrRelicensingGranted: false,
      },
      source: {
        releaseCommit: 'd8c35bb01c399ecde711274ef43880d8d304ae44',
        tag: 'rabbit-runtime-ui-bundle-2026-07-30',
        attachment: {
          bytes: 2_717_585,
          sha256: 'cf40e6c7149635a8cf6439e618e951219770491a7f364e7776b8af128461a3a9',
        },
      },
      counts: {
        selectedModels: 3,
        selectedBytes: 230_536,
        selectedTriangles: 1_222,
      },
    });
    expect(INNER_KEEP_RABBIT_MODELS).toHaveLength(3);
    expect(INNER_KEEP_RABBIT_RUNTIME_PATHS).toHaveLength(3);
    expect(new Set(INNER_KEEP_RABBIT_RUNTIME_PATHS).size).toBe(3);
    expect(() => assertInnerKeepRabbitRuntimeUseAuthorized()).not.toThrow();
  });

  it('keeps the browser catalog immutable and aligned with the audited record', () => {
    expect(INNER_KEEP_RABBIT_RUNTIME_SELECTION_DIGEST).toBe(
      INNER_KEEP_RABBIT_SELECTION_DIGEST,
    );
    expect(INNER_KEEP_RABBIT_ANIMATION_CLIPS).toEqual(['Alert', 'Idle', 'Nibble', 'Walk']);
    for (const model of INNER_KEEP_RABBIT_MODELS) {
      const client = INNER_KEEP_RABBIT_RUNTIME_ASSETS[
        model.profile as keyof typeof INNER_KEEP_RABBIT_RUNTIME_ASSETS
      ];
      expect(client).toMatchObject({
        bytes: model.bytes,
        sha256: model.sha256,
        triangles: model.triangles,
        uploadedVertices: model.uploadedVertices,
        drawCalls: model.drawCalls,
        rigged: model.mode === 'animated',
        animations: model.animations,
      });
      expect(`public/${client.path}`).toBe(model.destinationPath);
      expect(client.path).toMatch(
        new RegExp(`-${model.sha256.slice(0, 16)}\\.glb$`, 'u'),
      );
      expect(Object.isFrozen(client)).toBe(true);
    }
    expect(innerKeepRabbitLodForQuality('high', false)).toBe('balanced');
    expect(innerKeepRabbitLodForQuality('balanced', false)).toBe('balanced');
    expect(innerKeepRabbitLodForQuality('high', true)).toBe('compact');
    expect(innerKeepRabbitLodForQuality('reduced', false)).toBe('compact');
    expect(INNER_KEEP_RABBIT_RUNTIME_ASSETS.compact).toMatchObject({
      path: REALM_RABBIT_RUNTIME_ASSET.path,
      bytes: REALM_RABBIT_RUNTIME_ASSET.bytes,
      sha256: REALM_RABBIT_RUNTIME_ASSET.sha256,
      triangles: REALM_RABBIT_RUNTIME_ASSET.triangles,
      uploadedVertices: REALM_RABBIT_RUNTIME_ASSET.uploadedVertices,
    });
  });

  it('verifies every installed GLB, including rig, clips, vertices, and triangles', () => {
    expect(verifyInnerKeepRabbitRuntimeInstall({ mode: 'repository' })).toEqual({
      mode: 'repository',
      files: 3,
      bytes: 230_536,
      digest: INNER_KEEP_RABBIT_SELECTION_DIGEST,
      presentationOnly: true,
    });
    for (const model of INNER_KEEP_RABBIT_MODELS) {
      const gltf = verifyInnerKeepRabbitGlb(
        readFileSync(resolve(ROOT, model.destinationPath)),
        model,
        model.destinationPath,
      );
      expect(gltf.skins?.length ?? 0).toBe(model.mode === 'animated' ? 1 : 0);
      expect((gltf.animations ?? []).map((animation: { name?: string }) => animation.name).sort())
        .toEqual([...model.animations].sort());
    }
  });

  it('maps the exact allowlist into production and rejects extras in either leaf', () => {
    const outputRoot = productionFixture();
    expect(verifyInnerKeepRabbitRuntimeInstall({
      mode: 'production-dist',
      outputRoot,
    })).toMatchObject({ files: 3, bytes: 230_536 });
    const extra = resolve(
      outputRoot,
      'models/hegemony/inner-keep/wildlife/rabbit/unreviewed.glb',
    );
    writeFileSync(extra, 'not authorized', 'utf8');
    expect(() => verifyInnerKeepRabbitRuntimeInstall({
      mode: 'production-dist',
      outputRoot,
    })).toThrow(/three-file allowlist/i);
    rmSync(extra);
    const sharedExtra = resolve(
      outputRoot,
      'models/hegemony/environment/wildlife/rabbit/unreviewed.glb',
    );
    writeFileSync(sharedExtra, 'not authorized', 'utf8');
    expect(() => verifyInnerKeepRabbitRuntimeInstall({
      mode: 'production-dist',
      outputRoot,
    })).toThrow(/three-file allowlist/i);
  });

  it('keeps ordinary builds offline and the provenance-required boundary visible', () => {
    const packageJson = JSON.parse(readFileSync(resolve(ROOT, 'package.json'), 'utf8')) as {
      scripts: Record<string, string>;
    };
    expect(packageJson.scripts.build).toContain('verify-inner-keep-rabbit-assets.mjs');
    expect(packageJson.scripts.build).not.toContain('install-inner-keep-rabbit-assets.mjs');
    expect(packageJson.scripts['assets:audit:inner-keep-rabbit'])
      .toBe('node scripts/install-inner-keep-rabbit-assets.mjs --audit-only');
    expect(packageJson.scripts['prepare:inner-keep-rabbit-assets'])
      .toBe('node scripts/install-inner-keep-rabbit-assets.mjs --install');
    const notice = readFileSync(resolve(ROOT, 'ASSETS-LICENSE.md'), 'utf8');
    expect(notice).toContain('Lowlands Rabbit wildlife runtime');
    expect(notice).toContain('public-archive-authorized-no-separate-open-license');
    expect(notice).toContain('LicenseRef-Warpkeep-Provenance-Required');
    expect(notice).toMatch(/do\s+not define animal population/u);
  });
});
