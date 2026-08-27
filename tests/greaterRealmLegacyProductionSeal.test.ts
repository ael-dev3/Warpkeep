// @vitest-environment node

import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  GENESIS_001_LEGACY_GREATER_REALM_PRODUCTION_SEAL_PROFILE,
  requireGenesis001LegacyGreaterRealmProductionCliReadOnly,
} from '../scripts/greater-realm-legacy-production-seal.mjs';

const repositoryRoot = resolve(import.meta.dirname, '..');
const tsxCli = resolve(repositoryRoot, 'node_modules/tsx/dist/cli.mjs');

function direct(entrypoint: string, arguments_: readonly string[]) {
  const executable = entrypoint.endsWith('.mjs') ? process.execPath : process.execPath;
  const prefix = entrypoint.endsWith('.mjs') ? [] : [tsxCli];
  return spawnSync(executable, [...prefix, entrypoint, ...arguments_], {
    cwd: repositoryRoot,
    encoding: 'utf8',
    env: {
      PATH: process.env.PATH,
      TMPDIR: process.env.TMPDIR,
      WARPKEEP_ADMIN_TOKEN_SECRET: 'must-not-be-read',
      WKGR_PRODUCTION_ADMIN_SECRET_PATH: '/must/not/be/read',
    },
    timeout: 5_000,
  });
}

