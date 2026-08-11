import {
  GREATER_REALM_AMBIENCE_CLASS,
  GREATER_REALM_HABITAT_CLASS,
  GREATER_REALM_HYDRO_REGIME,
  GREATER_REALM_PROTOCOL_VERSION,
  GREATER_REALM_RENDERER_CONTRACT_VERSION,
  GREATER_REALM_TRAVEL_CLASS,
  createGreaterRealmChunkRequest,
  createGreaterRealmResourceLocationRequest,
  createGreaterRealmRoutePlanRequest,
  createGreaterRealmWindowRequest,
  decodeGreaterRealmBootstrapDto,
  decodeGreaterRealmChunkDto,
  decodeGreaterRealmResourceLocationBatchDto,
  decodeGreaterRealmRoutePageDto,
  decodeGreaterRealmWindowDto,
  type GreaterRealmChunkDto,
  type GreaterRealmLod,
  type GreaterRealmPublicCellDto
} from '../greater-realm/greaterRealmPublicContract';
import type { GreaterRealmPublicTransport } from '../greater-realm/greaterRealmTransport';

export const GREATER_REALM_SYNTHETIC_REVISION = 1n;
export const GREATER_REALM_SYNTHETIC_CELL_SIZE = 1;

const ATLAS_ID = 'greater.realm.synthetic.v17';
const CHUNK_WEST = 'GRK-AAAAAAAAAAAAAAAAAAAAAAAAAA';
const CHUNK_EAST = 'GRK-BBBBBBBBBBBBBBBBBBBBBBBBBB';
const WATER_RIVER = 'GRW-AAAAAAAAAAAAAAAAAAAAAAAAAA';
const WATER_OCEAN = 'GRW-BBBBBBBBBBBBBBBBBBBBBBBBBB';

type CellSpec = Readonly<{
  atlasQ: number;
  atlasR: number;
  owner: typeof CHUNK_WEST | typeof CHUNK_EAST;
  passable?: boolean;
  water?: 'river' | 'stream' | 'ocean';
  depth?: number;
  flowDirection?: number;
  flow?: bigint;
  travel?: GreaterRealmPublicCellDto['travelClass'];
  sealedBoundaryMask?: number;
  ambience?: number;
  presentationVariant?: number;
}>;

function cellKey(atlasQ: number, atlasR: number) {
  return `T1_LOWLANDS:${atlasQ}:${atlasR}`;
}

