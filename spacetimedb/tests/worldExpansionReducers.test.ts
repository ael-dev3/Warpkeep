import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

function source(path: string): string {
  return readFileSync(new URL(path, import.meta.url), 'utf8');
}

test('routine world seeding refuses the deployed generation-v2 realm before any write', () => {
  const admin = source('../src/reducers/admin.ts');
  const start = admin.indexOf('export const adminSeedWorld');
  const end = admin.indexOf('export const adminExpandGenesisWorldV3', start);
  const reducer = admin.slice(start, end);
  const predecessor = reducer.indexOf('matchesGenerationV2Realm(existingRealm)');
  const refusal = reducer.indexOf('WORLD_EXPANSION_REQUIRES_V3_REDUCER');
  const seed = reducer.indexOf('seedCanonicalWorld(ctx)');
  assert.ok(predecessor >= 0 && refusal > predecessor && seed > refusal);
});

test('the expansion reducer is admin-only, exact-CAS, atomic, and target-idempotent', () => {
  const admin = source('../src/reducers/admin.ts');
  const start = admin.indexOf('export const adminExpandGenesisWorldV3');
  const end = admin.indexOf('export const adminAllowFid', start);
  const reducer = admin.slice(start, end);
  assert.ok(start >= 0 && end > start);
  assert.match(reducer, /name: 'admin_expand_genesis_world_v3'/);
  assert.match(reducer, /expectedWorldTiles: t\.u64\(\)/);
  assert.match(reducer, /expectedWorldTileMeta: t\.u64\(\)/);
  assert.match(reducer, /expectedGenerationVersion: t\.u32\(\)/);

  const adminCheck = reducer.indexOf('requireAdmin(ctx)');
  const classify = reducer.indexOf('classifyGenesisStaticSnapshot(snapshot)');
  const graph = reducer.indexOf('worldCastleGraphIsConsistent(');
  const dynamicGraph = reducer.indexOf('assertExactGenesisDynamicGraph(ctx)', graph);
  const targetNoop = reducer.indexOf("if (generation === 'generation-v3') return");
  const seed = reducer.indexOf('seedCanonicalWorld(ctx)');
  const postcondition = reducer.indexOf("!== 'generation-v3'", seed);
  const audit = reducer.indexOf("'expand_world_v3'", seed);
  assert.ok(
    adminCheck >= 0
    && classify > adminCheck
    && graph > classify
    && dynamicGraph > graph
    && targetNoop > dynamicGraph
    && seed > targetNoop
    && postcondition > seed
    && audit > postcondition,
  );
});

test('the realm transition rechecks the exact predecessor and preserves createdAt', () => {
  const reducer = source('../src/reducers/worldSeed.ts');
  assert.match(reducer, /plan\.realmTransition\.kind === 'update'/);
  assert.match(reducer, /existing\.generationVersion !== plan\.realmTransition\.previous\.generationVersion/);
  assert.match(reducer, /existing\.authoritativeRadius !== plan\.realmTransition\.previous\.authoritativeRadius/);
  assert.match(reducer, /createdAt: existing\.createdAt/);
});
