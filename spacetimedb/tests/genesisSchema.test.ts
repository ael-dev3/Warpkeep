import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

function source(path: string): string {
  return readFileSync(new URL(path, import.meta.url), 'utf8');
}

function tableDefinition(text: string, sourceName: string): string {
  const exported = `export const ${sourceName} = table(`;
  const local = `const ${sourceName} = table(`;
  const start = Math.max(text.indexOf(exported), text.indexOf(local));
  assert.notEqual(start, -1, `missing table ${sourceName}`);
  const end = text.indexOf('\n);', start);
  assert.notEqual(end, -1, `unterminated table ${sourceName}`);
  return text.slice(start, end + 3)
    .replace(/^export /, '')
    .replace(/\r\n/g, '\n');
}

test('the exact deployed seven-table schema prefix remains byte-identical to its frozen fixture', () => {
  const current = source('../src/schema.ts');
  const deployed = source('../migration-fixtures/additive-v2-schema/src/index.ts');
  const prefix = [
    'allowedFid',
    'worldTile',
    'player',
    'castle',
    'adminAudit',
    'playerV2',
    'playerOwnershipV2',
  ];

  for (const tableName of prefix) {
    assert.equal(tableDefinition(current, tableName), tableDefinition(deployed, tableName));
  }

  const schemaStart = current.indexOf('const warpkeep = schema({');
  const schemaEnd = current.indexOf('\n});', schemaStart);
  const registrations = current.slice(schemaStart, schemaEnd)
    .split('\n')
    .map(line => line.trim())
    .filter(line => /^[a-zA-Z][a-zA-Z0-9]*,$/.test(line))
    .map(line => line.slice(0, -1));
  assert.deepEqual(registrations.slice(0, 7), prefix);
});

test('protocol-v3 tables are append-only, explicitly versioned, and privacy-separated', () => {
  const schema = source('../src/schema.ts');
  const appended = [
    ['realmV1', 'realm_v1', true],
    ['worldTileMetaV1', 'world_tile_meta_v1', true],
    ['castleSlotV1', 'castle_slot_v1', true],
    ['castleSlotClaimV1', 'castle_slot_claim_v1', false],
    ['realmProfileV1', 'realm_profile_v1', true],
    ['markAccountV1', 'mark_account_v1', false],
    ['snapBurnCreditV1', 'snap_burn_credit_v1', false],
    ['fidWalletAttributionV1', 'fid_wallet_attribution_v1', false],
    ['walletAttributionSnapshotV1', 'wallet_attribution_snapshot_v1', false],
    ['snapScanCursorV1', 'snap_scan_cursor_v1', false],
    ['snapScanBatchV1', 'snap_scan_batch_v1', false],
    ['alphaTermsAcceptanceV1', 'alpha_terms_acceptance_v1', false],
  ] as const;

  for (const [sourceName, wireName, isPublic] of appended) {
    const definition = tableDefinition(schema, sourceName);
    assert.match(definition, new RegExp(`name: '${wireName}'`));
    assert.equal(/public:\s*true/.test(definition), isPublic);
  }

  const profile = tableDefinition(schema, 'realmProfileV1');
  assert.match(profile, /communityStatsVisible: t\.bool\(\)/);
  assert.match(profile, /totalSnapBurnedMicros: t\.option\(t\.u128\(\)\)/);
  assert.match(profile, /marksBalanceMicros: t\.option\(t\.u128\(\)\)/);

  const privateAccount = tableDefinition(schema, 'markAccountV1');
  assert.doesNotMatch(privateAccount, /public:\s*true/);
  assert.match(privateAccount, /earnedMicros: t\.u128\(\)/);
  assert.match(privateAccount, /spentMicros: t\.u128\(\)/);
  assert.match(privateAccount, /balanceMicros: t\.u128\(\)/);

  const burn = tableDefinition(schema, 'snapBurnCreditV1');
  assert.doesNotMatch(burn, /public:\s*true|hypersnap/i);
  assert.match(burn, /tokenContract: t\.string\(\)/);
  assert.match(burn, /burnMethod: t\.string\(\)/);
  assert.match(burn, /transactionHash: t\.string\(\)/);
  assert.match(burn, /batchId: t\.string\(\)\.index\(\)/);
  assert.match(burn, /burnReference: t\.string\(\)\.unique\(\)/);

  const wallet = tableDefinition(schema, 'fidWalletAttributionV1');
  assert.doesNotMatch(wallet, /public:\s*true/);
  assert.match(wallet, /snapshotAttributionKey: t\.string\(\)\.primaryKey\(\)/);
  assert.match(wallet, /columns: \['snapshotGeneration', 'address'\]/);
  assert.doesNotMatch(wallet, /address: t\.string\(\)\.unique\(\)/);

  const snapshot = tableDefinition(schema, 'walletAttributionSnapshotV1');
  assert.doesNotMatch(snapshot, /public:\s*true/);
  assert.match(snapshot, /attributionCount: t\.u32\(\)/);

  const batch = tableDefinition(schema, 'snapScanBatchV1');
  assert.doesNotMatch(batch, /public:\s*true/);
  assert.match(batch, /expectedMicros: t\.u128\(\)/);
  assert.match(batch, /appliedMicros: t\.u128\(\)/);
  assert.match(batch, /columns: \['cursorKey', 'status'\]/);

  const acceptance = tableDefinition(schema, 'alphaTermsAcceptanceV1');
  assert.doesNotMatch(acceptance, /public:\s*true/);
  assert.match(acceptance, /acceptanceKey: t\.string\(\)\.primaryKey\(\)/);
  assert.match(acceptance, /fid: t\.u64\(\)\.index\(\)/);
});
