import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  lstatSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync
} from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';

import {
  GLTFPACK_VERSION,
  resolveGltfpackBinaryPath,
  resolveGltfpackToolSpec
} from './gltfpack-tool-config.mjs';
import { createAssetToolEnvironment } from './asset-tool-process.mjs';
import {
  inspectEmbeddedWebpGlb,
  rewriteEmbeddedWebpGlb,
  SHARP_TOOLCHAIN
} from './rewrite-embedded-webp-glb.mjs';
import { resolveAttestedSystemUnzip } from './system-unzip.mjs';
import {
  ensureContainedDirectory,
  installAtomicFileFamily
} from './atomic-install-file-family.mjs';

const root = resolve(import.meta.dirname, '..');
const release = Object.freeze({
  tag: 'hegemony-frontier-keep-3d-2026-07-14',
  attachment: 'hegemony-frontier-keep-3d-sources-v1.zip',
  bytes: 10_672_929,
  sha256: 'c029a636ee0a791ca54072d5f32fcf68263677951fd59c338dfe242264335d5f'
});
const archive = process.env.WARPKEEP_CASTLE_ARCHIVE
  ? resolve(process.env.WARPKEEP_CASTLE_ARCHIVE)
  : process.env.WARPKEEP_CASTLE_ARCHIVE_CACHE
    ? resolve(process.env.WARPKEEP_CASTLE_ARCHIVE_CACHE)
    : resolve(root, '.cache/warpkeep-assets', release.tag, release.attachment);
const bundleRoot = 'hegemony-frontier-keep-3d-sources-v1';
const sourceMember = `${bundleRoot}/HegemonyMainCastle.glb`;
const sourceRecord = Object.freeze({
  bytes: 2_233_564,
  sha256: 'b33755f14bbed0855cf738ba8fb2dbdde9cf56e976b7f108a2259dd478a9b580'
});
// This reproducer is historical evidence only. Never write its superseded
// bytes over the active or rollback-safe public runtime coordinates.
const outputRelativeDirectory = [
  '.cache',
  'warpkeep-assets',
  release.tag,
  'historical-alpha-0.3.4-runtime'
].join('/');
const gltfpackSpec = resolveGltfpackToolSpec();
const gltfpackBinary = resolveGltfpackBinaryPath(root, gltfpackSpec);
const unzipBinary = resolveAttestedSystemUnzip();
const workspace = mkdtempSync(resolve(tmpdir(), 'warpkeep-main-castle-'));
const assetToolEnvironment = createAssetToolEnvironment(workspace);

const profiles = Object.freeze([
  Object.freeze({
    id: 'high', ratio: '0.75', error: '0.004', textureSize: 2_048,
    expectedBytes: 1_934_920,
    expectedTriangles: 67_680,
    expectedVertices: 153_439,
    expectedIndexComponentType: 5_125,
    expectedSha256: '9e49713b5cb59f9b5ac10511652de4c243ba8b1edd2227935f4c9c415304a1a2',
    expectedImages: Object.freeze([
      Object.freeze({ bytes: 79_450, sha256: '3ff2fa16d17b08d91551f5b52ee8419a821c4e726c2296c0c539daee3f23149a' }),
      Object.freeze({ bytes: 69_426, sha256: '27c90266612844c619d6a79d5db5701454ce6209e91cab47247eeb8fd065517a' })
    ])
  }),
  Object.freeze({
    id: 'balanced', ratio: '0.42', error: '0.012', textureSize: 1_024,
    expectedBytes: 1_172_132,
    expectedTriangles: 40_353,
    expectedVertices: 78_928,
    expectedIndexComponentType: 5_125,
    expectedSha256: 'aa3a557b1725dc4bd91e772f44136f72270b0c055c31d8913bb8738405b5934e',
    expectedImages: Object.freeze([
      Object.freeze({ bytes: 192_188, sha256: '1074250bd5d8bcb6889f14f5ad1a7f12e748853140bf8c7a6e6d69ce254d23e7' }),
      Object.freeze({ bytes: 58_470, sha256: 'f48aef508f4f548035e2db4fafc1a52d117d67ebd5264f1f3fcb6545bf25dc6d' })
    ])
  }),
  Object.freeze({
    id: 'compact', ratio: '0.25', error: '0.018', textureSize: 512,
    expectedBytes: 508_508,
    expectedTriangles: 19_086,
    expectedVertices: 34_098,
    expectedIndexComponentType: 5_123,
    expectedSha256: 'de27e5d43818e4aea225f10f8aa0fafa935b61b2c0c21553c36a8bef916a9c29',
    expectedImages: Object.freeze([
      Object.freeze({ bytes: 82_498, sha256: '712b27a1f21435c8f232dddc0e7122cedd93553eb17b4e5b6370417d3e437ba3' }),
      Object.freeze({ bytes: 22_098, sha256: '7465d0ffebd3e7da60831bda33d240f3b9d6516d71922a5b5df920b930568c75' })
    ])
  })
]);

