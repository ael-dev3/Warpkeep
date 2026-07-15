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

test('the QA principal is accepted only by v2 while the deployed v1 wire fails closed', () => {
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
  assert.match(procedure, /qaObserverRealmSnapshotV1,\s*_ctx\s*=>\s*\{\s*throw new SenderError\('QA_OBSERVER_V1_DISABLED'\)/);
  const v1Start = procedure.indexOf('export const qaObserverGetRealmSnapshotV1');
  const v2Start = procedure.indexOf('export const qaObserverGetRealmAttestationV2');
  assert.ok(v1Start >= 0 && v2Start > v1Start);
  assert.doesNotMatch(procedure.slice(v1Start, v2Start), /withTx|requireQaSnapshotResolver|tx\.db\./);

  const activeProcedure = procedure.slice(v2Start);
  assert.match(activeProcedure, /name: 'qa_observer_get_realm_attestation_v2'/);
  assert.match(activeProcedure, /qaObserverRealmAttestationV2,\s*ctx\s*=>/);
  assert.match(activeProcedure, /requireQaSnapshotResolver\(tx\)/);
  assert.match(activeProcedure, /assertGenesisFoundingGraph\(tx\)/);
  assert.match(activeProcedure, /buildQaObserverRealmAttestationV2/);
  assert.doesNotMatch(activeProcedure, /\.(?:insert|update|delete)\s*\(/);

  const guardAt = activeProcedure.indexOf('requireQaSnapshotResolver(tx)');
  const firstReadAt = activeProcedure.indexOf('tx.db.');
  assert.ok(guardAt >= 0 && firstReadAt > guardAt);
});

test('both additive QA procedure wire spellings are pinned exactly in schema metadata', () => {
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
  assert.equal(
    explicitNames.match(/'qa_observer_get_realm_attestation_v2'/g)?.length,
    1,
  );
  assert.doesNotMatch(explicitNames, /qa_observer_get_realm_snapshot_v_1/);
  assert.doesNotMatch(explicitNames, /qa_observer_get_realm_attestation_v_2/);

  const registration = source.slice(explicitNamesEnd, source.indexOf('export default', explicitNamesEnd));
  assert.match(registration, /sourceName: name, canonicalName: name/);
});

test('the v2 QA attestation SATS product exposes only world state and exact aggregates', () => {
  const source = readFileSync(new URL('../src/reducers/qaObserver.ts', import.meta.url), 'utf8');
  const realmStart = source.indexOf("const qaObserverRealmV2 = t.object");
  const aggregatesStart = source.indexOf("const qaObserverRealmAggregatesV2 = t.object");
  const attestationStart = source.indexOf("const qaObserverRealmAttestationV2 = t.object");
  const procedureStart = source.indexOf('/**', attestationStart);
  assert.ok(realmStart >= 0 && aggregatesStart > realmStart);
  assert.ok(attestationStart > aggregatesStart && procedureStart > attestationStart);

  const fields = (block: string) => [...block.matchAll(/^  ([a-zA-Z][a-zA-Z0-9]*):/gm)]
    .map(match => match[1]);
  assert.deepEqual(fields(source.slice(realmStart, aggregatesStart)), [
    'realmId',
    'numericSeed',
    'generationVersion',
    'authoritativeRadius',
    'renderRadius',
    'playerCapacity',
  ]);
  assert.deepEqual(fields(source.slice(aggregatesStart, attestationStart)), [
    'castleCount',
    'profileCount',
    'foundedCount',
    'activeCount',
  ]);
  const attestationSchema = source.slice(attestationStart, procedureStart);
  assert.deepEqual(fields(attestationSchema), [
    'version',
    'protocolVersion',
    'worldSeed',
    'worldSeedName',
    'worldTileCount',
    'worldTileMetaCount',
    'realm',
    'aggregates',
  ]);
  for (const forbidden of [
    'fid',
    'castleid',
    'tilekey',
    'username',
    'displayname',
    'bio',
    'portrait',
    'coordinates',
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
    assert.doesNotMatch(attestationSchema.toLowerCase(), new RegExp(forbidden));
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
