import { resolve } from 'node:path';

export const GLTFPACK_VERSION = '1.2';

const TOOL_SPECS = Object.freeze({
  'darwin-arm64': Object.freeze({
    attachment: 'gltfpack-macos.zip',
    archiveBytes: 1_657_609,
    archiveSha256: '9f5288a6ad585bef3befbc2907c9f9b9fdeeb0b5a29eaa57f0fe15521b82eb28',
    binaryName: 'gltfpack',
    binaryBytes: 3_252_584,
    binarySha256: '037336fafa46f342fe118ce8d17877fecb3deb1cd6dd8f62ee2a95bfaf2b79df'
  }),
  'darwin-x64': Object.freeze({
    attachment: 'gltfpack-macos-intel.zip',
    archiveBytes: 1_826_692,
    archiveSha256: 'bcbd379f212552a84ca19fc986750ce8a4c3fd6c13344df6dbcff7bbf6bc121c',
    binaryName: 'gltfpack',
    binaryBytes: 3_787_240,
    binarySha256: '75f1b3e6cf0b4a9a504b721a0e0a1fe73087ba36bf631e7638cf3b3eea75adf1'
  }),
  'linux-x64': Object.freeze({
    attachment: 'gltfpack-ubuntu.zip',
    archiveBytes: 1_971_662,
    archiveSha256: 'ebc236f5f6c08c7e5c5750476a187d24805d44d8c680449c4b7369c333f817b1',
    binaryName: 'gltfpack',
    binaryBytes: 4_110_968,
    binarySha256: '7e0dc08489835df804a83ca111c2cac6f8431f5a7b0e5453d94d6749a988b32f'
  }),
  'win32-x64': Object.freeze({
    attachment: 'gltfpack-windows.zip',
    archiveBytes: 1_474_962,
    archiveSha256: '52e0c061d8b42f1c6bd8fe1cbc1e26a9da579ad5a4f5dd30a8ee0d599062f6c4',
    binaryName: 'gltfpack.exe',
    binaryBytes: 2_966_528,
    binarySha256: 'ff64f45e84aac9a1f58880e40934b3f29277413e2d0b3ed257322261ec021d2b'
  })
});

export function resolveGltfpackToolSpec(platform = process.platform, arch = process.arch) {
  const key = `${platform}-${arch}`;
  const spec = TOOL_SPECS[key];
  if (!spec) {
    throw new Error(`No checksum-pinned gltfpack ${GLTFPACK_VERSION} build for ${key}.`);
  }
  return Object.freeze({ ...spec, key });
}

export function gltfpackToolPaths(root, spec = resolveGltfpackToolSpec()) {
  const directory = resolve(root, '.cache/warpkeep-tools', `gltfpack-v${GLTFPACK_VERSION}`, spec.key);
  return Object.freeze({
    directory,
    archive: resolve(directory, spec.attachment),
    binary: resolve(directory, spec.binaryName)
  });
}

/**
 * Preparation accepts the explicit executable override first, then the exact
 * cache destination understood by the fetcher. Keeping this resolution in one
 * reviewed helper prevents a successful custom-cache fetch from becoming
 * invisible to the deterministic preparation step.
 */
export function resolveGltfpackBinaryPath(
  root,
  spec = resolveGltfpackToolSpec(),
  environment = process.env
) {
  const configured = environment.WARPKEEP_GLTFPACK_BIN
    ?? environment.WARPKEEP_GLTFPACK_BIN_CACHE;
  return configured
    ? resolve(configured)
    : gltfpackToolPaths(root, spec).binary;
}
