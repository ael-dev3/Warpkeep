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
  const exported = `export const ${sourceName} = table(`;
  const local = `const ${sourceName} = table(`;
  const start = Math.max(text.indexOf(exported), text.indexOf(local));
  assert.notEqual(start, -1, `missing table ${sourceName}`);
  const end = text.indexOf('\n);', start);
  assert.notEqual(end, -1, `unterminated table ${sourceName}`);
  return text.slice(start, end + 3);
}

function schemaRegistrations(text: string): string[] {
  const schemaStart = text.search(/const (?:warpkeep|db) = schema\(\{/);
  assert.notEqual(schemaStart, -1, 'missing schema registration');
  const schemaEnd = text.indexOf('\n});', schemaStart);
  assert.notEqual(schemaEnd, -1, 'unterminated schema registration');
  return text.slice(schemaStart, schemaEnd)
    .split('\n')
    .map(line => line.trim())
    .filter(line => /^[a-zA-Z][a-zA-Z0-9]*,$/.test(line))
    .map(line => line.slice(0, -1));
}

function mutationTargets(text: string): string[] {
  return [...text.matchAll(/ctx\.db\.([a-zA-Z][a-zA-Z0-9]*)[a-zA-Z0-9.]*\.(?:insert|update|delete)\s*\(/g)]
    .map(match => match[1]);
}

test('resource and Gold prefixes remain intact through later additive suffixes', () => {
  const schema = source('../src/schema.ts');
  const deployedV3 = source('../migration-fixtures/additive-v3-schema/src/index.ts');
  const deployedRegistrations = schemaRegistrations(deployedV3);
  const registrations = schemaRegistrations(schema);

  assert.deepEqual(registrations.slice(0, deployedRegistrations.length), deployedRegistrations);
  assert.deepEqual(registrations.slice(deployedRegistrations.length), [
    'resourceAccountV1',
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

  const account = tableDefinition(schema, 'resourceAccountV1');
  assert.match(account, /name: 'resource_account_v1'/);
  assert.doesNotMatch(account, /public:\s*true/);
  assert.match(
    account,
    /fid: t\.u64\(\)\.primaryKey\(\),[\s\S]*castleId: t\.u64\(\)\.unique\(\),[\s\S]*realmId: t\.string\(\)\.index\(\),[\s\S]*food: t\.u64\(\),[\s\S]*wood: t\.u64\(\),[\s\S]*stone: t\.u64\(\),[\s\S]*gold: t\.u64\(\),[\s\S]*settledThroughMicros: t\.u64\(\),[\s\S]*revision: t\.u64\(\),[\s\S]*policyVersion: t\.string\(\),[\s\S]*createdAt: t\.timestamp\(\),[\s\S]*updatedAt: t\.timestamp\(\)/,
  );
  assert.doesNotMatch(account, /marks|identity|username|pfp|wallet|address/i);
});

test('new founding writes the complete private resource account in the same atomic authority path', () => {
  const authority = source('../src/foundingAuthority.ts');
  const founding = section(authority, 'export function ensureGenesisFounder');
  const accountInsert = 'ctx.db.resourceAccountV1.insert({';
  const insertAt = founding.indexOf(accountInsert);
  const finalAssertionAt = founding.lastIndexOf('assertGenesisFoundingGraph(ctx)');

  assert.notEqual(insertAt, -1);
  assert.ok(finalAssertionAt > insertAt);
  assert.doesNotMatch(founding.slice(insertAt, finalAssertionAt), /\breturn\b/);
  assert.match(
    founding.slice(insertAt, finalAssertionAt),
    /fid,[\s\S]*castleId: castle\.castleId,[\s\S]*realmId: HEGEMONY_REALM_ID,[\s\S]*\.\.\.GENESIS_STARTING_RESOURCE_BALANCES,[\s\S]*settledThroughMicros: ctx\.timestamp\.microsSinceUnixEpoch,[\s\S]*revision: 0n,[\s\S]*policyVersion: GENESIS_RESOURCE_POLICY_VERSION,[\s\S]*createdAt: ctx\.timestamp,[\s\S]*updatedAt: ctx\.timestamp/,
  );
  assert.ok(founding.indexOf('ctx.db.markAccountV1.insert({') < insertAt);
  assert.ok(founding.indexOf('ctx.db.castle.insert({') < insertAt);
  assert.ok(founding.indexOf('ctx.db.castleSlotClaimV1.insert({') < insertAt);
  assert.ok(founding.indexOf('ctx.db.worldTile.key.update(') < insertAt);
  assert.equal(founding.match(/ctx\.db\.resourceAccountV1\.insert\(\{/g)?.length, 1);

  const admin = source('../src/reducers/admin.ts');
  const profiledAdmission = section(
    admin,
    'export const adminAdmitFounderV1',
    'export const adminUpsertRealmProfileV1',
  );
  assert.match(profiledAdmission, /applyAllowedFidTransition/);
  assert.match(profiledAdmission, /ensureGenesisFounder\(ctx, input\.fid, normalized\)/);
  assert.match(profiledAdmission, /assertGenesisResourceForFid\(ctx, input\.fid\)/);
});

test('gameplay resource authority requires the current entry agreement and the caller-bound founder graph', () => {
  const auth = source('../src/auth.ts');
  const gameplay = section(
    auth,
    'export function requireGameplayPlayerV1',
    '/** Admin inputs',
  );
  const admittedAt = gameplay.indexOf('requireOwnedCastleActionV1(ctx)');
  const acceptanceAt = gameplay.indexOf('alphaTermsAcceptanceV1.acceptanceKey.find');
  const resourceAt = gameplay.indexOf('assertGenesisResourceForFid(ctx, admitted.claims.fid)');

  assert.ok(admittedAt >= 0 && acceptanceAt > admittedAt && resourceAt > acceptanceAt);
  assert.match(
    gameplay,
    /acceptanceKey = `\$\{admitted\.claims\.fid\}:\$\{WARPKEEP_ALPHA_TERMS_VERSION\}`/,
  );
  assert.match(gameplay, /acceptance\.fid !== admitted\.claims\.fid/);
  assert.match(gameplay, /acceptance\.termsVersion !== WARPKEEP_ALPHA_TERMS_VERSION/);
  assert.match(gameplay, /ALPHA_TERMS_REQUIRED/);
  assert.doesNotMatch(gameplay, /ENTRY_AGREEMENT_EVIDENCE_VERSIONS|hasRetainedEntryAgreementEvidence/);

  const admitted = section(
    auth,
    'export function requireAdmittedPlayer',
    '/**\n * Resolve the only castle',
  );
  assert.match(admitted, /playerOwnershipV2\.fid\.find\(claims\.fid\)/);
  assert.match(admitted, /ownership\?\.identity\.equals\(ctx\.sender\)/);
  assert.match(admitted, /castle\.ownerFid\.find\(claims\.fid\)/);
  assert.match(admitted, /return \{ claims, player: player!, castle \}/);
  assert.match(admitted, /IDENTITY_MISMATCH/);

  const ownedCastle = section(
    auth,
    'export function requireOwnedCastleActionV1',
    '/**\n * Require the complete current gameplay graph',
  );
  assert.match(ownedCastle, /requireAdmittedPlayer\(ctx\)/);
  assert.match(ownedCastle, /admitted\.castle\.ownerFid !== admitted\.claims\.fid/);
  assert.doesNotMatch(ownedCastle, /ctx\.db\.|\.find\s*\(/);

  const resourceAuthority = source('../src/resourceAuthority.ts');
  const localGraph = section(
    resourceAuthority,
    'export function assertGenesisResourceForFid',
    '/** Insert the compiled starting state',
  );
  assert.match(localGraph, /assertGenesisFounderForFid\(ctx, fid\)/);
  assert.match(localGraph, /resourceAccountV1\.fid\.find\(fid\)/);
  assert.match(localGraph, /castle\.ownerFid\.find\(fid\)/);
  assert.match(localGraph, /accountMatchesFounder\(ctx, account, ctx\.timestamp\.microsSinceUnixEpoch\)/);
  assert.doesNotMatch(localGraph, /\.iter\s*\(/);

  const graphBinding = section(
    resourceAuthority,
    'function accountMatchesFounder',
    'export type GenesisResourceAuthority',
  );
  assert.match(graphBinding, /castle\.ownerFid\.find\(row\.fid\)/);
  assert.match(graphBinding, /castle\.castleId\.find\(row\.castleId\)/);
  assert.match(graphBinding, /castleByFid\.castleId !== row\.castleId/);
  assert.match(graphBinding, /castleById\.ownerFid !== row\.fid/);
  assert.match(graphBinding, /allowedFid\.fid\.find\(row\.fid\)/);
  assert.match(graphBinding, /realmProfileV1\.fid\.find\(row\.fid\)/);
  assert.match(graphBinding, /markAccountV1\.fid\.find\(row\.fid\)/);
  assert.match(graphBinding, /castleSlotClaimV1\.ownerFid\.find\(row\.fid\)\?\.castleId !== row\.castleId/);
});

test('player get and collect wires accept no FID, balance, rate, terrain, or clock input', () => {
  const reducers = source('../src/reducers/resources.ts');
  const getter = section(
    reducers,
    'export const getMyResourceStateV1',
    '/** Settle every complete production quantum',
  );
  const collect = section(
    reducers,
    'export const collectResourcesV1',
    '/**\n * Hermes-only',
  );
  assert.match(
    getter,
    /warpkeep\.procedure\(\s*\{ name: 'get_my_resource_state_v1' \},\s*myResourceStateV1,\s*ctx =>/,
  );
  assert.match(
    collect,
    /warpkeep\.reducer\(\s*\{ name: 'collect_resources_v1' \},\s*ctx =>/,
  );

  const getBinding = source('../../src/spacetime/module_bindings/get_my_resource_state_v_1_procedure.ts');
  const collectBinding = source('../../src/spacetime/module_bindings/collect_resources_v_1_reducer.ts');
  assert.match(getBinding, /export const params = \{\s*\};/);
  assert.match(collectBinding, /export default \{\s*\};/);
  for (const binding of [getBinding, collectBinding]) {
    assert.doesNotMatch(binding, /\b(?:fid|food|wood|stone|gold|balance|rate|terrain|time|timestamp|micros)\s*:/i);
  }

  const browser = source('../../src/spacetime/warpkeepConnection.ts');
  const browserRead = section(
    browser,
    'export async function readWarpkeepResourceState',
    '/** Settle server-authoritative yield',
  );
  const browserCollect = section(
    browser,
    'export async function collectWarpkeepResources',
    '/**\n * Read the caller-only expedition procedure',
  );
  assert.match(browserRead, /procedures\.getMyResourceStateV1\(\{\}\)/);
  assert.match(browserCollect, /reducers\.collectResourcesV1\(\{\}\)/);
  assert.doesNotMatch(browserCollect, /collectResourcesV1\(\{[\s\S]+\}\)/);
});

test('collect preserves active Food and Wood reserves, settles with server time, and preserves Marks exactly', () => {
  const reducers = source('../src/reducers/resources.ts');
  const collect = section(
    reducers,
    'export const collectResourcesV1',
    '/**\n * Hermes-only',
  );
  const marksBeforeAt = collect.indexOf('const marksBefore =');
  const foodCollectAt = collect.indexOf('collectActiveFoodExpedition(ctx, claims.fid)');
  const woodCollectAt = collect.indexOf('collectActiveWoodExpedition(ctx, claims.fid)');
  const settlementAt = collect.indexOf(
    'const settlement = planResourceSettlementForActiveExpeditionReservations',
  );
  const accountUpdateAt = collect.indexOf('ctx.db.resourceAccountV1.fid.update({');
  const marksAfterAt = collect.indexOf('const marksAfter =');
  const finalAssertionAt = collect.lastIndexOf('assertGenesisResourceForFid(ctx, claims.fid)');

  assert.ok(
    marksBeforeAt >= 0
      && foodCollectAt > marksBeforeAt
      && woodCollectAt > foodCollectAt
      && settlementAt > woodCollectAt
      && accountUpdateAt > settlementAt
      && marksAfterAt > accountUpdateAt
      && finalAssertionAt > marksAfterAt,
  );
  assert.match(
    collect,
    /planResourceSettlementForActiveExpeditionReservations\(\s*ctx,\s*claims\.fid,\s*resourceAfterExpeditions\.account,\s*resourceAfterExpeditions\.terrainKind,\s*ctx\.timestamp\.microsSinceUnixEpoch,?\s*\)/,
  );
  assert.match(collect, /if \(settlement\.completedQuanta !== 0n\)/);
  assert.match(collect, /collectActiveFoodExpedition\(ctx, claims\.fid\)/);
  assert.match(collect, /collectActiveWoodExpedition\(ctx, claims\.fid\)/);
  assert.match(collect, /collectActiveGoldExpedition\(ctx, claims\.fid\)/);
  assert.deepEqual(mutationTargets(collect), ['resourceAccountV1']);
  assert.match(collect, /updatedAt: ctx\.timestamp/);
  for (const field of [
    'totalSnapBurnedMicros',
    'earnedMicros',
    'spentMicros',
    'balanceMicros',
    'policyVersion',
  ]) {
    assert.match(
      collect,
      new RegExp(`marksAfter\\.${field} !== marksBefore\\.${field}`),
    );
  }
  assert.match(collect, /markAccountIsConsistent\(marksBefore\)/);
  assert.match(collect, /markAccountIsConsistent\(marksAfter\)/);
  assert.doesNotMatch(
    collect,
    /ctx\.db\.(?:realmProfileV1|playerV2|castle|worldTile|markAccountV1)[a-zA-Z0-9.]*(?:insert|update|delete)\s*\(/,
  );

  const browser = source('../../src/spacetime/warpkeepConnection.ts');
  const browserCollect = section(
    browser,
    'export async function collectWarpkeepResources',
    '/**\n * Read the caller-only expedition procedure',
  );
  assert.ok(
    browserCollect.indexOf('reducers.collectResourcesV1({})')
      < browserCollect.indexOf('readWarpkeepResourceState(connection, ownFid)'),
  );
  assert.doesNotMatch(browserCollect, /(?:food|wood|stone|gold|marksBalanceMicros)\s*:/);
});

test('backfill is admin-only, guarded, idempotent, and fully planned before its first write', () => {
  const reducers = source('../src/reducers/resources.ts');
  const backfill = section(
    reducers,
    'export const adminBackfillResourceAccountsV1',
    '/** Counts-only',
  );
  assert.match(
    backfill,
    /\{ expectedFounderCount: t\.u64\(\), policyVersion: t\.string\(\) \}/,
  );
  const requireAdminAt = backfill.indexOf('requireAdmin(ctx)');
  const planAt = backfill.indexOf(
    'planGenesisResourceBackfill(ctx, expectedFounderCount, policyVersion)',
  );
  const noOpAt = backfill.indexOf('if (plan.missing.length === 0) return');
  const insertAt = backfill.indexOf('insertGenesisResourceAccount(ctx, entry.fid, entry.castle)');
  const inspectAt = backfill.indexOf('inspectGenesisResourceGraph(ctx)');
  const auditAt = backfill.indexOf('ctx.db.adminAudit.insert({');
  assert.ok(
    requireAdminAt >= 0
      && planAt > requireAdminAt
      && noOpAt > planAt
      && insertAt > noOpAt
      && inspectAt > insertAt
      && auditAt > inspectAt,
  );
  assert.deepEqual(mutationTargets(backfill), ['adminAudit']);
  assert.match(backfill, /aggregate\.resourceAccounts !== expectedFounderCount/);
  assert.match(backfill, /aggregate\.missingResourceAccounts !== 0n/);
  assert.match(backfill, /aggregate\.orphanedResourceAccounts !== 0n/);
  assert.match(backfill, /aggregate\.resourceInvariantViolations !== 0n/);

  const authority = source('../src/resourceAuthority.ts');
  const plan = section(
    authority,
    'export function planGenesisResourceBackfill',
    'export type ResourceGraphAggregate',
  );
  assert.match(plan, /policyVersion !== GENESIS_RESOURCE_POLICY_VERSION/);
  for (const table of [
    'allowedFid',
    'castle',
    'castleSlotClaimV1',
    'realmProfileV1',
    'markAccountV1',
  ]) {
    assert.match(plan, new RegExp(`ctx\\.db\\.${table}\\.count\\(\\) !== expectedFounderCount`));
  }
  assert.match(plan, /assertGenesisFoundingGraph\(ctx\)/);
  assert.equal(mutationTargets(plan).length, 0);
  assert.ok(
    plan.indexOf('for (const account of ctx.db.resourceAccountV1.iter())')
      < plan.indexOf('const missing:'),
  );
  assert.match(plan, /missing\.sort\(\(left, right\)/);
});

test('v4 administrator status is authenticated and returns only counts plus versions', () => {
  const reducers = source('../src/reducers/resources.ts');
  const returnType = section(
    reducers,
    "const adminAlphaStatusV4 = t.object('AdminAlphaStatusV4'",
    'function senderPolicyError',
  );
  const fields = [...returnType.matchAll(/^\s{2}([a-zA-Z][a-zA-Z0-9]*): t\./gm)]
    .map(match => match[1]);
  assert.deepEqual(fields, [
    'allowedFids',
    'castles',
    'markAccounts',
    'resourceAccounts',
    'missingResourceAccounts',
    'orphanedResourceAccounts',
    'resourceInvariantViolations',
    'protocolVersion',
    'resourcePolicyVersion',
  ]);
  assert.doesNotMatch(
    returnType,
    /\b(?:fid|castleId|realmId|food|wood|stone|gold|marksBalanceMicros|identity|username|pfpUrl|wallet|address|timestamp)\s*:/i,
  );

  const status = section(reducers, 'export const adminGetAlphaStatusV4');
  assert.match(status, /requireAdmin\(tx\)/);
  assert.match(status, /inspectGenesisResourceGraph\(tx\)/);
  assert.match(status, /allowedFids: tx\.db\.allowedFid\.count\(\)/);
  assert.match(status, /castles: tx\.db\.castle\.count\(\)/);
  assert.match(status, /markAccounts: tx\.db\.markAccountV1\.count\(\)/);
  assert.match(status, /protocolVersion: WARPKEEP_BACKEND_PROTOCOL_VERSION/);
  assert.match(status, /resourcePolicyVersion: GENESIS_RESOURCE_POLICY_VERSION/);
  assert.doesNotMatch(status, /return\s*\{[\s\S]*(?:account\.food|account\.wood|account\.stone|account\.gold|marks\.balanceMicros)/);
});

test('resource wire names are exact and protected from the SDK trailing-digit converter', () => {
  const exactNames = [
    'get_my_resource_state_v1',
    'collect_resources_v1',
    'admin_backfill_resource_accounts_v1',
    'admin_get_alpha_status_v4',
  ] as const;
  const schema = source('../src/schema.ts');
  const explicitNames = section(
    schema,
    "for (const name of [",
    'warpkeep.moduleDef.explicitNames.entries.push',
  );
  for (const name of exactNames) {
    assert.equal(explicitNames.match(new RegExp(`'${name}'`, 'g'))?.length, 1);
  }
  assert.doesNotMatch(
    explicitNames,
    /(?:get_my_resource_state|collect_resources|admin_backfill_resource_accounts)_v_1|admin_get_alpha_status_v_4/,
  );

  const reducers = source('../src/reducers/resources.ts');
  for (const name of exactNames) {
    assert.match(reducers, new RegExp(`name: '${name}'`));
  }
  const generated = source('../../src/spacetime/module_bindings/index.ts');
  for (const name of exactNames) {
    assert.match(generated, new RegExp(`__\\w+Schema\\("${name}"`));
  }
});

test('the private resource table is absent from generated public tables and Realm subscriptions', () => {
  const generatedRoot = new URL('../../src/spacetime/module_bindings/', import.meta.url);
  assert.equal(existsSync(new URL('resource_account_v_1_table.ts', generatedRoot)), false);

  const generated = source('../../src/spacetime/module_bindings/index.ts');
  const generatedTables = section(
    generated,
    'const tablesSchema = __schema({',
    '/** The schema information for all reducers',
  );
  assert.doesNotMatch(generatedTables, /resourceAccountV1|resource_account_v1/i);

  const playerBindings = source('../../src/spacetime/playerModuleBindings.ts');
  const playerTables = section(
    playerBindings,
    'const tablesSchema = __schema({',
    'const reducersSchema = __reducers(',
  );
  assert.doesNotMatch(playerTables, /resourceAccountV1|resource_account_v1/i);

  const connection = source('../../src/spacetime/warpkeepConnection.ts');
  const subscription = section(
    connection,
    'export function subscribeToWarpkeepRealm',
    'function readWorldTiles',
  );
  const observer = section(
    connection,
    'export function observeWarpkeepRealm',
    'export function disconnectWarpkeep',
  );
  assert.doesNotMatch(subscription, /resourceAccountV1|resource_account_v1/i);
  assert.doesNotMatch(observer, /resourceAccountV1|resource_account_v1/i);

  const qaObserver = source('../src/reducers/qaObserver.ts');
  assert.doesNotMatch(qaObserver, /resourceAccountV1|resource_account_v1/i);
});
