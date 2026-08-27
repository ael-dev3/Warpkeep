// @vitest-environment node

import {
  mkdirSync,
  mkdtempSync,
  rmSync,
  statSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { GREATER_REALM_REGION_SPECS } from '../scripts/atlas/greater-realm-candidate-generator';
import {
  GREATER_REALM_WATER_REGIME_ID,
} from '../scripts/atlas/greater-realm-hydrology-authority';
import {
  GREATER_REALM_PRIVATE_LEGACY_LOWLANDS_PATCH_V1,
} from '../scripts/atlas/greater-realm-legacy-lowlands';
import {
  GREATER_REALM_ROUTE_CLASS,
} from '../scripts/atlas/greater-realm-living-world';
import {
  openGreaterRealmPrivateWorkspace,
  type GreaterRealmPrivateWorkspace,
} from '../scripts/atlas/greater-realm-private-workspace';
import {
  GREATER_REALM_RUNTIME_RELEASE_FIXTURE_LEGACY_RESOURCE_COUNT,
  GREATER_REALM_RUNTIME_RELEASE_FIXTURE_LOWLANDS_TILE_KEYS,
  GREATER_REALM_RUNTIME_RELEASE_FIXTURE_SOURCE_COMMIT,
  createGreaterRealmRuntimeReleaseFixtureSource,
  greaterRealmRuntimeReleaseFixtureSeed,
} from '../scripts/atlas/greater-realm-runtime-release-test-fixture';
import {
  GREATER_REALM_RUNTIME_MAXIMUM_CHUNK_CASTLE_SLOTS,
  GREATER_REALM_RUNTIME_MAXIMUM_CHUNK_RESOURCE_LOCATIONS,
  GREATER_REALM_RUNTIME_MAXIMUM_CHUNK_RESOURCE_NODES,
  GREATER_REALM_RUNTIME_MAXIMUM_NODES_PER_LOCATION,
  GREATER_REALM_RUNTIME_RELEASE_DIRECTORY,
  GREATER_REALM_RUNTIME_FRAMING_SPEC_V1,
  GREATER_REALM_RUNTIME_RELEASE_SEED_CONTROL_PATH,
  assertGreaterRealmRuntimeReleaseMatches,
  createGenesis002GreaterRealmRuntimeRelease,
  createGreaterRealmRuntimeRelease,
  greaterRealmRuntimeReleaseTestSeams,
  openOrCreateGreaterRealmRuntimeReleaseSeed,
  readGreaterRealmRuntimeRelease,
  verifyGreaterRealmRuntimeReleaseArtifacts,
  verifyGenesis002GreaterRealmRuntimeReleaseArtifacts,
  writeGreaterRealmRuntimeRelease,
  type GreaterRealmRuntimeCell,
  type GreaterRealmRuntimeChunkPayload,
  type GreaterRealmRuntimeReleaseArtifacts,
  type GreaterRealmRuntimeResourceNode,
  type GreaterRealmRuntimeReleaseSource,
  type GreaterRealmRuntimeSlot,
} from '../scripts/atlas/greater-realm-runtime-release';

vi.setConfig({ testTimeout: 90_000 });

const temporaryRoots: string[] = [];

function mutateAndRehashChunk(
  sourceArtifacts: GreaterRealmRuntimeReleaseArtifacts,
  chunkIndex: number,
  mutate: (payload: Record<string, unknown>) => void,
): GreaterRealmRuntimeReleaseArtifacts {
  const chunks = [...sourceArtifacts.chunks];
  const original = chunks[chunkIndex]!;
  const payload = JSON.parse(JSON.stringify(original.payload)) as Record<string, unknown>;
  mutate(payload);
  const cells = payload.cells as readonly Readonly<{ releaseOrdinal: number }>[];
  const apron = payload.apronCellKeys as readonly string[];
  const slots = payload.castleSlots as readonly Readonly<{ releaseOrdinal: number }>[];
  const nodes = payload.resourceNodes as readonly Readonly<{ releaseOrdinal: number }>[];
  const lod1 = payload.lod1CellKeys as readonly string[];
  const lod2 = payload.lod2CellKeys as readonly string[];
  const lod3 = payload.lod3CellKeys as readonly string[];
  payload.importBatches = {
    castleSlots: greaterRealmRuntimeReleaseTestSeams.importBatchDescriptors(slots, 128),
    resourceNodes: greaterRealmRuntimeReleaseTestSeams.importBatchDescriptors(nodes, 256),
  };
  payload.sectionDigests = {
    cellsSha256: greaterRealmRuntimeReleaseTestSeams.sha256(
      greaterRealmRuntimeReleaseTestSeams.canonicalBytes(cells),
    ),
    apronSha256: greaterRealmRuntimeReleaseTestSeams.sha256(
      greaterRealmRuntimeReleaseTestSeams.canonicalBytes(apron),
    ),
    lodSha256: greaterRealmRuntimeReleaseTestSeams.sha256(
      greaterRealmRuntimeReleaseTestSeams.canonicalBytes({ lod1, lod2, lod3 }),
    ),
    castleSlotsSha256: greaterRealmRuntimeReleaseTestSeams.sha256(
      greaterRealmRuntimeReleaseTestSeams.canonicalBytes(slots),
    ),
    resourceNodesSha256: greaterRealmRuntimeReleaseTestSeams.sha256(
      greaterRealmRuntimeReleaseTestSeams.canonicalBytes(nodes),
    ),
  };
  const bytes = greaterRealmRuntimeReleaseTestSeams.canonicalBytes(payload);
  chunks[chunkIndex] = Object.freeze({
    path: original.path,
    bytes,
    payload: payload as never,
  });
  const manifest = JSON.parse(JSON.stringify(sourceArtifacts.manifest)) as Record<string, unknown>;
  const descriptor = (manifest.chunks as Array<Record<string, unknown>>)[chunkIndex]!;
  descriptor.sectionDigests = payload.sectionDigests;
  descriptor.payloadSha256 = greaterRealmRuntimeReleaseTestSeams.sha256(bytes);
  return Object.freeze({
    ...sourceArtifacts,
    manifest,
    manifestBytes: greaterRealmRuntimeReleaseTestSeams.canonicalBytes(manifest),
    chunks: Object.freeze(chunks),
  });
}

type MutableRuntimeChunk = {
  path: string;
  payload: Record<string, unknown>;
};

function reverseObjectKeyOrder(value: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(value).reverse());
}

const RUNTIME_CELL_ABI_KEYS = Object.freeze([
  'cellKey', 'atlasCoordKey', 'releaseOrdinal', 'atlasId', 'chunkHandle',
  'regionId', 'componentKey', 'localQ', 'localR', 'atlasQ', 'atlasR', 'tier',
  'passable', 'elevation', 'slope', 'aspect', 'profileCurvature', 'planCurvature',
  'ridgeId', 'geologicalBarrierBand', 'biomeClass', 'landformClass', 'yieldClass',
  'movementCost', 'sealedBoundaryMask', 'hydroRegime', 'hydroBodyId',
  'hydroDepthClass', 'hydroSurfaceMilli', 'hydroFlowDirection', 'flowAccumulation',
  'bankVariant', 'hydrologyRevision', 'routeParentDirection', 'routeDepth',
  'travelClass', 'wetness', 'exposure', 'coastDistance', 'freshwaterDistance',
  'temperature', 'moisture', 'habitatClass', 'canopyBasisPoints',
  'groundcoverBasisPoints', 'wildflowerBasisPoints', 'featureClass',
  'ambienceClass', 'presentationVariant',
] as const);

const RUNTIME_RESOURCE_ABI_KEYS = Object.freeze([
  'nodeId', 'releaseOrdinal', 'atlasId', 'locationId', 'cellKey', 'regionId',
  'componentKey', 'resourceKind', 'tier', 'nodeOrdinal', 'allocationRank',
  'legacyCatalogId', 'policyVersion', 'active',
] as const);

function applyObjectKeyOrder(
  value: Record<string, unknown>,
  orderedKeys: readonly string[],
): void {
  const entries = new Map(Object.entries(value));
  for (const key of Object.keys(value)) delete value[key];
  for (const key of orderedKeys) {
    if (entries.has(key)) value[key] = entries.get(key);
    entries.delete(key);
  }
  for (const [key, entry] of entries) value[key] = entry;
}

function readOnlyWorkspace(
  files: ReadonlyMap<string, Buffer>,
  readFile = vi.fn((path: string, maximumBytes?: number): Buffer => {
    const bytes = files.get(path);
    if (bytes === undefined) throw new Error(`TEST_FILE_MISSING:${path}`);
    if (maximumBytes !== undefined && bytes.byteLength > maximumBytes) {
      throw new Error('GREATER_REALM_PRIVATE_WORKSPACE_FILE_SIZE_INVALID');
    }
    return Buffer.from(bytes);
  }),
): Readonly<{ workspace: GreaterRealmPrivateWorkspace; readFile: typeof readFile }> {
  return Object.freeze({
    workspace: Object.freeze({ readFile }) as unknown as GreaterRealmPrivateWorkspace,
    readFile,
  });
}