function createCell(spec: CellSpec): GreaterRealmPublicCellDto {
  const water = spec.water;
  const passable = spec.passable ?? water === undefined;
  const hydroRegime = water === 'river'
    ? GREATER_REALM_HYDRO_REGIME.RIVER
    : water === 'stream'
      ? GREATER_REALM_HYDRO_REGIME.STREAM
      : water === 'ocean'
        ? GREATER_REALM_HYDRO_REGIME.OCEAN
        : GREATER_REALM_HYDRO_REGIME.DRY;
  return Object.freeze({
    cellKey: cellKey(spec.atlasQ, spec.atlasR),
    chunkHandle: spec.owner,
    regionId: 'T1_LOWLANDS',
    atlasQ: spec.atlasQ,
    atlasR: spec.atlasR,
    tier: 1,
    passable,
    elevation: 90 + (spec.atlasR + 2) * 14 + Math.abs(spec.atlasQ) * 7,
    slope: Math.abs(spec.atlasQ * 173 + spec.atlasR * 211) % 4_000,
    aspect: ((spec.atlasQ - spec.atlasR) % 6 + 6) % 6,
    profileCurvature: spec.atlasQ * 19 - spec.atlasR * 13,
    planCurvature: spec.atlasR * 17 - spec.atlasQ * 11,
    geologicalBarrierBand: passable ? 0 : water === undefined ? 2 : 0,
    biomeClass: water === 'ocean' ? 20 : spec.atlasR < 0 ? 8 : 3,
    landformClass: water === 'ocean' ? 4 : spec.atlasR > 1 ? 7 : 2,
    yieldClass: passable ? 2 : 0,
    movementCost: passable ? 80 + Math.abs(spec.atlasQ) * 4 : 1_000_000,
    sealedBoundaryMask: spec.sealedBoundaryMask ?? 0,
    hydroRegime,
    ...(water === undefined
      ? {}
      : { hydroBodyId: water === 'ocean' ? WATER_OCEAN : WATER_RIVER }),
    hydroDepthClass: water === undefined ? 0 : spec.depth ?? 1,
    hydroSurfaceMilli: water === undefined ? 110 : 124,
    ...(spec.flowDirection === undefined ? {} : { hydroFlowDirection: spec.flowDirection }),
    flowAccumulation: water === undefined ? 0n : spec.flow ?? 64n,
    bankVariant: water === undefined ? 0 : (17 + spec.atlasQ * 31 + spec.atlasR * 7) >>> 0,
    hydrologyRevision: water === undefined ? 0 : 1,
    travelClass: spec.travel ?? GREATER_REALM_TRAVEL_CLASS.NONE,
    wetness: water === undefined ? 3_500 : 10_000,
    exposure: spec.atlasQ * 57 - spec.atlasR * 31,
    coastDistance: water === 'ocean' ? 0 : 200,
    freshwaterDistance: water === 'river' || water === 'stream' ? 0 : 90,
    temperature: 4_900 - spec.atlasR * 45,
    moisture: water === undefined ? 5_100 : 8_900,
    habitatClass: water === undefined
      ? GREATER_REALM_HABITAT_CLASS.PLAINS
      : GREATER_REALM_HABITAT_CLASS.NONE,
    canopyBasisPoints: water === undefined ? 4_200 : 0,
    groundcoverBasisPoints: water === undefined ? 7_000 : 0,
    wildflowerBasisPoints: water === undefined ? 1_400 : 0,
    featureClass: spec.atlasQ === -2 && spec.atlasR === 1 ? 3 : 0,
    ambienceClass: spec.ambience ?? GREATER_REALM_AMBIENCE_CLASS.NONE,
    presentationVariant: spec.presentationVariant
      ?? ((spec.atlasQ * 2_654_435_761 + spec.atlasR * 2_246_822_519) >>> 0)
  } satisfies GreaterRealmPublicCellDto);
}

const westCore = Object.freeze([
  createCell({ atlasQ: -3, atlasR: 0, owner: CHUNK_WEST, sealedBoundaryMask: 0b00_1000 }),
  createCell({
    atlasQ: -2, atlasR: 0, owner: CHUNK_WEST,
    travel: GREATER_REALM_TRAVEL_CLASS.TRACK,
    ambience: GREATER_REALM_AMBIENCE_CLASS.RABBIT_HABITAT
  }),
  createCell({
    atlasQ: -2, atlasR: 1, owner: CHUNK_WEST,
    travel: GREATER_REALM_TRAVEL_CLASS.ROAD,
    ambience: GREATER_REALM_AMBIENCE_CLASS.CIVILIAN_FOOTFALL
  }),
  createCell({ atlasQ: -1, atlasR: 0, owner: CHUNK_WEST }),
  createCell({
    atlasQ: -1, atlasR: 1, owner: CHUNK_WEST,
    travel: GREATER_REALM_TRAVEL_CLASS.ROAD,
    ambience: GREATER_REALM_AMBIENCE_CLASS.GUARD_POST
  }),
  createCell({ atlasQ: -1, atlasR: 2, owner: CHUNK_WEST, passable: false, sealedBoundaryMask: 0b00_0011 }),
  createCell({
    atlasQ: 0, atlasR: 1, owner: CHUNK_WEST, passable: true,
    water: 'river', depth: 1, flowDirection: 2, flow: 512n,
    travel: GREATER_REALM_TRAVEL_CLASS.FORD,
    ambience: GREATER_REALM_AMBIENCE_CLASS.COURIER_ROUTE
  })
]);

