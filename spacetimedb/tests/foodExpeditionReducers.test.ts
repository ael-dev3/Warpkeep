import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

function source(path: string): string {
  return readFileSync(new URL(path, import.meta.url), 'utf8');
}

function section(text: string, startNeedle: string, endNeedle?: string): string {
  const start = text.indexOf(startNeedle);
  assert.notEqual(start, -1, `missing source section: ${startNeedle}`);
  if (endNeedle === undefined) return text.slice(start);
  const end = text.indexOf(endNeedle, start + startNeedle.length);
  assert.notEqual(end, -1, `missing source section terminator: ${endNeedle}`);
  return text.slice(start, end);
}

function tableDefinition(text: string, sourceName: string): string {
  const start = text.indexOf(`export const ${sourceName} = table(`);
  assert.notEqual(start, -1, `missing table ${sourceName}`);
  const end = text.indexOf('\n);', start);
  assert.notEqual(end, -1, `unterminated table ${sourceName}`);
  return text.slice(start, end + 3);
}

function schemaRegistrations(text: string): string[] {
  const start = text.indexOf('const warpkeep = schema({');
  const end = text.indexOf('\n});', start);
  assert.ok(start >= 0 && end > start);
  return text.slice(start, end)
    .split('\n')
    .map(line => line.trim())
    .filter(line => /^[A-Za-z][A-Za-z0-9]*,$/.test(line))
    .map(line => line.slice(0, -1));
}

test('v7 Food tables remain intact through later additive suffixes', () => {
  const schema = source('../src/schema.ts');
  const v4 = source('../migration-fixtures/additive-v4-schema/src/index.ts');
  const registrations = schemaRegistrations(schema);
  const v4Registrations = schemaRegistrations(v4.replace('const db = schema({', 'const warpkeep = schema({'));
  assert.deepEqual(registrations.slice(0, v4Registrations.length), v4Registrations);
  assert.deepEqual(registrations.slice(-33, -6), [
    'goldSiteV1',
    'goldNodeOccupationV1',
    'goldExpeditionV1',
    'goldExpeditionIdempotencyV1',
    'goldExpeditionScheduleV1',
    'realmForestLayoutV1',
    'realmForestInstanceV1',
    'foodSiteV1',
    'foodNodeOccupationV1',
    'foodExpeditionV1',
    'foodExpeditionIdempotencyV1',
    'foodExpeditionScheduleV1',
    'woodSiteV1',
    'woodNodeOccupationV1',
    'woodExpeditionV1',
    'woodExpeditionIdempotencyV1',
    'woodExpeditionScheduleV1',
    'realmWaterLayoutV1',
    'realmWaterBodyV1',
    'realmWaterCellV1',
    'realmEnvironmentV1',
    'stoneSiteV1',
    'stoneNodeOccupationV1',
    'stoneExpeditionV1',
    'stoneExpeditionIdempotencyV1',
    'stoneExpeditionScheduleV1',
    'realmWaterRevisionV1',
  ]);

  const site = tableDefinition(schema, 'foodSiteV1');
  assert.match(site, /name: 'food_site_v1', public: true/);
  assert.match(site, /siteId: t\.string\(\)\.primaryKey\(\),[\s\S]*q: t\.i32\(\),[\s\S]*r: t\.i32\(\),[\s\S]*tier: t\.u32\(\),[\s\S]*active: t\.bool\(\)/);
  assert.doesNotMatch(site, /\bfid\b|\bowner\w*\b|\bbalance\w*\b/i);

  const occupation = tableDefinition(schema, 'foodNodeOccupationV1');
  assert.match(occupation, /name: 'food_node_occupation_v1',[\s\S]*public: true/);
  assert.doesNotMatch(occupation, /\bfid\b|accrued|credited|idempotency|balance/i);

  const expedition = tableDefinition(schema, 'foodExpeditionV1');
  assert.doesNotMatch(expedition, /public:\s*true/);
  assert.match(expedition, /fid: t\.u64\(\)\.unique\(\)/);
  assert.match(expedition, /originCastleId: t\.u64\(\)\.unique\(\)/);
  assert.match(expedition, /accruedFood: t\.u64\(\),[\s\S]*creditedFood: t\.u64\(\)/);

  const schedule = tableDefinition(schema, 'foodExpeditionScheduleV1');
  assert.match(schedule, /name: 'food_expedition_schedule_v_1'/);
  assert.match(schedule, /public:\s*true/);
  assert.match(schedule, /scheduled: \(\): any => runFoodExpeditionScheduleV1/);
});

