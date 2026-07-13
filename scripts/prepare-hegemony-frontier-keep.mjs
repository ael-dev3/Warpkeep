import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  copyFileSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  statSync
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const source = process.env.WARPKEEP_KEEP_SOURCE
  ? resolve(process.env.WARPKEEP_KEEP_SOURCE)
  : join(
    root,
    '.cache/warpkeep-assets/unresolved/hegemony-frontier-keep',
    'Meshy_AI_Hegemony_Frontier_Kee_0711104905_image-to-3d-texture.glb'
  );
const outputDirectory = join(root, 'public/models/hegemony');
const workspace = mkdtempSync(join(tmpdir(), 'warpkeep-keep-'));
const usesPnpm = process.env.npm_config_user_agent?.startsWith('pnpm/') ?? false;
const packageRunner = process.platform === 'win32'
  ? (usesPnpm ? 'pnpm.cmd' : 'npx.cmd')
  : (usesPnpm ? 'pnpm' : 'npx');
const cli = usesPnpm
  ? ['dlx', '@gltf-transform/cli@4.4.1']
  : ['--yes', '@gltf-transform/cli@4.4.1'];
const expectedSource = {
  bytes: 63_263_296,
  sha256: 'fd31cd99ce2c81a3bb149915954ee72009f1db0ebb8a9e972747e21294d5986d'
};

const profiles = [
  {
    id: 'high',
    ratio: '0.06',
    error: '0.008',
    textureSize: '2048',
    expectedBytes: 2_256_092,
    expectedTriangles: 56_466,
    expectedVertices: 55_704,
    expectedSha256: 'ed2593a2e427c496c2eaa582f56c20290816d272c5d5b8800cdf554ecc8a296c'
  },
  {
    id: 'balanced',
    ratio: '0.04',
    error: '0.012',
    textureSize: '2048',
    expectedBytes: 2_064_100,
    expectedTriangles: 37_634,
    expectedVertices: 40_632,
    expectedSha256: 'bb47fabe11982b7eb99a9cb6a3df2a23427502417fad58edd969e51bcff061c4'
  },
  {
    id: 'compact',
    ratio: '0.018',
    error: '0.018',
    textureSize: '1024',
    expectedBytes: 760_916,
    expectedTriangles: 17_536,
    expectedVertices: 24_766,
    expectedSha256: '9de356095b314c3d43fee072c31115bb265699913991ac6aa3f656a2b8bde33b'
  }
];

function run(args) {
  const result = spawnSync(packageRunner, [...cli, ...args], {
    cwd: root,
    encoding: 'utf8',
    stdio: 'inherit'
  });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`glTF-Transform exited with ${result.status}.`);
}

function sha256(path) {
  return createHash('sha256').update(readFileSync(path)).digest('hex');
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
    images: json.images?.length ?? 0,
    extensionsRequired: json.extensionsRequired ?? []
  };
}

function assertExactFile(path, expected, label) {
  const bytes = statSync(path).size;
  const hash = sha256(path);
  if (bytes !== expected.bytes) {
    throw new Error(`${label} byte length changed: ${bytes}`);
  }
  if (hash !== expected.sha256) {
    throw new Error(`${label} hash changed: ${hash}`);
  }
  return { bytes, hash };
}

try {
  if (!statSync(source, { throwIfNoEntry: false })) {
    throw new Error(
      `Missing offline keep source at ${source}. Its redistribution rights are unresolved, so Warpkeep does not download it automatically. Set WARPKEEP_KEEP_SOURCE to an authorized exact copy.`
    );
  }
  assertExactFile(source, expectedSource, 'source archive');
  const prepared = profiles.map((profile) => {
    const optimized = join(workspace, `${profile.id}-optimized.glb`);
    const tangent = join(workspace, `${profile.id}-tangent.glb`);
    const output = join(workspace, `hegemony-frontier-keep-${profile.id}.glb`);

    run([
      'optimize', source, optimized,
      '--compress', 'false',
      '--simplify-ratio', profile.ratio,
      '--simplify-error', profile.error,
      '--texture-compress', 'webp',
      '--texture-size', profile.textureSize,
      '--flatten', 'true',
      '--join', 'true',
      '--weld', 'true',
      '--prune', 'true'
    ]);
    run(['tangents', optimized, tangent]);
    run([
      'meshopt', tangent, output,
      '--level', 'high',
      '--quantize-position', '14',
      '--quantize-normal', '10',
      '--quantize-texcoord', '12'
    ]);
    run(['validate', output]);

    const { bytes, hash } = assertExactFile(output, {
      bytes: profile.expectedBytes,
      sha256: profile.expectedSha256
    }, `${profile.id} output`);
    const statistics = readGlbStatistics(output);
    if (
      statistics.triangles !== profile.expectedTriangles
      || statistics.vertices !== profile.expectedVertices
      || statistics.images !== 4
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
    return { ...profile, output, bytes, hash };
  });

  mkdirSync(outputDirectory, { recursive: true });
  prepared.forEach((profile) => {
    const destination = join(outputDirectory, `hegemony-frontier-keep-${profile.id}.glb`);
    copyFileSync(profile.output, destination);
    console.log(
      `${profile.id}: ${profile.bytes} bytes, ${profile.expectedTriangles} triangles, sha256 ${profile.hash}`
    );
  });
} finally {
  rmSync(workspace, { recursive: true, force: true });
}
