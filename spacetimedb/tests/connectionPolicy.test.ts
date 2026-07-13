import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

test('subscription connections require a fresh exact admin or an admitted player', () => {
  const source = readFileSync(new URL('../src/auth.ts', import.meta.url), 'utf8');
  const start = source.indexOf('export function requireWarpkeepConnection');
  const end = source.indexOf('/** Require a bridge-issued admin token', start);
  assert.notEqual(start, -1);
  assert.notEqual(end, -1);

  const connectionGate = source.slice(start, end);
  assert.match(connectionGate, /isHermesAdminJwt\(base\)/);
  assert.match(connectionGate, /readFreshHermesAdminJwt/);
  assert.match(connectionGate, /requireAllowedFid\(ctx\)\.claims/);
  assert.doesNotMatch(connectionGate, /readFreshAuthEpochResolverJwt/);
});

test('the resolver principal is isolated to its dedicated authorization guard', () => {
  const source = readFileSync(new URL('../src/auth.ts', import.meta.url), 'utf8');
  const start = source.indexOf('export function requireAuthEpochResolver');
  const end = source.indexOf('export function requireAllowedFid', start);
  assert.notEqual(start, -1);
  assert.notEqual(end, -1);

  const resolverGate = source.slice(start, end);
  assert.match(resolverGate, /readFreshAuthEpochResolverJwt/);
  assert.doesNotMatch(resolverGate, /requireAdmin/);
});
