import { useRef } from 'react';

import { GENESIS_FOREST_LAYOUT_V1_TREE_COUNT } from '../../../spacetimedb/src/forestLayoutContract';
import {
  GENESIS_WATER_REVISION_ENABLED_CELLS_V1
} from '../../../spacetimedb/src/waterRevision';
import {
  GENESIS_WATER_CELLS_V1,
  type GenesisWaterCellV1
} from '../../../spacetimedb/src/waterWorld';
import type { WarpkeepWorldTileMetadata } from '../../spacetime/warpkeepBackendTypes';
import {
  isPlayableRealmCoord,
  type RealmTerrainSurface
} from '../../game/map/realmTerrainSurface';
import type { RealmPeerCastleMarker } from './createRealmScene';
import type { RealmFoodNodePresentation } from './realmFoodNodePresentation';
import type { RealmGoldNodePresentation } from './realmGoldNodePresentation';
import type { RealmStoneNodePresentation } from './realmStoneNodePresentation';
import type { RealmWoodNodePresentation } from './realmWoodNodePresentation';

export type RealmCastleProjection = Readonly<{
  castleId: number;
  ownerFid: number;
  q: number;
  r: number;
  level: number;
  name: string;
  tileKey?: string;
  foundedAt?: number;
}>;

type RealmSceneCatalogNode = Readonly<{
  siteId: string;
  coord: Readonly<{ q: number; r: number }>;
  tier: number;
}>;

export type RealmSceneConstructionKeyInput = Readonly<{
  canonicalFingerprint: string;
  realmId: string;
  numericSeed: number;
  authoritativeRadius: number;
  renderRadius: number;
  ownCastleId: number;
  keepCoord: Readonly<{ q: number; r: number }>;
  peerCastles: readonly Readonly<{ castleId: number; q: number; r: number }>[];
  goldNodes: readonly RealmSceneCatalogNode[];
  foodNodes: readonly RealmSceneCatalogNode[];
  woodNodes: readonly RealmSceneCatalogNode[];
  stoneNodes: readonly RealmSceneCatalogNode[];
  forestSignature: string;
  waterSignature: string;
  quality: string;
  reducedMotion: boolean;
  observerMode: boolean;
}>;

function sortedCastleCatalog(
  castles: RealmSceneConstructionKeyInput['peerCastles']
) {
  return castles
    .map((castle) => [castle.castleId, castle.q, castle.r] as const)
    .sort((left, right) => (
      left[0] - right[0]
      || left[1] - right[1]
      || left[2] - right[2]
    ));
}

function sortedNodeCatalog(nodes: readonly RealmSceneCatalogNode[]) {
  return nodes
    .map((node) => [node.siteId, node.coord.q, node.coord.r, node.tier] as const)
    .sort((left, right) => left[0].localeCompare(right[0]));
}

/**
 * A scene construction boundary must describe immutable content, never the
 * identity of freshly allocated SpacetimeDB snapshot arrays. Dynamic
 * occupations, workers, profiles, menus, and private procedure results are
 * intentionally absent because the mounted scene reconciles them in place.
 */
export function realmSceneConstructionKey(input: RealmSceneConstructionKeyInput) {
  return JSON.stringify([
    'realm-scene-v1',
    input.canonicalFingerprint,
    input.realmId,
    input.numericSeed,
    input.authoritativeRadius,
    input.renderRadius,
    input.ownCastleId,
    input.keepCoord.q,
    input.keepCoord.r,
    sortedCastleCatalog(input.peerCastles),
    sortedNodeCatalog(input.goldNodes),
    sortedNodeCatalog(input.foodNodes),
    sortedNodeCatalog(input.woodNodes),
    sortedNodeCatalog(input.stoneNodes),
    input.forestSignature,
    input.waterSignature,
    input.quality,
    input.reducedMotion,
    input.observerMode
  ]);
}

export type RealmSceneRecreationReason =
  | 'initial-entry'
  | 'graphics-quality-change'
  | 'reduced-motion-material-change'
  | 'canonical-topology-change'
  | 'renderer-recovery'
  | 'explicit-retry';

export type RealmSceneConstructionProfile = Readonly<{
  key: string;
  quality: string;
  reducedMotion: boolean;
}>;

export function realmSceneRecreationReason(
  previous: RealmSceneConstructionProfile | undefined,
  next: RealmSceneConstructionProfile,
  requested?: 'renderer-recovery' | 'explicit-retry'
): RealmSceneRecreationReason {
  if (previous === undefined) return 'initial-entry';
  if (requested !== undefined) return requested;
  if (previous.quality !== next.quality) return 'graphics-quality-change';
  if (previous.reducedMotion !== next.reducedMotion) {
    return 'reduced-motion-material-change';
  }
  return 'canonical-topology-change';
}