function fullyRehashArtifacts(
  sourceArtifacts: GreaterRealmRuntimeReleaseArtifacts,
  mutate: (draft: Readonly<{
    manifest: Record<string, unknown>;
    chunks: MutableRuntimeChunk[];
  }>) => void,
  mutateDerivedChunk?: (payload: Record<string, unknown>, index: number) => void,
): GreaterRealmRuntimeReleaseArtifacts {
  const manifestSeed = JSON.parse(JSON.stringify(sourceArtifacts.manifest)) as Record<string, unknown>;
  const mutableChunks = sourceArtifacts.chunks.map(chunk => ({
    path: chunk.path,
    payload: JSON.parse(JSON.stringify(chunk.payload)) as Record<string, unknown>,
  }));
  mutate({ manifest: manifestSeed, chunks: mutableChunks });
  const descriptors = JSON.parse(JSON.stringify(manifestSeed.chunks)) as Array<Record<string, unknown>>;
  const rebuiltChunks = mutableChunks.map((chunk, index) => {
    const payload = chunk.payload;
    const cells = payload.cells as GreaterRealmRuntimeCell[];
    const apron = payload.apronCellKeys as string[];
    const slots = payload.castleSlots as GreaterRealmRuntimeSlot[];
    const nodes = payload.resourceNodes as GreaterRealmRuntimeResourceNode[];
    const lod1 = payload.lod1CellKeys as string[];
    const lod2 = payload.lod2CellKeys as string[];
    const lod3 = payload.lod3CellKeys as string[];
    payload.importBatches = {
      castleSlots: greaterRealmRuntimeReleaseTestSeams.importBatchDescriptors(slots, 128),
      resourceNodes: greaterRealmRuntimeReleaseTestSeams.importBatchDescriptors(nodes, 256),
    };
    payload.sectionDigests = {
      cellsSha256: greaterRealmRuntimeReleaseTestSeams.sha256(
        greaterRealmRuntimeReleaseTestSeams.canonicalBytes(cells),
      ),
      apronSha256: greaterRealmRuntimeReleaseTestSeams.sha256(
        greaterRealmRuntimeReleaseTestSeams.canonicalBytes(apron),
      ),
      lodSha256: greaterRealmRuntimeReleaseTestSeams.sha256(
        greaterRealmRuntimeReleaseTestSeams.canonicalBytes({ lod1, lod2, lod3 }),
      ),
      castleSlotsSha256: greaterRealmRuntimeReleaseTestSeams.sha256(
        greaterRealmRuntimeReleaseTestSeams.canonicalBytes(slots),
      ),
      resourceNodesSha256: greaterRealmRuntimeReleaseTestSeams.sha256(
        greaterRealmRuntimeReleaseTestSeams.canonicalBytes(nodes),
      ),
    };
    mutateDerivedChunk?.(payload, index);
    const bytes = greaterRealmRuntimeReleaseTestSeams.canonicalBytes(payload);
    const descriptor = descriptors[index]!;
    descriptor.firstCellOrdinal = cells[0]?.releaseOrdinal;
    descriptor.coreCellCount = cells.length;
    descriptor.apronCellCount = apron.length;
    descriptor.lod0CellCount = cells.length;
    descriptor.lod1CellCount = lod1.length;
    descriptor.lod2CellCount = lod2.length;
    descriptor.lod3CellCount = lod3.length;
    descriptor.payloadSha256 = greaterRealmRuntimeReleaseTestSeams.sha256(bytes);
    descriptor.sectionDigests = payload.sectionDigests;
    return Object.freeze({
      path: chunk.path,
      bytes,
      payload: payload as GreaterRealmRuntimeChunkPayload,
    });
  });
  const cells = rebuiltChunks.flatMap(chunk => chunk.payload.cells)
    .sort((first, second) => first.releaseOrdinal - second.releaseOrdinal);
  const slots = rebuiltChunks.flatMap(chunk => chunk.payload.castleSlots)
    .sort((first, second) => first.releaseOrdinal - second.releaseOrdinal);
  const nodes = rebuiltChunks.flatMap(chunk => chunk.payload.resourceNodes)
    .sort((first, second) => first.releaseOrdinal - second.releaseOrdinal);
  const components = (manifestSeed.components as Array<Record<string, unknown>>).map(component => {
    const componentKey = String(component.componentKey);
    const componentCells = cells.filter(cell => cell.componentKey === componentKey);
    const componentSlots = slots.filter(slot => slot.componentKey === componentKey);
    const componentNodes = nodes.filter(node => node.componentKey === componentKey);
    component.regionMask = componentCells.reduce((mask, cell) => {
      const ordinal = greaterRealmRuntimeReleaseTestSeams.publicRegionSpecs
        .find(region => region.id === cell.regionId)!.ordinal;
      return mask | (1 << ordinal);
    }, 0);
    component.expectedCellCount = componentCells.length;
    component.maxRouteDepth = Math.max(...componentCells.map(cell => cell.routeDepth ?? 0));
    component.expectedSlotCount = componentSlots.length;
    component.expectedFoodNodeCount = componentNodes
      .filter(node => node.resourceKind === 'food').length;
    component.expectedWoodNodeCount = componentNodes
      .filter(node => node.resourceKind === 'wood').length;
    component.expectedStoneNodeCount = componentNodes
      .filter(node => node.resourceKind === 'stone').length;
    component.expectedGoldNodeCount = componentNodes
      .filter(node => node.resourceKind === 'gold').length;
    component.componentSha256 = greaterRealmRuntimeReleaseTestSeams.digestComponent(
      componentKey,
      componentCells,
      componentSlots,
      componentNodes,
    );
    return component;
  });
  const regions = greaterRealmRuntimeReleaseTestSeams.publicRegionSpecs.map(region => {
    const regionCells = cells.filter(cell => cell.regionId === region.id);
    const regionSlots = slots.filter(slot => slot.regionId === region.id);
    const regionNodes = nodes.filter(node => node.regionId === region.id);
    const countKind = (kind: 'food' | 'wood' | 'stone' | 'gold') => (
      regionNodes.filter(node => node.resourceKind === kind).length
    );
    return {
      regionId: region.id,
      publicName: region.name,
      ordinal: region.ordinal,
      tier: 1,
      cellCount: regionCells.length,
      passableCellCount: regionCells.filter(cell => cell.passable).length,
      chunkCount: new Set(regionCells.map(cell => cell.chunkHandle)).size,
      castleCapacity: regionSlots.length,
      resourceLocationCount: new Set(regionNodes.map(node => node.locationId)).size,
      resourceNodeCount: regionNodes.length,
      foodNodeCount: countKind('food'),
      woodNodeCount: countKind('wood'),
      stoneNodeCount: countKind('stone'),
      goldNodeCount: countKind('gold'),
      active: false,
    };
  });
  const totals = {
    regionCount: regions.length,
    componentCount: components.length,
    chunkCount: descriptors.length,
    cellCount: cells.length,
    castleSlotCount: slots.length,
    resourceNodeCount: nodes.length,
  };
  const header = greaterRealmRuntimeReleaseTestSeams.releaseHeader({
    publicReleaseId: String(manifestSeed.publicReleaseId),
    publicApprovalReceiptId: String(manifestSeed.publicApprovalReceiptId),
    sourceCommit: String(manifestSeed.sourceCommit),
    totals,
    legacyLowlandsBridge: manifestSeed.legacyLowlandsBridge as Readonly<Record<string, unknown>>,
  });
  const releaseSha256 = greaterRealmRuntimeReleaseTestSeams.framedSha256(
    'warpkeep.greater-realm.release.v1',
    [
      greaterRealmRuntimeReleaseTestSeams.canonicalBytes(header),
      ...rebuiltChunks.map(chunk => chunk.bytes),
      greaterRealmRuntimeReleaseTestSeams.canonicalBytes(components),
      greaterRealmRuntimeReleaseTestSeams.canonicalBytes(regions),
    ],
  );
  const manifest: Record<string, unknown> = {
    ...header,
    regions,
    components,
    chunks: descriptors,
    releaseSha256,
  };
  const status = {
    schema: sourceArtifacts.status.schema,
    publicReleaseId: String(manifest.publicReleaseId),
    verified: true,
    tierOneOnly: true,
    regionCount: regions.length,
    componentCount: components.length,
    chunkCount: descriptors.length,
    cellCount: cells.length,
    castleSlotCount: slots.length,
    resourceNodeCount: nodes.length,
    releaseSha256,
    productionUntouched: true,
  };
  return Object.freeze({
    manifest: Object.freeze(manifest),
    manifestBytes: greaterRealmRuntimeReleaseTestSeams.canonicalBytes(manifest),
    status: Object.freeze(status),
    statusBytes: greaterRealmRuntimeReleaseTestSeams.canonicalBytes(status),
    chunks: Object.freeze(rebuiltChunks),
  });
}

describe('Greater Realm runtime canonical JSON', () => {
  const invalidCode = 'GREATER_REALM_RUNTIME_RELEASE_CANONICAL_JSON_INVALID';

  function expectInvalidAtRootAndNested(value: unknown): void {
    expect(() => greaterRealmRuntimeReleaseTestSeams.canonicalBytes(value))
      .toThrow(invalidCode);
    expect(() => greaterRealmRuntimeReleaseTestSeams.canonicalBytes({ nested: value }))
      .toThrow(invalidCode);
  }

  it('encodes root and nested plain records with wire-format optional-field omission', () => {
    const nested = Object.assign(Object.create(null) as Record<string, unknown>, {
      present: 'nested',
      optional: undefined,
    });
    expect(greaterRealmRuntimeReleaseTestSeams.canonicalBytes({
      schema: 'plain-record-v1',
      optional: undefined,
      nested,
      rows: [{ present: true, optional: undefined }, null],
      ratio: 1.5,
    }).toString('utf8')).toBe(
      '{"schema":"plain-record-v1","nested":{"present":"nested"},'
      + '"rows":[{"present":true},null],"ratio":1.5}\n',
    );
  });

  it('does not invoke an inherited Array.prototype toJSON hook', () => {
    const inheritedToJSON = vi.fn(() => ['substituted']);
    const previous = Object.getOwnPropertyDescriptor(Array.prototype, 'toJSON');
    Object.defineProperty(Array.prototype, 'toJSON', {
      configurable: true,
      value: inheritedToJSON,
      writable: true,
    });
    try {
      expect(greaterRealmRuntimeReleaseTestSeams.canonicalBytes([
        { present: true, optional: undefined },
      ]).toString('utf8')).toBe('[{"present":true}]\n');
      expect(inheritedToJSON).not.toHaveBeenCalled();
    } finally {
      if (previous === undefined) {
        Reflect.deleteProperty(Array.prototype, 'toJSON');
      } else {
        Object.defineProperty(Array.prototype, 'toJSON', previous);
      }
    }
  });

  it('rejects custom serialization, accessors, symbols, and hidden record fields', () => {
    const toJSON = vi.fn(() => ({ substituted: true }));
    const customSerialization = { present: true, toJSON };
    let getterCalls = 0;
    const getterRecord = Object.defineProperty({}, 'value', {
      enumerable: true,
      get: () => {
        getterCalls += 1;
        return 'must-not-run';
      },
    });
    const setterRecord = Object.defineProperty({}, 'value', {
      enumerable: true,
      set: () => undefined,
    });
    const symbolRecord: Record<PropertyKey, unknown> = { present: true };
    symbolRecord[Symbol('hidden-channel')] = 'must-not-serialize';
    const hiddenRecord = Object.defineProperty({ present: true }, 'hidden', {
      value: 'must-not-serialize',
    });

    for (const value of [
      customSerialization,
      getterRecord,
      setterRecord,
      symbolRecord,
      hiddenRecord,
    ]) expectInvalidAtRootAndNested(value);
    expect(toJSON).not.toHaveBeenCalled();
    expect(getterCalls).toBe(0);
  });

  it('rejects sparse, decorated, and custom-prototype arrays and records', () => {
    const sparse = new Array<unknown>(2);
    sparse[1] = 'present';
    const decorated = Object.defineProperty(['dense'], 'hidden', { value: true });
    const customArray = ['dense'];
    Object.setPrototypeOf(customArray, Object.create(Array.prototype));
    const customRecord = Object.assign(Object.create({ inherited: true }), {
      present: true,
    });

    for (const value of [sparse, decorated, customArray, customRecord, new Date(0)]) {
      expectInvalidAtRootAndNested(value);
    }
  });

  it('rejects unsupported values, cycles, and non-finite or unsafe numbers', () => {
    for (const value of [
      () => undefined,
      1n,
      Symbol('unsupported'),
      Number.NaN,
      Number.POSITIVE_INFINITY,
      Number.NEGATIVE_INFINITY,
      Number.MAX_SAFE_INTEGER + 1,
      Number.MIN_SAFE_INTEGER - 1,
    ]) expectInvalidAtRootAndNested(value);

    expect(() => greaterRealmRuntimeReleaseTestSeams.canonicalBytes(undefined))
      .toThrow(invalidCode);
    expect(() => greaterRealmRuntimeReleaseTestSeams.canonicalBytes([undefined]))
      .toThrow(invalidCode);

    const cycle: Record<string, unknown> = {};
    cycle.self = cycle;
    expectInvalidAtRootAndNested(cycle);
  });
});

