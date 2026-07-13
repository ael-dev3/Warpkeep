import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import test from 'node:test';

import { evaluatePlayerOwnership } from '../src/playerOwnershipPolicy';

function source(path: string): string {
  return readFileSync(new URL(path, import.meta.url), 'utf8');
}

test('OIDC ownership is private and absent from the public player projection', () => {
  const schema = source('../src/schema.ts');
  const ownershipStart = schema.indexOf('export const playerOwnership');
  const playerStart = schema.indexOf('export const player =', ownershipStart);
  const castleStart = schema.indexOf('export const castle', playerStart);

  assert.notEqual(ownershipStart, -1);
  assert.notEqual(playerStart, -1);
  assert.notEqual(castleStart, -1);

  const ownership = schema.slice(ownershipStart, playerStart);
  assert.match(ownership, /name: 'player_ownership'/);
  assert.match(ownership, /identity: t\.identity\(\)\.unique\(\)/);
  assert.doesNotMatch(ownership, /public:\s*true/);

  const player = schema.slice(playerStart, castleStart);
  assert.match(player, /name: 'player', public: true/);
  assert.doesNotMatch(player, /\bidentity\s*:/);
});

test('ownership checks fail closed for missing, partial, and mismatched bindings', () => {
  assert.equal(evaluatePlayerOwnership(false, false, false), 'unbound');
  assert.equal(evaluatePlayerOwnership(true, false, false), 'partial');
  assert.equal(evaluatePlayerOwnership(false, true, false), 'partial');
  assert.equal(evaluatePlayerOwnership(true, true, false), 'identity_mismatch');
  assert.equal(evaluatePlayerOwnership(true, true, true), 'current');

  const auth = source('../src/auth.ts');
  const start = auth.indexOf('export function requireAdmittedPlayer');
  const end = auth.indexOf('/** Admin inputs', start);
  assert.notEqual(start, -1);
  assert.notEqual(end, -1);

  const guard = auth.slice(start, end);
  assert.match(guard, /playerOwnership\.fid\.find\(claims\.fid\)/);
  assert.match(guard, /evaluatePlayerOwnership/);
  assert.match(guard, /ownership\?\.identity\.equals\(ctx\.sender\)/);
  assert.match(guard, /STATE_INTEGRITY/);
  assert.match(guard, /IDENTITY_MISMATCH/);
  assert.doesNotMatch(guard, /player\.identity/);
});

test('bootstrap commits the private ownership row separately from public profile data', () => {
  const admission = source('../src/reducers/admission.ts');

  assert.match(admission, /playerOwnership\.identity\.find\(ctx\.sender\)/);
  assert.match(
    admission,
    /ctx\.db\.playerOwnership\.insert\(\{[\s\S]*?fid: claims\.fid,[\s\S]*?identity: ctx\.sender,[\s\S]*?\}\)/,
  );

  const playerInsertStart = admission.indexOf('ctx.db.player.insert({');
  const castleInsertStart = admission.indexOf('ctx.db.castle.insert({', playerInsertStart);
  assert.notEqual(playerInsertStart, -1);
  assert.notEqual(castleInsertStart, -1);
  assert.doesNotMatch(admission.slice(playerInsertStart, castleInsertStart), /\bidentity\s*:/);
  assert.doesNotMatch(admission, /optionalDisplayClaim|senderAuth\.jwt\?\.fullPayload/);
  assert.match(
    admission.slice(playerInsertStart, castleInsertStart),
    /username: undefined,[\s\S]*displayName: undefined,[\s\S]*pfpUrl: undefined/,
  );
});

test('generated browser bindings expose no private ownership table accessor', () => {
  const bindingsRoot = new URL('../../src/spacetime/module_bindings/', import.meta.url);
  const index = readFileSync(new URL('index.ts', bindingsRoot), 'utf8');
  const player = readFileSync(new URL('player_table.ts', bindingsRoot), 'utf8');
  const types = readFileSync(new URL('types.ts', bindingsRoot), 'utf8');
  const playerTypeStart = types.indexOf('export const Player =');
  const playerTypeEnd = types.indexOf('export type Player =', playerTypeStart);

  assert.doesNotMatch(index, /playerOwnership|player_ownership/i);
  assert.equal(existsSync(new URL('player_ownership_table.ts', bindingsRoot)), false);
  assert.doesNotMatch(player, /\bidentity\s*:/);
  assert.notEqual(playerTypeStart, -1);
  assert.notEqual(playerTypeEnd, -1);
  assert.doesNotMatch(types.slice(playerTypeStart, playerTypeEnd), /\bidentity\s*:/);
});
