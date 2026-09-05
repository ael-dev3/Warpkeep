export type VoxelCell = Readonly<{ x: number; y: number; z: number; material: number }>;

export type VoxelSurfaceInput = Readonly<{
  voxels: readonly VoxelCell[];
  occluders?: readonly VoxelCell[];
  maximumVoxels: number;
  maximumFaces: number;
}>;

export type VoxelSurfaceQuad = Readonly<{
  direction: 0 | 1 | 2 | 3 | 4 | 5;
  plane: number;
  u: number;
  v: number;
  width: number;
  height: number;
  material: number;
}>;

export type VoxelSurfacePlan = Readonly<{
  quads: readonly VoxelSurfaceQuad[];
  occupiedVoxelCount: number;
  contextVoxelCount: number;
  exposedFaceCount: number;
  mergedQuadCount: number;
  triangleCount: number;
  uploadBytes: number;
  signature: string;
}>;

export type VoxelSurfaceMeshData = Readonly<{
  positions: Float32Array;
  normals: Int8Array;
  colors: Uint8Array;
  indices: Uint32Array;
  occupiedVoxelCount: number;
  exposedFaceCount: number;
  mergedQuadCount: number;
  triangleCount: number;
  uploadBytes: number;
  signature: string;
}>;

const VOXEL_MESHER_VERSION = 'voxel-surface-v1';
const BYTES_PER_QUAD = 96;
const DIRECTIONS = Object.freeze([
  Object.freeze({ x: 1, y: 0, z: 0 }),
  Object.freeze({ x: -1, y: 0, z: 0 }),
  Object.freeze({ x: 0, y: 1, z: 0 }),
  Object.freeze({ x: 0, y: -1, z: 0 }),
  Object.freeze({ x: 0, y: 0, z: 1 }),
  Object.freeze({ x: 0, y: 0, z: -1 })
] as const);

function boundedNonnegativeInteger(value: number, name: string) {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new RangeError(`${name} must be a nonnegative safe integer.`);
  }
  return value;
}

function voxelKey(cell: Pick<VoxelCell, 'x' | 'y' | 'z'>) {
  return `${cell.x},${cell.y},${cell.z}`;
}

function validatedVoxel(cell: VoxelCell, setName: string, index: number): VoxelCell {
  if (
    !Number.isSafeInteger(cell.x)
    || !Number.isSafeInteger(cell.y)
    || !Number.isSafeInteger(cell.z)
    || !Number.isSafeInteger(cell.material)
    || cell.material < 0
    || cell.material > 255
  ) {
    throw new RangeError(`${setName} voxel ${index} must use safe integer coordinates and a uint8 material.`);
  }
  return Object.freeze({ x: cell.x, y: cell.y, z: cell.z, material: cell.material });
}

/** Stable bounded palette used by every renderer adapter. */
export function voxelMaterialColor(material: number): readonly [number, number, number] {
  if (!Number.isSafeInteger(material) || material < 0 || material > 255) {
    throw new RangeError('Voxel material must be a uint8 value.');
  }
  // The low semantic ids are hand-balanced for terrain and prefabs. Remaining
  // ids retain deterministic, bounded colors for neutral callers.
  const semantic: readonly (readonly [number, number, number])[] = [
    [116, 143, 82], [91, 111, 69], [119, 105, 82], [95, 117, 128],
    [180, 151, 91], [77, 111, 103], [171, 101, 67], [218, 196, 130],
    [111, 104, 97], [151, 145, 132], [91, 65, 45], [201, 164, 73],
    [102, 78, 117], [173, 196, 203], [63, 79, 87], [225, 210, 161]
  ];
  const fixed = semantic[material];
  if (fixed !== undefined) return fixed;
  return Object.freeze([
    48 + (Math.imul(material, 73) & 159),
    48 + (Math.imul(material, 151) & 159),
    48 + (Math.imul(material, 199) & 159)
  ] as const);
}

function sortedCells(cells: Iterable<VoxelCell>) {
  return [...cells].sort((left, right) => (
    left.x - right.x
    || left.y - right.y
    || left.z - right.z
    || left.material - right.material
  ));
}

