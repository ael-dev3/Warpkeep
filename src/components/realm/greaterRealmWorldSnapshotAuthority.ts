import type {
  GreaterRealmClientSnapshot
} from '../../greater-realm/greaterRealmClientRuntime';
import type {
  GreaterRealmPublicCellDto,
  GreaterRealmWindowCastleDto
} from '../../greater-realm/greaterRealmPublicContract';

const READABLE_GREATER_REALM_MODES = new Set(['canary', 'active', 'halted']);

export function isReadableGreaterRealmMode(mode: string) {
  return READABLE_GREATER_REALM_MODES.has(mode);
}

function publicCellFingerprint(cell: GreaterRealmPublicCellDto) {
  return Object.entries(cell)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => `${key}:${typeof value === 'bigint' ? value.toString() : String(value)}`)
    .join('|');
}

function loadedCells(snapshot: GreaterRealmClientSnapshot) {
  return snapshot.chunks.flatMap(({ chunk }) => [
    ...chunk.coreCells,
    ...chunk.apronCells
  ]);
}

function loadedOwnCellAuthorityIsCurrent(
  snapshot: GreaterRealmClientSnapshot,
  cellKey: string,
  atlasQ: number,
  atlasR: number,
  elevation: number
) {
  const cells = loadedCells(snapshot);
  const keyMatches = cells.filter((cell) => cell.cellKey === cellKey);
  const coordinateMatches = cells.filter((cell) => (
    cell.atlasQ === atlasQ && cell.atlasR === atlasR
  ));
  // Lower LODs may omit the caller's exact cell. The bootstrap/window pair is
  // then the caller-derived authority, but a conflicting sampled coordinate is
  // never tolerated.
  if (keyMatches.length === 0) return coordinateMatches.length === 0;
  const fingerprint = publicCellFingerprint(keyMatches[0]!);
  return keyMatches.every((cell) => (
    cell.atlasQ === atlasQ
    && cell.atlasR === atlasR
    && cell.elevation === elevation
    && publicCellFingerprint(cell) === fingerprint
  )) && coordinateMatches.every((cell) => (
    cell.cellKey === cellKey
    && publicCellFingerprint(cell) === fingerprint
  ));
}

/**
 * Current read authority for the mounted scene. Cell keys contain region-local
 * coordinates, so ownership is proved by the loaded public atlas projection,
 * never by parsing a key suffix as atlas q/r.
 */
export function greaterRealmSnapshotMatchesSceneLifetime(input: Readonly<{
  snapshot: GreaterRealmClientSnapshot;
  sessionGeneration: number;
  ownCastle: Readonly<{ castleId: number; q: number; r: number }>;
  view: Readonly<{ centerQ: number; centerR: number; radius: number; lod: number }>;
}>) {
  const { snapshot, ownCastle, view } = input;
  const bootstrap = snapshot.bootstrap;
  const windowDto = snapshot.window;
  const loadedView = snapshot.view;
  const ownCastleId = Number.isSafeInteger(ownCastle.castleId)
    && ownCastle.castleId > 0
      ? BigInt(ownCastle.castleId)
      : undefined;
  const windowOwnCastle = windowDto?.castles.filter(
    (castle) => castle.castleId === ownCastleId
  );
  const descriptorHandles = new Set(
    windowDto?.chunks.map((descriptor) => descriptor.chunkHandle) ?? []
  );
  const selectedHandles = new Set(
    snapshot.chunks?.map(({ chunk }) => chunk.chunkHandle) ?? []
  );
  return !(
    snapshot.phase !== 'ready'
    || snapshot.sessionGeneration !== input.sessionGeneration
    || bootstrap === undefined
    || !isReadableGreaterRealmMode(bootstrap.mode)
    || ownCastleId === undefined
    || bootstrap.myCastleId !== ownCastleId
    || bootstrap.myAtlasQ !== ownCastle.q
    || bootstrap.myAtlasR !== ownCastle.r
    || !Number.isSafeInteger(bootstrap.myElevation)
    || typeof bootstrap.myCellKey !== 'string'
    || bootstrap.myCellKey.length === 0
    || windowDto === undefined
    || windowOwnCastle?.length !== 1
    || windowOwnCastle[0]!.atlasQ !== bootstrap.myAtlasQ
    || windowOwnCastle[0]!.atlasR !== bootstrap.myAtlasR
    || windowOwnCastle[0]!.elevation !== bootstrap.myElevation
    || !selectedHandles.has(windowOwnCastle[0]!.chunkHandle)
    || loadedView === undefined
    || loadedView.centerQ !== view.centerQ
    || loadedView.centerR !== view.centerR
    || loadedView.radius !== view.radius
    || loadedView.lod !== view.lod
    || windowDto.atlasId !== bootstrap.atlasId
    || windowDto.revision !== bootstrap.revision
    || windowDto.centerQ !== view.centerQ
    || windowDto.centerR !== view.centerR
    || windowDto.radius !== view.radius
    || !Array.isArray(snapshot.chunks)
    || snapshot.selectedChunkCount !== snapshot.chunks.length
    || !snapshot.chunks.every(({ chunk }) => (
      chunk.atlasId === bootstrap.atlasId
      && chunk.revision === bootstrap.revision
      && chunk.lod === view.lod
      && descriptorHandles.has(chunk.chunkHandle)
    ))
  );
}

export function isCurrentGreaterRealmSceneSnapshot(input: Readonly<{
  snapshot: GreaterRealmClientSnapshot;
  sessionGeneration: number;
  ownCastle: Readonly<{ castleId: number; q: number; r: number }>;
  view: Readonly<{ centerQ: number; centerR: number; radius: number; lod: number }>;
}>) {
  const { snapshot, ownCastle } = input;
  if (!greaterRealmSnapshotMatchesSceneLifetime(input)) return false;
  const bootstrap = snapshot.bootstrap!;
  return loadedOwnCellAuthorityIsCurrent(
    snapshot,
    bootstrap.myCellKey,
    ownCastle.q,
    ownCastle.r,
    bootstrap.myElevation
  );
}

export function greaterRealmWindowCastleTopologySignature(
  castles: readonly GreaterRealmWindowCastleDto[]
) {
  return castles.map((castle) => (
    `${castle.castleId}:${castle.chunkHandle}:${castle.atlasQ}:${castle.atlasR}:${castle.level}:${castle.elevation}`
  )).join('|');
}
