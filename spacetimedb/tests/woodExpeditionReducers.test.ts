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

test('v8 Wood tables append after the complete v5 Gold, v6 forest, and v7 Food suffixes', () => {
  const schema = source('../src/schema.ts');
  const v4 = source('../migration-fixtures/additive-v4-schema/src/index.ts');
  const registrations = schemaRegistrations(schema);
  const v4Registrations = schemaRegistrations(v4.replace('const db = schema({', 'const warpkeep = schema({'));
  assert.deepEqual(registrations.slice(0, v4Registrations.length), v4Registrations);
  assert.deepEqual(registrations.slice(-17), [
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
  ]);

  const site = tableDefinition(schema, 'woodSiteV1');
  assert.match(site, /name: 'wood_site_v1', public: true/);
  assert.match(site, /siteId: t\.string\(\)\.primaryKey\(\),[\s\S]*q: t\.i32\(\),[\s\S]*r: t\.i32\(\),[\s\S]*tier: t\.u32\(\),[\s\S]*active: t\.bool\(\)/);
  assert.doesNotMatch(site, /\bfid\b|\bowner\w*\b|\bbalance\w*\b/i);

  const occupation = tableDefinition(schema, 'woodNodeOccupationV1');
  assert.match(occupation, /name: 'wood_node_occupation_v1',[\s\S]*public: true/);
  assert.doesNotMatch(occupation, /\bfid\b|accrued|credited|idempotency|balance/i);

  const expedition = tableDefinition(schema, 'woodExpeditionV1');
  assert.doesNotMatch(expedition, /public:\s*true/);
  assert.match(expedition, /fid: t\.u64\(\)\.unique\(\)/);
  assert.match(expedition, /originCastleId: t\.u64\(\)\.unique\(\)/);
  assert.match(expedition, /accruedWood: t\.u64\(\),[\s\S]*creditedWood: t\.u64\(\)/);

  const schedule = tableDefinition(schema, 'woodExpeditionScheduleV1');
  assert.match(schedule, /name: 'wood_expedition_schedule_v_1'/);
  assert.match(schedule, /public:\s*true/);
  assert.match(schedule, /scheduled: \(\): any => runWoodExpeditionScheduleV1/);
});

test('Wood reducer inputs are caller-bound and its lifecycle is scheduler-only', () => {
  const reducer = source('../src/reducers/woodExpeditions.ts');
  const dispatch = section(
    reducer,
    'export const dispatchWoodExpeditionV1',
    '/**\n * Explicit no-input claim',
  );
  const privateState = section(
    reducer,
    'export const getMyWoodExpeditionStateV1',
    '/**\n * The browser supplies',
  );
  assert.match(dispatch, /name: 'dispatch_wood_expedition_v1'/);
  assert.match(dispatch, /\{ siteId: t\.string\(\), idempotencyKey: t\.string\(\) \}/);
  assert.match(dispatch, /requireGameplayPlayerV1\(ctx\)/);
  assert.match(dispatch, /dispatchGenesisWoodExpedition\(ctx, \{[\s\S]*fid: claims\.fid,[\s\S]*siteId,[\s\S]*idempotencyKey/);
  assert.doesNotMatch(dispatch, /(?:q|r|fid|castleId|rate|time|duration|phase|wood)\s*:\s*t\./i);
  assert.match(privateState, /name: 'get_my_wood_expedition_state_v1'/);
  assert.match(privateState, /pendingWood: state\.pendingWood/);

  const schema = source('../src/schema.ts');
  const scheduled = section(schema, 'export const runWoodExpeditionScheduleV1', 'for (const name of [');
  assert.match(scheduled, /name: 'run_wood_expedition_schedule_v_1'/);
  assert.match(scheduled, /if \(!ctx\.senderAuth\.isInternal\)/);
  assert.match(scheduled, /WOOD_EXPEDITION_SCHEDULE_INTERNAL_ONLY/);
  assert.match(scheduled, /runWoodExpeditionSchedule\(ctx, arg\)/);
});

test('Food, Wood, and Gold wagons are independent while every passive settlement preserves paired reserves', () => {
  const woodAuthority = source('../src/woodExpeditionAuthority.ts');
  const foodAuthority = source('../src/foodExpeditionAuthority.ts');
  const goldAuthority = source('../src/goldExpeditionAuthority.ts');
  const resources = source('../src/reducers/resources.ts');
  const reservation = source('../src/resourceExpeditionReservationAuthority.ts');

  const woodDispatch = section(woodAuthority, 'export function dispatchGenesisWoodExpedition', '/**\n * Claim');
  const goldDispatch = section(goldAuthority, 'export function dispatchGenesisGoldExpedition', '/**\n * Claim');
  assert.match(woodDispatch, /woodExpeditionV1\.originCastleId\.find/);
  assert.match(goldDispatch, /goldExpeditionV1\.originCastleId\.find/);
  // Separate private tables deliberately permit the same founder/castle to
  // have one Wood wagon alongside independently bounded Food and Gold wagons.
  assert.doesNotMatch(woodDispatch, /goldExpeditionV1/);
  assert.doesNotMatch(woodDispatch, /foodExpeditionV1/);
  assert.doesNotMatch(goldDispatch, /woodExpeditionV1/);

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
  assert.match(reservation, /WOOD_GATHERING_TOTAL_WOOD - wood\.creditedWood/);
  assert.match(reservation, /planResourceSettlementWithExpeditionReservations\(/);

  const woodExpiry = section(woodAuthority, 'function creditExpiredWood', 'function completeReturn');
  assert.match(woodExpiry, /planResourceSettlementForActiveExpeditionReservations\([\s\S]*now,/);
  assert.doesNotMatch(woodExpiry, /planResourceSettlement\([\s\S]*gatheringEndsAtMicros/);
  const goldExpiry = section(goldAuthority, 'function creditExpiredGold', 'function completeReturn');
  assert.match(goldExpiry, /planResourceSettlementForActiveExpeditionReservations\([\s\S]*now,/);

  const collect = section(resources, 'export const collectResourcesV1', '/**\n * Hermes-only');
  assert.match(collect, /collectActiveWoodExpedition\(ctx, claims\.fid\)/);
  assert.match(collect, /collectActiveGoldExpedition\(ctx, claims\.fid\)/);
  assert.ok(
    collect.indexOf('collectActiveWoodExpedition(ctx, claims.fid)')
      < collect.indexOf('planResourceSettlementForActiveExpeditionReservations('),
  );
});
