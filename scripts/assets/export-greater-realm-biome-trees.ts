/** Reproducible GLB archive for the code-native Greater Realm biome trees. */
import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

import {
  BIOME_TREE_NAMES,
  createBiomeTreeGeometry,
  type BiomeTreeDetail
} from '../../src/greater-realm/biomeTreeGeometry';

const OUTPUT = path.resolve(process.argv[2] ?? 'artifacts/biome-trees');
const DETAILS: readonly BiomeTreeDetail[] = ['high', 'balanced', 'reduced'];

function padded(length: number): number { return (length + 3) & ~3; }

function glb(name: string, positions: Float32Array, normals: Float32Array, colors: Float32Array): Buffer {
  const data = [positions, normals, colors];
  const views: { buffer: number; byteOffset: number; byteLength: number; target: number }[] = [];
  let offset = 0;
  const payloads = data.map((attribute) => {
    const bytes = Buffer.from(attribute.buffer, attribute.byteOffset, attribute.byteLength);
    views.push({ buffer: 0, byteOffset: offset, byteLength: bytes.length, target: 34962 });
    offset += padded(bytes.length);
    return bytes;
  });
  const binary = Buffer.alloc(offset);
  let cursor = 0;
  payloads.forEach((bytes) => {
    bytes.copy(binary, cursor);
    cursor += padded(bytes.length);
  });
  const vertexCount = positions.length / 3;
  const minimum = [Infinity, Infinity, Infinity];
  const maximum = [-Infinity, -Infinity, -Infinity];
  for (let index = 0; index < positions.length; index += 3) {
    for (let axis = 0; axis < 3; axis += 1) {
      minimum[axis] = Math.min(minimum[axis]!, positions[index + axis]!);
      maximum[axis] = Math.max(maximum[axis]!, positions[index + axis]!);
    }
  }
  const accessors = data.map((attribute, index) => ({
    bufferView: index,
    componentType: 5126,
    count: attribute.length / 3,
    type: 'VEC3',
    ...(index === 0 ? { min: minimum, max: maximum } : {})
  }));
  const document = {
    asset: { version: '2.0', generator: 'Warpkeep biome-tree exporter 1' },
    scene: 0,
    scenes: [{ nodes: [0] }],
    nodes: [{ mesh: 0, name }],
    meshes: [{ name, primitives: [{
      attributes: { POSITION: 0, NORMAL: 1, COLOR_0: 2 },
      material: 0, mode: 4
    }] }],
    materials: [{ name: 'Faceted vertex color', doubleSided: true,
      pbrMetallicRoughness: { baseColorFactor: [1, 1, 1, 1], metallicFactor: 0, roughnessFactor: 0.88 } }],
    accessors,
    bufferViews: views,
    buffers: [{ byteLength: binary.length }]
  };
  const json = Buffer.from(JSON.stringify(document));
  const jsonLength = padded(json.length);
  const totalLength = 12 + 8 + jsonLength + 8 + binary.length;
  const result = Buffer.alloc(totalLength);
  result.writeUInt32LE(0x46546c67, 0);
  result.writeUInt32LE(2, 4);
  result.writeUInt32LE(totalLength, 8);
  result.writeUInt32LE(jsonLength, 12);
  result.writeUInt32LE(0x4e4f534a, 16);
  json.copy(result, 20);
  result.fill(0x20, 20 + json.length, 20 + jsonLength);
  const binHeader = 20 + jsonLength;
  result.writeUInt32LE(binary.length, binHeader);
  result.writeUInt32LE(0x004e4942, binHeader + 4);
  binary.copy(result, binHeader + 8);
  if (vertexCount % 3 !== 0) throw new Error(`${name}: incomplete triangle primitive`);
  return result;
}

await mkdir(OUTPUT, { recursive: true });
const models = [];
for (const [idText, label] of Object.entries(BIOME_TREE_NAMES)) {
  const biomeClass = Number(idText);
  for (const detail of DETAILS) {
    const geometry = createBiomeTreeGeometry(biomeClass, detail);
    const positions = geometry.getAttribute('position').array as Float32Array;
    const normals = geometry.getAttribute('normal').array as Float32Array;
    const colors = geometry.getAttribute('color').array as Float32Array;
    const slug = label.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/-$/g, '');
    const name = `warpkeep-biome-${String(biomeClass).padStart(2, '0')}-${slug}-${detail}`;
    const bytes = glb(name, positions, normals, colors);
    const sha256 = createHash('sha256').update(bytes).digest('hex');
    const file = `${name}-${sha256.slice(0, 16)}.glb`;
    await writeFile(path.join(OUTPUT, file), bytes);
    geometry.computeBoundingBox();
    const box = geometry.boundingBox!;
    models.push({ biomeClass, biome: slug, label, detail, file, bytes: bytes.length,
      sha256, triangles: positions.length / 9, vertices: positions.length / 3,
      bounds: { min: box.min.toArray(), max: box.max.toArray() } });
    geometry.dispose();
  }
}
const manifest = {
  family: 'warpkeep-greater-realm-biome-trees-2026-09-28',
  coordinateSystem: '+Y up, trunk-root pivot at origin',
  source: 'Warpkeep src/greater-realm/biomeTreeGeometry.ts',
  license: 'CC-BY-4.0',
  provenance: 'Original procedural mesh recipes. No BlendSwap mesh, node data, or texture imported.',
  models
};
await writeFile(path.join(OUTPUT, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
process.stdout.write(`Wrote ${models.length} GLBs and manifest to ${OUTPUT}\n`);
