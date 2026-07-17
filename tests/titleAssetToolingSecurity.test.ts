import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

const fetchSource = readFileSync(resolve(
  import.meta.dirname,
  '../scripts/fetch-title-assets.mjs',
), 'utf8');
const prepareSource = readFileSync(resolve(
  import.meta.dirname,
  '../scripts/prepare-title-models.mjs',
), 'utf8');
const gltfpackFetchSource = readFileSync(resolve(
  import.meta.dirname,
  '../scripts/fetch-gltfpack-tool.mjs',
), 'utf8');
const gltfpackFetchScript = resolve(
  import.meta.dirname,
  '../scripts/fetch-gltfpack-tool.mjs',
);

describe('title asset reconstruction security', () => {
  it('uses the bounded, host-pinned release transport with a versioned user agent', () => {
    expect(fetchSource).toContain('fetchPinnedGithubReleaseAsset');
    expect(fetchSource).toContain('readExactResponseBody');
    expect(fetchSource).toContain('AbortSignal.timeout(60_000)');
    expect(fetchSource).toContain('readWarpkeepPackageVersion');
    expect(fetchSource).not.toContain("redirect: 'follow'");
    expect(fetchSource).not.toContain('.arrayBuffer()');
    expect(fetchSource).not.toContain('Warpkeep-asset-fetch/0.3.0');
  });

  it('uses an attested unzip and installs both GLBs as one rollback-safe family', () => {
    expect(prepareSource).toContain('resolveAttestedSystemUnzip');
    expect(prepareSource).toContain('readContainedRegularFile');
    expect(prepareSource).toContain('installAtomicFileFamily');
    expect(prepareSource).not.toMatch(/spawnSync\(\s*['"]unzip['"]/u);
    expect(prepareSource).not.toContain('writeFileSync');
    expect(prepareSource).not.toContain('mkdirSync(outputDirectory');
  });

  it('validates the gltfpack archive before publishing either pinned cache layer', () => {
    const binaryPublish = gltfpackFetchSource.indexOf("label: 'gltfpack binary cache'");
    const archivePublish = gltfpackFetchSource.indexOf("label: 'gltfpack archive cache'");
    expect(gltfpackFetchSource).toContain('gltfpack validation archive');
    expect(gltfpackFetchSource).toContain("runUnzip(['-p', validationArchive");
    expect(gltfpackFetchSource).toContain('rmSync(validationArchive, { force: true })');
    expect(binaryPublish).toBeGreaterThan(-1);
    expect(archivePublish).toBeGreaterThan(binaryPublish);
  });

  it('rejects colliding archive and executable cache overrides before network access', () => {
    const sharedCache = resolve(import.meta.dirname, '.gltfpack-collision-fixture');
    const result = spawnSync(process.execPath, [gltfpackFetchScript], {
      cwd: resolve(import.meta.dirname, '..'),
      encoding: 'utf8',
      env: {
        ...process.env,
        WARPKEEP_GLTFPACK_ARCHIVE_CACHE: sharedCache,
        WARPKEEP_GLTFPACK_BIN_CACHE: sharedCache,
      },
      timeout: 5_000,
    });

    expect(result.status).not.toBe(0);
    expect(`${result.stdout}${result.stderr}`).toMatch(/must use distinct paths/i);
  });
});
