import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
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

test('backend compatibility metadata stays static for every lifecycle-admitted principal', () => {
  const source = readFileSync(new URL('../src/reducers/admin.ts', import.meta.url), 'utf8');
  const start = source.indexOf('export const getAlphaBackendInfo');
  const end = source.indexOf('/**\n * Hermes-only inspection surface.', start);
  assert.notEqual(start, -1);
  assert.notEqual(end, -1);

  const procedure = source.slice(start, end);
  assert.match(procedure, /requireWarpkeepConnection\(tx\)/);
  assert.match(procedure, /protocolVersion: WARPKEEP_BACKEND_PROTOCOL_VERSION/);
  assert.match(procedure, /worldSeed: HEGEMONY_WORLD_SEED/);
  assert.match(procedure, /worldSeedName: HEGEMONY_GENESIS_001/);
  assert.doesNotMatch(procedure, /tx\.db\./);
  assert.doesNotMatch(procedure, /\.(?:insert|update|delete)\s*\(/);
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
