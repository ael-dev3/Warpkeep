import { describe, expect, it } from 'vitest';

import {
  CANONICAL_GENESIS_SNAPSHOT_FINGERPRINT,
  CanonicalGenesisSnapshotError,
  GENESIS_GENERATION_V2_SNAPSHOT_FINGERPRINT,
  GENESIS_GENERATION_V3_SNAPSHOT_FINGERPRINT,
  isCanonicalGenesisSnapshot,
  validateCanonicalGenesisSnapshot
} from '../src/spacetime/canonicalGenesisSnapshot';
import {
  CANONICAL_REALM,
  GENESIS_GENERATION_V2_REALM
} from '../spacetimedb/src/world';
import type { WarpkeepRealmSnapshotCandidate } from '../src/spacetime/warpkeepBackendTypes';
import {
  CANONICAL_GENESIS_FOREST_LAYOUT_V1
} from '../spacetimedb/src/forestLayoutPolicy';
import {
  CANONICAL_TEST_FID,
  createCanonicalGenesisCandidate
} from './fixtures/canonicalGenesisSnapshot';

function validate(
  candidate: WarpkeepRealmSnapshotCandidate,
  ownFid = CANONICAL_TEST_FID,
  protocolVersion = 3
) {
  return validateCanonicalGenesisSnapshot(candidate, { ownFid, protocolVersion });
}

function replaceTile(
  candidate: WarpkeepRealmSnapshotCandidate,
  index: number,
  patch: Partial<(typeof candidate.tiles)[number]>
): WarpkeepRealmSnapshotCandidate {
  return {
    ...candidate,
    tiles: candidate.tiles.map((tile, tileIndex) => (
      tileIndex === index ? { ...tile, ...patch } : tile
    ))
  };
}

function replaceMetadata(
  candidate: WarpkeepRealmSnapshotCandidate,
  index: number,
  patch: Partial<(typeof candidate.tileMetadata)[number]>
): WarpkeepRealmSnapshotCandidate {
  return {
    ...candidate,
    tileMetadata: candidate.tileMetadata.map((metadata, metadataIndex) => (
      metadataIndex === index ? { ...metadata, ...patch } : metadata
    ))
  };
}