export function realmWaterSceneSignature(
  cells: readonly GenesisWaterCellV1[] | undefined
) {
  if (cells === undefined) return 'water:unavailable';
  if (cells === GENESIS_WATER_CELLS_V1) return 'water:layout-v1';
  if (cells === GENESIS_WATER_REVISION_ENABLED_CELLS_V1) {
    return 'water:layout-v1:revision-v1';
  }
  // The public decoder currently returns only one of the two immutable
  // canonical catalogs above. Unfamiliar arrays share one blocked identity
  // and the stable-input hook removes their payload from scene construction.
  return 'water:unrecognized';
}

export function useStableRealmWaterSceneInputs(input: Readonly<{
  cells: readonly GenesisWaterCellV1[] | undefined;
  bodies: readonly unknown[] | undefined;
  environment: unknown;
}>) {
  const signature = realmWaterSceneSignature(input.cells);
  const stableRef = useRef<Readonly<{
    signature: string;
    cells: readonly GenesisWaterCellV1[] | undefined;
    bodies: readonly unknown[] | undefined;
    environment: unknown;
  }> | undefined>(undefined);
  if (stableRef.current?.signature !== signature) {
    stableRef.current = signature === 'water:unrecognized'
      ? Object.freeze({
          signature,
          cells: undefined,
          bodies: undefined,
          environment: undefined
        })
      : Object.freeze({ signature, ...input });
  }
  return stableRef.current;
}

const EMPTY_PEER_CASTLE_MARKERS: readonly RealmPeerCastleMarker[] = Object.freeze([]);

function samePeerCastleMarkers(
  first: readonly RealmPeerCastleMarker[],
  second: readonly RealmPeerCastleMarker[]
) {
  return first.length === second.length && first.every((castle, index) => {
    const candidate = second[index];
    return candidate !== undefined
      && castle.castleId === candidate.castleId
      && castle.q === candidate.q
      && castle.r === candidate.r;
  });
}

/**
 * SpacetimeDB snapshots deliberately return fresh presentation objects. Keep
 * the renderer input stable when only unrelated player/tile state or castle
 * display metadata changed, while still replacing it for a real marker move.
 */
export function useStablePeerCastleMarkers(
  castles: readonly RealmCastleProjection[],
  ownFid: number | undefined,
  surface: RealmTerrainSurface
) {
  const stableMarkersRef = useRef<readonly RealmPeerCastleMarker[]>(EMPTY_PEER_CASTLE_MARKERS);
  const nextMarkers: RealmPeerCastleMarker[] = [];
  for (const castle of castles) {
    if (
      (ownFid === undefined || castle.ownerFid !== ownFid)
      && isPlayableRealmCoord(surface, { q: castle.q, r: castle.r })
    ) {
      nextMarkers.push({ castleId: castle.castleId, q: castle.q, r: castle.r });
    }
  }
  nextMarkers.sort((left, right) => (
    left.castleId - right.castleId
    || left.q - right.q
    || left.r - right.r
  ));

  if (!samePeerCastleMarkers(stableMarkersRef.current, nextMarkers)) {
    stableMarkersRef.current = nextMarkers;
  }
  return stableMarkersRef.current;
}

type RealmGatheringNodePresentation =
  | RealmGoldNodePresentation
  | RealmFoodNodePresentation
  | RealmStoneNodePresentation
  | RealmWoodNodePresentation;

function sameGatheringNodes<T extends RealmGatheringNodePresentation>(
  first: readonly T[],
  second: readonly T[]
) {
  return first.length === second.length && first.every((node, index) => {
    const candidate = second[index];
    if (
      candidate === undefined
      || node.siteId !== candidate.siteId
      || node.coord.q !== candidate.coord.q
      || node.coord.r !== candidate.coord.r
      || node.tier !== candidate.tier
      || node.availability !== candidate.availability
      || node.occupiedByViewer !== candidate.occupiedByViewer
    ) return false;
    const occupation = node.occupation;
    const candidateOccupation = candidate.occupation;
    if ((occupation === undefined) !== (candidateOccupation === undefined)) return false;
    if (
      occupation !== undefined
      && candidateOccupation !== undefined
      && (
        occupation.siteId !== candidateOccupation.siteId
        || occupation.originCastleId !== candidateOccupation.originCastleId
        || occupation.phase !== candidateOccupation.phase
        || occupation.startedAtMicros !== candidateOccupation.startedAtMicros
        || occupation.arrivesAtMicros !== candidateOccupation.arrivesAtMicros
        || occupation.gatheringEndsAtMicros !== candidateOccupation.gatheringEndsAtMicros
        || occupation.returnsAtMicros !== candidateOccupation.returnsAtMicros
      )
    ) return false;
    const origin = node.originCastle;
    const candidateOrigin = candidate.originCastle;
    return (origin === undefined) === (candidateOrigin === undefined)
      && (
        origin === undefined
        || candidateOrigin === undefined
        || (
          origin.castleId === candidateOrigin.castleId
          && origin.name === candidateOrigin.name
          && origin.q === candidateOrigin.q
          && origin.r === candidateOrigin.r
        )
      );
  });
}