const eastCore = Object.freeze([
  createCell({
    atlasQ: 0, atlasR: 0, owner: CHUNK_EAST, passable: true,
    water: 'river', depth: 2, flowDirection: 2, flow: 2_048n,
    travel: GREATER_REALM_TRAVEL_CLASS.FORD,
    ambience: GREATER_REALM_AMBIENCE_CLASS.EXOTIC_COURIER_ROUTE
  }),
  createCell({
    atlasQ: 1, atlasR: -1, owner: CHUNK_EAST, passable: false,
    water: 'stream', depth: 2, flowDirection: 2, flow: 1_024n
  }),
  createCell({
    atlasQ: 1, atlasR: 0, owner: CHUNK_EAST,
    travel: GREATER_REALM_TRAVEL_CLASS.ROAD,
    ambience: GREATER_REALM_AMBIENCE_CLASS.CIVILIAN_FOOTFALL
  }),
  createCell({ atlasQ: 1, atlasR: 1, owner: CHUNK_EAST }),
  createCell({
    atlasQ: 2, atlasR: -1, owner: CHUNK_EAST, passable: false,
    water: 'ocean', depth: 3, sealedBoundaryMask: 0b00_0011
  }),
  createCell({
    atlasQ: 2, atlasR: 0, owner: CHUNK_EAST,
    travel: GREATER_REALM_TRAVEL_CLASS.CARRIAGEWAY,
    ambience: GREATER_REALM_AMBIENCE_CLASS.RABBIT_HABITAT
  }),
  createCell({ atlasQ: 2, atlasR: 1, owner: CHUNK_EAST, sealedBoundaryMask: 0b10_0000 })
]);

const westApron = Object.freeze([eastCore[0]!, eastCore[2]!]);
const eastApron = Object.freeze([westCore[6]!, westCore[4]!]);

type SyntheticChunkSource = Readonly<{
  handle: string;
  core: readonly GreaterRealmPublicCellDto[];
  apron: readonly GreaterRealmPublicCellDto[];
  location: Readonly<Record<string, unknown>>;
}>;

const sources: readonly SyntheticChunkSource[] = Object.freeze([
  Object.freeze({
    handle: CHUNK_WEST,
    core: westCore,
    apron: westApron,
    location: Object.freeze({
      locationId: 'GRL-AAAAAAAAAAAAAAAAAAAAAAAAAA',
      cellKey: westCore[3]!.cellKey,
      regionId: 'T1_LOWLANDS',
      atlasQ: westCore[3]!.atlasQ,
      atlasR: westCore[3]!.atlasR,
      resourceKind: 'wood',
      nodeCount: 5,
      policyVersion: 'synthetic-v1'
    })
  }),
  Object.freeze({
    handle: CHUNK_EAST,
    core: eastCore,
    apron: eastApron,
    location: Object.freeze({
      locationId: 'GRL-BBBBBBBBBBBBBBBBBBBBBBBBBB',
      cellKey: eastCore[6]!.cellKey,
      regionId: 'T1_LOWLANDS',
      atlasQ: eastCore[6]!.atlasQ,
      atlasR: eastCore[6]!.atlasR,
      resourceKind: 'stone',
      nodeCount: 4,
      policyVersion: 'synthetic-v1'
    })
  })
]);

const lodVisibleCounts = Object.freeze([9, 5, 3, 2] as const);

