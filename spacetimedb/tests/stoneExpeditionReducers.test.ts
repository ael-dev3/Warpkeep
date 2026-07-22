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

test('v10 Stone tables remain before the additive Water revision suffix', () => {
  const schema = source('../src/schema.ts');
  const v4 = source('../migration-fixtures/additive-v4-schema/src/index.ts');
  const registrations = schemaRegistrations(schema);
  const v4Registrations = schemaRegistrations(v4.replace('const db = schema({', 'const warpkeep = schema({'));
  assert.deepEqual(registrations.slice(0, v4Registrations.length), v4Registrations);
  assert.deepEqual(registrations.slice(-16, -6), [
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

  const site = tableDefinition(schema, 'stoneSiteV1');
  assert.match(site, /name: 'stone_site_v1', public: true/);
  assert.match(site, /siteId: t\.string\(\)\.primaryKey\(\),[\s\S]*q: t\.i32\(\),[\s\S]*r: t\.i32\(\),[\s\S]*tier: t\.u32\(\),[\s\S]*active: t\.bool\(\)/);
  assert.doesNotMatch(site, /\bfid\b|\bowner\w*\b|\bbalance\w*\b/i);

  const occupation = tableDefinition(schema, 'stoneNodeOccupationV1');
  assert.match(occupation, /name: 'stone_node_occupation_v1',[\s\S]*public: true/);
  assert.doesNotMatch(occupation, /\bfid\b|accrued|credited|idempotency|balance/i);

  const expedition = tableDefinition(schema, 'stoneExpeditionV1');
  assert.doesNotMatch(expedition, /public:\s*true/);
  assert.match(expedition, /fid: t\.u64\(\)\.unique\(\)/);
  assert.match(expedition, /originCastleId: t\.u64\(\)\.unique\(\)/);
  assert.match(expedition, /accruedStone: t\.u64\(\),[\s\S]*creditedStone: t\.u64\(\)/);

  const schedule = tableDefinition(schema, 'stoneExpeditionScheduleV1');
  assert.match(schedule, /name: 'stone_expedition_schedule_v_1'/);
  assert.match(schedule, /public:\s*true/);
  assert.match(schedule, /scheduled: \(\): any => runStoneExpeditionScheduleV1/);
});

test('Stone reducer inputs are caller-bound and its lifecycle is scheduler-only', () => {
  const reducer = source('../src/reducers/stoneExpeditions.ts');
  const dispatch = section(
    reducer,
    'export const dispatchStoneExpeditionV1',
    '/**\n * Explicit no-input claim',
  );
  const privateState = section(
    reducer,
    'export const getMyStoneExpeditionStateV1',
    '/**\n * The browser supplies',
  );
  assert.match(dispatch, /name: 'dispatch_stone_expedition_v1'/);
  assert.match(dispatch, /\{ siteId: t\.string\(\), idempotencyKey: t\.string\(\) \}/);
  assert.match(dispatch, /requireGameplayPlayerV1\(ctx\)/);
  assert.match(dispatch, /dispatchGenesisStoneExpedition\(ctx, \{[\s\S]*fid: claims\.fid,[\s\S]*siteId,[\s\S]*idempotencyKey/);
  assert.doesNotMatch(dispatch, /(?:q|r|fid|castleId|rate|time|duration|phase|stone)\s*:\s*t\./i);
  assert.match(privateState, /name: 'get_my_stone_expedition_state_v1'/);
  assert.match(privateState, /pendingStone: state\.pendingStone/);

  const schema = source('../src/schema.ts');
  const scheduled = section(schema, 'export const runStoneExpeditionScheduleV1', 'for (const name of [');
  assert.match(scheduled, /name: 'run_stone_expedition_schedule_v_1'/);
  assert.doesNotMatch(scheduled, /senderAuth\.isInternal|connectionId|databaseIdentity/);
  assert.match(scheduled, /runStoneExpeditionSchedule\(ctx, arg\)/);

  const authority = source('../src/stoneExpeditionAuthority.ts');
  const expiry = section(authority, 'function creditExpiredStone', 'function completeReturn');
  assert.match(expiry, /stoneNodeOccupationV1\.siteId\.update\(\{[\s\S]*phase: 'returning'/);
  assert.doesNotMatch(expiry, /siteId\.delete\(occupation\.siteId\)/);
  const completion = section(authority, 'function completeReturn', 'export type StoneSiteSeedPlan');
  assert.match(completion, /assertOccupationMatchesExpedition\(occupation, expedition\)/);
  assert.match(completion, /occupation\.phase !== 'returning'/);
  assert.match(completion, /stoneNodeOccupationV1\.siteId\.delete\(occupation\.siteId\)/);
  assert.ok(
    completion.indexOf('stoneNodeOccupationV1.siteId.delete(occupation.siteId)')
      < completion.indexOf('stoneExpeditionV1.expeditionId.delete(expedition.expeditionId)'),
  );
});

test('Food, Stone, and Gold wagons are independent while every passive settlement preserves paired reserves', () => {
  const stoneAuthority = source('../src/stoneExpeditionAuthority.ts');
  const foodAuthority = source('../src/foodExpeditionAuthority.ts');
  const goldAuthority = source('../src/goldExpeditionAuthority.ts');
  const resources = source('../src/reducers/resources.ts');
  const reservation = source('../src/resourceExpeditionReservationAuthority.ts');

  const stoneDispatch = section(stoneAuthority, 'export function dispatchGenesisStoneExpedition', '/**\n * Claim');
  const goldDispatch = section(goldAuthority, 'export function dispatchGenesisGoldExpedition', '/**\n * Claim');
  assert.match(stoneDispatch, /stoneExpeditionV1\.originCastleId\.find/);
  assert.match(goldDispatch, /goldExpeditionV1\.originCastleId\.find/);
  // Separate private tables deliberately permit the same founder/castle to
  // have one Stone wagon alongside independently bounded Food and Gold wagons.
  assert.doesNotMatch(stoneDispatch, /goldExpeditionV1/);
  assert.doesNotMatch(stoneDispatch, /foodExpeditionV1/);
  assert.doesNotMatch(goldDispatch, /stoneExpeditionV1/);

  for (const [name, text] of [
    ['resource HUD/collector', resources],
    ['Gold lifecycle', goldAuthority],
    ['Food lifecycle', foodAuthority],
    ['Stone lifecycle', stoneAuthority],
  ] as const) {
    assert.match(
      text,
      /planResourceSettlementForActiveExpeditionReservations\(/,
      `${name} must preserve active Food and Stone awards`,
    );
  }
  assert.match(reservation, /ctx\.db\.foodExpeditionV1\.fid\.find\(fid\)/);
  assert.match(reservation, /ctx\.db\.stoneExpeditionV1\.fid\.find\(fid\)/);
  assert.match(reservation, /STONE_GATHERING_TOTAL_STONE - stone\.creditedStone/);
  assert.match(reservation, /planResourceSettlementWithExpeditionReservations\(/);

  const stoneExpiry = section(stoneAuthority, 'function creditExpiredStone', 'function completeReturn');
  assert.match(stoneExpiry, /planResourceSettlementForActiveExpeditionReservations\([\s\S]*now,/);
  assert.doesNotMatch(stoneExpiry, /planResourceSettlement\([\s\S]*gatheringEndsAtMicros/);
  const goldExpiry = section(goldAuthority, 'function creditExpiredGold', 'function completeReturn');
  assert.match(goldExpiry, /planResourceSettlementForActiveExpeditionReservations\([\s\S]*now,/);

  const collect = section(resources, 'export const collectResourcesV1', '/**\n * Hermes-only');
  assert.match(collect, /collectActiveStoneExpedition\(ctx, claims\.fid\)/);
  assert.match(collect, /collectActiveGoldExpedition\(ctx, claims\.fid\)/);
  assert.ok(
    collect.indexOf('collectActiveStoneExpedition(ctx, claims.fid)')
      < collect.indexOf('planResourceSettlementForActiveExpeditionReservations('),
  );
});