describe('Greater Realm declassified runtime release', () => {
  let source: GreaterRealmRuntimeReleaseSource;
  let artifacts: GreaterRealmRuntimeReleaseArtifacts;

  beforeAll(() => {
    source = createGreaterRealmRuntimeReleaseFixtureSource();
    artifacts = createGreaterRealmRuntimeRelease({
      source,
      sourceCommit: GREATER_REALM_RUNTIME_RELEASE_FIXTURE_SOURCE_COMMIT,
      releaseSeed: greaterRealmRuntimeReleaseFixtureSeed(),
    });
  });

  afterAll(() => {
    source.grid.clearIndex?.();
    for (const root of temporaryRoots.splice(0)) {
      rmSync(root, { force: true, recursive: true });
    }
  });

  it('exports six exact Tier-I aggregates, 600 slots, and 12,000 regional resource nodes', () => {
    expect(() => verifyGreaterRealmRuntimeReleaseArtifacts(artifacts)).not.toThrow();
    expect(artifacts.manifest.regions).toEqual(
      GREATER_REALM_REGION_SPECS.slice(0, 6).map((region, ordinal) => expect.objectContaining({
        regionId: region.id,
        publicName: region.name,
        ordinal,
        tier: 1,
        castleCapacity: 100,
        resourceNodeCount: 2_000,
        foodNodeCount: 500,
        woodNodeCount: 500,
        stoneNodeCount: 500,
        goldNodeCount: 500,
      })),
    );
    expect(artifacts.status).toMatchObject({
      verified: true,
      tierOneOnly: true,
      regionCount: 6,
      castleSlotCount: 600,
      resourceNodeCount: 12_000,
      productionUntouched: true,
    });
    // Contract vector: length-framed canonical header, ordered chunks,
    // components, and all six four-kind region aggregates.
    const header = greaterRealmRuntimeReleaseTestSeams.releaseHeader({
      publicReleaseId: String(artifacts.manifest.publicReleaseId),
      publicApprovalReceiptId: String(artifacts.manifest.publicApprovalReceiptId),
      sourceCommit: String(artifacts.manifest.sourceCommit),
      totals: artifacts.manifest.totals as Readonly<Record<string, number>>,
      legacyLowlandsBridge: artifacts.manifest.legacyLowlandsBridge as Readonly<Record<string, unknown>>,
    });
    const headerBytes = greaterRealmRuntimeReleaseTestSeams.canonicalBytes(header);
    expect(headerBytes).toHaveLength(1_421);
    expect(greaterRealmRuntimeReleaseTestSeams.sha256(headerBytes))
      .toBe('c8e254d17803448beb4a1b170d871f4465dec4acaada49666590fa48ce6d2a96');
    expect(artifacts.manifest.releaseSha256)
      .toBe('58d6cb269c1befdd140e1db2320a5d1910c8ba782d049444963942e423cf40ab');
    expect((artifacts.manifest.components as Array<Record<string, unknown>>)[0]!.componentSha256)
      .toBe('31955d3985dd9f906fe881990e4a051d7df3bfb5d24e3aa555870044a0f0a732');
    const slotless = (artifacts.manifest.components as Array<Record<string, number>>)
      .filter(component => component.expectedSlotCount === 0);
    expect(slotless.length).toBeGreaterThan(0);
    expect(slotless.every(component => (
      component.expectedFoodNodeCount === 0
      && component.expectedWoodNodeCount === 0
      && component.expectedStoneNodeCount === 0
      && component.expectedGoldNodeCount === 0
    ))).toBe(true);
  });

  it('generates a distinct G002 package without reinterpreting historical G001 bytes', () => {
    const genesis002 = createGenesis002GreaterRealmRuntimeRelease({
      source,
      sourceCommit: GREATER_REALM_RUNTIME_RELEASE_FIXTURE_SOURCE_COMMIT,
      releaseSeed: greaterRealmRuntimeReleaseFixtureSeed(),
    });
    try {
      expect(genesis002.manifest.atlasId).toBe('GENESIS_002_GREATER_REALM');
      expect(artifacts.manifest.atlasId).toBe('GENESIS_001_GREATER_REALM');
      expect(genesis002.manifest.releaseSha256)
        .not.toBe(artifacts.manifest.releaseSha256);
      expect(() => verifyGenesis002GreaterRealmRuntimeReleaseArtifacts(genesis002))
        .not.toThrow();
      expect(() => verifyGreaterRealmRuntimeReleaseArtifacts(genesis002)).toThrow();
      expect(() => verifyGenesis002GreaterRealmRuntimeReleaseArtifacts(artifacts)).toThrow();
      expect(genesis002.chunks.every(chunk => (
        chunk.payload.cells.every(cell => cell.atlasId === 'GENESIS_002_GREATER_REALM')
        && chunk.payload.castleSlots.every(slot => slot.atlasId === 'GENESIS_002_GREATER_REALM')
        && chunk.payload.resourceNodes.every(node => node.atlasId === 'GENESIS_002_GREATER_REALM')
      ))).toBe(true);
    } finally {
      genesis002.manifestBytes.fill(0);
      genesis002.statusBytes.fill(0);
      for (const chunk of genesis002.chunks) chunk.bytes.fill(0);
    }
  });

  it('uses exact 15x15 axial bins, bounded visible windows, and exact public cell keys', () => {
    const descriptors = artifacts.manifest.chunks as Array<Record<string, unknown>>;
    let sawApronHeavyBorderChunk = false;
    for (const [index, chunk] of artifacts.chunks.entries()) {
      const descriptor = descriptors[index]!;
      expect(chunk.payload.cells.length).toBeLessThanOrEqual(225);
      expect(chunk.payload.cells.length + chunk.payload.apronCellKeys.length)
        .toBeLessThanOrEqual(384);
      expect(descriptor.chunkCoordKey).toBe(`B:${descriptor.binQ}:${descriptor.binR}`);
      for (const cell of chunk.payload.cells) {
        expect(Math.floor(cell.atlasQ / 15)).toBe(descriptor.binQ);
        expect(Math.floor(cell.atlasR / 15)).toBe(descriptor.binR);
        expect(cell.cellKey).toBe(`${cell.regionId}:${cell.localQ}:${cell.localR}`);
      }
      const visible = [
        ...chunk.payload.cells.map(cell => cell.cellKey),
        ...chunk.payload.apronCellKeys,
      ];
      if (chunk.payload.apronCellKeys.length > chunk.payload.cells.length) {
        sawApronHeavyBorderChunk = true;
      }
      expect(chunk.payload.lod1CellKeys).toHaveLength(Math.ceil(visible.length / 2));
      expect(chunk.payload.lod2CellKeys).toHaveLength(
        Math.ceil(chunk.payload.lod1CellKeys.length / 2),
      );
      expect(chunk.payload.lod3CellKeys).toHaveLength(
        Math.ceil(chunk.payload.lod2CellKeys.length / 2),
      );
      expect(chunk.payload.lod1CellKeys.every(key => visible.includes(key))).toBe(true);
      expect(chunk.payload.lod2CellKeys.every(key => chunk.payload.lod1CellKeys.includes(key)))
        .toBe(true);
      expect(chunk.payload.lod3CellKeys.every(key => chunk.payload.lod2CellKeys.includes(key)))
        .toBe(true);
      const coreKeys = new Set(chunk.payload.cells.map(cell => cell.cellKey));
      expect(chunk.payload.lod1CellKeys.some(key => coreKeys.has(key))).toBe(true);
      expect(chunk.payload.lod2CellKeys.some(key => coreKeys.has(key))).toBe(true);
      expect(chunk.payload.lod3CellKeys.some(key => coreKeys.has(key))).toBe(true);
    }
    expect(sawApronHeavyBorderChunk).toBe(true);
  });

  it('uses contiguous balanced location blocks within every resource ordinal group', () => {
    const nodes = artifacts.chunks.flatMap(chunk => chunk.payload.resourceNodes)
      .sort((first, second) => first.releaseOrdinal - second.releaseOrdinal);
    const groups = new Map<string, typeof nodes>();
    for (const node of nodes) {
      const key = `${node.componentKey}:${node.regionId}:${node.resourceKind}`;
      const values = groups.get(key) ?? [];
      values.push(node);
      groups.set(key, values);
    }
    for (const group of groups.values()) {
      const seen = new Set<string>();
      const counts = new Map<string, number>();
      const projections = new Map<string, string>();
      let previous = '';
      for (const node of group) {
        if (node.locationId !== previous) {
          expect(seen.has(node.locationId)).toBe(false);
          if (previous !== '') expect(node.locationId.localeCompare(previous)).toBeGreaterThan(0);
          seen.add(node.locationId);
          previous = node.locationId;
        }
        const projection = JSON.stringify({
          cellKey: node.cellKey,
          regionId: node.regionId,
          componentKey: node.componentKey,
          resourceKind: node.resourceKind,
          legacyCatalogId: node.legacyCatalogId,
          policyVersion: node.policyVersion,
        });
        expect(projections.get(node.locationId) ?? projection).toBe(projection);
        projections.set(node.locationId, projection);
        counts.set(node.locationId, (counts.get(node.locationId) ?? 0) + 1);
      }
      const locationCounts = [...counts.values()];
      expect(Math.max(...locationCounts)).toBeLessThanOrEqual(
        GREATER_REALM_RUNTIME_MAXIMUM_NODES_PER_LOCATION,
      );
      expect(Math.max(...locationCounts) - Math.min(...locationCounts)).toBeLessThanOrEqual(1);
    }
    for (const chunk of artifacts.chunks) {
      expect(chunk.payload.castleSlots.length)
        .toBeLessThanOrEqual(GREATER_REALM_RUNTIME_MAXIMUM_CHUNK_CASTLE_SLOTS);
      expect(chunk.payload.resourceNodes.length)
        .toBeLessThanOrEqual(GREATER_REALM_RUNTIME_MAXIMUM_CHUNK_RESOURCE_NODES);
      expect(new Set(chunk.payload.resourceNodes.map(node => node.locationId)).size)
        .toBeLessThanOrEqual(GREATER_REALM_RUNTIME_MAXIMUM_CHUNK_RESOURCE_LOCATIONS);
    }
  });

  it('freezes UTF-8 canonical JSON and unsigned u64 big-endian framing', () => {
    const vector = GREATER_REALM_RUNTIME_FRAMING_SPEC_V1.compatibilityVector;
    const frames = vector.frames.map(frame => {
      const bytes = Buffer.from(frame.canonicalJson, 'utf8');
      const length = Buffer.alloc(8);
      length.writeBigUInt64BE(BigInt(bytes.byteLength));
      expect(bytes.byteLength).toBe(frame.byteLength);
      expect(bytes.toString('hex')).toBe(frame.utf8Hex);
      expect(length.toString('hex')).toBe(frame.lengthPrefixHex);
      return bytes;
    });
    expect(Buffer.from(`${vector.domain}\n`, 'utf8').toString('hex')).toBe(vector.domainUtf8Hex);
    expect(greaterRealmRuntimeReleaseTestSeams.framedSha256(vector.domain, frames))
      .toBe(vector.digestSha256);
  });

  it('pins every passable parent and retains only reviewed river or stream fords as wet routes', () => {
    const cells = artifacts.chunks.flatMap(chunk => chunk.payload.cells);
    const byCoordinate = new Map(cells.map(cell => [cell.atlasCoordKey, cell] as const));
    for (const cell of cells) {
      if (!cell.passable) {
        expect(cell.componentKey).toBeUndefined();
        expect(cell.routeDepth).toBeUndefined();
        expect(cell.routeParentDirection).toBeUndefined();
        continue;
      }
      expect(cell.componentKey).toMatch(/^GRC-[A-Z2-7]{26}$/u);
      if (cell.routeDepth === 0) {
        expect(cell.routeParentDirection).toBeUndefined();
        continue;
      }
      const direction = [
        [1, 0], [1, -1], [0, -1], [-1, 0], [-1, 1], [0, 1],
      ][cell.routeParentDirection!]!;
      const parent = byCoordinate.get(`A:${cell.atlasQ + direction[0]}:${cell.atlasR + direction[1]}`);
      expect(parent?.componentKey).toBe(cell.componentKey);
      expect(parent?.routeDepth).toBe(cell.routeDepth! - 1);
    }
    const wetPassable = cells.filter(cell => (
      cell.passable && cell.hydroRegime !== GREATER_REALM_WATER_REGIME_ID.DRY
    ));
    expect(wetPassable).toHaveLength(1);
    expect(wetPassable[0]).toMatchObject({
      hydroRegime: GREATER_REALM_WATER_REGIME_ID.RIVER,
      travelClass: GREATER_REALM_ROUTE_CLASS.FORD,
    });
  });

  it('remaps topology identity and derives full public presentation without private material', () => {
    const cells = artifacts.chunks.flatMap(chunk => chunk.payload.cells);
    const lakes = cells.filter(cell => cell.hydroRegime === GREATER_REALM_WATER_REGIME_ID.LAKE);
    expect(lakes).toHaveLength(2);
    expect(new Set(lakes.map(cell => cell.hydroBodyId)).size).toBe(1);
    expect(lakes[0]!.hydroBodyId).toMatch(/^GRW-[A-Z2-7]{26}$/u);
    expect(lakes.every(cell => !cell.passable && cell.componentKey === undefined)).toBe(true);
    const ridge = cells.find(cell => cell.ridgeId !== undefined);
    expect(ridge?.ridgeId).toMatch(/^GRD-[A-Z2-7]{26}$/u);
    expect(ridge?.ridgeId).not.toContain('42');
    expect(cells[0]).toEqual(expect.objectContaining({
      profileCurvature: 17,
      planCurvature: -19,
      habitatClass: expect.any(Number),
      canopyBasisPoints: expect.any(Number),
      groundcoverBasisPoints: expect.any(Number),
      wildflowerBasisPoints: expect.any(Number),
      bankVariant: expect.any(Number),
      presentationVariant: expect.any(Number),
    }));
    const wireText = JSON.stringify({
      manifest: artifacts.manifest,
      status: artifacts.status,
      chunks: artifacts.chunks.map(chunk => chunk.payload),
    });
    expect(wireText).not.toContain('deadbeef');
    expect(wireText).not.toContain('T2_CROWNWOOD');
    expect(wireText).not.toContain('20000:-20000');
  });

  it('preserves exact reversible Lowlands cells, slots, and all catalog locations', () => {
    const cells = artifacts.chunks.flatMap(chunk => chunk.payload.cells);
    const lowlandsKeys = new Set(cells
      .filter(cell => cell.regionId === 'T1_LOWLANDS')
      .map(cell => `${cell.localQ},${cell.localR}`));
    expect(lowlandsKeys.size).toBeGreaterThanOrEqual(10_000);
    for (const key of GREATER_REALM_RUNTIME_RELEASE_FIXTURE_LOWLANDS_TILE_KEYS) {
      expect(lowlandsKeys.has(key)).toBe(true);
    }
    const slots = artifacts.chunks.flatMap(chunk => chunk.payload.castleSlots);
    expect(slots.filter(slot => slot.legacySlotId !== undefined)
      .map(slot => slot.legacySlotId)
      .sort((first, second) => first! - second!))
      .toEqual(Array.from({ length: 100 }, (_, index) => index + 1));
    expect(slots.filter(slot => slot.legacySlotId === undefined)).toHaveLength(500);
    const nodes = artifacts.chunks.flatMap(chunk => chunk.payload.resourceNodes);
    const catalogIds = new Set(nodes
      .filter(node => node.legacyCatalogId !== undefined)
      .map(node => `${node.resourceKind}:${node.legacyCatalogId}`));
    expect(catalogIds.size).toBe(GREATER_REALM_RUNTIME_RELEASE_FIXTURE_LEGACY_RESOURCE_COUNT);
    expect(nodes.filter(node => node.regionId === 'T1_LOWLANDS')).toHaveLength(2_000);
  });

  it('is deterministic for one control seed and independent for a fresh public seed', () => {
    const replay = createGreaterRealmRuntimeRelease({
      source,
      sourceCommit: GREATER_REALM_RUNTIME_RELEASE_FIXTURE_SOURCE_COMMIT,
      releaseSeed: greaterRealmRuntimeReleaseFixtureSeed(),
    });
    const fresh = createGreaterRealmRuntimeRelease({
      source,
      sourceCommit: GREATER_REALM_RUNTIME_RELEASE_FIXTURE_SOURCE_COMMIT,
      releaseSeed: greaterRealmRuntimeReleaseFixtureSeed(7),
    });
    expect(replay.manifestBytes).toEqual(artifacts.manifestBytes);
    expect(replay.statusBytes).toEqual(artifacts.statusBytes);
    expect(replay.chunks.map(chunk => chunk.bytes)).toEqual(artifacts.chunks.map(chunk => chunk.bytes));
    expect(fresh.manifest.publicReleaseId).not.toBe(artifacts.manifest.publicReleaseId);
    expect(fresh.manifest.publicApprovalReceiptId).not.toBe(artifacts.manifest.publicApprovalReceiptId);
  });

  it('does not let an unused owner selection channel influence any release byte', () => {
    const alternateSource = createGreaterRealmRuntimeReleaseFixtureSource({
      fillUnusedOwnerSelectionChannel: true,
    });
    try {
      const alternate = createGreaterRealmRuntimeRelease({
        source: alternateSource,
        sourceCommit: GREATER_REALM_RUNTIME_RELEASE_FIXTURE_SOURCE_COMMIT,
        releaseSeed: greaterRealmRuntimeReleaseFixtureSeed(),
      });
      expect(alternate.manifestBytes).toEqual(artifacts.manifestBytes);
      expect(alternate.statusBytes).toEqual(artifacts.statusBytes);
      expect(alternate.chunks.map(chunk => chunk.bytes))
        .toEqual(artifacts.chunks.map(chunk => chunk.bytes));
    } finally {
      alternateSource.grid.clearIndex?.();
    }
  });

  it('rejects a synthetic source that revises a frozen dry Lowlands cell', () => {
    const hostileSource = createGreaterRealmRuntimeReleaseFixtureSource();
    try {
      const waterKeys = new Set(
        GREATER_REALM_PRIVATE_LEGACY_LOWLANDS_PATCH_V1.water.enabledCells
          .map(water => water.cellKey),
      );
      const dryTile = GREATER_REALM_PRIVATE_LEGACY_LOWLANDS_PATCH_V1.world.tiles
        .find(tile => !waterKeys.has(tile.key))!;
      const dryCell = hostileSource.grid.indexOf({ q: dryTile.q, r: dryTile.r });
      if (dryCell < 0) throw new Error('GREATER_REALM_RUNTIME_RELEASE_TEST_DRY_CELL_MISSING');
      hostileSource.waterGenerationVersion[dryCell] = 1;
      expect(() => createGreaterRealmRuntimeRelease({
        source: hostileSource,
        sourceCommit: GREATER_REALM_RUNTIME_RELEASE_FIXTURE_SOURCE_COMMIT,
        releaseSeed: greaterRealmRuntimeReleaseFixtureSeed(),
      })).toThrow('GREATER_REALM_RUNTIME_RELEASE_LOWLANDS_CLASSIFICATION_INVALID');
    } finally {
      hostileSource.grid.clearIndex?.();
    }
  });

  it('rejects byte tampering and private authority injected into a public object', () => {
    const first = artifacts.chunks[0]!;
    const tamperedBytes = Buffer.from(first.bytes);
    tamperedBytes[tamperedBytes.length - 2] ^= 1;
    const tampered = Object.freeze({
      ...artifacts,
      chunks: Object.freeze([
        Object.freeze({ ...first, bytes: tamperedBytes }),
        ...artifacts.chunks.slice(1),
      ]),
    });
    expect(() => verifyGreaterRealmRuntimeReleaseArtifacts(tampered))
      .toThrow('GREATER_REALM_RUNTIME_RELEASE_CHUNK_INVALID');
    expect(() => greaterRealmRuntimeReleaseTestSeams.assertNoPrivateReleaseMaterial({
      ...artifacts.manifest,
      candidateHandle: 'GR-A-AAAAAAAAAAAAAAAA',
    })).toThrow('GREATER_REALM_RUNTIME_RELEASE_PRIVACY_BOUNDARY_INVALID');
    for (const generatorOnlyKey of [
      'resourcePotential',
      'corePotential',
      'throneAnchor',
      'gateCell',
      'gateApproachCell',
      'barrier',
      'barrierCrossSections',
      'seedNamespace',
      'terrainSeedNamespace',
      'rootSeed',
      'candidateSeed',
      'presentationSeed',
    ]) {
      expect(() => greaterRealmRuntimeReleaseTestSeams.assertNoPrivateReleaseMaterial({
        [generatorOnlyKey]: 1,
      })).toThrow('GREATER_REALM_RUNTIME_RELEASE_PRIVACY_BOUNDARY_INVALID');
    }
  });

  it('rejects an artifact payload whose hidden root toJSON substitutes the hashed wire', () => {
    const first = artifacts.chunks[0]!;
    const substitutedWire = Object.freeze({ substituted: true });
    const toJSON = vi.fn(() => substitutedWire);
    const payload = Object.defineProperty({}, 'toJSON', {
      configurable: true,
      value: toJSON,
    }) as Record<string, unknown>;
    Object.assign(payload, first.payload);
    const bytes = Buffer.from(`${JSON.stringify(payload)}\n`, 'utf8');
    expect(bytes.toString('utf8')).toBe('{"substituted":true}\n');

    const manifest = JSON.parse(artifacts.manifestBytes.toString('utf8')) as Record<string, unknown>;
    const status = JSON.parse(artifacts.statusBytes.toString('utf8')) as Record<string, unknown>;
    const descriptors = manifest.chunks as Array<Record<string, unknown>>;
    descriptors[0]!.payloadSha256 = greaterRealmRuntimeReleaseTestSeams.sha256(bytes);
    const chunks = [
      { ...first, bytes, payload: payload as GreaterRealmRuntimeChunkPayload },
      ...artifacts.chunks.slice(1),
    ];
    const header = greaterRealmRuntimeReleaseTestSeams.releaseHeader({
      publicReleaseId: String(manifest.publicReleaseId),
      publicApprovalReceiptId: String(manifest.publicApprovalReceiptId),
      sourceCommit: String(manifest.sourceCommit),
      totals: manifest.totals as Readonly<Record<string, number>>,
      legacyLowlandsBridge: manifest.legacyLowlandsBridge as Readonly<Record<string, unknown>>,
    });
    const releaseSha256 = greaterRealmRuntimeReleaseTestSeams.framedSha256(
      'warpkeep.greater-realm.release.v1',
      [
        greaterRealmRuntimeReleaseTestSeams.canonicalBytes(header),
        ...chunks.map(chunk => chunk.bytes),
        greaterRealmRuntimeReleaseTestSeams.canonicalBytes(
          manifest.components as readonly unknown[],
        ),
        greaterRealmRuntimeReleaseTestSeams.canonicalBytes(
          manifest.regions as readonly unknown[],
        ),
      ],
    );
    manifest.releaseSha256 = releaseSha256;
    status.releaseSha256 = releaseSha256;
    const mismatchedArtifacts: GreaterRealmRuntimeReleaseArtifacts = {
      manifest: manifest as GreaterRealmRuntimeReleaseArtifacts['manifest'],
      manifestBytes: greaterRealmRuntimeReleaseTestSeams.canonicalBytes(manifest),
      status: status as GreaterRealmRuntimeReleaseArtifacts['status'],
      statusBytes: greaterRealmRuntimeReleaseTestSeams.canonicalBytes(status),
      chunks,
    };

    toJSON.mockClear();
    expect(() => verifyGreaterRealmRuntimeReleaseArtifacts(mismatchedArtifacts))
      .toThrow('GREATER_REALM_RUNTIME_RELEASE_CANONICAL_JSON_INVALID');
    expect(toJSON).not.toHaveBeenCalled();
  });

  it('rejects fully rehashed chunk payloads with non-canonical ABI object-key order', () => {
    const reversedRoot = fullyRehashArtifacts(artifacts, draft => {
      const chunk = draft.chunks[0]!;
      chunk.payload = reverseObjectKeyOrder(chunk.payload);
    });
    expect(() => verifyGreaterRealmRuntimeReleaseArtifacts(reversedRoot))
      .toThrow('GREATER_REALM_RUNTIME_RELEASE_CHUNK_INVALID');

    const reversedCell = fullyRehashArtifacts(artifacts, draft => {
      const cells = draft.chunks[0]!.payload.cells as Array<Record<string, unknown>>;
      cells[0] = reverseObjectKeyOrder(cells[0]!);
    });
    expect(() => verifyGreaterRealmRuntimeReleaseArtifacts(reversedCell))
      .toThrow('GREATER_REALM_RUNTIME_RELEASE_CELL_INVALID');

    const reversedSlot = fullyRehashArtifacts(artifacts, draft => {
      const chunk = draft.chunks.find(candidate => (
        (candidate.payload.castleSlots as unknown[]).length > 0
      ))!;
      const slots = chunk.payload.castleSlots as Array<Record<string, unknown>>;
      slots[0] = reverseObjectKeyOrder(slots[0]!);
    });
    expect(() => verifyGreaterRealmRuntimeReleaseArtifacts(reversedSlot))
      .toThrow('GREATER_REALM_RUNTIME_RELEASE_SLOT_INVALID');

    const reversedResource = fullyRehashArtifacts(artifacts, draft => {
      const chunk = draft.chunks.find(candidate => (
        (candidate.payload.resourceNodes as unknown[]).length > 0
      ))!;
      const nodes = chunk.payload.resourceNodes as Array<Record<string, unknown>>;
      nodes[0] = reverseObjectKeyOrder(nodes[0]!);
    });
    expect(() => verifyGreaterRealmRuntimeReleaseArtifacts(reversedResource))
      .toThrow('GREATER_REALM_RUNTIME_RELEASE_RESOURCE_INVALID');

    const reversedImportBatches = fullyRehashArtifacts(
      artifacts,
      () => undefined,
      (payload, index) => {
        if (index === 0) {
          payload.importBatches = reverseObjectKeyOrder(
            payload.importBatches as Record<string, unknown>,
          );
        }
      },
    );
    expect(() => verifyGreaterRealmRuntimeReleaseArtifacts(reversedImportBatches))
      .toThrow('GREATER_REALM_RUNTIME_RELEASE_CHUNK_INVALID');

    let reversedBatchDescriptorFound = false;
    const reversedBatchDescriptor = fullyRehashArtifacts(
      artifacts,
      () => undefined,
      payload => {
        if (reversedBatchDescriptorFound) return;
        const importBatches = payload.importBatches as Record<string, readonly unknown[]>;
        const castleSlots = [...importBatches.castleSlots] as Array<Record<string, unknown>>;
        const resourceNodes = [...importBatches.resourceNodes] as Array<Record<string, unknown>>;
        if (castleSlots.length > 0) {
          castleSlots[0] = reverseObjectKeyOrder(castleSlots[0]!);
        } else if (resourceNodes.length > 0) {
          resourceNodes[0] = reverseObjectKeyOrder(resourceNodes[0]!);
        } else {
          return;
        }
        payload.importBatches = { castleSlots, resourceNodes };
        reversedBatchDescriptorFound = true;
      },
    );
    expect(reversedBatchDescriptorFound).toBe(true);
    expect(() => verifyGreaterRealmRuntimeReleaseArtifacts(reversedBatchDescriptor))
      .toThrow('GREATER_REALM_RUNTIME_RELEASE_CHUNK_INVALID');

    const reversedSectionDigests = fullyRehashArtifacts(
      artifacts,
      () => undefined,
      (payload, index) => {
        if (index === 0) {
          payload.sectionDigests = reverseObjectKeyOrder(
            payload.sectionDigests as Record<string, unknown>,
          );
        }
      },
    );
    expect(() => verifyGreaterRealmRuntimeReleaseArtifacts(reversedSectionDigests))
      .toThrow('GREATER_REALM_RUNTIME_RELEASE_CHUNK_INVALID');

    const reversedComponent = fullyRehashArtifacts(artifacts, draft => {
      const components = draft.manifest.components as Array<Record<string, unknown>>;
      components[0] = reverseObjectKeyOrder(components[0]!);
    });
    expect(() => verifyGreaterRealmRuntimeReleaseArtifacts(reversedComponent))
      .toThrow('GREATER_REALM_RUNTIME_RELEASE_COMPONENT_INVALID');

    const reversedChunkDescriptor = fullyRehashArtifacts(artifacts, draft => {
      const descriptors = draft.manifest.chunks as Array<Record<string, unknown>>;
      descriptors[0] = reverseObjectKeyOrder(descriptors[0]!);
    });
    expect(() => verifyGreaterRealmRuntimeReleaseArtifacts(reversedChunkDescriptor))
      .toThrow('GREATER_REALM_RUNTIME_RELEASE_READ_BOUNDS_INVALID');

    const reversedLegacyBridge = fullyRehashArtifacts(artifacts, draft => {
      draft.manifest.legacyLowlandsBridge = reverseObjectKeyOrder(
        draft.manifest.legacyLowlandsBridge as Record<string, unknown>,
      );
    });
    expect(() => verifyGreaterRealmRuntimeReleaseArtifacts(reversedLegacyBridge))
      .toThrow('GREATER_REALM_RUNTIME_RELEASE_REGION_INVALID');

    const reversedLegacyCounts = fullyRehashArtifacts(artifacts, draft => {
      const bridge = draft.manifest.legacyLowlandsBridge as Record<string, unknown>;
      bridge.mappedResourceCatalogCounts = reverseObjectKeyOrder(
        bridge.mappedResourceCatalogCounts as Record<string, unknown>,
      );
    });
    expect(() => verifyGreaterRealmRuntimeReleaseArtifacts(reversedLegacyCounts))
      .toThrow('GREATER_REALM_RUNTIME_RELEASE_REGION_INVALID');
  });

  it('rejects fully rehashed chunks whose raw core rows are not ordinal-contiguous', () => {
    const swappedCoreRows = fullyRehashArtifacts(artifacts, draft => {
      const cells = draft.chunks[0]!.payload.cells as unknown[];
      [cells[0], cells[1]] = [cells[1], cells[0]];
    });
    expect(() => verifyGreaterRealmRuntimeReleaseArtifacts(swappedCoreRows))
      .toThrow('GREATER_REALM_RUNTIME_RELEASE_CHUNK_INVALID');
  });

  it('rejects a fully rehashed castle slot moved to a foreign core chunk', () => {
    const foreignSlot = fullyRehashArtifacts(artifacts, draft => {
      const donor = draft.chunks.find(chunk => (
        (chunk.payload.castleSlots as unknown[]).length > 0
      ))!;
      const donorRows = donor.payload.castleSlots as Array<Record<string, unknown>>;
      const slot = donorRows.shift()!;
      const target = draft.chunks.find(chunk => (
        chunk !== donor
        && (chunk.payload.castleSlots as unknown[]).length
          < GREATER_REALM_RUNTIME_MAXIMUM_CHUNK_CASTLE_SLOTS
        && !(chunk.payload.cells as Array<Record<string, unknown>>)
          .some(cell => cell.cellKey === slot.cellKey)
      ))!;
      (target.payload.castleSlots as Array<Record<string, unknown>>).push(slot);
    });
    expect(() => verifyGreaterRealmRuntimeReleaseArtifacts(foreignSlot))
      .toThrow('GREATER_REALM_RUNTIME_RELEASE_CHUNK_INVALID');
  });

  it('rejects a fully rehashed resource node moved to a foreign core chunk', () => {
    const foreignResource = fullyRehashArtifacts(artifacts, draft => {
      const donor = draft.chunks.find(chunk => (
        (chunk.payload.resourceNodes as unknown[]).length > 0
      ))!;
      const donorRows = donor.payload.resourceNodes as Array<Record<string, unknown>>;
      const node = donorRows.shift()!;
      const target = draft.chunks.find(chunk => {
        if (chunk === donor) return false;
        const targetNodes = chunk.payload.resourceNodes as Array<Record<string, unknown>>;
        return targetNodes.length < GREATER_REALM_RUNTIME_MAXIMUM_CHUNK_RESOURCE_NODES
          && new Set(targetNodes.map(row => row.locationId)).size
            < GREATER_REALM_RUNTIME_MAXIMUM_CHUNK_RESOURCE_LOCATIONS
          && !(chunk.payload.cells as Array<Record<string, unknown>>)
            .some(cell => cell.cellKey === node.cellKey);
      })!;
      (target.payload.resourceNodes as Array<Record<string, unknown>>).push(node);
    });
    expect(() => verifyGreaterRealmRuntimeReleaseArtifacts(foreignResource))
      .toThrow('GREATER_REALM_RUNTIME_RELEASE_CHUNK_INVALID');
  });

  it('rejects rehashed route-closure and resource-count tampering', () => {
    const closureChunkIndex = artifacts.chunks.findIndex(chunk => (
      chunk.payload.cells.some(cell => cell.routeDepth === 1)
    ));
    const closureTampered = mutateAndRehashChunk(artifacts, closureChunkIndex, payload => {
      const cell = (payload.cells as Array<Record<string, unknown>>)
        .find(candidate => candidate.routeDepth === 1)!;
      cell.routeDepth = 3;
    });
    expect(() => verifyGreaterRealmRuntimeReleaseArtifacts(closureTampered))
      .toThrow('GREATER_REALM_RUNTIME_RELEASE_COMPONENT_CLOSURE_INVALID');

    const countChunkIndex = artifacts.chunks.findIndex(chunk => (
      chunk.payload.resourceNodes.length > 0
    ));
    const countTampered = mutateAndRehashChunk(artifacts, countChunkIndex, payload => {
      (payload.resourceNodes as unknown[]).pop();
    });
    expect(() => verifyGreaterRealmRuntimeReleaseArtifacts(countTampered))
      .toThrow('GREATER_REALM_RUNTIME_RELEASE_COUNT_INVALID');
  });

  it('rejects fully rehashed split and cross-group resource location reuse', () => {
    const splitLocation = fullyRehashArtifacts(artifacts, draft => {
      const entries = draft.chunks.flatMap(chunk => (
        (chunk.payload.resourceNodes as Array<Record<string, unknown>>)
          .map(node => ({ chunk, node }))
      )).sort((first, second) => (
        Number(first.node.releaseOrdinal) - Number(second.node.releaseOrdinal)
      ));
      let first: Record<string, unknown> | undefined;
      let target: Record<string, unknown> | undefined;
      for (let firstIndex = 0; firstIndex < entries.length && target === undefined; firstIndex += 1) {
        const candidate = entries[firstIndex]!;
        let sawDifferentLocation = false;
        for (let index = firstIndex + 1; index < entries.length; index += 1) {
          const next = entries[index]!;
          if (
            next.node.componentKey !== candidate.node.componentKey
            || next.node.regionId !== candidate.node.regionId
            || next.node.resourceKind !== candidate.node.resourceKind
          ) break;
          if (
            sawDifferentLocation
            && next.chunk === candidate.chunk
            && next.node.locationId !== candidate.node.locationId
          ) {
            first = candidate.node;
            target = next.node;
            break;
          }
          if (next.node.locationId !== candidate.node.locationId) sawDifferentLocation = true;
        }
      }
      if (first === undefined || target === undefined) {
        throw new Error('GREATER_REALM_RUNTIME_RELEASE_TEST_SPLIT_LOCATION_FIXTURE_MISSING');
      }
      for (const key of [
        'locationId',
        'cellKey',
        'regionId',
        'componentKey',
        'resourceKind',
        'policyVersion',
      ]) target[key] = first[key];
      if (first.legacyCatalogId === undefined) delete target.legacyCatalogId;
      else target.legacyCatalogId = first.legacyCatalogId;
      applyObjectKeyOrder(target, RUNTIME_RESOURCE_ABI_KEYS);
    });
    expect(() => verifyGreaterRealmRuntimeReleaseArtifacts(splitLocation))
      .toThrow('GREATER_REALM_RUNTIME_RELEASE_RESOURCE_LOCATION_INVALID');

    const crossGroupReuse = fullyRehashArtifacts(artifacts, draft => {
      const nodes = draft.chunks.flatMap(chunk => (
        chunk.payload.resourceNodes as Array<Record<string, unknown>>
      )).sort((first, second) => Number(first.releaseOrdinal) - Number(second.releaseOrdinal));
      const first = nodes[0]!;
      const target = nodes.find(node => (
        node.componentKey !== first.componentKey
        || node.regionId !== first.regionId
        || node.resourceKind !== first.resourceKind
      ))!;
      target.locationId = first.locationId;
    });
    expect(() => verifyGreaterRealmRuntimeReleaseArtifacts(crossGroupReuse))
      .toThrow('GREATER_REALM_RUNTIME_RELEASE_RESOURCE_LOCATION_INVALID');
  });

  it('rejects fully rehashed per-chunk slot, node, and distinct-location overflow', () => {
    const overSlots = fullyRehashArtifacts(artifacts, draft => {
      const target = draft.chunks.find(chunk => (
        (chunk.payload.castleSlots as unknown[]).length === 0
      ))!;
      const targetRows = target.payload.castleSlots as unknown[];
      for (const donor of draft.chunks) {
        if (donor === target) continue;
        const rows = donor.payload.castleSlots as unknown[];
        while (
          rows.length > 0
          && targetRows.length <= GREATER_REALM_RUNTIME_MAXIMUM_CHUNK_CASTLE_SLOTS
        ) targetRows.push(rows.shift()!);
      }
    });
    expect(() => verifyGreaterRealmRuntimeReleaseArtifacts(overSlots))
      .toThrow('GREATER_REALM_RUNTIME_RELEASE_CHUNK_INVALID');

    const overNodes = fullyRehashArtifacts(artifacts, draft => {
      const target = draft.chunks.find(chunk => (
        (chunk.payload.resourceNodes as unknown[]).length === 0
      ))!;
      const targetRows = target.payload.resourceNodes as unknown[];
      for (const donor of draft.chunks) {
        if (donor === target) continue;
        const rows = donor.payload.resourceNodes as unknown[];
        while (
          rows.length > 0
          && targetRows.length <= GREATER_REALM_RUNTIME_MAXIMUM_CHUNK_RESOURCE_NODES
        ) targetRows.push(rows.shift()!);
      }
    });
    expect(() => verifyGreaterRealmRuntimeReleaseArtifacts(overNodes))
      .toThrow('GREATER_REALM_RUNTIME_RELEASE_CHUNK_INVALID');

    const overLocations = fullyRehashArtifacts(artifacts, draft => {
      const target = draft.chunks.find(chunk => (
        (chunk.payload.resourceNodes as unknown[]).length === 0
      ))!;
      const targetRows = target.payload.resourceNodes as Array<Record<string, unknown>>;
      const seen = new Set<string>();
      for (const donor of draft.chunks) {
        if (donor === target) continue;
        const rows = donor.payload.resourceNodes as Array<Record<string, unknown>>;
        for (let index = 0; index < rows.length && (
          seen.size <= GREATER_REALM_RUNTIME_MAXIMUM_CHUNK_RESOURCE_LOCATIONS
        );) {
          const locationId = String(rows[index]!.locationId);
          if (seen.has(locationId)) {
            index += 1;
          } else {
            seen.add(locationId);
            targetRows.push(rows.splice(index, 1)[0]!);
          }
        }
      }
    });
    expect(() => verifyGreaterRealmRuntimeReleaseArtifacts(overLocations))
      .toThrow('GREATER_REALM_RUNTIME_RELEASE_CHUNK_INVALID');

    const files = new Map<string, Buffer>([
      [`${GREATER_REALM_RUNTIME_RELEASE_DIRECTORY}/import-manifest.json`, overNodes.manifestBytes],
      [`${GREATER_REALM_RUNTIME_RELEASE_DIRECTORY}/status.json`, overNodes.statusBytes],
      ...overNodes.chunks.map(chunk => [
        `${GREATER_REALM_RUNTIME_RELEASE_DIRECTORY}/${chunk.path}`,
        chunk.bytes,
      ] as const),
    ]);
    const bounded = readOnlyWorkspace(files);
    expect(() => readGreaterRealmRuntimeRelease(bounded.workspace))
      .toThrow('GREATER_REALM_RUNTIME_RELEASE_READ_BOUNDS_INVALID');
  });

  it('rejects fully rehashed Lowlands lock substitutions and valid-field reclassification', () => {
    const canonicalKeys = new Set(GREATER_REALM_RUNTIME_RELEASE_FIXTURE_LOWLANDS_TILE_KEYS);
    const alteredField = fullyRehashArtifacts(artifacts, draft => {
      const cell = draft.chunks.flatMap(chunk => (
        chunk.payload.cells as Array<Record<string, unknown>>
      )).find(candidate => (
        candidate.regionId === 'T1_LOWLANDS'
        && canonicalKeys.has(`${candidate.localQ},${candidate.localR}`)
      ))!;
      cell.biomeClass = cell.biomeClass === 0 ? 1 : 0;
    });
    expect(() => verifyGreaterRealmRuntimeReleaseArtifacts(alteredField))
      .toThrow('GREATER_REALM_RUNTIME_RELEASE_LOWLANDS_CLASSIFICATION_INVALID');

    const replacedCoordinate = fullyRehashArtifacts(artifacts, draft => {
      const used = new Set(draft.chunks.flatMap(chunk => [
        ...(chunk.payload.castleSlots as Array<Record<string, unknown>>).map(slot => slot.cellKey),
        ...(chunk.payload.resourceNodes as Array<Record<string, unknown>>).map(node => node.cellKey),
      ]));
      const roots = new Set((draft.manifest.components as Array<Record<string, unknown>>)
        .map(component => component.rootCellKey));
      const cell = draft.chunks.flatMap(chunk => (
        chunk.payload.cells as Array<Record<string, unknown>>
      )).find(candidate => (
        candidate.regionId === 'T1_LOWLANDS'
        && canonicalKeys.has(`${candidate.localQ},${candidate.localR}`)
        && !used.has(candidate.cellKey)
        && !roots.has(candidate.cellKey)
      ))!;
      const oldKey = String(cell.cellKey);
      cell.localQ = Number(cell.localQ) + 1_000_000;
      cell.localR = Number(cell.localR) - 1_000_000;
      const newKey = `T1_LOWLANDS:${cell.localQ}:${cell.localR}`;
      cell.cellKey = newKey;
      for (const chunk of draft.chunks) {
        for (const key of ['apronCellKeys', 'lod1CellKeys', 'lod2CellKeys', 'lod3CellKeys']) {
          chunk.payload[key] = (chunk.payload[key] as string[])
            .map(value => value === oldKey ? newKey : value);
        }
      }
    });
    expect(() => verifyGreaterRealmRuntimeReleaseArtifacts(replacedCoordinate))
      .toThrow('GREATER_REALM_RUNTIME_RELEASE_LOWLANDS_GEOMETRY_INVALID');

    const alteredYield = fullyRehashArtifacts(artifacts, draft => {
      const cell = draft.chunks.flatMap(chunk => (
        chunk.payload.cells as Array<Record<string, unknown>>
      )).find(candidate => (
        candidate.regionId === 'T1_LOWLANDS'
        && canonicalKeys.has(`${candidate.localQ},${candidate.localR}`)
        && candidate.passable === true
      ))!;
      cell.yieldClass = cell.yieldClass === 1 ? 2 : 1;
    });
    expect(() => verifyGreaterRealmRuntimeReleaseArtifacts(alteredYield))
      .toThrow('GREATER_REALM_RUNTIME_RELEASE_LOWLANDS_CLASSIFICATION_INVALID');

    const alteredDryHydrology = fullyRehashArtifacts(artifacts, draft => {
      const cell = draft.chunks.flatMap(chunk => (
        chunk.payload.cells as Array<Record<string, unknown>>
      )).find(candidate => (
        candidate.regionId === 'T1_LOWLANDS'
        && canonicalKeys.has(`${candidate.localQ},${candidate.localR}`)
        && candidate.hydroRegime === GREATER_REALM_WATER_REGIME_ID.DRY
      ))!;
      cell.hydroSurfaceMilli = 0;
      cell.hydrologyRevision = 1;
    });
    expect(() => verifyGreaterRealmRuntimeReleaseArtifacts(alteredDryHydrology))
      .toThrow('GREATER_REALM_RUNTIME_RELEASE_LOWLANDS_CLASSIFICATION_INVALID');

    const alteredPassability = fullyRehashArtifacts(artifacts, draft => {
      const cells = draft.chunks.flatMap(chunk => (
        chunk.payload.cells as Array<Record<string, unknown>>
      ));
      const byAtlas = new Map(cells.map(cell => [
        `${cell.atlasQ},${cell.atlasR}`,
        cell,
      ] as const));
      const riverKeys = new Set(
        GREATER_REALM_PRIVATE_LEGACY_LOWLANDS_PATCH_V1.water.enabledCells
          .filter(water => water.regime === 'river')
          .map(water => water.cellKey),
      );
      const directions = [[1, 0], [1, -1], [0, -1], [-1, 0], [-1, 1], [0, 1]];
      let selected: Record<string, unknown> | undefined;
      let parent: Record<string, unknown> | undefined;
      let parentDirection = -1;
      for (const cell of cells) {
        if (
          cell.regionId !== 'T1_LOWLANDS'
          || !riverKeys.has(`${cell.localQ},${cell.localR}`)
          || cell.passable !== false
        ) continue;
        for (let direction = 0; direction < directions.length; direction += 1) {
          const delta = directions[direction]!;
          const neighbor = byAtlas.get(
            `${Number(cell.atlasQ) + delta[0]!},${Number(cell.atlasR) + delta[1]!}`,
          );
          if (neighbor?.passable === true && Number(neighbor.routeDepth) < 4_096) {
            selected = cell;
            parent = neighbor;
            parentDirection = direction;
            break;
          }
        }
        if (selected !== undefined) break;
      }
      if (selected === undefined || parent === undefined || parentDirection < 0) {
        throw new Error('GREATER_REALM_RUNTIME_RELEASE_TEST_PASSABILITY_FIXTURE_MISSING');
      }
      selected.passable = true;
      selected.travelClass = GREATER_REALM_ROUTE_CLASS.FORD;
      selected.componentKey = parent.componentKey;
      selected.routeDepth = Number(parent.routeDepth) + 1;
      selected.routeParentDirection = parentDirection;
      applyObjectKeyOrder(selected, RUNTIME_CELL_ABI_KEYS);
    });
    expect(() => verifyGreaterRealmRuntimeReleaseArtifacts(alteredPassability))
      .toThrow('GREATER_REALM_RUNTIME_RELEASE_LOWLANDS_CLASSIFICATION_INVALID');

    const alteredWaterBody = fullyRehashArtifacts(artifacts, draft => {
      const cells = draft.chunks.flatMap(chunk => (
        chunk.payload.cells as Array<Record<string, unknown>>
      ));
      const waters = GREATER_REALM_PRIVATE_LEGACY_LOWLANDS_PATCH_V1.water.enabledCells;
      const first = waters[0]!;
      const other = waters.find(water => water.bodyId !== first.bodyId)!;
      const firstCell = cells.find(cell => (
        cell.regionId === 'T1_LOWLANDS'
        && `${cell.localQ},${cell.localR}` === first.cellKey
      ))!;
      const otherCell = cells.find(cell => (
        cell.regionId === 'T1_LOWLANDS'
        && `${cell.localQ},${cell.localR}` === other.cellKey
      ))!;
      firstCell.hydroBodyId = otherCell.hydroBodyId;
    });
    expect(() => verifyGreaterRealmRuntimeReleaseArtifacts(alteredWaterBody))
      .toThrow('GREATER_REALM_RUNTIME_RELEASE_LOWLANDS_WATER_INVALID');

    const alteredWaterDirection = fullyRehashArtifacts(artifacts, draft => {
      const internal = GREATER_REALM_PRIVATE_LEGACY_LOWLANDS_PATCH_V1.water.enabledCells
        .find(water => water.downstreamWaterCellKey !== undefined)!;
      const cell = draft.chunks.flatMap(chunk => (
        chunk.payload.cells as Array<Record<string, unknown>>
      )).find(candidate => (
        candidate.regionId === 'T1_LOWLANDS'
        && `${candidate.localQ},${candidate.localR}` === internal.cellKey
      ))!;
      cell.hydroFlowDirection = (Number(cell.hydroFlowDirection) + 1) % 6;
    });
    expect(() => verifyGreaterRealmRuntimeReleaseArtifacts(alteredWaterDirection))
      .toThrow('GREATER_REALM_RUNTIME_RELEASE_LOWLANDS_WATER_INVALID');
  });

  it('rejects a fully rehashed river-to-stream transition that otherwise closes', () => {
    const invalidTransition = fullyRehashArtifacts(artifacts, draft => {
      const cells = draft.chunks.flatMap(chunk => (
        chunk.payload.cells as Array<Record<string, unknown>>
      ));
      const byAtlas = new Map(cells.map(cell => [
        `${cell.atlasQ},${cell.atlasR}`,
        cell,
      ] as const));
      const river = cells.find(cell => (
        cell.regionId !== 'T1_LOWLANDS'
        && cell.hydroRegime === GREATER_REALM_WATER_REGIME_ID.RIVER
        && cell.hydroFlowDirection !== undefined
      ))!;
      const directions = [[1, 0], [1, -1], [0, -1], [-1, 0], [-1, 1], [0, 1]];
      const riverDelta = directions[Number(river.hydroFlowDirection)]!;
      const stream = byAtlas.get(
        `${Number(river.atlasQ) + riverDelta[0]!},${Number(river.atlasR) + riverDelta[1]!}`,
      )!;
      const standingWater = directions.map((delta, direction) => ({
        direction,
        cell: byAtlas.get(
          `${Number(stream.atlasQ) + delta[0]!},${Number(stream.atlasR) + delta[1]!}`,
        ),
      })).find(candidate => (
        candidate.cell !== undefined
        && candidate.cell !== river
        && candidate.cell.hydroRegime === GREATER_REALM_WATER_REGIME_ID.LAKE
      ))!;
      stream.hydroRegime = GREATER_REALM_WATER_REGIME_ID.STREAM;
      stream.hydroBodyId = `GRW-${'A'.repeat(26)}`;
      stream.hydroFlowDirection = standingWater.direction;
      stream.hydroSurfaceMilli = 100;
      stream.flowAccumulation = '2';
      standingWater.cell!.hydroSurfaceMilli = 90;
      standingWater.cell!.flowAccumulation = '3';
      applyObjectKeyOrder(stream, RUNTIME_CELL_ABI_KEYS);
    });
    expect(() => verifyGreaterRealmRuntimeReleaseArtifacts(invalidTransition))
      .toThrow('GREATER_REALM_RUNTIME_RELEASE_HYDROLOGY_FLOW_INVALID');
  });

  it('rejects fully rehashed slot relocation, per-region skew, and omission', () => {
    const legacyRelocated = fullyRehashArtifacts(artifacts, draft => {
      const slots = draft.chunks.flatMap(chunk => (
        chunk.payload.castleSlots as Array<Record<string, unknown>>
      ));
      const lowlands = slots.find(slot => slot.legacySlotId !== undefined)!;
      const nonLowlands = slots.find(slot => slot.regionId !== 'T1_LOWLANDS')!;
      const legacySlotId = lowlands.legacySlotId;
      delete lowlands.legacySlotId;
      nonLowlands.legacySlotId = legacySlotId;
    });
    expect(() => verifyGreaterRealmRuntimeReleaseArtifacts(legacyRelocated))
      .toThrow('GREATER_REALM_RUNTIME_RELEASE_SLOT_INVALID');

    const regionRelocated = fullyRehashArtifacts(artifacts, draft => {
      const cells = draft.chunks.flatMap(chunk => (
        chunk.payload.cells as Array<Record<string, unknown>>
      ));
      const cellByKey = new Map(cells.map(cell => [String(cell.cellKey), cell] as const));
      const slots = draft.chunks.flatMap(chunk => (
        chunk.payload.castleSlots as Array<Record<string, unknown>>
      ));
      const occupied = new Set(slots.map(slot => slot.cellKey));
      const moved = slots.find(slot => slot.regionId === 'T1_FROSTMERE')!;
      const target = cells.find(cell => (
        cell.regionId === 'T1_SUNSCAR'
        && cell.passable === true
        && cell.hydroRegime === GREATER_REALM_WATER_REGIME_ID.DRY
        && !occupied.has(cell.cellKey)
      ))!;
      moved.cellKey = target.cellKey;
      moved.regionId = target.regionId;
      moved.componentKey = target.componentKey;
      slots.sort((first, second) => (
        Number(cellByKey.get(String(first.cellKey))!.releaseOrdinal)
        - Number(cellByKey.get(String(second.cellKey))!.releaseOrdinal)
      ));
      slots.forEach((slot, index) => { slot.releaseOrdinal = index; });
    });
    expect(() => verifyGreaterRealmRuntimeReleaseArtifacts(regionRelocated))
      .toThrow('GREATER_REALM_RUNTIME_RELEASE_READ_BOUNDS_INVALID');

    const omitted = fullyRehashArtifacts(artifacts, draft => {
      const chunk = draft.chunks.find(candidate => (
        (candidate.payload.castleSlots as unknown[]).length > 0
      ))!;
      (chunk.payload.castleSlots as unknown[]).pop();
    });
    expect(() => verifyGreaterRealmRuntimeReleaseArtifacts(omitted))
      .toThrow('GREATER_REALM_RUNTIME_RELEASE_READ_BOUNDS_INVALID');
  });

  it('bounds manifest bytes, descriptor counts, aggregates, and cumulative artifact bytes', () => {
    const oversizedManifest = Buffer.alloc(
      greaterRealmRuntimeReleaseTestSeams.maximumRuntimeManifestBytes + 1,
      0x20,
    );
    const oversizedRead = vi.fn(() => oversizedManifest);
    const oversizedWorkspace = Object.freeze({
      readFile: oversizedRead,
    }) as unknown as GreaterRealmPrivateWorkspace;
    expect(() => readGreaterRealmRuntimeRelease(oversizedWorkspace))
      .toThrow('GREATER_REALM_RUNTIME_RELEASE_READ_BOUNDS_INVALID');
    expect(oversizedRead).toHaveBeenCalledTimes(1);
    expect(oversizedRead).toHaveBeenCalledWith(
      `${GREATER_REALM_RUNTIME_RELEASE_DIRECTORY}/import-manifest.json`,
      greaterRealmRuntimeReleaseTestSeams.maximumRuntimeManifestBytes,
    );

    const descriptorOverflow = JSON.parse(JSON.stringify(artifacts.manifest)) as Record<string, unknown>;
    const seedDescriptor = (descriptorOverflow.chunks as Array<Record<string, unknown>>)[0]!;
    descriptorOverflow.chunks = Array.from(
      { length: greaterRealmRuntimeReleaseTestSeams.maximumRuntimeChunks + 1 },
      (_, importOrdinal) => ({ ...seedDescriptor, importOrdinal }),
    );
    (descriptorOverflow.totals as Record<string, unknown>).chunkCount =
      greaterRealmRuntimeReleaseTestSeams.maximumRuntimeChunks + 1;
    const descriptorFiles = new Map<string, Buffer>([[
      `${GREATER_REALM_RUNTIME_RELEASE_DIRECTORY}/import-manifest.json`,
      greaterRealmRuntimeReleaseTestSeams.canonicalBytes(descriptorOverflow),
    ]]);
    const descriptorWorkspace = readOnlyWorkspace(descriptorFiles);
    expect(() => readGreaterRealmRuntimeRelease(descriptorWorkspace.workspace))
      .toThrow('GREATER_REALM_RUNTIME_RELEASE_READ_BOUNDS_INVALID');
    expect(descriptorWorkspace.readFile).toHaveBeenCalledTimes(1);

    const aggregateOverflow = JSON.parse(JSON.stringify(artifacts.manifest)) as Record<string, unknown>;
    (aggregateOverflow.totals as Record<string, unknown>).cellCount = 150_001;
    const aggregateFiles = new Map<string, Buffer>([[
      `${GREATER_REALM_RUNTIME_RELEASE_DIRECTORY}/import-manifest.json`,
      greaterRealmRuntimeReleaseTestSeams.canonicalBytes(aggregateOverflow),
    ]]);
    const aggregateWorkspace = readOnlyWorkspace(aggregateFiles);
    expect(() => readGreaterRealmRuntimeRelease(aggregateWorkspace.workspace))
      .toThrow('GREATER_REALM_RUNTIME_RELEASE_READ_BOUNDS_INVALID');
    expect(aggregateWorkspace.readFile).toHaveBeenCalledTimes(1);

    const maximumChunk = Buffer.alloc(
      greaterRealmRuntimeReleaseTestSeams.maximumRuntimeChunkBytes,
    );
    const cumulativeOverflow = Object.freeze({
      ...artifacts,
      chunks: Object.freeze(Array.from({ length: 129 }, (_, index) => Object.freeze({
        ...artifacts.chunks[0]!,
        path: `chunks/overflow-${index}.json`,
        bytes: maximumChunk,
      }))),
    });
    expect(129 * maximumChunk.byteLength).toBeGreaterThan(
      greaterRealmRuntimeReleaseTestSeams.maximumRuntimeReleaseBytes,
    );
    expect(() => verifyGreaterRealmRuntimeReleaseArtifacts(cumulativeOverflow))
      .toThrow('GREATER_REALM_RUNTIME_RELEASE_READ_BOUNDS_INVALID');
  });

  it('persists a 0600 seed control before a 0700 release and makes exact retries idempotent', async () => {
    const root = mkdtempSync(join(tmpdir(), 'warpkeep-runtime-release-'));
    temporaryRoots.push(root);
    const repositoryRoot = join(root, 'repository');
    const workspaceRoot = join(root, 'private-workspace');
    mkdirSync(repositoryRoot, { mode: 0o700 });
    const workspace = openGreaterRealmPrivateWorkspace({ repositoryRoot, workspaceRoot });
    const firstSeed = openOrCreateGreaterRealmRuntimeReleaseSeed(workspace);
    const firstSeedCopy = Buffer.from(firstSeed);
    const controlledArtifacts = createGreaterRealmRuntimeRelease({
      source,
      sourceCommit: GREATER_REALM_RUNTIME_RELEASE_FIXTURE_SOURCE_COMMIT,
      releaseSeed: firstSeed,
    });
    firstSeed.fill(0);
    const replaySeed = openOrCreateGreaterRealmRuntimeReleaseSeed(workspace);
    expect(replaySeed).toEqual(firstSeedCopy);
    replaySeed.fill(0);
    firstSeedCopy.fill(0);
    await expect(writeGreaterRealmRuntimeRelease({ workspace, artifacts: controlledArtifacts }))
      .resolves.toBe('installed');
    await expect(writeGreaterRealmRuntimeRelease({ workspace, artifacts: controlledArtifacts }))
      .resolves.toBe('unchanged');
    const installed = readGreaterRealmRuntimeRelease(workspace);
    expect(installed.manifestBytes).toEqual(controlledArtifacts.manifestBytes);
    expect(statSync(workspaceRoot).mode & 0o777).toBe(0o700);
    expect(statSync(join(workspaceRoot, GREATER_REALM_RUNTIME_RELEASE_SEED_CONTROL_PATH)).mode & 0o777)
      .toBe(0o600);
    expect(statSync(join(workspaceRoot, GREATER_REALM_RUNTIME_RELEASE_DIRECTORY)).mode & 0o777)
      .toBe(0o700);
  });

  it('rejects a stale release from another selected candidate at the same C0', async () => {
    const root = mkdtempSync(join(tmpdir(), 'warpkeep-runtime-release-stale-batch-'));
    temporaryRoots.push(root);
    const repositoryRoot = join(root, 'repository');
    const workspaceRoot = join(root, 'private-workspace');
    mkdirSync(repositoryRoot, { mode: 0o700 });
    const workspace = openGreaterRealmPrivateWorkspace({ repositoryRoot, workspaceRoot });
    const secondCandidate = createGreaterRealmRuntimeReleaseFixtureSource();
    const seed = openOrCreateGreaterRealmRuntimeReleaseSeed(workspace);
    let selectedRelease: GreaterRealmRuntimeReleaseArtifacts | undefined;
    let staleForSelection: GreaterRealmRuntimeReleaseArtifacts | undefined;
    try {
      const changedCell = secondCandidate.regionId.findIndex(region => region === 1);
      expect(changedCell).toBeGreaterThanOrEqual(0);
      secondCandidate.vegetationDensity[changedCell] =
        secondCandidate.vegetationDensity[changedCell] === 255 ? 0 : 255;
      staleForSelection = createGreaterRealmRuntimeRelease({
        source,
        sourceCommit: GREATER_REALM_RUNTIME_RELEASE_FIXTURE_SOURCE_COMMIT,
        releaseSeed: seed,
      });
      selectedRelease = createGreaterRealmRuntimeRelease({
        source: secondCandidate,
        sourceCommit: GREATER_REALM_RUNTIME_RELEASE_FIXTURE_SOURCE_COMMIT,
        releaseSeed: seed,
      });
      expect(staleForSelection.manifest.sourceCommit)
        .toBe(selectedRelease.manifest.sourceCommit);
      expect(staleForSelection.manifest.generatorVersion)
        .toBe(selectedRelease.manifest.generatorVersion);
      expect(staleForSelection.chunks.map(chunk => chunk.bytes))
        .not.toEqual(selectedRelease.chunks.map(chunk => chunk.bytes));
      await expect(writeGreaterRealmRuntimeRelease({
        workspace,
        artifacts: staleForSelection,
      })).resolves.toBe('installed');
      expect(() => assertGreaterRealmRuntimeReleaseMatches(workspace, staleForSelection!))
        .not.toThrow();
      expect(() => assertGreaterRealmRuntimeReleaseMatches(workspace, selectedRelease!))
        .toThrow('GREATER_REALM_RUNTIME_RELEASE_REPLAY_MISMATCH');
    } finally {
      seed.fill(0);
      secondCandidate.grid.clearIndex?.();
      for (const release of [selectedRelease, staleForSelection]) {
        release?.manifestBytes.fill(0);
        release?.statusBytes.fill(0);
        for (const chunk of release?.chunks ?? []) chunk.bytes.fill(0);
      }
    }
  });

  it('fails closed when publication lacks its separate seed control', async () => {
    const root = mkdtempSync(join(tmpdir(), 'warpkeep-runtime-release-no-control-'));
    temporaryRoots.push(root);
    const repositoryRoot = join(root, 'repository');
    const workspaceRoot = join(root, 'private-workspace');
    mkdirSync(repositoryRoot, { mode: 0o700 });
    const workspace = openGreaterRealmPrivateWorkspace({ repositoryRoot, workspaceRoot });
    await expect(writeGreaterRealmRuntimeRelease({ workspace, artifacts }))
      .rejects.toThrow('GREATER_REALM_RUNTIME_RELEASE_SEED_CONTROL_MISSING');
  });
});