function signatureFor(emitters: readonly VoxelCell[], context: readonly VoxelCell[]) {
  let hash = 0xcbf29ce484222325n;
  const consume = (value: string) => {
    for (let index = 0; index < value.length; index += 1) {
      hash ^= BigInt(value.charCodeAt(index));
      hash = BigInt.asUintN(64, hash * 0x100000001b3n);
    }
  };
  consume(`${VOXEL_MESHER_VERSION}|e|`);
  emitters.forEach((cell) => consume(`${cell.x},${cell.y},${cell.z},${cell.material};`));
  consume('|c|');
  context.forEach((cell) => consume(`${cell.x},${cell.y},${cell.z},${cell.material};`));
  return `${VOXEL_MESHER_VERSION}:${hash.toString(16).padStart(16, '0')}`;
}

function faceCoordinates(cell: VoxelCell, direction: number) {
  if (direction <= 1) {
    return { plane: cell.x + (direction === 0 ? 1 : 0), u: cell.z, v: cell.y };
  }
  if (direction <= 3) {
    return { plane: cell.y + (direction === 2 ? 1 : 0), u: cell.x, v: cell.z };
  }
  return { plane: cell.z + (direction === 4 ? 1 : 0), u: cell.x, v: cell.y };
}

function mergeBucket(
  direction: VoxelSurfaceQuad['direction'],
  plane: number,
  material: number,
  cells: ReadonlySet<string>
) {
  const remaining = new Set(cells);
  const ordered = [...remaining].map((entry) => entry.split(',').map(Number) as [number, number])
    .sort((left, right) => left[1] - right[1] || left[0] - right[0]);
  const quads: VoxelSurfaceQuad[] = [];
  for (const [u, v] of ordered) {
    if (!remaining.has(`${u},${v}`)) continue;
    let width = 1;
    while (remaining.has(`${u + width},${v}`)) width += 1;
    let height = 1;
    heightLoop: while (true) {
      for (let offset = 0; offset < width; offset += 1) {
        if (!remaining.has(`${u + offset},${v + height}`)) break heightLoop;
      }
      height += 1;
    }
    for (let dv = 0; dv < height; dv += 1) {
      for (let du = 0; du < width; du += 1) remaining.delete(`${u + du},${v + dv}`);
    }
    quads.push(Object.freeze({ direction, plane, u, v, width, height, material }));
  }
  return quads;
}

export function planVoxelSurface(input: VoxelSurfaceInput): VoxelSurfacePlan {
  const maximumVoxels = boundedNonnegativeInteger(input.maximumVoxels, 'maximumVoxels');
  const maximumFaces = boundedNonnegativeInteger(input.maximumFaces, 'maximumFaces');
  const emitterMap = new Map<string, VoxelCell>();
  const contextMap = new Map<string, VoxelCell>();
  const occupancy = new Map<string, VoxelCell>();

  const insert = (source: readonly VoxelCell[], target: Map<string, VoxelCell>, name: string) => {
    source.forEach((candidate, index) => {
      const cell = validatedVoxel(candidate, name, index);
      voxelMaterialColor(cell.material);
      const key = voxelKey(cell);
      if (target.has(key)) throw new Error(`Duplicate ${name} voxel at ${key}.`);
      target.set(key, cell);
      const existing = occupancy.get(key);
      if (existing !== undefined && existing.material !== cell.material) {
        throw new Error(`Voxel ${key} has conflicting material across emitting and occlusion occupancy.`);
      }
      if (existing === undefined) {
        if (occupancy.size >= maximumVoxels) {
          throw new RangeError(`Voxel occupancy exceeds maximumVoxels (${maximumVoxels}).`);
        }
        occupancy.set(key, cell);
      }
    });
  };
  insert(input.voxels, emitterMap, 'emitting');
  insert(input.occluders ?? [], contextMap, 'occluder');

  const buckets = new Map<string, {
    direction: VoxelSurfaceQuad['direction'];
    plane: number;
    material: number;
    cells: Set<string>;
  }>();
  let exposedFaceCount = 0;
  for (const cell of sortedCells(emitterMap.values())) {
    for (let rawDirection = 0; rawDirection < DIRECTIONS.length; rawDirection += 1) {
      const direction = rawDirection as VoxelSurfaceQuad['direction'];
      const delta = DIRECTIONS[direction];
      if (occupancy.has(`${cell.x + delta.x},${cell.y + delta.y},${cell.z + delta.z}`)) continue;
      exposedFaceCount += 1;
      if (exposedFaceCount > maximumFaces) {
        throw new RangeError(`Exposed voxel faces exceed maximumFaces (${maximumFaces}).`);
      }
      const face = faceCoordinates(cell, direction);
      const bucketKey = `${direction}|${face.plane}|${cell.material}`;
      let bucket = buckets.get(bucketKey);
      if (bucket === undefined) {
        bucket = { direction, plane: face.plane, material: cell.material, cells: new Set() };
        buckets.set(bucketKey, bucket);
      }
      bucket.cells.add(`${face.u},${face.v}`);
    }
  }

  const quads = [...buckets.values()]
    .sort((left, right) => (
      left.direction - right.direction
      || left.plane - right.plane
      || left.material - right.material
    ))
    .flatMap((bucket) => mergeBucket(
      bucket.direction, bucket.plane, bucket.material, bucket.cells
    ));
  const frozenQuads = Object.freeze(quads);
  const emitters = sortedCells(emitterMap.values());
  const context = sortedCells(contextMap.values());
  return Object.freeze({
    quads: frozenQuads,
    occupiedVoxelCount: emitterMap.size,
    contextVoxelCount: contextMap.size,
    exposedFaceCount,
    mergedQuadCount: frozenQuads.length,
    triangleCount: frozenQuads.length * 2,
    uploadBytes: frozenQuads.length * BYTES_PER_QUAD,
    signature: signatureFor(emitters, context)
  });
}

