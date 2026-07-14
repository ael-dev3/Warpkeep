import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import test from 'node:test';

test('lifecycle admission accepts only exact fresh service principals or an admitted player', () => {
  const source = readFileSync(new URL('../src/auth.ts', import.meta.url), 'utf8');
  const start = source.indexOf('export function requireWarpkeepConnection');
  const end = source.indexOf('/** Require a bridge-issued admin token', start);
  assert.notEqual(start, -1);
  assert.notEqual(end, -1);

  const connectionGate = source.slice(start, end);
  assert.match(connectionGate, /isHermesAdminJwt\(base\)/);
  assert.match(connectionGate, /readFreshHermesAdminJwt/);
  assert.match(connectionGate, /isAuthEpochResolverJwt\(base\)/);
  assert.match(connectionGate, /readFreshAuthEpochResolverJwt/);
  assert.match(connectionGate, /isQaSnapshotResolverJwt\(base\)/);
  assert.match(connectionGate, /readFreshQaSnapshotResolverJwt/);
  assert.match(connectionGate, /requireAllowedFid\(ctx\)\.claims/);
});

test('the resolver procedure independently revalidates the exact fresh resolver and never delegates to admin', () => {
  const source = readFileSync(new URL('../src/auth.ts', import.meta.url), 'utf8');
  const start = source.indexOf('export function requireAuthEpochResolver');
  const end = source.indexOf('export function requireAllowedFid', start);
  assert.notEqual(start, -1);
  assert.notEqual(end, -1);

  const resolverGate = source.slice(start, end);
  assert.match(resolverGate, /readFreshAuthEpochResolverJwt/);
  assert.match(resolverGate, /claims\.resolverFid !== expectedFid/);
  assert.doesNotMatch(resolverGate, /requireAdmin/);
});