function createChunk(source: SyntheticChunkSource, lod: GreaterRealmLod): GreaterRealmChunkDto {
  const stableVisible = [
    source.core[0]!, source.apron[0]!, source.core[1]!, source.core[2]!,
    source.apron[1]!, ...source.core.slice(3)
  ];
  const selected = new Set(
    (lod === 0 ? [...source.core, ...source.apron] : stableVisible.slice(0, lodVisibleCounts[lod]))
      .map((cell) => cell.cellKey)
  );
  return decodeGreaterRealmChunkDto({
    atlasId: ATLAS_ID,
    revision: GREATER_REALM_SYNTHETIC_REVISION,
    chunkHandle: source.handle,
    lod,
    sourceCellCount: source.core.length,
    coreCells: source.core.filter((cell) => selected.has(cell.cellKey)),
    apronCells: source.apron.filter((cell) => selected.has(cell.cellKey)),
    resourceLocations: lod === 0 ? [source.location] : []
  });
}

const lodZeroChunks = Object.freeze(sources.map((source) => createChunk(source, 0)));
const allCells = new Map(
  [...westCore, ...eastCore].map((cell) => [cell.cellKey, cell] as const)
);
const routeCellKeys = Object.freeze([
  cellKey(-2, 1), cellKey(-1, 1), cellKey(0, 1),
  cellKey(0, 0), cellKey(1, 0), cellKey(2, 0)
]);

const regionSpecs = Object.freeze([
  ['T1_LOWLANDS', 'The Hegemony Lowlands'],
  ['T1_FROSTMERE', 'Frostmere Reach'],
  ['T1_SUNSCAR', 'Sunscar Expanse'],
  ['T1_MIREFEN', 'Mirefen Delta'],
  ['T1_STONEWAKE', 'Stonewake Isles'],
  ['T1_EMBERWOOD', 'Emberwood March']
] as const);

export const GREATER_REALM_SYNTHETIC_TIER_ONE_FIXTURE = Object.freeze({
  bootstrap: decodeGreaterRealmBootstrapDto({
    atlasId: ATLAS_ID,
    publicReleaseId: 'GRR-AAAAAAAAAAAAAAAAAAAAAAAAAA',
    name: 'Synthetic Greater Realm',
    protocolVersion: GREATER_REALM_PROTOCOL_VERSION,
    generatorVersion: 'synthetic-v1',
    runtimePartitionVersion: 'axial-bin-v1',
    rendererContractVersion: GREATER_REALM_RENDERER_CONTRACT_VERSION,
    revision: GREATER_REALM_SYNTHETIC_REVISION,
    visibleTierMax: 1,
    navigationTierMax: 1,
    foundingTierMax: 1,
    visibleRegionCount: 6,
    visibleCellCount: 600,
    visibleChunkCount: 6,
    castleCapacity: 600,
    mode: 'canary',
    regions: regionSpecs.map(([regionId, publicName], ordinal) => ({
      regionId,
      ordinal,
      publicName,
      tier: 1,
      cellCount: 100,
      passableCellCount: 80,
      chunkCount: 1,
      castleCapacity: 100,
      resourceLocationCount: 400,
      resourceNodeCount: 2_000,
      foodNodeCount: 500,
      woodNodeCount: 500,
      stoneNodeCount: 500,
      goldNodeCount: 500
    })),
    myCastleId: 1n,
    myCellKey: routeCellKeys[0]
  }),
  window: decodeGreaterRealmWindowDto({
    atlasId: ATLAS_ID,
    revision: GREATER_REALM_SYNTHETIC_REVISION,
    centerQ: 0,
    centerR: 0,
    radius: 1,
    chunks: [
      {
        chunkHandle: CHUNK_WEST,
        binQ: -1,
        binR: 0,
        coreCellCount: 7,
        apronCellCount: 2,
        lod0CellCount: 7,
        lod1CellCount: 5,
        lod2CellCount: 3,
        lod3CellCount: 2
      },
      {
        chunkHandle: CHUNK_EAST,
        binQ: 0,
        binR: 0,
        coreCellCount: 7,
        apronCellCount: 2,
        lod0CellCount: 7,
        lod1CellCount: 5,
        lod2CellCount: 3,
        lod3CellCount: 2
      }
    ]
  }),
  chunks: lodZeroChunks,
  routeCellKeys
});