describe('sealed Genesis 001 legacy Greater Realm production entrypoints', () => {
  it('rejects every legacy production mutation and retains only read inspection', () => {
    expect(GENESIS_001_LEGACY_GREATER_REALM_PRODUCTION_SEAL_PROFILE).toBe(
      'warpkeep-genesis-001-legacy-greater-realm-production-seal-v1',
    );
    for (const [entrypoint, arguments_] of [
      ['publisher', ['founded', '--confirm']],
      ['publisher', ['recover', `--confirm-recovery=${'a'.repeat(64)}`]],
      ['import', ['apply', '--confirm']],
      ['import', ['recover', `--confirm-recovery=${'a'.repeat(64)}`]],
      ['relocation', ['prepare', '--confirm']],
      ['relocation', ['begin-drain', '--confirm']],
      ['relocation', ['freeze', '--confirm']],
      ['relocation', ['plan', '--confirm']],
      ['relocation', ['canary', '--confirm']],
      ['relocation', ['commit', '--confirm']],
      ['relocation', ['halt', '--confirm']],
      ['relocation', ['resume', '--confirm']],
      ['relocation', ['rollback', '--confirm']],
      ['relocation', ['recover', `--confirm-recovery=${'a'.repeat(64)}`]],
      ['bootstrap', [...Array(12).fill('-'), 'import-apply']],
      ['bootstrap', [...Array(12).fill('-'), 'import-recover']],
      ['bootstrap', [...Array(12).fill('-'), 'publish']],
      ['bootstrap', [...Array(12).fill('-'), 'publish-recover']],
      ['bootstrap', [...Array(12).fill('-'), 'relocation', 'commit']],
      ['bootstrap', [...Array(12).fill('-'), 'relocation-recover']],
      ['bootstrap', [...Array(12).fill('-'), 'hermes-list-pending']],
      ['bootstrap', [...Array(12).fill('-'), 'hermes-admit-dry']],
      ['bootstrap', [...Array(12).fill('-'), 'hermes-admit-confirm']],
      ['bootstrap', [...Array(12).fill('-'), 'hermes-allow-dry']],
      ['bootstrap', [...Array(12).fill('-'), 'hermes-allow-confirm']],
      ['bootstrap', [...Array(12).fill('-'), 'hermes-notification-recover-dry']],
      ['bootstrap', [...Array(12).fill('-'), 'hermes-notification-recover-confirm']],
    ] as const) {
      expect(
        () => requireGenesis001LegacyGreaterRealmProductionCliReadOnly({
          entrypoint,
          arguments_,
        }),
        `${entrypoint} ${arguments_.join(' ')}`,
      ).toThrowError('GENESIS_001_LEGACY_GREATER_REALM_PRODUCTION_MUTATION_SEALED');
    }

    for (const [entrypoint, arguments_] of [
      ['publisher', ['recover-inspect']],
      ['import', ['inspect']],
      ['import', ['recover-inspect']],
      ['relocation', ['inspect']],
      ['relocation', ['recover-inspect']],
      ['bootstrap', [...Array(12).fill('-'), 'import-inspect']],
      ['bootstrap', [...Array(12).fill('-'), 'publish-recover-inspect']],
      ['bootstrap', [...Array(12).fill('-'), 'relocation', 'inspect']],
      ['bootstrap', [...Array(12).fill('-'), 'relocation-recover-inspect']],
      ['bootstrap', [...Array(12).fill('-'), 'verify']],
    ] as const) {
      expect(() => requireGenesis001LegacyGreaterRealmProductionCliReadOnly({
        entrypoint,
        arguments_,
      })).not.toThrow();
    }
  });

  it('fails each direct mutation before private-workspace or credential handling', () => {
    const bootstrapPrefix = [...Array(12).fill('-')];
    for (const [entrypoint, arguments_] of [
      ['scripts/greater-realm-production-publisher.ts', ['founded', '--confirm']],
      ['scripts/greater-realm-production-import-operator.ts', ['apply', '--confirm']],
      ['scripts/greater-realm-production-relocation-operator.ts', ['commit', '--confirm']],
      ['scripts/greater-realm-production-bootstrap.mjs', [...bootstrapPrefix, 'publish']],
    ] as const) {
      const result = direct(entrypoint, arguments_);
      expect(result.status, entrypoint).toBe(1);
      expect(result.stdout, entrypoint).toBe('');
      expect(result.stderr, entrypoint).toContain(
        'GENESIS_001_LEGACY_GREATER_REALM_PRODUCTION_MUTATION_SEALED',
      );
      expect(result.stderr, entrypoint).not.toContain('must-not-be-read');
      expect(result.stderr, entrypoint).not.toMatch(/PRIVATE_INVOCATION|ADMIN_SECRET|TRANSPORT/u);
    }
  });

  it('places the seal before every direct authority boundary and keeps aliases inert', () => {
    for (const [path, after] of [
      ['scripts/greater-realm-production-publisher.ts', 'assertGreaterRealmPrivateInvocation();'],
      ['scripts/greater-realm-production-import-operator.ts', 'assertGreaterRealmPrivateInvocation();'],
      ['scripts/greater-realm-production-relocation-operator.ts', 'assertGreaterRealmPrivateInvocation();'],
      ['scripts/greater-realm-production-bootstrap.mjs', 'runGreaterRealmProductionBootstrap('],
    ] as const) {
      const source = readFileSync(resolve(repositoryRoot, path), 'utf8');
      const main = source.slice(source.indexOf('async function main'));
      expect(main.indexOf('requireGenesis001LegacyGreaterRealmProductionCliReadOnly('), path)
        .toBeGreaterThanOrEqual(0);
      expect(main.indexOf('requireGenesis001LegacyGreaterRealmProductionCliReadOnly('), path)
        .toBeLessThan(main.indexOf(after));
    }

    const manifest = JSON.parse(readFileSync(resolve(repositoryRoot, 'package.json'), 'utf8'));
    for (const alias of [
      'stdb:greater-realm:import:inspect',
      'stdb:greater-realm:import:apply',
      'stdb:greater-realm:publish',
      'stdb:greater-realm:relocation',
    ]) {
      expect(manifest.scripts[alias]).toContain('PRODUCTION_COMMAND_REQUIRES_TRUSTED_ENV_I_LAUNCH');
      expect(manifest.scripts[alias]).toContain('/usr/bin/false');
    }

    const envelope = readFileSync(resolve(
      repositoryRoot,
      'docs/operations/greater-realm-production-launch-envelope.sh.txt',
    ), 'utf8');
    const sealed = envelope.indexOf(
      'fail GENESIS_001_LEGACY_GREATER_REALM_PRODUCTION_MUTATION_SEALED',
    );
    expect(sealed).toBeGreaterThan(envelope.indexOf('shift 11'));
    expect(sealed).toBeLessThan(envelope.indexOf('/usr/bin/python3 -I -S -B'));
    for (const command of [
      'import-apply',
      'import-recover',
      'publish',
      'publish-recover',
      'relocation-recover',
      'hermes-list-pending',
      'hermes-admit-confirm',
      'hermes-allow-confirm',
    ]) expect(envelope.slice(envelope.indexOf('shift 11'), sealed + 200)).toContain(command);
  });
});
