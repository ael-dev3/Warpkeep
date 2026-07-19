import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

function source(path: string): string {
  return readFileSync(new URL(path, import.meta.url), 'utf8');
}

function tableDefinition(text: string, sourceName: string): string {
  const start = text.indexOf(`export const ${sourceName} = table(`);
  assert.notEqual(start, -1, `missing table ${sourceName}`);
  const end = text.indexOf('\n);', start);
  assert.notEqual(end, -1, `unterminated table ${sourceName}`);
  return text.slice(start, end + 3);
}

test('Water revision authority requires an exact active v1 base and environment', () => {
  const authority = source('../src/waterRevisionAuthority.ts');

  assert.match(authority, /plan = planGenesisWaterLayoutSeed\(ctx\)/);
  assert.match(authority, /!plan\.layout\.activated/);
  assert.match(authority, /classifyGenesisWaterEnvironmentV1/);
  assert.match(authority, /environmentState !== 'exact'/);
  assert.match(authority, /realmWaterLayoutV1\.count\(\) !== 1n/);
  assert.match(authority, /realmWaterBodyV1\.count\(\)/);
  assert.match(authority, /realmWaterCellV1\.count\(\)/);
  assert.match(authority, /realmEnvironmentV1\.count\(\) !== 1n/);
  assert.match(authority, /matchesCanonicalGenesisWaterRevisionV1\(row\)/);
  assert.match(authority, /WATER_REVISION_METADATA_CONFLICT/);
  assert.match(authority, /activatedAt\.microsSinceUnixEpoch >= row\.seededAt/);
});

test('Water revision lifecycle is admin-only, input-free, idempotent, and aggregate-only', () => {
  const reducer = source('../src/reducers/waterRevision.ts');
  const index = source('../src/index.ts');

  for (const operation of ['seed', 'activate']) {
    assert.match(reducer, new RegExp(
      `warpkeep\\.reducer\\(\\s*\\{ name: 'admin_${operation}_genesis_water_revision_v1' \\},\\s*ctx =>`,
    ));
  }
  assert.match(reducer, /name: 'admin_inspect_genesis_water_revision_v1'/);
  assert.match(reducer, /const admin = requireAdmin\(ctx\)/);
  assert.match(reducer, /if \(plan\.revision !== undefined\) return;/);
  assert.match(reducer, /if \(before\.revision\.activated\) return;/);
  assert.match(reducer, /revisionRows: tx\.db\.realmWaterRevisionV1\.count\(\)/);
  assert.doesNotMatch(reducer, /\.q\b|\.r\b|cellKey|bodyId/);
  assert.match(index, /adminSeedGenesisWaterRevisionV1/);
  assert.match(index, /adminActivateGenesisWaterRevisionV1/);
  assert.match(index, /adminInspectGenesisWaterRevisionV1/);
});

test('the append-only public revision table stores policy without topology', () => {
  const schema = source('../src/schema.ts');
  const revision = tableDefinition(schema, 'realmWaterRevisionV1');

  assert.match(revision, /name: 'realm_water_revision_v1', public: true/);
  assert.match(revision, /realmId: t\.string\(\)\.primaryKey\(\)/);
  assert.match(revision, /baseLayoutDigest: t\.string\(\)/);
  assert.match(revision, /lakeCellCount: t\.u32\(\)/);
  assert.match(revision, /riverWidthCells: t\.u32\(\)/);
  assert.match(revision, /navigationFogBoundaryDepthCells: t\.u32\(\)/);
  assert.match(revision, /activatedAt: t\.option\(t\.timestamp\(\)\)/);
  assert.doesNotMatch(revision, /\n\s*q:|\n\s*r:|cellKey:|bodyId:/);
  assert.match(schema, /stoneExpeditionScheduleV1,\n\s*realmWaterRevisionV1,\n\}\);/);
});