const sourceImages = Object.freeze([
  Object.freeze({
    name: 'WK_HeroCastle_NormalAtlas',
    role: 'normal',
    bytes: 79_450,
    sha256: '3ff2fa16d17b08d91551f5b52ee8419a821c4e726c2296c0c539daee3f23149a',
    width: 2_048,
    height: 2_048
  }),
  Object.freeze({
    name: 'WK_HeroCastle_BaseColorAtlas',
    role: 'baseColor',
    bytes: 69_426,
    sha256: '27c90266612844c619d6a79d5db5701454ce6209e91cab47247eeb8fd065517a',
    width: 2_048,
    height: 2_048
  })
]);

const sourceGeometryPayloads = Object.freeze([
  Object.freeze({ bytes: 85_978, sha256: '467d10d1cfa12a8d48f54130926085769a2e15fc3d4a506387ef29c80aeb352b' }),
  Object.freeze({ bytes: 329_926, sha256: '16adf9553fed2e35d05aaa919d28713a0883ac92969122e3c7a2fb21e1969726' }),
  Object.freeze({ bytes: 340_356, sha256: 'd10b425fbdec55683f4534864957ecb54c92c1b227d18c9c959b011d7a29d926' }),
  Object.freeze({ bytes: 747_702, sha256: 'e7afa4479f5da5b4e1f12419821de04f8539491a1a21bec817cab6f0524e3f38' }),
  Object.freeze({ bytes: 577_154, sha256: 'e590837e7f5827d3b410b7679c8b8750da8a81fffb8849f6f90051bb5f0dd67d' })
]);

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

function assertExact(bytes, expected, label) {
  if (bytes.byteLength !== expected.bytes) {
    throw new Error(`${label} byte length changed: ${bytes.byteLength}.`);
  }
  const hash = sha256(bytes);
  if (hash !== expected.sha256) throw new Error(`${label} hash changed: ${hash}.`);
  return hash;
}

function assertExactOrdinaryFile(path, expectedBytes, label) {
  const details = lstatSync(path, { throwIfNoEntry: false });
  if (!details?.isFile()) throw new Error(`${label} must be an ordinary file: ${path}.`);
  if (details.size !== expectedBytes) {
    throw new Error(`${label} byte length changed: ${details.size}.`);
  }
}

function unzip(args, encoding = 'utf8') {
  const result = spawnSync(unzipBinary, args, {
    cwd: root,
    encoding,
    maxBuffer: 32 * 1024 * 1024
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`unzip failed (${result.status}): ${String(result.stderr).trim()}`);
  }
  return result.stdout;
}

function assertSafeArchive(entries) {
  const normalized = new Set();
  for (const entry of entries) {
    if (!entry || entry.includes('\\') || entry.includes('\0') || entry.startsWith('/') || /^[A-Za-z]:/.test(entry)) {
      throw new Error(`Unsafe ZIP entry: ${JSON.stringify(entry)}.`);
    }
    const parts = entry.split('/').filter(Boolean);
    if (parts.some((part) => part === '.' || part === '..')) throw new Error(`Unsafe ZIP path: ${entry}.`);
    const key = entry.normalize('NFC');
    if (normalized.has(key)) throw new Error(`Duplicate ZIP entry: ${entry}.`);
    normalized.add(key);
    if (parts[0] !== bundleRoot) throw new Error(`Unexpected ZIP root: ${entry}.`);
  }
  const listing = unzip(['-Z', '-l', archive]);
  if (listing.split(/\r?\n/).some((line) => /^l[rwx-]{9}\s/.test(line))) {
    throw new Error('The castle archive contains a symbolic link.');
  }
  if (!normalized.has(sourceMember)) throw new Error(`Missing ZIP member: ${sourceMember}.`);
}