test('backend compatibility metadata stays static and explicitly excludes the QA principal', () => {
  const source = readFileSync(new URL('../src/reducers/admin.ts', import.meta.url), 'utf8');
  const start = source.indexOf('export const getAlphaBackendInfo');
  const end = source.indexOf('/**\n * Hermes-only inspection surface.', start);
  assert.notEqual(start, -1);
  assert.notEqual(end, -1);

  const procedure = source.slice(start, end);
  assert.match(procedure, /requireWarpkeepMetadataConnection\(tx\)/);
  assert.match(procedure, /protocolVersion: WARPKEEP_BACKEND_PROTOCOL_VERSION/);
  assert.match(procedure, /worldSeed: HEGEMONY_WORLD_SEED/);
  assert.match(procedure, /worldSeedName: HEGEMONY_GENESIS_001/);
  assert.doesNotMatch(procedure, /tx\.db\./);
  assert.doesNotMatch(procedure, /\.(?:insert|update|delete)\s*\(/);
});

test('metadata connection guard fails closed for the QA principal', () => {
  const source = readFileSync(new URL('../src/auth.ts', import.meta.url), 'utf8');
  const start = source.indexOf('export function requireWarpkeepMetadataConnection');
  const end = source.indexOf('/** Require a bridge-issued admin token', start);
  assert.notEqual(start, -1);
  assert.notEqual(end, -1);

  const guard = source.slice(start, end);
  assert.match(guard, /requireWarpkeepConnection\(ctx\)/);
  assert.match(guard, /isQaSnapshotResolverJwt\(claims\)/);
  assert.match(guard, /INVALID_QA_SNAPSHOT_RESOLVER_SESSION/);
});

test('the resolver guard is used only by its read-only procedure', () => {
  const source = readFileSync(new URL('../src/reducers/admin.ts', import.meta.url), 'utf8');
  const resolverStart = source.indexOf('export const authResolverGetFidAdmissionV2');
  const resolverEnd = source.indexOf('/** Protected and idempotent canonical world seeding.', resolverStart);
  assert.notEqual(resolverStart, -1);
  assert.notEqual(resolverEnd, -1);

  const resolverProcedure = source.slice(resolverStart, resolverEnd);
  const remainder = `${source.slice(0, resolverStart)}${source.slice(resolverEnd)}`;
  assert.match(resolverProcedure, /requireAuthEpochResolver\(tx, fid\)/);
  assert.doesNotMatch(resolverProcedure, /\.(?:insert|update|delete)\s*\(/);
  assert.doesNotMatch(remainder, /requireAuthEpochResolver\(/);
});

test('the QA snapshot guard independently revalidates only the fresh exact principal', () => {
  const source = readFileSync(new URL('../src/auth.ts', import.meta.url), 'utf8');
  const start = source.indexOf('export function requireQaSnapshotResolver');
  const end = source.indexOf('export function requireAllowedFid', start);
  assert.notEqual(start, -1);
  assert.notEqual(end, -1);

  const qaGate = source.slice(start, end);
  assert.match(qaGate, /readFreshQaSnapshotResolverJwt/);
  assert.doesNotMatch(qaGate, /requireAdmin|requireAllowedFid|requireAdmittedPlayer|requireAuthEpochResolver/);
});

test('the QA principal is accepted by exactly one fixed no-argument read procedure', () => {
  const reducerDirectory = new URL('../src/reducers/', import.meta.url);
  const files = readdirSync(reducerDirectory)
    .filter(file => file.endsWith('.ts'));
  const uses = files.flatMap(file => {
    const source = readFileSync(new URL(file, reducerDirectory), 'utf8');
    return source.includes('requireQaSnapshotResolver(') ? [{ file, source }] : [];
  });
  assert.deepEqual(uses.map(use => use.file), ['qaObserver.ts']);

  const procedure = uses[0]!.source;
  assert.match(procedure, /name: 'qa_observer_get_realm_snapshot_v1'/);
  assert.match(procedure, /qaObserverRealmSnapshotV1,\s*ctx\s*=>/);
  assert.match(procedure, /requireQaSnapshotResolver\(tx\)/);
  assert.match(procedure, /assertGenesisFoundingGraph\(tx\)/);
  assert.match(procedure, /buildQaObserverRealmSnapshot/);
  assert.doesNotMatch(procedure, /\.(?:insert|update|delete)\s*\(/);

  const guardAt = procedure.indexOf('requireQaSnapshotResolver(tx)');
  const firstReadAt = procedure.indexOf('tx.db.');
  assert.ok(guardAt >= 0 && firstReadAt > guardAt);
});

test('the QA snapshot procedure wire spelling is pinned exactly in schema metadata', () => {
  const source = readFileSync(new URL('../src/schema.ts', import.meta.url), 'utf8');
  const explicitNamesStart = source.indexOf('for (const name of [');
  const explicitNamesEnd = source.indexOf(']) {', explicitNamesStart);
  assert.notEqual(explicitNamesStart, -1);
  assert.notEqual(explicitNamesEnd, -1);

  const explicitNames = source.slice(explicitNamesStart, explicitNamesEnd);
  assert.equal(
    explicitNames.match(/'qa_observer_get_realm_snapshot_v1'/g)?.length,
    1,
  );
  assert.doesNotMatch(explicitNames, /qa_observer_get_realm_snapshot_v_1/);

  const registration = source.slice(explicitNamesEnd, source.indexOf('export default', explicitNamesEnd));
  assert.match(registration, /sourceName: name, canonicalName: name/);
});

test('the QA snapshot SATS product field order and privacy boundary stay exact', () => {
  const source = readFileSync(new URL('../src/reducers/qaObserver.ts', import.meta.url), 'utf8');
  const realmStart = source.indexOf("const qaObserverRealmV1 = t.object");
  const castleStart = source.indexOf("const qaObserverCastleV1 = t.object");
  const snapshotStart = source.indexOf("const qaObserverRealmSnapshotV1 = t.object");
  const procedureStart = source.indexOf('/**', snapshotStart);
  assert.ok(realmStart >= 0 && castleStart > realmStart);
  assert.ok(snapshotStart > castleStart && procedureStart > snapshotStart);

  const fields = (block: string) => [...block.matchAll(/^  ([a-zA-Z][a-zA-Z0-9]*):/gm)]
    .map(match => match[1]);
  assert.deepEqual(fields(source.slice(realmStart, castleStart)), [
    'realmId',
    'numericSeed',
    'generationVersion',
    'authoritativeRadius',
    'renderRadius',
    'playerCapacity',
  ]);
  assert.deepEqual(fields(source.slice(castleStart, snapshotStart)), [
    'castleId',
    'tileKey',
    'q',
    'r',
    'level',
    'name',
    'canonicalUsername',
    'displayName',
    'portraitAvailable',
    'publicBio',
    'publicStatus',
  ]);
  const snapshotSchema = source.slice(snapshotStart, procedureStart);
  assert.deepEqual(fields(snapshotSchema), [
    'version',
    'protocolVersion',
    'worldSeed',
    'worldSeedName',
    'worldTileCount',
    'worldTileMetaCount',
    'realm',
    'castles',
  ]);
  for (const forbidden of [
    'fid',
    'identity',
    'admission',
    'ownership',
    'terms',
    'wallet',
    'audit',
    'marks',
    'timestamp',
    'pfp',
    'url',
  ]) {
    assert.doesNotMatch(snapshotSchema.toLowerCase(), new RegExp(forbidden));
  }
});

test('admitted-player authority is derived only from the protocol-v2 pair', () => {
  const source = readFileSync(new URL('../src/auth.ts', import.meta.url), 'utf8');
  const start = source.indexOf('export function requireAdmittedPlayer');
  const end = source.indexOf('/** Admin inputs', start);
  assert.notEqual(start, -1);
  assert.notEqual(end, -1);

  const guard = source.slice(start, end);
  assert.match(guard, /ctx\.db\.playerV2\.fid\.find/);
  assert.match(guard, /ctx\.db\.playerOwnershipV2\.fid\.find/);
  assert.doesNotMatch(guard, /ctx\.db\.player\./);
  assert.doesNotMatch(guard, /ctx\.db\.playerOwnership\./);
});