function quadVertices(quad: VoxelSurfaceQuad): readonly (readonly [number, number, number])[] {
  const { direction, plane, u, v, width, height } = quad;
  if (direction === 0) return [[plane, v, u], [plane, v + height, u], [plane, v + height, u + width], [plane, v, u + width]];
  if (direction === 1) return [[plane, v, u], [plane, v, u + width], [plane, v + height, u + width], [plane, v + height, u]];
  if (direction === 2) return [[u, plane, v], [u, plane, v + height], [u + width, plane, v + height], [u + width, plane, v]];
  if (direction === 3) return [[u, plane, v], [u + width, plane, v], [u + width, plane, v + height], [u, plane, v + height]];
  if (direction === 4) return [[u, v, plane], [u + width, v, plane], [u + width, v + height, plane], [u, v + height, plane]];
  return [[u, v, plane], [u, v + height, plane], [u + width, v + height, plane], [u + width, v, plane]];
}

export function createVoxelSurfaceMeshData(plan: VoxelSurfacePlan): VoxelSurfaceMeshData {
  const vertexCount = plan.mergedQuadCount * 4;
  const positions = new Float32Array(vertexCount * 3);
  const normals = new Int8Array(vertexCount * 3);
  const colors = new Uint8Array(vertexCount * 3);
  const indices = new Uint32Array(plan.mergedQuadCount * 6);
  const normalValues = [
    [127, 0, 0], [-127, 0, 0], [0, 127, 0],
    [0, -127, 0], [0, 0, 127], [0, 0, -127]
  ] as const;

  plan.quads.forEach((quad, quadIndex) => {
    const vertices = quadVertices(quad);
    const normal = normalValues[quad.direction];
    const color = voxelMaterialColor(quad.material);
    vertices.forEach((vertex, vertexIndex) => {
      const offset = (quadIndex * 4 + vertexIndex) * 3;
      positions.set(vertex, offset);
      normals.set(normal, offset);
      colors.set(color, offset);
    });
    const vertexOffset = quadIndex * 4;
    indices.set([
      vertexOffset, vertexOffset + 1, vertexOffset + 2,
      vertexOffset, vertexOffset + 2, vertexOffset + 3
    ], quadIndex * 6);
  });

  const uploadBytes = positions.byteLength + normals.byteLength + colors.byteLength
    + indices.byteLength;
  if (uploadBytes !== plan.uploadBytes) {
    throw new Error('Voxel surface emission did not match its planned byte reservation.');
  }
  return Object.freeze({
    positions,
    normals,
    colors,
    indices,
    occupiedVoxelCount: plan.occupiedVoxelCount,
    exposedFaceCount: plan.exposedFaceCount,
    mergedQuadCount: plan.mergedQuadCount,
    triangleCount: plan.triangleCount,
    uploadBytes,
    signature: plan.signature
  });
}
