import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
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

test('v5 Gold authority prefix remains intact through later additive suffixes', () => {
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
  assert.deepEqual(registrations.slice(-33, -28), [
    'goldSiteV1',
    'goldNodeOccupationV1',
    'goldExpeditionV1',
    'goldExpeditionIdempotencyV1',
    'goldExpeditionScheduleV1',
  ]);

  const site = tableDefinition(schema, 'goldSiteV1');
  assert.match(site, /name: 'gold_site_v1', public: true/);
  assert.match(site, /siteId: t\.string\(\)\.primaryKey\(\),[\s\S]*q: t\.i32\(\),[\s\S]*r: t\.i32\(\),[\s\S]*tier: t\.u32\(\),[\s\S]*active: t\.bool\(\)/);
  assert.doesNotMatch(site, /\bfid\b|\bowner\w*\b|\bbalance\w*\b/i);

  const occupation = tableDefinition(schema, 'goldNodeOccupationV1');
  assert.match(occupation, /name: 'gold_node_occupation_v1',[\s\S]*public: true/);
  assert.match(occupation, /siteId: t\.string\(\)\.primaryKey\(\),[\s\S]*originCastleId: t\.u64\(\),[\s\S]*phase: t\.string\(\),[\s\S]*startedAtMicros: t\.u64\(\),[\s\S]*arrivesAtMicros: t\.u64\(\),[\s\S]*gatheringEndsAtMicros: t\.u64\(\),[\s\S]*returnsAtMicros: t\.u64\(\)/);
  assert.doesNotMatch(occupation, /\bfid\b|accrued|credited|idempotency|balance/i);

  const expedition = tableDefinition(schema, 'goldExpeditionV1');
  assert.doesNotMatch(expedition, /public:\s*true/);
  assert.match(expedition, /fid: t\.u64\(\)\.unique\(\)/);
  assert.match(expedition, /originCastleId: t\.u64\(\)\.unique\(\)/);
  assert.match(expedition, /siteId: t\.string\(\)\.index\(\)/);
  assert.match(expedition, /settledThroughMicros: t\.u64\(\),[\s\S]*accruedGold: t\.u64\(\),[\s\S]*creditedGold: t\.u64\(\)/);

  const schedule = tableDefinition(schema, 'goldExpeditionScheduleV1');
  assert.match(schedule, /name: 'gold_expedition_schedule_v_1'/);
  assert.match(schedule, /public:\s*true/);
  assert.match(schedule, /scheduled: \(\): any => runGoldExpeditionScheduleV1/);
  assert.match(
    schedule,
    /scheduleId: t\.u64\(\)\.primaryKey\(\)\.autoInc\(\),[\s\S]*scheduledAt: t\.scheduleAt\(\),[\s\S]*originCastleId: t\.u64\(\)\.index\(\),[\s\S]*siteId: t\.string\(\)\.index\(\),[\s\S]*stage: t\.string\(\)/,
  );
  // This public row is only a scheduler projection of already-public
  // occupation timing. Private identity, request, expedition, and economy
  // fields must remain impossible to subscribe to from this table.
  assert.doesNotMatch(
    schedule,
    /\b(?:fid|requestKey|expeditionId|accruedGold|creditedGold|balance)\s*:/,
  );
});