function runGltfpack(args, encoding = 'utf8') {
  const result = spawnSync(gltfpackBinary, args, {
    cwd: workspace,
    env: assetToolEnvironment,
    encoding,
    stdio: encoding === null ? ['ignore', 'inherit', 'inherit'] : undefined
  });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`gltfpack exited with ${result.status}.`);
  return result.stdout;
}

function readGlbStatistics(path) {
  const bytes = readFileSync(path);
  if (bytes.subarray(0, 4).toString('ascii') !== 'glTF' || bytes.readUInt32LE(4) !== 2) {
    throw new Error(`${path} is not a glTF 2.0 binary.`);
  }
  if (bytes.readUInt32LE(8) !== bytes.byteLength) {
    throw new Error(`${path} has a mismatched declared GLB length.`);
  }
  const jsonLength = bytes.readUInt32LE(12);
  const json = JSON.parse(bytes.subarray(20, 20 + jsonLength).toString('utf8').trim());
  const primitive = json.meshes?.[0]?.primitives?.[0];
  const indexAccessor = json.accessors?.[primitive?.indices];
  const positionAccessor = json.accessors?.[primitive?.attributes?.POSITION];
  return {
    triangles: (indexAccessor?.count ?? 0) / 3,
    vertices: positionAccessor?.count ?? 0,
    indexComponentType: indexAccessor?.componentType,
    images: json.images?.length ?? 0,
    atlasSize: json.materials?.[0]?.extras?.wk_atlas_size,
    extensionsRequired: json.extensionsRequired ?? []
  };
}

function assertImageRecords(actual, expected, label, targetSize) {
  if (actual.length !== expected.length) {
    throw new Error(`${label} image count changed: ${actual.length}.`);
  }
  actual.forEach((image, index) => {
    const exact = expected[index];
    if (
      (exact.name !== undefined && image.name !== exact.name)
      || (exact.role !== undefined && image.role !== exact.role)
      || image.bytes !== exact.bytes
      || image.sha256 !== exact.sha256
      || image.width !== (exact.width ?? targetSize)
      || image.height !== (exact.height ?? targetSize)
    ) {
      throw new Error(`${label} image ${index} changed: ${JSON.stringify(image)}.`);
    }
  });
}

function assertGeometryPayloads(actual, label) {
  if (actual.length !== sourceGeometryPayloads.length) {
    throw new Error(`${label} physical geometry payload count changed: ${actual.length}.`);
  }
  actual.forEach((payload, index) => {
    const expected = sourceGeometryPayloads[index];
    if (payload.bytes !== expected.bytes || payload.sha256 !== expected.sha256) {
      throw new Error(`${label} physical geometry payload ${index} changed.`);
    }
  });
}

