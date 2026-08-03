import { createHash } from 'node:crypto';
import { resolve } from 'node:path';

import {
  ensureContainedDirectory,
  installAtomicFileFamily,
  readContainedRegularFile
} from './atomic-install-file-family.mjs';

const root = resolve(import.meta.dirname, '..');
const suppliedRoot = process.env.WARPKEEP_RABBIT_RUNTIME_ROOT
  ? resolve(process.env.WARPKEEP_RABBIT_RUNTIME_ROOT)
  : undefined;
const sourceFilename = 'Warpkeep_Rabbit_LOD2_Compact_Static_Runtime.glb';
const destinationFilename =
  'hegemony-lowlands-rabbit-compact-2ecc7b1adf4c1d79.glb';
const expectedBytes = 14_808;
const expectedHash =
  '2ecc7b1adf4c1d79b7ca2d5ea9a6727ed3f6d9072047466082bb912d34ea930c';

if (!suppliedRoot) {
  throw new Error(
    'Set WARPKEEP_RABBIT_RUNTIME_ROOT to the exact Rabbit Runtime/Environment/Wildlife/Rabbit directory.'
  );
}

const bytes = readContainedRegularFile({
  root: suppliedRoot,
  relativePath: sourceFilename,
  label: 'Lowlands Rabbit compact supplied runtime',
  expectedBytes
});
const hash = createHash('sha256').update(bytes).digest('hex');
if (hash !== expectedHash) {
  throw new Error('Lowlands Rabbit compact supplied runtime hash changed: ' + hash + '.');
}
const jsonLength = bytes.readUInt32LE(12);
const json = JSON.parse(bytes.subarray(20, 20 + jsonLength).toString('utf8').trim());
const primitive = json.meshes?.[0]?.primitives?.[0];
if (
  bytes.subarray(0, 4).toString('ascii') !== 'glTF'
  || bytes.readUInt32LE(4) !== 2
  || bytes.readUInt32LE(8) !== bytes.byteLength
  || json.asset?.copyright !== 'Copyright Ael / Warpkeep; project-authored rabbit runtime asset'
  || json.scenes?.length !== 1
  || json.scenes[0]?.name !== 'WK_Rabbit_AuthoringScene'
  || json.nodes?.length !== 1
  || json.nodes[0]?.name !== 'WK_Rabbit_LOD2_Compact_Static'
  || json.meshes?.length !== 1
  || json.meshes[0]?.name !== 'WK_Rabbit_LOD2_Compact_Static_Mesh'
  || json.meshes[0]?.primitives?.length !== 1
  || primitive?.indices !== 3
  || primitive?.material !== 0
  || primitive?.attributes?.POSITION !== 0
  || primitive?.attributes?.NORMAL !== 1
  || primitive?.attributes?.COLOR_0 !== 2
  || json.accessors?.[0]?.count !== 384
  || json.accessors?.[3]?.count !== 438
  || json.materials?.length !== 1
  || json.animations !== undefined
  || json.skins !== undefined
) {
  throw new Error('Lowlands Rabbit compact supplied runtime structure changed.');
}

const destinationRoot = ensureContainedDirectory({
  root,
  relativePath: 'public/models/hegemony/environment/wildlife/rabbit',
  label: 'Lowlands Rabbit runtime directory'
});
installAtomicFileFamily({
  destinationRoot,
  entries: [{
    bytes,
    label: 'Lowlands Rabbit compact runtime',
    relativePath: destinationFilename
  }]
});
console.log(
  'Lowlands Rabbit compact: 14,808 bytes, 146 triangles, sha256 ' + expectedHash
);
