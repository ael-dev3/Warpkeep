import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';

import {
  CANONICAL_GENESIS_FOREST_INSTANCES_V1,
  CANONICAL_GENESIS_FOREST_LAYOUT_V1,
  GENESIS_FOREST_LAYOUT_V1_FIXED_POINT,
  GENESIS_FOREST_LAYOUT_V1_SPECIES_IDS,
  canonicalGenesisForestAssetCatalogV1DigestInput,
  canonicalGenesisForestLayoutV1DigestInput,
  isCompleteCanonicalGenesisForestLayoutV1,
  matchesCanonicalGenesisForestInstanceV1,
} from '../src/forestLayoutPolicy';
import {
  GENESIS_FOREST_LAYOUT_V1_ASSET_CATALOG_DIGEST,
  GENESIS_FOREST_LAYOUT_V1_DIGEST,
  GENESIS_FOREST_LAYOUT_V1_HABITATS,
  GENESIS_FOREST_LAYOUT_V1_TREE_COUNT,
} from '../src/forestLayoutContract';
import { CANONICAL_CASTLE_SLOTS, canonicalMetaForKey } from '../src/world';

// Matches the authored 1.22-unit landscape foundation plus the 0.16-unit
// tree structure clearance used by the reviewed planner. Keep this entirely
// in fixed point so a refactor cannot reintroduce a platform-rounding edge.
const CASTLE_FOUNDATION_CLEARANCE_MICROUNITS = 1_380_000n;

function canonicalTileCenterMicrounits(q: number, r: number) {
  return Object.freeze({
    x: BigInt(Math.round(Math.sqrt(3) * (q + r * 0.5) * 1_000_000)),
    z: BigInt(Math.round(r * 1.5 * 1_000_000)),
  });
}

test('the Genesis 001 shared forest is a fixed 210-instance reviewed catalog', () => {
  assert.equal(CANONICAL_GENESIS_FOREST_INSTANCES_V1.length, GENESIS_FOREST_LAYOUT_V1_TREE_COUNT);
  assert.equal(CANONICAL_GENESIS_FOREST_LAYOUT_V1.instanceCount, GENESIS_FOREST_LAYOUT_V1_TREE_COUNT);
  assert.equal(
    createHash('sha256').update(canonicalGenesisForestLayoutV1DigestInput()).digest('hex'),
    GENESIS_FOREST_LAYOUT_V1_DIGEST,
  );
  assert.equal(
    createHash('sha256').update(canonicalGenesisForestAssetCatalogV1DigestInput()).digest('hex'),
    GENESIS_FOREST_LAYOUT_V1_ASSET_CATALOG_DIGEST,
  );

  const ids = new Set<string>();
  const species = new Set<string>();
  const minimumCastleClearanceSquared = CASTLE_FOUNDATION_CLEARANCE_MICROUNITS
    * CASTLE_FOUNDATION_CLEARANCE_MICROUNITS;
  for (const instance of CANONICAL_GENESIS_FOREST_INSTANCES_V1) {
    assert.equal(ids.has(instance.treeId), false);
    ids.add(instance.treeId);
    species.add(instance.speciesId);
    assert.equal(instance.tileKey, `${instance.q},${instance.r}`);
    assert.equal(matchesCanonicalGenesisForestInstanceV1(instance), true);
    assert.ok(GENESIS_FOREST_LAYOUT_V1_HABITATS.includes(instance.habitat));
    assert.ok(instance.rotationMilliDegrees >= 0 && instance.rotationMilliDegrees < 360_000);
    assert.ok(instance.scaleBasisPoints >= 9_000 && instance.scaleBasisPoints <= 11_000);

    const meta = canonicalMetaForKey(instance.tileKey);
    assert.equal(meta?.passable, true);
    assert.ok(meta?.terrainKind === 'forest' || meta?.terrainKind === 'lowland' || meta?.terrainKind === 'meadow');
    assert.notEqual(meta?.staticContentKind, 'castle-slot');
    assert.notEqual(meta?.staticContentKind, 'scenic-blocker');

    for (const slot of CANONICAL_CASTLE_SLOTS) {
      const center = canonicalTileCenterMicrounits(slot.q, slot.r);
      const xDelta = instance.worldXMicrounits - center.x;
      const zDelta = instance.worldZMicrounits - center.z;
      assert.ok(
        xDelta * xDelta + zDelta * zDelta >= minimumCastleClearanceSquared,
        `${instance.treeId} violates canonical castle foundation clearance`,
      );
    }

    const centerX = Math.round(
      Math.sqrt(3) * (instance.q + instance.r * 0.5)
        * GENESIS_FOREST_LAYOUT_V1_FIXED_POINT.transformMicrounits,
    );
    const centerZ = Math.round(instance.r * 1.5 * GENESIS_FOREST_LAYOUT_V1_FIXED_POINT.transformMicrounits);
    assert.ok(
      Math.abs(Number(instance.worldXMicrounits) - centerX - Number(instance.localXMicrounits)) <= 1,
    );
    assert.ok(
      Math.abs(Number(instance.worldZMicrounits) - centerZ - Number(instance.localZMicrounits)) <= 1,
    );
  }
  assert.equal(species.size, GENESIS_FOREST_LAYOUT_V1_SPECIES_IDS.length);
  assert.equal(isCompleteCanonicalGenesisForestLayoutV1(
    CANONICAL_GENESIS_FOREST_LAYOUT_V1,
    CANONICAL_GENESIS_FOREST_INSTANCES_V1,
  ), true);
});

test('the exact completeness gate rejects partial or altered public layout rows', () => {
  assert.equal(isCompleteCanonicalGenesisForestLayoutV1(
    CANONICAL_GENESIS_FOREST_LAYOUT_V1,
    CANONICAL_GENESIS_FOREST_INSTANCES_V1.slice(1),
  ), false);

  const first = CANONICAL_GENESIS_FOREST_INSTANCES_V1[0]!;
  assert.equal(isCompleteCanonicalGenesisForestLayoutV1(
    CANONICAL_GENESIS_FOREST_LAYOUT_V1,
    [{ ...first, scaleBasisPoints: first.scaleBasisPoints + 1 }, ...CANONICAL_GENESIS_FOREST_INSTANCES_V1.slice(1)],
  ), false);
});
