import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  GLTFPACK_VERSION,
  gltfpackToolPaths,
  resolveGltfpackBinaryPath,
  resolveGltfpackToolSpec
} from '../scripts/gltfpack-tool-config.mjs';

describe('checksum-pinned gltfpack tool configuration', () => {
  it('pins every supported platform archive and executable', () => {
    expect(GLTFPACK_VERSION).toBe('1.2');
    const specs = [
      resolveGltfpackToolSpec('darwin', 'arm64'),
      resolveGltfpackToolSpec('darwin', 'x64'),
      resolveGltfpackToolSpec('linux', 'x64'),
      resolveGltfpackToolSpec('win32', 'x64')
    ];

    specs.forEach((spec) => {
      expect(spec.archiveBytes).toBeGreaterThan(1_000_000);
      expect(spec.binaryBytes).toBeGreaterThan(2_000_000);
      expect(spec.archiveSha256).toMatch(/^[0-9a-f]{64}$/);
      expect(spec.binarySha256).toMatch(/^[0-9a-f]{64}$/);
      expect(Object.isFrozen(spec)).toBe(true);
    });
  });

  it('fails closed on an unpinned platform and confines cache paths', () => {
    expect(() => resolveGltfpackToolSpec('freebsd', 'arm64'))
      .toThrow(/No checksum-pinned gltfpack 1\.2 build/);

    const spec = resolveGltfpackToolSpec('darwin', 'arm64');
    const paths = gltfpackToolPaths('/private/warpkeep', spec);
    expect(paths.directory).toBe(resolve(
      '/private/warpkeep',
      '.cache/warpkeep-tools/gltfpack-v1.2/darwin-arm64'
    ));
    expect(paths.archive).toBe(resolve(paths.directory, spec.attachment));
    expect(paths.binary).toBe(resolve(paths.directory, spec.binaryName));
  });

  it('shares custom cache resolution with preparation and prioritizes an explicit binary', () => {
    const spec = resolveGltfpackToolSpec('darwin', 'arm64');
    expect(resolveGltfpackBinaryPath('/private/warpkeep', spec, {
      WARPKEEP_GLTFPACK_BIN_CACHE: '/private/cache/gltfpack'
    })).toBe('/private/cache/gltfpack');
    expect(resolveGltfpackBinaryPath('/private/warpkeep', spec, {
      WARPKEEP_GLTFPACK_BIN: '/trusted/offline/gltfpack',
      WARPKEEP_GLTFPACK_BIN_CACHE: '/private/cache/gltfpack'
    })).toBe('/trusted/offline/gltfpack');
  });
});
