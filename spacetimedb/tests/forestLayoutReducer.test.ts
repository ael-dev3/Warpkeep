import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import test from 'node:test';

function source(path: string): string {
  return readFileSync(new URL(path, import.meta.url), 'utf8');
}

test('forest seeding is admin-only, canonical-only, and idempotent', () => {
  const reducer = source('../src/reducers/forestLayout.ts');
  const authority = source('../src/forestLayoutAuthority.ts');

  assert.match(reducer, /name: 'admin_seed_genesis_forest_layout_v1'/);
  assert.match(
    reducer,
    /warpkeep\.reducer\(\s*\{ name: 'admin_seed_genesis_forest_layout_v1' \},\s*ctx =>/,
  );
  assert.match(reducer, /const admin = requireAdmin\(ctx\)/);
  assert.match(reducer, /const plan = planGenesisForestLayoutSeed\(ctx\)/);
  assert.match(reducer, /for \(const instance of plan\.missingInstances\)/);
  assert.match(reducer, /insertGenesisForestLayoutMetadata\(ctx\)/);
  assert.match(reducer, /FOREST_LAYOUT_SEED_INTEGRITY/);

  assert.match(authority, /matchesCanonicalGenesisForestInstanceV1\(row\)/);
  assert.match(authority, /matchesCanonicalGenesisForestLayoutV1\(row\)/);
  assert.match(authority, /FOREST_LAYOUT_METADATA_PARTIAL/);
  assert.match(authority, /matchesCanonicalTerrain\(storedTile\)/);
  assert.match(authority, /matchesCanonicalWorldMeta\(storedMeta\)/);
  assert.doesNotMatch(authority, /goldNodeOccupation|goldExpedition|dispatchGenesisGold/);
});

test('the public forest rows are present in committed generated bindings', () => {
  const bindings = new URL('../../src/spacetime/module_bindings/', import.meta.url);
  const layout = new URL('realm_forest_layout_v_1_table.ts', bindings);
  const instances = new URL('realm_forest_instance_v_1_table.ts', bindings);
  const reducer = new URL('admin_seed_genesis_forest_layout_v_1_reducer.ts', bindings);
  const index = new URL('index.ts', bindings);

  assert.equal(existsSync(layout), true);
  assert.equal(existsSync(instances), true);
  assert.equal(existsSync(reducer), true);
  assert.match(readFileSync(layout, 'utf8'),
    /realmId:[\s\S]*layoutVersion:[\s\S]*layoutDigest:[\s\S]*assetCatalogDigest:[\s\S]*instanceCount:/);
  assert.match(readFileSync(instances, 'utf8'),
    /treeId:[\s\S]*localXMicrounits:[\s\S]*worldZMicrounits:[\s\S]*rotationMilliDegrees:[\s\S]*scaleBasisPoints:[\s\S]*speciesId:[\s\S]*habitat:/);
  const indexSource = readFileSync(index, 'utf8');
  assert.match(indexSource, /realmForestLayoutV1:/);
  assert.match(indexSource, /realmForestInstanceV1:/);
});
