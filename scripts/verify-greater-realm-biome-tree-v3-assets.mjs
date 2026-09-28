import { createHash } from 'node:crypto';
import { readFile, readdir, stat } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ASSET_DIR = path.join(ROOT, 'public/models/greater-realm/biome-trees/v3');
const MANIFEST_PATH = path.join(ASSET_DIR, 'manifest.json');
const CATALOG_PATH = path.join(ROOT, 'src/greater-realm/biomeTreeV3Catalog.ts');
const EXPECTED_TAG = 'greater-realm-lush-biome-trees-2026-09-28-v3';
const EXPECTED_ARCHIVE_SHA256 = '039d2fb736b4a58857b84ba11c321208e1a9e8ca54eb1922d6684237144f547e';
const EXPECTED_BIOMES = [...Array.from({ length: 19 }, (_, index) => index + 1), 23];
const DIST = process.argv.includes('--production-dist')
  ? path.join(ROOT, 'dist/models/greater-realm/biome-trees/v3')
  : null;

function fail(message) {
  throw new Error(`GREATER_REALM_BIOME_TREE_V3_ASSETS_INVALID: ${message}`);
}

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

function parseGlb(bytes, label) {
  if (bytes.length < 20 || bytes.readUInt32LE(0) !== 0x46546c67
      || bytes.readUInt32LE(4) !== 2 || bytes.readUInt32LE(8) !== bytes.length) {
    fail(`${label} has an invalid GLB header`);
  }
  const jsonLength = bytes.readUInt32LE(12);
  if (bytes.readUInt32LE(16) !== 0x4e4f534a || 20 + jsonLength + 8 > bytes.length) {
    fail(`${label} has an invalid GLB JSON chunk`);
  }
  let document;
  try {
    document = JSON.parse(bytes.subarray(20, 20 + jsonLength).toString('utf8').trimEnd());
  } catch {
    fail(`${label} has malformed GLB JSON`);
  }
  const binaryHeader = 20 + jsonLength;
  const binaryLength = bytes.readUInt32LE(binaryHeader);
  if (bytes.readUInt32LE(binaryHeader + 4) !== 0x004e4942
      || binaryHeader + 8 + binaryLength !== bytes.length) {
    fail(`${label} has an invalid GLB binary chunk`);
  }
  return document;
}

async function verify(directory, label) {
  const manifest = JSON.parse(await readFile(path.join(directory, 'manifest.json'), 'utf8'));
  if (manifest.schema !== 'warpkeep-greater-realm-biome-trees.runtime.v1'
      || manifest.sourceRelease?.tag !== EXPECTED_TAG
      || manifest.sourceRelease?.archiveSha256 !== EXPECTED_ARCHIVE_SHA256) {
    fail(`${label} manifest does not pin the approved v3 source release`);
  }
  if (!Array.isArray(manifest.models) || manifest.models.length !== 40) {
    fail(`${label} manifest must contain exactly 40 near/mobile models`);
  }
  const names = await readdir(directory);
  const glbNames = names.filter((name) => name.endsWith('.glb')).sort();
  const rows = [...manifest.models].sort((a, b) => a.path.localeCompare(b.path));
  const paths = new Set();
  const pairs = new Map();
  for (const row of rows) {
    if (!Number.isInteger(row.biomeClass) || !EXPECTED_BIOMES.includes(row.biomeClass)
        || !['near', 'mobile'].includes(row.variant)
        || !/^\/models\/greater-realm\/biome-trees\/v3\/[a-z0-9-]+-(near|mobile)\.glb$/.test(row.path)) {
      fail(`${label} has an invalid model identity or path`);
    }
    const filename = path.basename(row.path);
    if (paths.has(filename)) fail(`${label} duplicates ${filename}`);
    paths.add(filename);
    const modelPath = path.join(directory, filename);
    const info = await stat(modelPath);
    if (!info.isFile() || info.size !== row.bytes) fail(`${label} byte length mismatch for ${filename}`);
    const bytes = await readFile(modelPath);
    if (sha256(bytes) !== row.sha256) fail(`${label} SHA-256 mismatch for ${filename}`);
    const gltf = parseGlb(bytes, filename);
    const primitive = gltf.meshes?.[0]?.primitives?.[0];
    if (gltf.meshes?.length !== 1 || gltf.meshes[0].primitives?.length !== 1
        || gltf.materials?.length !== 1 || gltf.images?.length !== 1
        || gltf.textures?.length !== 1 || primitive?.mode !== 4
        || primitive.material !== 0 || !primitive.indices
        || primitive.attributes?.POSITION === undefined
        || primitive.attributes?.TEXCOORD_0 === undefined
        || gltf.materials[0].alphaMode !== 'MASK'
        || gltf.asset?.extras?.sourceRelease !== EXPECTED_TAG
        || gltf.asset?.extras?.sourceSha256 !== row.sourceSha256) {
      fail(`${label} model structure/source lineage is invalid for ${filename}`);
    }
    const indices = gltf.accessors?.[primitive.indices];
    if (!indices || indices.count / 3 !== row.triangles) {
      fail(`${label} triangle count mismatch for ${filename}`);
    }
    const geometryBytes = gltf.bufferViews
      .filter((view) => view.target === 34962 || view.target === 34963)
      .reduce((total, view) => total + view.byteLength, 0);
    if (geometryBytes !== row.geometryBytes) fail(`${label} geometry byte count mismatch for ${filename}`);
    const key = `${row.biomeClass}:${row.variant}`;
    if (pairs.has(key)) fail(`${label} repeats ${key}`);
    pairs.set(key, row);
  }
  if (glbNames.length !== 40 || glbNames.some((name) => !paths.has(name))) {
    fail(`${label} GLB files do not match its manifest exactly`);
  }
  for (const biomeClass of EXPECTED_BIOMES) {
    if (!pairs.has(`${biomeClass}:near`) || !pairs.has(`${biomeClass}:mobile`)) {
      fail(`${label} is missing the near/mobile pair for biome ${biomeClass}`);
    }
  }
  return manifest;
}

const sourceCatalog = await readFile(CATALOG_PATH, 'utf8');
if (!sourceCatalog.includes(EXPECTED_TAG) || !sourceCatalog.includes(EXPECTED_ARCHIVE_SHA256)) {
  fail('generated TypeScript catalog does not pin the source release');
}
const manifest = await verify(ASSET_DIR, 'public source');
if (DIST) await verify(DIST, 'production dist');
process.stdout.write(
  `Greater Realm v3 trees verified: ${manifest.models.length} runtime GLBs, `
  + `${manifest.models.reduce((total, row) => total + row.bytes, 0).toLocaleString()} bytes.\n`
);