describe('canonical Genesis 001 browser snapshot boundary', () => {
  it.each([
    [2, 1_261, GENESIS_GENERATION_V2_SNAPSHOT_FINGERPRINT],
    [3, 10_000, GENESIS_GENERATION_V3_SNAPSHOT_FINGERPRINT]
  ] as const)(
    'brands and deeply freezes the exact generation-%i protocol-3 snapshot',
    (generationVersion, cellCount, fingerprint) => {
      const snapshot = validate(createCanonicalGenesisCandidate({ generationVersion }));

      expect(snapshot.protocolVersion).toBe(3);
      expect(snapshot.canonicalFingerprint).toBe(fingerprint);
      expect(snapshot.realm).toEqual(snapshot.activeRealms[0]);
      expect(snapshot.tiles).toHaveLength(cellCount);
      expect(snapshot.tileMetadata).toHaveLength(cellCount);
      expect(snapshot.ownCastle.ownerFid).toBe(CANONICAL_TEST_FID);
      expect(isCanonicalGenesisSnapshot(snapshot, CANONICAL_TEST_FID)).toBe(true);
      expect(isCanonicalGenesisSnapshot(snapshot, CANONICAL_TEST_FID + 1)).toBe(false);
      expect(Object.isFrozen(snapshot)).toBe(true);
      expect(Object.isFrozen(snapshot.tiles)).toBe(true);
      expect(Object.isFrozen(snapshot.tiles[0])).toBe(true);
      expect(validate(snapshot)).toBe(snapshot);
    }
  );

  it('preserves the deployed v2 fingerprint and points the compatibility alias at v3', () => {
    expect(GENESIS_GENERATION_V2_SNAPSHOT_FINGERPRINT).toBe(
      'warpkeep:genesis-001:protocol-3:seed-3445214658:generation-2:radius-20:render-22:capacity-100:tiles-1261:metadata-1261'
    );
    expect(GENESIS_GENERATION_V3_SNAPSHOT_FINGERPRINT).toBe(
      'warpkeep:genesis-001:protocol-3:seed-3445214658:generation-3:radius-58:render-60:capacity-100:tiles-10000:metadata-10000'
    );
    expect(CANONICAL_GENESIS_SNAPSHOT_FINGERPRINT)
      .toBe(GENESIS_GENERATION_V3_SNAPSHOT_FINGERPRINT);
  });

  it('treats radius 58 as a maximum envelope, not as a complete radius-58 disc', () => {
    const snapshot = validate(createCanonicalGenesisCandidate({ generationVersion: 3 }));
    const ring58 = snapshot.tiles.filter((tile) => (
      Math.max(Math.abs(tile.q), Math.abs(tile.r), Math.abs(-tile.q - tile.r)) === 58
    ));

    expect(snapshot.realm.authoritativeRadius).toBe(58);
    expect(snapshot.tiles).toHaveLength(10_000);
    expect(ring58).toHaveLength(81);
    expect(snapshot.tiles).not.toHaveLength(1 + (3 * 58 * 59));
  });

  it('preserves a present-but-incomplete forest projection for the strict renderer decoder', () => {
    const candidate = createCanonicalGenesisCandidate();
    const unseeded = validate({
      ...candidate,
      forestTrees: []
    });
    // An empty paired row array is materially different from a legacy server
    // without the additive tables: the scene resolver must block it rather
    // than enabling its explicit DEV-only preview.
    expect(unseeded).not.toHaveProperty('forestLayout');
    expect(unseeded.forestTrees).toEqual([]);
    expect(Object.isFrozen(unseeded.forestTrees)).toBe(true);

    const oneSided = validate({
      ...candidate,
      forestLayout: CANONICAL_GENESIS_FOREST_LAYOUT_V1
    });
    expect(oneSided.forestLayout).toEqual(CANONICAL_GENESIS_FOREST_LAYOUT_V1);
    expect(oneSided).not.toHaveProperty('forestTrees');

    const malformed = validate({
      ...candidate,
      forestLayout: null,
      forestTrees: []
    });
    expect(malformed.forestLayout).toBeNull();
    expect(malformed.forestTrees).toEqual([]);
  });

  it('rejects any backend protocol other than protocol 3', () => {
    expect(() => validate(createCanonicalGenesisCandidate(), CANONICAL_TEST_FID, 2))
      .toThrow(CanonicalGenesisSnapshotError);
  });

  it.each([
    ['no active realm', []],
    ['two active realms', undefined]
  ])('rejects %s', (_label, configuredRealms) => {
    const candidate = createCanonicalGenesisCandidate();
    const activeRealms = configuredRealms ?? [candidate.activeRealms[0]!, candidate.activeRealms[0]!];
    expect(() => validate({ ...candidate, activeRealms }))
      .toThrow(CanonicalGenesisSnapshotError);
  });

  it.each([
    ['realmId', 'OTHER_REALM'],
    ['seedName', 'OTHER_SEED'],
    ['numericSeed', 1],
    ['generationVersion', 1],
    ['authoritativeRadius', 4],
    ['renderRadius', 5],
    ['playerCapacity', 99],
    ['active', false]
  ] as const)('rejects a noncanonical realm %s', (field, value) => {
    const candidate = createCanonicalGenesisCandidate();
    expect(() => validate({
      ...candidate,
      activeRealms: [{ ...candidate.activeRealms[0]!, [field]: value }]
    })).toThrow(CanonicalGenesisSnapshotError);
  });

  it.each([0, 61, 1_260, 9_999])('rejects an incomplete %i-tile projection', (count) => {
    const candidate = createCanonicalGenesisCandidate();
    expect(() => validate({ ...candidate, tiles: candidate.tiles.slice(0, count) }))
      .toThrow(CanonicalGenesisSnapshotError);
  });

  it('rejects every mixed generation tuple, including a same-count valid-row swap', () => {
    const v2 = createCanonicalGenesisCandidate({ generationVersion: 2 });
    const v3 = createCanonicalGenesisCandidate({ generationVersion: 3 });

    expect(() => validate({ ...v2, activeRealms: [{ ...CANONICAL_REALM }] }))
      .toThrow(CanonicalGenesisSnapshotError);
    expect(() => validate({ ...v3, activeRealms: [{ ...GENESIS_GENERATION_V2_REALM }] }))
      .toThrow(CanonicalGenesisSnapshotError);

    const v2Keys = new Set(v2.tiles.map((tile) => tile.key));
    const validOuterTile = v3.tiles.find((tile) => !v2Keys.has(tile.key))!;
    const validOuterMetadata = v3.tileMetadata.find(
      (metadata) => metadata.tileKey === validOuterTile.key
    )!;
    expect(() => validate({
      ...v2,
      tiles: [...v2.tiles.slice(0, -1), validOuterTile],
      tileMetadata: [...v2.tileMetadata.slice(0, -1), validOuterMetadata]
    })).toThrow(CanonicalGenesisSnapshotError);
  });

  it('rejects duplicate or noncanonical world tiles', () => {
    const duplicate = createCanonicalGenesisCandidate();
    expect(() => validate({
      ...duplicate,
      tiles: [...duplicate.tiles.slice(0, -1), duplicate.tiles[0]!]
    })).toThrow(CanonicalGenesisSnapshotError);

    const wrongTerrain = createCanonicalGenesisCandidate();
    expect(() => validate(replaceTile(wrongTerrain, 1, { biome: 'forged' })))
      .toThrow(CanonicalGenesisSnapshotError);
    expect(() => validate(replaceTile(wrongTerrain, 1, { terrainSeed: 0 })))
      .toThrow(CanonicalGenesisSnapshotError);
  });

  it('requires exactly one canonical metadata row for every canonical tile', () => {
    const missing = createCanonicalGenesisCandidate();
    expect(() => validate({ ...missing, tileMetadata: missing.tileMetadata.slice(1) }))
      .toThrow(CanonicalGenesisSnapshotError);

    const duplicate = createCanonicalGenesisCandidate();
    expect(() => validate({
      ...duplicate,
      tileMetadata: [...duplicate.tileMetadata.slice(0, -1), duplicate.tileMetadata[0]!]
    })).toThrow(CanonicalGenesisSnapshotError);

    const wrongRing = createCanonicalGenesisCandidate();
    expect(() => validate(replaceMetadata(wrongRing, 1, { ring: 20 })))
      .toThrow(CanonicalGenesisSnapshotError);
    expect(() => validate(replaceMetadata(wrongRing, 1, { generationVersion: 1 })))
      .toThrow(CanonicalGenesisSnapshotError);
  });

  it('bounds public player and profile projections to canonical capacity', () => {
    const candidate = createCanonicalGenesisCandidate();
    const extraFids = Array.from({ length: 100 }, (_, index) => 10_000 + index);
    expect(() => validate({
      ...candidate,
      players: [
        ...candidate.players,
        ...extraFids.map((fid) => ({ fid, status: 'active' }))
      ]
    })).toThrow(CanonicalGenesisSnapshotError);
    expect(() => validate({
      ...candidate,
      profiles: [
        ...candidate.profiles,
        ...Array.from({ length: 101 }, (_, index) => ({
          fid: 20_000 + index,
          publicStatus: 'active',
          communityStatsVisible: false
        }))
      ]
    })).toThrow(CanonicalGenesisSnapshotError);
  });

  it('requires one public profile per founder while allowing player bootstrap to lag', () => {
    const candidate = createCanonicalGenesisCandidate({
      ownFid: CANONICAL_TEST_FID,
      peerFid: 77
    });
    expect(validate({
      ...candidate,
      players: candidate.players.filter((player) => player.fid !== 77)
    }).castles).toHaveLength(2);
    expect(() => validate({
      ...candidate,
      profiles: candidate.profiles.filter((profile) => profile.fid !== 77)
    })).toThrow(CanonicalGenesisSnapshotError);

    const extraPlayerFid = 88;
    const extraProfileFid = 99;
    expect(validate({
      ...candidate,
      players: [...candidate.players, { fid: extraPlayerFid, status: 'active' }],
      profiles: [...candidate.profiles, {
        fid: extraProfileFid,
        publicStatus: 'founded',
        communityStatsVisible: false
      }]
    }).castles).toHaveLength(2);
  });

  it('rejects noncanonical castle and public-profile presentation fields', () => {
    const candidate = createCanonicalGenesisCandidate();
    const invalidCandidates: readonly WarpkeepRealmSnapshotCandidate[] = [
      {
        ...candidate,
        castles: [{ ...candidate.castles[0]!, name: `Keep\u206a${'x'.repeat(80)}` }]
      },
      {
        ...candidate,
        players: [{
          ...candidate.players[0]!,
          displayName: 'Deceptive\u206aKeeper'
        }]
      },
      {
        ...candidate,
        players: [{
          ...candidate.players[0]!,
          pfpUrl: 'http://profiles.example/keeper.png'
        }]
      },
      {
        ...candidate,
        profiles: [{
          ...candidate.profiles[0]!,
          canonicalUsername: 'keeper\u00ad'
        }]
      },
      {
        ...candidate,
        profiles: [{
          ...candidate.profiles[0]!,
          publicBio: 'x'.repeat(321)
        }]
      },
      {
        ...candidate,
        profiles: [{
          ...candidate.profiles[0]!,
          pfpUrl: 'https://profiles.example:8443/keeper.png'
        }]
      }
    ];
    for (const invalid of invalidCandidates) {
      expect(() => validate(invalid)).toThrow(CanonicalGenesisSnapshotError);
    }
  });

  it('rejects broken castle-to-tile occupancy in either direction', () => {
    const missingOccupant = createCanonicalGenesisCandidate();
    const castleTileIndex = missingOccupant.tiles.findIndex(
      (tile) => tile.key === missingOccupant.ownCastle?.tileKey
    );
    expect(() => validate(replaceTile(
      missingOccupant,
      castleTileIndex,
      { occupantCastleId: undefined }
    ))).toThrow(CanonicalGenesisSnapshotError);

    const wrongCastleCoord = createCanonicalGenesisCandidate();
    expect(() => validate({
      ...wrongCastleCoord,
      castles: [{ ...wrongCastleCoord.castles[0]!, q: 19 }]
    })).toThrow(CanonicalGenesisSnapshotError);

    const orphanOccupant = createCanonicalGenesisCandidate();
    const emptyTileIndex = orphanOccupant.tiles.findIndex(
      (tile) => tile.occupantCastleId === undefined
    );
    expect(() => validate(replaceTile(
      orphanOccupant,
      emptyTileIndex,
      { occupantCastleId: 99 }
    ))).toThrow(CanonicalGenesisSnapshotError);
  });

  it('requires exactly one castle owned by the authenticated FID', () => {
    const candidate = createCanonicalGenesisCandidate();
    expect(() => validate(candidate, CANONICAL_TEST_FID + 1))
      .toThrow(CanonicalGenesisSnapshotError);
    expect(() => validate({
      ...candidate,
      ownCastle: { ...candidate.ownCastle!, ownerFid: CANONICAL_TEST_FID + 1 }
    })).toThrow(CanonicalGenesisSnapshotError);
  });
});