try {
  assertExactOrdinaryFile(
    archive,
    release.bytes,
    `Verified historical castle archive (run "npm run assets:fetch:castle:source-0.3.4" or set WARPKEEP_CASTLE_ARCHIVE to an exact offline copy)`
  );
  assertExactOrdinaryFile(
    gltfpackBinary,
    gltfpackSpec.binaryBytes,
    `Pinned native gltfpack ${GLTFPACK_VERSION} (run "npm run tools:fetch:gltfpack" first)`
  );
  const toolBytes = readFileSync(gltfpackBinary);
  assertExact(toolBytes, {
    bytes: gltfpackSpec.binaryBytes,
    sha256: gltfpackSpec.binarySha256
  }, `gltfpack ${GLTFPACK_VERSION} ${gltfpackSpec.key}`);
  const version = String(runGltfpack(['-v'])).trim();
  if (version !== `gltfpack ${GLTFPACK_VERSION}`) {
    throw new Error(`Unexpected gltfpack version: ${JSON.stringify(version)}.`);
  }
  const archiveBytes = readFileSync(archive);
  assertExact(archiveBytes, release, `${release.tag}/${release.attachment}`);
  const entries = unzip(['-Z1', archive]).split(/\r?\n/).filter(Boolean);
  assertSafeArchive(entries);
  const sourceBytes = unzip(['-p', archive, sourceMember], null);
  assertExact(sourceBytes, sourceRecord, sourceMember);
  const source = resolve(workspace, 'HegemonyMainCastle.glb');
  writeFileSync(source, sourceBytes, { mode: 0o600 });

  const prepared = [];
  for (const profile of profiles) {
    const rewritten = await rewriteEmbeddedWebpGlb(sourceBytes, {
      targetSize: profile.textureSize,
      label: `${profile.id} pre-simplification atlas rewrite`
    });
    assertImageRecords(rewritten.originalImages, sourceImages, 'source', 2_048);
    assertGeometryPayloads(rewritten.preservedRanges, profile.id);
    assertImageRecords(
      rewritten.images,
      profile.expectedImages,
      `${profile.id} pre-simplification`,
      profile.textureSize
    );
    if (
      rewritten.toolchain.sharp !== SHARP_TOOLCHAIN.sharp
      || rewritten.toolchain.vips !== SHARP_TOOLCHAIN.vips
      || rewritten.toolchain.webp !== SHARP_TOOLCHAIN.webp
    ) {
      throw new Error(`${profile.id} Sharp toolchain identity changed.`);
    }
    const rewrittenSource = resolve(workspace, `hegemony-main-castle-${profile.id}-atlases.glb`);
    writeFileSync(rewrittenSource, rewritten.bytes, { mode: 0o600 });
    const output = resolve(workspace, `hegemony-main-castle-${profile.id}.glb`);
    runGltfpack([
      '-i', rewrittenSource,
      '-o', output,
      '-cc',
      '-si', profile.ratio,
      '-se', profile.error,
      '-sp',
      '-vp', '14',
      '-vn', '10',
      '-vt', '12',
      '-kn',
      '-ke'
    ]);
    const bytes = readFileSync(output);
    const hash = assertExact(bytes, {
      bytes: profile.expectedBytes,
      sha256: profile.expectedSha256
    }, `${profile.id} output`);
    const statistics = readGlbStatistics(output);
    if (
      statistics.triangles !== profile.expectedTriangles
      || statistics.vertices !== profile.expectedVertices
      || statistics.indexComponentType !== profile.expectedIndexComponentType
      || statistics.images !== 2
      || statistics.atlasSize !== profile.textureSize
    ) {
      throw new Error(`${profile.id} output statistics changed: ${JSON.stringify(statistics)}`);
    }
    for (const extension of [
      'EXT_meshopt_compression',
      'EXT_texture_webp',
      'KHR_mesh_quantization'
    ]) {
      if (!statistics.extensionsRequired.includes(extension)) {
        throw new Error(`${profile.id} output no longer requires ${extension}.`);
      }
    }
    const outputImages = (await inspectEmbeddedWebpGlb(bytes, {
      label: `${profile.id} prepared output`
    })).images;
    assertImageRecords(outputImages, profile.expectedImages, profile.id, profile.textureSize);
    prepared.push({
      ...profile,
      output,
      byteLength: bytes.byteLength,
      preparedBytes: bytes,
      hash
    });
  }

  const outputDirectory = ensureContainedDirectory({
    root,
    relativePath: outputRelativeDirectory,
    label: 'Historical Alpha 0.3.4 output directory'
  });
  installAtomicFileFamily({
    destinationRoot: outputDirectory,
    entries: prepared.map((profile) => ({
      bytes: profile.preparedBytes,
      label: `${profile.id} historical Alpha 0.3.4 output`,
      relativePath: `hegemony-main-castle-${profile.id}.glb`
    }))
  });
  prepared.forEach((profile) => {
    console.log(
      `${profile.id}: ${profile.byteLength} bytes, ${profile.expectedTriangles} triangles, sha256 ${profile.hash}`
    );
  });
} finally {
  rmSync(workspace, { recursive: true, force: true });
}
