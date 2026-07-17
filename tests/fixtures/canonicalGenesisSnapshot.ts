import {
  CANONICAL_CASTLE_SLOTS,
  CANONICAL_REALM,
  CANONICAL_WORLD_TILES,
  CANONICAL_WORLD_TILE_META
} from '../../spacetimedb/src/world';
import { validateCanonicalGenesisSnapshot } from '../../src/spacetime/canonicalGenesisSnapshot';
import type {
  CanonicalWarpkeepRealmSnapshot,
  WarpkeepRealmSnapshotCandidate
} from '../../src/spacetime/warpkeepBackendTypes';
import { WARPKEEP_EXPECTED_BACKEND_PROTOCOL_VERSION } from '../../src/spacetime/warpkeepProtocol';

export const CANONICAL_TEST_FID = 12_345;
export const CANONICAL_TEST_CASTLE_ID = 1;

const TEST_SLOT = CANONICAL_CASTLE_SLOTS[0]!;
const TEST_PEER_SLOT = CANONICAL_CASTLE_SLOTS[1]!;

type CanonicalGenesisFixtureOptions = Readonly<{
  ownFid?: number;
  peerFid?: number;
}>;

export function createCanonicalGenesisCandidate(
  options: number | CanonicalGenesisFixtureOptions = CANONICAL_TEST_FID
): WarpkeepRealmSnapshotCandidate {
  const ownFid = typeof options === 'number'
    ? options
    : options.ownFid ?? CANONICAL_TEST_FID;
  const peerFid = typeof options === 'number' ? undefined : options.peerFid;
  const ownCastle = {
    castleId: CANONICAL_TEST_CASTLE_ID,
    ownerFid: ownFid,
    tileKey: TEST_SLOT.tileKey,
    q: TEST_SLOT.q,
    r: TEST_SLOT.r,
    level: 2,
    name: 'Warpkeeper Bastion'
  } as const;
  const peerCastle = peerFid === undefined ? undefined : {
    castleId: 2,
    ownerFid: peerFid,
    tileKey: TEST_PEER_SLOT.tileKey,
    q: TEST_PEER_SLOT.q,
    r: TEST_PEER_SLOT.r,
    level: 1,
    name: 'Peer Watch'
  } as const;
  const castles = peerCastle ? [ownCastle, peerCastle] : [ownCastle];
  return {
    activeRealms: [{ ...CANONICAL_REALM }],
    tiles: CANONICAL_WORLD_TILES.map((tile) => ({
      ...tile,
      ...(tile.key === TEST_SLOT.tileKey
        ? { occupantCastleId: CANONICAL_TEST_CASTLE_ID }
        : tile.key === peerCastle?.tileKey
          ? { occupantCastleId: peerCastle.castleId }
          : {})
    })),
    tileMetadata: CANONICAL_WORLD_TILE_META.map((metadata) => ({ ...metadata })),
    players: [
      { fid: ownFid, status: 'active' },
      ...(peerFid === undefined ? [] : [{ fid: peerFid, status: 'active' }])
    ],
    profiles: [
      { fid: ownFid, publicStatus: 'founded', communityStatsVisible: false },
      ...(peerFid === undefined ? [] : [{
        fid: peerFid,
        publicStatus: 'founded',
        communityStatsVisible: false
      }])
    ],
    castles,
    ownCastle
  };
}

export function createCanonicalGenesisSnapshot(
  options: number | CanonicalGenesisFixtureOptions = CANONICAL_TEST_FID
): CanonicalWarpkeepRealmSnapshot {
  const ownFid = typeof options === 'number'
    ? options
    : options.ownFid ?? CANONICAL_TEST_FID;
  return validateCanonicalGenesisSnapshot(createCanonicalGenesisCandidate(options), {
    ownFid,
    protocolVersion: WARPKEEP_EXPECTED_BACKEND_PROTOCOL_VERSION
  });
}
