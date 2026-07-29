import { describe, expect, it } from 'vitest';

import {
  realmSceneConstructionKey,
  realmSceneRecreationReason,
  realmSceneTopologyKey,
  realmWaterSceneSignature,
  type RealmSceneConstructionKeyInput,
  type RealmSceneConstructionProfile
} from '../src/components/realm/realmMapProjectionStability';
import {
  GENESIS_WATER_REVISION_ENABLED_CELLS_V1
} from '../spacetimedb/src/waterRevision';
import { GENESIS_WATER_CELLS_V1 } from '../spacetimedb/src/waterWorld';

const BASE_INPUT: RealmSceneConstructionKeyInput = Object.freeze({
  canonicalFingerprint: 'canonical-fingerprint',
  realmId: 'genesis-001',
  numericSeed: 20_260_319,
  authoritativeRadius: 57,
  renderRadius: 60,
  ownCastleId: 1,
  keepCoord: Object.freeze({ q: 0, r: 0 }),
  peerCastles: Object.freeze([
    Object.freeze({ castleId: 3, q: -2, r: 1 }),
    Object.freeze({ castleId: 2, q: 2, r: -1 })
  ]),
  goldNodes: Object.freeze([
    Object.freeze({ siteId: 'gold-b', coord: Object.freeze({ q: 8, r: -3 }), tier: 1 }),
    Object.freeze({ siteId: 'gold-a', coord: Object.freeze({ q: 7, r: -2 }), tier: 1 })
  ]),
  foodNodes: Object.freeze([
    Object.freeze({ siteId: 'food-a', coord: Object.freeze({ q: -6, r: 2 }), tier: 1 })
  ]),
  woodNodes: Object.freeze([
    Object.freeze({ siteId: 'wood-a', coord: Object.freeze({ q: 4, r: 6 }), tier: 1 })
  ]),
  stoneNodes: Object.freeze([
    Object.freeze({ siteId: 'stone-a', coord: Object.freeze({ q: -8, r: 3 }), tier: 1 })
  ]),
  forestSignature: 'forest:layout-v1',
  waterSignature: 'water:layout-v1:revision-v1',
  quality: 'balanced',
  reducedMotion: false,
  observerMode: false
});

function profile(
  input: RealmSceneConstructionKeyInput
): RealmSceneConstructionProfile {
  return Object.freeze({
    key: realmSceneConstructionKey(input),
    topologyKey: realmSceneTopologyKey(input),
    quality: input.quality,
    reducedMotion: input.reducedMotion
  });
}

describe('realm scene construction lifecycle', () => {
  it('keeps a stable construction key across deep clones and catalog reordering', () => {
    const reorderedClone: RealmSceneConstructionKeyInput = {
      ...BASE_INPUT,
      keepCoord: { ...BASE_INPUT.keepCoord },
      peerCastles: [...BASE_INPUT.peerCastles]
        .reverse()
        .map((castle) => ({ ...castle })),
      goldNodes: [...BASE_INPUT.goldNodes]
        .reverse()
        .map((node) => ({ ...node, coord: { ...node.coord } })),
      foodNodes: BASE_INPUT.foodNodes.map((node) => ({
        ...node,
        coord: { ...node.coord }
      })),
      woodNodes: BASE_INPUT.woodNodes.map((node) => ({
        ...node,
        coord: { ...node.coord }
      })),
      stoneNodes: BASE_INPUT.stoneNodes.map((node) => ({
        ...node,
        coord: { ...node.coord }
      }))
    };

    expect(realmSceneConstructionKey(reorderedClone))
      .toBe(realmSceneConstructionKey(BASE_INPUT));
  });

  it('changes the key for genuine authoritative topology changes', () => {
    const movedCastle: RealmSceneConstructionKeyInput = {
      ...BASE_INPUT,
      peerCastles: BASE_INPUT.peerCastles.map((castle) => (
        castle.castleId === 2 ? { ...castle, q: castle.q + 1 } : castle
      ))
    };
    const changedNode: RealmSceneConstructionKeyInput = {
      ...BASE_INPUT,
      stoneNodes: BASE_INPUT.stoneNodes.map((node) => ({
        ...node,
        tier: node.tier + 1
      }))
    };

    expect(realmSceneConstructionKey(movedCastle))
      .not.toBe(realmSceneConstructionKey(BASE_INPUT));
    expect(realmSceneConstructionKey(changedNode))
      .not.toBe(realmSceneConstructionKey(BASE_INPUT));
  });

  it('reports initial, topology, quality, and reduced-motion recreation truth', () => {
    const initial = profile(BASE_INPUT);
    const topology = profile({
      ...BASE_INPUT,
      peerCastles: BASE_INPUT.peerCastles.map((castle) => (
        castle.castleId === 2 ? { ...castle, r: castle.r + 1 } : castle
      ))
    });
    const quality = profile({ ...BASE_INPUT, quality: 'high' });
    const reducedMotion = profile({ ...BASE_INPUT, reducedMotion: true });
    const topologyAndQuality = profile({
      ...BASE_INPUT,
      quality: 'high',
      peerCastles: BASE_INPUT.peerCastles.map((castle) => (
        castle.castleId === 2 ? { ...castle, q: castle.q + 1 } : castle
      ))
    });
    const topologyAndReducedMotion = profile({
      ...BASE_INPUT,
      reducedMotion: true,
      stoneNodes: BASE_INPUT.stoneNodes.map((node) => ({
        ...node,
        tier: node.tier + 1
      }))
    });

    expect(realmSceneRecreationReason(undefined, initial)).toBe('initial-entry');
    expect(realmSceneRecreationReason(initial, topology))
      .toBe('canonical-topology-change');
    expect(realmSceneRecreationReason(initial, quality))
      .toBe('graphics-quality-change');
    expect(realmSceneRecreationReason(initial, reducedMotion))
      .toBe('reduced-motion-material-change');
    expect(realmSceneRecreationReason(initial, topologyAndQuality))
      .toBe('canonical-topology-change');
    expect(realmSceneRecreationReason(initial, topologyAndReducedMotion))
      .toBe('canonical-topology-change');
  });

  it('distinguishes both recognized Water revisions and blocks cloned payload identity', () => {
    expect(realmWaterSceneSignature(GENESIS_WATER_CELLS_V1))
      .toBe('water:layout-v1');
    expect(realmWaterSceneSignature(GENESIS_WATER_REVISION_ENABLED_CELLS_V1))
      .toBe('water:layout-v1:revision-v1');
    expect(realmWaterSceneSignature([...GENESIS_WATER_CELLS_V1]))
      .toBe('water:unrecognized');
  });
});
