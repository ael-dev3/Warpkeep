import { describe, expect, it } from 'vitest';

import {
  CANONICAL_GENESIS_SNAPSHOT_FINGERPRINT,
  CanonicalGenesisSnapshotError,
  isCanonicalGenesisSnapshot,
  validateCanonicalGenesisSnapshot
} from '../src/spacetime/canonicalGenesisSnapshot';
import type { WarpkeepRealmSnapshotCandidate } from '../src/spacetime/warpkeepBackendTypes';
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
  it('brands and deeply freezes the exact protocol-3 Genesis snapshot', () => {
    const snapshot = validate(createCanonicalGenesisCandidate());

    expect(snapshot.protocolVersion).toBe(3);
    expect(snapshot.canonicalFingerprint).toBe(CANONICAL_GENESIS_SNAPSHOT_FINGERPRINT);
    expect(snapshot.realm).toEqual(snapshot.activeRealms[0]);
    expect(snapshot.tiles).toHaveLength(1_261);
    expect(snapshot.tileMetadata).toHaveLength(1_261);
    expect(snapshot.ownCastle.ownerFid).toBe(CANONICAL_TEST_FID);
    expect(isCanonicalGenesisSnapshot(snapshot, CANONICAL_TEST_FID)).toBe(true);
    expect(isCanonicalGenesisSnapshot(snapshot, CANONICAL_TEST_FID + 1)).toBe(false);
    expect(Object.isFrozen(snapshot)).toBe(true);
    expect(Object.isFrozen(snapshot.tiles)).toBe(true);
    expect(Object.isFrozen(snapshot.tiles[0])).toBe(true);
    expect(validate(snapshot)).toBe(snapshot);
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

  it.each([0, 61, 1_260])('rejects an incomplete %i-tile projection', (count) => {
    const candidate = createCanonicalGenesisCandidate();
    expect(() => validate({ ...candidate, tiles: candidate.tiles.slice(0, count) }))
      .toThrow(CanonicalGenesisSnapshotError);
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
