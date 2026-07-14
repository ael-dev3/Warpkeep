import { RealmMapScreen } from '../components/realm/RealmMapScreen';
import { validateCanonicalGenesisSnapshot } from '../spacetime/canonicalGenesisSnapshot';
import type {
  WarpkeepCastle,
  WarpkeepRealmProfile,
  WarpkeepRealmSnapshotCandidate
} from '../spacetime/warpkeepBackendTypes';
import { WARPKEEP_EXPECTED_BACKEND_PROTOCOL_VERSION } from '../spacetime/warpkeepProtocol';
import {
  CANONICAL_CASTLE_SLOTS,
  CANONICAL_REALM,
  CANONICAL_WORLD_TILES,
  CANONICAL_WORLD_TILE_META
} from '../../spacetimedb/src/world';

const QA_PLAYERS = Object.freeze([
  Object.freeze({ fid: 9_000_001, username: 'ael', displayName: 'Ael' }),
  Object.freeze({ fid: 9_000_002, username: 'violetwarden', displayName: 'Violet Warden' }),
  Object.freeze({ fid: 9_000_003, username: 'stonekeeper', displayName: 'Stone Keeper' }),
  Object.freeze({ fid: 9_000_004, username: 'frontierseer', displayName: 'Frontier Seer' })
]);

const QA_PFP_URL = 'https://warpkeep.com/images/factions/hegemony/marks/hegemony-mark-64.png';

function createQaSnapshot() {
  const castles: readonly WarpkeepCastle[] = QA_PLAYERS.map((player, index) => {
    const slot = CANONICAL_CASTLE_SLOTS[index];
    if (!slot) throw new Error('Realm QA requires four canonical castle slots.');
    return Object.freeze({
      castleId: index + 1,
      ownerFid: player.fid,
      tileKey: slot.tileKey,
      q: slot.q,
      r: slot.r,
      level: index === 0 ? 3 : 1,
      name: index === 0 ? 'Amethyst Bastion' : `${player.displayName} Keep`,
      foundedAt: Date.UTC(2026, 6, 14)
    });
  });
  const castleByTile = new Map(castles.map((castle) => [castle.tileKey, castle.castleId]));
  const profiles: readonly WarpkeepRealmProfile[] = QA_PLAYERS.map((player) => Object.freeze({
    fid: player.fid,
    canonicalUsername: player.username,
    displayName: player.displayName,
    pfpUrl: QA_PFP_URL,
    publicBio: 'A canonical local presentation fixture for Warpkeep Realm QA.',
    publicStatus: 'founding-player',
    communityStatsVisible: player.fid === QA_PLAYERS[0]!.fid,
    marksBalanceMicros: player.fid === QA_PLAYERS[0]!.fid ? 12_500_000n : undefined
  }));
  const candidate: WarpkeepRealmSnapshotCandidate = {
    activeRealms: [{ ...CANONICAL_REALM }],
    tiles: CANONICAL_WORLD_TILES.map((tile) => {
      const occupantCastleId = castleByTile.get(tile.key);
      return { ...tile, ...(occupantCastleId ? { occupantCastleId } : {}) };
    }),
    tileMetadata: CANONICAL_WORLD_TILE_META.map((metadata) => ({ ...metadata })),
    players: QA_PLAYERS.map((player) => ({ ...player, pfpUrl: QA_PFP_URL, status: 'active' })),
    profiles,
    castles,
    ownCastle: castles[0]
  };
  return validateCanonicalGenesisSnapshot(candidate, {
    ownFid: QA_PLAYERS[0]!.fid,
    protocolVersion: WARPKEEP_EXPECTED_BACKEND_PROTOCOL_VERSION
  });
}

const QA_SNAPSHOT = createQaSnapshot();

export function RealmQaHarness() {
  return (
    <RealmMapScreen
      identity={{
        fid: QA_PLAYERS[0]!.fid,
        username: QA_PLAYERS[0]!.username,
        displayName: QA_PLAYERS[0]!.displayName,
        pfpUrl: QA_PFP_URL
      }}
      snapshot={QA_SNAPSHOT}
      onRequestReturn={() => undefined}
    />
  );
}
