import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import test from 'node:test';

import { evaluatePlayerOwnership } from '../src/playerOwnershipPolicy';

function source(path: string): string {
  return readFileSync(new URL(path, import.meta.url), 'utf8');
}

test('the deployed player schema stays exact while the identity-free v2 pair is append-only', () => {
  const schema = source('../src/schema.ts');
  const legacyStart = schema.indexOf('export const player =');
  const castleStart = schema.indexOf('export const castle', legacyStart);
  const playerV2Start = schema.indexOf('export const playerV2');
  const ownershipV2Start = schema.indexOf('export const playerOwnershipV2', playerV2Start);
  const realmV1Start = schema.indexOf('export const realmV1', ownershipV2Start);
  const schemaStart = schema.indexOf('const warpkeep = schema({');

  assert.notEqual(legacyStart, -1);
  assert.notEqual(castleStart, -1);
  assert.notEqual(playerV2Start, -1);
  assert.notEqual(ownershipV2Start, -1);
  assert.notEqual(realmV1Start, -1);
  assert.notEqual(schemaStart, -1);

  const legacy = schema.slice(legacyStart, castleStart);
  assert.match(legacy, /name: 'player', public: true/);
  assert.match(
    legacy,
    /fid: t\.u64\(\)\.primaryKey\(\),[\s\S]*identity: t\.identity\(\)\.unique\(\),[\s\S]*username: t\.option\(t\.string\(\)\),[\s\S]*displayName: t\.option\(t\.string\(\)\),[\s\S]*pfpUrl: t\.option\(t\.string\(\)\),[\s\S]*joinedAt: t\.timestamp\(\),[\s\S]*status: t\.string\(\)/,
  );

  const projectionV2 = schema.slice(playerV2Start, ownershipV2Start);
  assert.match(projectionV2, /name: 'player_v2', public: true/);
  assert.doesNotMatch(projectionV2, /\bidentity\s*:/);

  const ownershipV2 = schema.slice(ownershipV2Start, realmV1Start);
  assert.match(ownershipV2, /name: 'player_ownership_v2'/);
  assert.match(ownershipV2, /identity: t\.identity\(\)\.unique\(\)/);
  assert.doesNotMatch(ownershipV2, /public:\s*true/);

  assert.match(
    schema.slice(schemaStart),
    /allowedFid,[\s\S]*worldTile,[\s\S]*player,[\s\S]*castle,[\s\S]*adminAudit,[\s\S]*playerV2,[\s\S]*playerOwnershipV2,/,
  );
});