/** Do not recreate a GPU Realm scene for unrelated profile/name snapshot churn. */
export function useStableGatheringNodes<T extends RealmGatheringNodePresentation>(
  nodes: readonly T[]
) {
  const stableNodesRef = useRef(nodes);
  if (!sameGatheringNodes(stableNodesRef.current, nodes)) stableNodesRef.current = nodes;
  return stableNodesRef.current;
}

function sameGatheringNodeCatalog<T extends RealmGatheringNodePresentation>(
  first: readonly T[],
  second: readonly T[]
) {
  return first.length === second.length && first.every((node, index) => {
    const candidate = second[index];
    return candidate !== undefined
      && node.siteId === candidate.siteId
      && node.coord.q === candidate.coord.q
      && node.coord.r === candidate.coord.r
      && node.tier === candidate.tier;
  });
}

/** Keep immutable site topology stable while occupation rows reconcile in-place. */
export function useStableGatheringNodeCatalog<T extends RealmGatheringNodePresentation>(
  nodes: readonly T[]
) {
  const stableCatalogRef = useRef(nodes);
  if (!sameGatheringNodeCatalog(stableCatalogRef.current, nodes)) {
    stableCatalogRef.current = nodes;
  }
  return stableCatalogRef.current;
}

/**
 * Canonical terrain metadata is immutable for one fingerprint. Avoid scanning
 * all 10,000 rows when a profile/castle subscription publishes a fresh
 * presentation snapshot with the same validated world identity.
 */
export function useStableRealmTerrainMetadata(
  rows: readonly WarpkeepWorldTileMetadata[],
  canonicalFingerprint: string
) {
  const stableRowsRef = useRef({ canonicalFingerprint, rows });
  if (stableRowsRef.current.canonicalFingerprint !== canonicalFingerprint) {
    stableRowsRef.current = { canonicalFingerprint, rows };
  }
  return stableRowsRef.current.rows;
}

type RealmForestSnapshotProjection = Readonly<{
  signature: string;
  layout: unknown;
  trees: unknown;
}>;

function primitiveForestSignature(value: unknown) {
  if (
    typeof value === 'string'
    || typeof value === 'number'
    || typeof value === 'boolean'
    || typeof value === 'bigint'
    || value === undefined
    || value === null
  ) return `${typeof value}:${String(value)}`;
  return 'other';
}

function forestRecordSignature(value: unknown, fields: readonly string[]) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return 'invalid';
  const row = value as Readonly<Record<string, unknown>>;
  return JSON.stringify(fields.map((field) => [field, primitiveForestSignature(row[field])]));
}

export const BLOCKED_SHARED_FOREST_PROJECTION_SIGNATURE = 'forest:blocked-cardinality';

/**
 * Retain an unchanged forest projection across unrelated snapshot churn. Every
 * policy-relevant fixed-point field participates in the signature, while
 * invalid or partial cardinality remains one stable blocked state.
 */
export function sharedForestProjectionSignature(layout: unknown, trees: unknown) {
  if (layout === undefined && trees === undefined) return 'forest:absent';
  if (layout === undefined || trees === undefined) {
    return BLOCKED_SHARED_FOREST_PROJECTION_SIGNATURE;
  }
  if (!Array.isArray(trees) || trees.length !== GENESIS_FOREST_LAYOUT_V1_TREE_COUNT) {
    return BLOCKED_SHARED_FOREST_PROJECTION_SIGNATURE;
  }
  const layoutRows = Array.isArray(layout) ? layout : [layout];
  if (layoutRows.length !== 1) return BLOCKED_SHARED_FOREST_PROJECTION_SIGNATURE;
  const layoutSignature = forestRecordSignature(layoutRows[0], [
    'realmId',
    'layoutVersion',
    'policyVersion',
    'layoutDigest',
    'assetCatalogDigest',
    'instanceCount'
  ]);
  const treeFields = [
    'treeId',
    'realmId',
    'tileKey',
    'q',
    'r',
    'localXMicrounits',
    'localZMicrounits',
    'worldXMicrounits',
    'worldZMicrounits',
    'rotationMilliDegrees',
    'scaleBasisPoints',
    'speciesId',
    'habitat',
    'layoutVersion'
  ] as const;
  return JSON.stringify([
    ['layout', layoutSignature],
    ['trees', trees.map((row) => forestRecordSignature(row, treeFields)).sort()]
  ]);
}

export function useStableSharedForestProjection(layout: unknown, trees: unknown) {
  const signature = sharedForestProjectionSignature(layout, trees);
  const projectionRef = useRef<Readonly<{
    signature: string;
    projection: RealmForestSnapshotProjection;
  }> | undefined>(undefined);
  if (projectionRef.current?.signature !== signature) {
    projectionRef.current = Object.freeze({
      signature,
      projection: Object.freeze({ signature, layout, trees })
    });
  }
  return projectionRef.current.projection;
}
