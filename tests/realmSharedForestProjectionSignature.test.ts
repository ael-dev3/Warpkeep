import { describe, expect, it } from 'vitest';

import { GENESIS_FOREST_LAYOUT_V1_TREE_COUNT } from '../spacetimedb/src/forestLayoutContract';
import {
  BLOCKED_SHARED_FOREST_PROJECTION_SIGNATURE,
  sharedForestProjectionSignature,
} from '../src/components/realm/RealmMapScreen';

function layout(overrides: Readonly<Record<string, unknown>> = {}) {
  return {
    realmId: 'genesis-001',
    layoutVersion: 'forest-v1',
    policyVersion: 'policy-v1',
    layoutDigest: 'layout-digest',
    assetCatalogDigest: 'asset-digest',
    instanceCount: GENESIS_FOREST_LAYOUT_V1_TREE_COUNT,
    ...overrides,
  };
}

function trees() {
  return Array.from({ length: GENESIS_FOREST_LAYOUT_V1_TREE_COUNT }, (_, index) => ({
    treeId: `tree-${index}`,
    realmId: 'genesis-001',
    tileKey: `${index},0`,
    q: index,
    r: 0,
    localXMicrounits: 0n,
    localZMicrounits: 0n,
    worldXMicrounits: BigInt(index),
    worldZMicrounits: 0n,
    rotationMilliDegrees: 0,
    scaleBasisPoints: 10_000,
    speciesId: 'oak',
    habitat: 'forest',
    layoutVersion: 'forest-v1',
  }));
}

describe('shared forest projection signature', () => {
  it('uses typed tuple encoding so delimiter-bearing fields cannot collide', () => {
    const rows = trees();
    const first = sharedForestProjectionSignature(layout({
      realmId: 'a;layoutVersion=string:b',
      layoutVersion: 'c',
    }), rows);
    const second = sharedForestProjectionSignature(layout({
      realmId: 'a',
      layoutVersion: 'b;layoutVersion=string:c',
    }), rows);

    expect(first).not.toBe(second);
  });

  it('rejects invalid cardinality before mapping attacker-sized public arrays', () => {
    const oversizedTrees = new Proxy(new Array(GENESIS_FOREST_LAYOUT_V1_TREE_COUNT + 1), {
      get(target, property, receiver) {
        if (property === 'map' || property === Symbol.iterator) {
          throw new Error('oversized rows must not be traversed');
        }
        return Reflect.get(target, property, receiver);
      },
    });
    expect(sharedForestProjectionSignature(layout(), oversizedTrees)).toBe(
      BLOCKED_SHARED_FOREST_PROJECTION_SIGNATURE,
    );

    const exactTrees = new Proxy(trees(), {
      get(target, property, receiver) {
        if (property === 'map' || property === Symbol.iterator) {
          throw new Error('trees must not be traversed after invalid layout cardinality');
        }
        return Reflect.get(target, property, receiver);
      },
    });
    expect(sharedForestProjectionSignature([layout(), layout()], exactTrees)).toBe(
      BLOCKED_SHARED_FOREST_PROJECTION_SIGNATURE,
    );
  });

  it('keeps an absent old projection distinct from present-invalid tables', () => {
    expect(sharedForestProjectionSignature(undefined, undefined)).toBe('forest:absent');
    expect(sharedForestProjectionSignature(layout(), [])).toBe(
      BLOCKED_SHARED_FOREST_PROJECTION_SIGNATURE,
    );
  });
});