test('dispatch and owner state wire accept no authority-shaped browser inputs', () => {
  const reducers = source('../src/reducers/goldExpeditions.ts');
  const dispatch = section(
    reducers,
    'export const dispatchGoldExpeditionV1',
    '/**\n * Explicit no-input claim',
  );
  const privateState = section(
    reducers,
    'export const getMyGoldExpeditionStateV1',
    '/**\n * The browser supplies',
  );
  const collect = section(
    reducers,
    'export const collectGoldExpeditionV1',
    '/**\n * Hermes-only',
  );
  assert.match(dispatch, /name: 'dispatch_gold_expedition_v1'/);
  assert.match(dispatch, /\{ siteId: t\.string\(\), idempotencyKey: t\.string\(\) \}/);
  assert.match(dispatch, /requireGameplayPlayerV1\(ctx\)/);
  assert.match(dispatch, /dispatchGenesisGoldExpedition\(ctx, \{[\s\S]*fid: claims\.fid,[\s\S]*account,[\s\S]*castle,[\s\S]*siteId,[\s\S]*idempotencyKey/);
  assert.doesNotMatch(dispatch, /(?:q|r|fid|castleId|rate|time|duration|phase|gold)\s*:\s*t\./i);

  assert.match(privateState, /name: 'get_my_gold_expedition_state_v1'/);
  assert.match(privateState, /requireGameplayPlayerV1\(tx\)/);
  assert.match(privateState, /myGoldExpeditionState\(tx, claims\.fid\)/);
  assert.match(privateState, /pendingGold: state\.pendingGold/);
  assert.match(privateState, /rateGoldPerMinute: GOLD_GATHER_RATE_PER_QUANTUM/);
  assert.match(collect, /name: 'collect_gold_expedition_v1'/);
  assert.match(collect, /collectActiveGoldExpedition\(ctx, claims\.fid\)/);
  assert.match(collect, /warpkeep\.reducer\(\s*\{ name: 'collect_gold_expedition_v1' \},\s*ctx =>/);
});

test('only the scheduler can change lifecycle phase, release a returned site, or credit scheduled remainder', () => {
  const schema = source('../src/schema.ts');
  const scheduled = section(
    schema,
    'export const runGoldExpeditionScheduleV1',
    'for (const name of [',
  );
  assert.match(scheduled, /name: 'run_gold_expedition_schedule_v_1'/);
  assert.doesNotMatch(scheduled, /senderAuth\.isInternal|connectionId|databaseIdentity/);
  assert.match(scheduled, /runGoldExpeditionSchedule\(ctx, arg\)/);

  const authority = source('../src/goldExpeditionAuthority.ts');
  const lifecycle = section(authority, 'export function runGoldExpeditionSchedule');
  assert.match(lifecycle, /ctx\.db\.goldExpeditionV1\.originCastleId\.find\(schedule\.originCastleId\)/);
  assert.match(lifecycle, /if \(!scheduleMatchesExpedition\(schedule, expedition\)\) return;/);
  assert.match(lifecycle, /transitionArrival\(ctx, expedition\)/);
  assert.match(lifecycle, /creditExpiredGold\(ctx, expedition\)/);
  assert.match(lifecycle, /completeReturn\(ctx, expedition\)/);
  assert.match(
    lifecycle,
    /if \(expedition\.phase === 'outbound' \|\| expedition\.phase === 'gathering'\)[\s\S]*creditExpiredGold\(ctx, expedition\)[\s\S]*completeReturn\(ctx, returning\)/,
  );

  const expiry = section(authority, 'function creditExpiredGold', 'function completeReturn');
  assert.match(expiry, /planGoldExpeditionAccrual\(expedition, expedition\.gatheringEndsAtMicros\)/);
  assert.match(expiry, /goldNodeOccupationV1\.siteId\.update\(\{[\s\S]*phase: 'returning'/);
  assert.doesNotMatch(expiry, /siteId\.delete\(occupation\.siteId\)/);
  assert.match(expiry, /phase: 'returning'/);

  const completion = section(authority, 'function completeReturn', 'export type GoldSiteSeedPlan');
  assert.match(completion, /assertOccupationMatchesExpedition\(occupation, expedition\)/);
  assert.match(completion, /occupation\.phase !== 'returning'/);
  assert.match(completion, /goldNodeOccupationV1\.siteId\.delete\(occupation\.siteId\)/);
  assert.ok(
    completion.indexOf('goldNodeOccupationV1.siteId.delete(occupation.siteId)')
      < completion.indexOf('goldExpeditionV1.expeditionId.delete(expedition.expeditionId)'),
  );

  const dispatchAuthority = section(authority, 'export function dispatchGenesisGoldExpedition', '/**\n * Claim only');
  assert.match(dispatchAuthority, /goldExpeditionV1\.siteId\.filter\(site\.siteId\)/);
  assert.match(dispatchAuthority, /assertExpeditionState\(existing\);[\s\S]*fail\('GOLD_SITE_EXPEDITION_CONFLICT'\)/);

  const frontendBindingDirectory = new URL('../../src/spacetime/module_bindings/', import.meta.url);
  // Generated bindings are refreshed in the integration branch; private rows
  // must never appear there even after v5 public tables are added.
  assert.equal(existsSync(new URL('gold_expedition_v_1_table.ts', frontendBindingDirectory)), false);
  assert.equal(existsSync(new URL('gold_expedition_idempotency_v_1_table.ts', frontendBindingDirectory)), false);
  const publicScheduleBinding = new URL('gold_expedition_schedule_v_1_table.ts', frontendBindingDirectory);
  assert.equal(existsSync(publicScheduleBinding), true);
  const publicSchedule = readFileSync(publicScheduleBinding, 'utf8');
  assert.match(publicSchedule, /scheduleId:[\s\S]*scheduledAt:[\s\S]*originCastleId:[\s\S]*siteId:[\s\S]*stage:/);
  assert.doesNotMatch(publicSchedule, /\b(?:fid|requestKey|expeditionId|accruedGold|creditedGold|balance)\b/);

  const scheduleValidation = section(authority, 'function scheduleMatchesExpedition', 'function transitionArrival');
  assert.match(scheduleValidation, /schedule\.originCastleId === expedition\.originCastleId/);
  assert.match(scheduleValidation, /schedule\.siteId === expedition\.siteId/);
  assert.match(scheduleValidation, /schedule\.scheduledAt\.tag === 'Time'/);
  assert.match(scheduleValidation, /schedule\.scheduledAt\.value\.microsSinceUnixEpoch === expectedAtMicros/);
});

test('the existing collection reducer claims current wagon Gold even when no passive quantum is due', () => {
  const resources = source('../src/reducers/resources.ts');
  const collect = section(resources, 'export const collectResourcesV1', '/**\n * Hermes-only');
  assert.match(collect, /if \(settlement\.completedQuanta !== 0n\)/);
  assert.match(collect, /collectActiveGoldExpedition\(ctx, claims\.fid\)/);
  assert.ok(
    collect.indexOf('collectActiveGoldExpedition(ctx, claims.fid)')
      < collect.indexOf('const marksAfter ='),
  );
  const policy = source('../src/resourceAuthorityPolicy.ts');
  assert.match(policy, /lowland: Object\.freeze\(\{ food: 8n, wood: 5n, stone: 3n, gold: 0n \}\)/);
  assert.match(policy, /'ancient-stone': Object\.freeze\(\{ food: 3n, wood: 4n, stone: 8n, gold: 0n \}\)/);
});