function abortIfNeeded(signal: AbortSignal) {
  if (signal.aborted) throw signal.reason;
}

/** Development-only in-memory transport; it cannot activate the public app. */
export function createGreaterRealmSyntheticTransport(): GreaterRealmPublicTransport {
  return Object.freeze({
    getBootstrap: async (signal) => {
      abortIfNeeded(signal);
      return GREATER_REALM_SYNTHETIC_TIER_ONE_FIXTURE.bootstrap;
    },
    getWindow: async (requested, signal) => {
      const request = createGreaterRealmWindowRequest(requested);
      abortIfNeeded(signal);
      if (
        request.expectedRevision !== GREATER_REALM_SYNTHETIC_REVISION
        || request.centerQ !== 0
        || request.centerR !== 0
        || request.radius !== 1
      ) throw new Error('GREATER_REALM_SYNTHETIC_WINDOW_UNAVAILABLE');
      return GREATER_REALM_SYNTHETIC_TIER_ONE_FIXTURE.window;
    },
    getChunk: async (requested, signal) => {
      const request = createGreaterRealmChunkRequest(requested);
      abortIfNeeded(signal);
      const source = sources.find((entry) => entry.handle === request.chunkHandle);
      if (!source || request.expectedRevision !== GREATER_REALM_SYNTHETIC_REVISION) {
        throw new Error('GREATER_REALM_SYNTHETIC_CHUNK_UNAVAILABLE');
      }
      return createChunk(source, request.lod);
    },
    getResourceLocations: async (requested, signal) => {
      const request = createGreaterRealmResourceLocationRequest(requested);
      abortIfNeeded(signal);
      if (request.expectedRevision !== GREATER_REALM_SYNTHETIC_REVISION) {
        throw new Error('GREATER_REALM_SYNTHETIC_RESOURCE_LOCATIONS_UNAVAILABLE');
      }
      const resourceLocations = request.chunkHandles.flatMap((chunkHandle) => {
        const source = sources.find((entry) => entry.handle === chunkHandle);
        if (source === undefined) {
          throw new Error('GREATER_REALM_SYNTHETIC_RESOURCE_LOCATIONS_UNAVAILABLE');
        }
        return createChunk(source, 0).resourceLocations.map((location) => ({
          chunkHandle,
          locationId: location.locationId,
          atlasQ: location.atlasQ,
          atlasR: location.atlasR,
          resourceKind: location.resourceKind,
          nodeCount: location.nodeCount
        }));
      });
      return decodeGreaterRealmResourceLocationBatchDto({
        atlasId: ATLAS_ID,
        revision: GREATER_REALM_SYNTHETIC_REVISION,
        chunkHandles: request.chunkHandles,
        truncated: false,
        resourceLocations
      });
    },
    planRoute: async (requested, signal) => {
      const request = createGreaterRealmRoutePlanRequest(requested);
      abortIfNeeded(signal);
      if (
        request.expectedRevision !== GREATER_REALM_SYNTHETIC_REVISION
        || request.originCellKey !== routeCellKeys[0]
        || request.destinationCellKey !== routeCellKeys.at(-1)
        || request.offset >= routeCellKeys.length
      ) throw new Error('GREATER_REALM_SYNTHETIC_ROUTE_UNAVAILABLE');
      const pageKeys = routeCellKeys.slice(request.offset, request.offset + request.limit);
      const nextOffset = request.offset + pageKeys.length < routeCellKeys.length
        ? request.offset + pageKeys.length
        : undefined;
      return decodeGreaterRealmRoutePageDto({
        atlasId: ATLAS_ID,
        revision: GREATER_REALM_SYNTHETIC_REVISION,
        cells: pageKeys.map((key) => allCells.get(key)!),
        totalLength: routeCellKeys.length,
        ...(nextOffset === undefined ? {} : { nextOffset }),
        complete: nextOffset === undefined
      });
    }
  });
}