test('protocol-v2 ownership checks fail closed for missing, partial, and mismatched bindings', () => {
  assert.equal(evaluatePlayerOwnership(false, false, false), 'unbound');
  assert.equal(evaluatePlayerOwnership(true, false, false), 'partial');
  assert.equal(evaluatePlayerOwnership(false, true, false), 'partial');
  assert.equal(evaluatePlayerOwnership(true, true, false), 'identity_mismatch');
  assert.equal(evaluatePlayerOwnership(true, true, true), 'current');

  const auth = source('../src/auth.ts');
  const start = auth.indexOf('export function requireAdmittedPlayer');
  const end = auth.indexOf('/** Admin inputs', start);
  const guard = auth.slice(start, end);

  assert.match(guard, /playerV2\.fid\.find\(claims\.fid\)/);
  assert.match(guard, /playerOwnershipV2\.fid\.find\(claims\.fid\)/);
  assert.match(guard, /ownership\?\.identity\.equals\(ctx\.sender\)/);
  assert.match(guard, /STATE_INTEGRITY/);
  assert.match(guard, /IDENTITY_MISMATCH/);
  assert.doesNotMatch(guard, /ctx\.db\.player\./);
  assert.doesNotMatch(guard, /ctx\.db\.playerOwnership\./);
  assert.match(guard, /assertGenesisFounderForFid/);
  assert.doesNotMatch(guard, /\.iter\s*\(/);
  assert.match(guard, /ctx\.db\.castle\.ownerFid\.find\(claims\.fid\)/);
});

test('legacy admission wires are inert and v2 bootstrap binds only the pre-founded assignment', () => {
  const admission = source('../src/reducers/admission.ts');
  const legacyStatusStart = admission.indexOf('export const getMyAdmissionStatus =');
  const v2StatusStart = admission.indexOf('export const getMyAdmissionStatusV2', legacyStatusStart);
  const legacyBootstrapStart = admission.indexOf('export const bootstrapPlayer =');
  const v2BootstrapStart = admission.indexOf('export const bootstrapPlayerV2', legacyBootstrapStart);

  const legacyStatus = admission.slice(legacyStatusStart, v2StatusStart);
  const legacyBootstrap = admission.slice(legacyBootstrapStart, v2BootstrapStart);
  const v2Bootstrap = admission.slice(v2BootstrapStart);

  assert.match(legacyStatus, /PROTOCOL_RETIRED/);
  assert.doesNotMatch(legacyStatus, /ctx\.db\./);
  assert.match(legacyBootstrap, /PROTOCOL_RETIRED/);
  assert.doesNotMatch(legacyBootstrap, /ctx\.db\./);

  assert.match(v2Bootstrap, /ctx\.db\.playerOwnershipV2\.insert/);
  assert.match(v2Bootstrap, /ctx\.db\.playerV2\.insert/);
  assert.match(v2Bootstrap, /assertExistingPlayerV2Consistency/);
  assert.match(admission, /function assertExistingPlayerV2Consistency[\s\S]*assertGenesisFounderForFid/);
  assert.doesNotMatch(v2Bootstrap, /\.iter\s*\(/);
  assert.doesNotMatch(v2Bootstrap, /ctx\.db\.castle\.(?:insert|update|delete)/);
  assert.doesNotMatch(v2Bootstrap, /ctx\.db\.worldTile\.(?:insert|update|delete)/);
  assert.doesNotMatch(admission, /ctx\.db\.player\.(?:insert|update|delete)/);
  assert.doesNotMatch(admission, /ctx\.db\.playerOwnership\./);
  assert.doesNotMatch(admission, /optionalDisplayClaim|senderAuth\.jwt\?\.fullPayload/);
  assert.match(
    v2Bootstrap,
    /username: undefined,[\s\S]*displayName: undefined,[\s\S]*pfpUrl: undefined/,
  );
});

test('generated bindings contain exactly eight public tables and omit every private table', () => {
  const bindingsRoot = new URL('../../src/spacetime/module_bindings/', import.meta.url);
  const index = readFileSync(new URL('index.ts', bindingsRoot), 'utf8');
  const legacyPlayer = readFileSync(new URL('player_table.ts', bindingsRoot), 'utf8');
  const playerV2 = readFileSync(new URL('player_v_2_table.ts', bindingsRoot), 'utf8');
  const tablesStart = index.indexOf('const tablesSchema = __schema({');
  const reducersStart = index.indexOf('const reducersSchema = __reducers(', tablesStart);
  assert.notEqual(tablesStart, -1);
  assert.notEqual(reducersStart, -1);
  const generatedTableSchema = index.slice(tablesStart, reducersStart);

  assert.match(legacyPlayer, /identity:/);
  assert.doesNotMatch(playerV2, /\bidentity\s*:/);
  assert.match(index, /playerV2/);
  assert.doesNotMatch(index, /playerOwnershipV2|player_ownership_v2/i);
  assert.equal(existsSync(new URL('player_ownership_v_2_table.ts', bindingsRoot)), false);

  const publicTableFiles = [
    'castle_slot_v_1_table.ts',
    'castle_table.ts',
    'player_table.ts',
    'player_v_2_table.ts',
    'realm_profile_v_1_table.ts',
    'realm_v_1_table.ts',
    'world_tile_meta_v_1_table.ts',
    'world_tile_table.ts',
  ];
  assert.deepEqual(
    readdirSync(bindingsRoot).filter(name => name.endsWith('_table.ts')).sort(),
    publicTableFiles,
  );

  const privateTableStems = [
    'admin_audit',
    'allowed_fid',
    'alpha_terms_acceptance_v_1',
    'castle_slot_claim_v_1',
    'fid_wallet_attribution_v_1',
    'mark_account_v_1',
    'player_ownership_v_2',
    'snap_burn_credit_v_1',
    'snap_scan_batch_v_1',
    'snap_scan_cursor_v_1',
    'wallet_attribution_snapshot_v_1',
  ];
  for (const stem of privateTableStems) {
    assert.equal(existsSync(new URL(`${stem}_table.ts`, bindingsRoot)), false);
    assert.doesNotMatch(generatedTableSchema, new RegExp(stem, 'i'));
  }
});