test('Food reducer inputs are caller-bound and its lifecycle is scheduler-only', () => {
  const reducer = source('../src/reducers/foodExpeditions.ts');
  const dispatch = section(
    reducer,
    'export const dispatchFoodExpeditionV1',
    '/**\n * Explicit no-input claim',
  );
  const privateState = section(
    reducer,
    'export const getMyFoodExpeditionStateV1',
    '/**\n * The browser supplies',
  );
  assert.match(dispatch, /name: 'dispatch_food_expedition_v1'/);
  assert.match(dispatch, /\{ siteId: t\.string\(\), idempotencyKey: t\.string\(\) \}/);
  assert.match(dispatch, /requireGameplayPlayerV1\(ctx\)/);
  assert.match(dispatch, /dispatchGenesisFoodExpedition\(ctx, \{[\s\S]*fid: claims\.fid,[\s\S]*siteId,[\s\S]*idempotencyKey/);
  assert.doesNotMatch(dispatch, /(?:q|r|fid|castleId|rate|time|duration|phase|food)\s*:\s*t\./i);
  assert.match(privateState, /name: 'get_my_food_expedition_state_v1'/);
  assert.match(privateState, /pendingFood: state\.pendingFood/);

  const schema = source('../src/schema.ts');
  const scheduled = section(schema, 'export const runFoodExpeditionScheduleV1', 'for (const name of [');
  assert.match(scheduled, /name: 'run_food_expedition_schedule_v_1'/);
  assert.doesNotMatch(scheduled, /senderAuth\.isInternal|connectionId|databaseIdentity/);
  assert.match(scheduled, /runFoodExpeditionSchedule\(ctx, arg\)/);

  const authority = source('../src/foodExpeditionAuthority.ts');
  const expiry = section(authority, 'function creditExpiredFood', 'function completeReturn');
  assert.match(expiry, /foodNodeOccupationV1\.siteId\.update\(\{[\s\S]*phase: 'returning'/);
  assert.doesNotMatch(expiry, /siteId\.delete\(occupation\.siteId\)/);
  const completion = section(authority, 'function completeReturn', 'export type FoodSiteSeedPlan');
  assert.match(completion, /assertOccupationMatchesExpedition\(occupation, expedition\)/);
  assert.match(completion, /occupation\.phase !== 'returning'/);
  assert.match(completion, /foodNodeOccupationV1\.siteId\.delete\(occupation\.siteId\)/);
  assert.ok(
    completion.indexOf('foodNodeOccupationV1.siteId.delete(occupation.siteId)')
      < completion.indexOf('foodExpeditionV1.expeditionId.delete(expedition.expeditionId)'),
  );
});

test('Food, Gold, and Wood wagons are independent while every passive settlement preserves paired reserves', () => {
  const foodAuthority = source('../src/foodExpeditionAuthority.ts');
  const woodAuthority = source('../src/woodExpeditionAuthority.ts');
  const goldAuthority = source('../src/goldExpeditionAuthority.ts');
  const resources = source('../src/reducers/resources.ts');
  const reservation = source('../src/resourceExpeditionReservationAuthority.ts');

  const foodDispatch = section(foodAuthority, 'export function dispatchGenesisFoodExpedition', '/**\n * Claim');
  const goldDispatch = section(goldAuthority, 'export function dispatchGenesisGoldExpedition', '/**\n * Claim');
  assert.match(foodDispatch, /foodExpeditionV1\.originCastleId\.find/);
  assert.match(goldDispatch, /goldExpeditionV1\.originCastleId\.find/);
  // Separate private tables deliberately permit the same founder/castle to
  // have Food, Wood, and Gold wagons in flight at the same time.
  assert.doesNotMatch(foodDispatch, /goldExpeditionV1/);
  assert.doesNotMatch(goldDispatch, /foodExpeditionV1/);

  for (const [name, text] of [
    ['resource HUD/collector', resources],
    ['Gold lifecycle', goldAuthority],
    ['Food lifecycle', foodAuthority],
    ['Wood lifecycle', woodAuthority],
  ] as const) {
    assert.match(
      text,
      /planResourceSettlementForActiveExpeditionReservations\(/,
      `${name} must preserve active Food and Wood awards`,
    );
  }
  assert.match(reservation, /ctx\.db\.foodExpeditionV1\.fid\.find\(fid\)/);
  assert.match(reservation, /ctx\.db\.woodExpeditionV1\.fid\.find\(fid\)/);
  assert.match(reservation, /FOOD_GATHERING_TOTAL_FOOD - food\.creditedFood/);
  assert.match(reservation, /planResourceSettlementWithExpeditionReservations\(/);

  const foodExpiry = section(foodAuthority, 'function creditExpiredFood', 'function completeReturn');
  assert.match(foodExpiry, /planResourceSettlementForActiveExpeditionReservations\([\s\S]*now,/);
  assert.doesNotMatch(foodExpiry, /planResourceSettlement\([\s\S]*gatheringEndsAtMicros/);
  const goldExpiry = section(goldAuthority, 'function creditExpiredGold', 'function completeReturn');
  assert.match(goldExpiry, /planResourceSettlementForActiveExpeditionReservations\([\s\S]*now,/);

  const collect = section(resources, 'export const collectResourcesV1', '/**\n * Hermes-only');
  assert.match(collect, /collectActiveFoodExpedition\(ctx, claims\.fid\)/);
  assert.match(collect, /collectActiveGoldExpedition\(ctx, claims\.fid\)/);
  assert.ok(
    collect.indexOf('collectActiveFoodExpedition(ctx, claims.fid)')
      < collect.indexOf('planResourceSettlementForActiveExpeditionReservations('),
  );
});
