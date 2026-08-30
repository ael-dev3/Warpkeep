// @vitest-environment node

import { spawnSync } from 'node:child_process';
import {
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

import { describe, expect, it } from 'vitest';

import {
  GENESIS_001_LEGACY_GREATER_REALM_PRODUCTION_SEAL_PROFILE,
  requireGenesis001LegacyGreaterRealmProductionCliReadOnly,
} from '../scripts/greater-realm-legacy-production-seal.mjs';

const repositoryRoot = resolve(import.meta.dirname, '..');

function direct(
  entrypoint: string,
  arguments_: readonly string[],
  authorityGuard?: string,
) {
  const prefix = entrypoint.endsWith('.mjs') ? [] : ['--import', 'tsx'];
  return spawnSync(process.execPath, [...prefix, entrypoint, ...arguments_], {
    cwd: repositoryRoot,
    encoding: 'utf8',
    env: {
      PATH: process.env.PATH,
      TMPDIR: process.env.TMPDIR,
      NODE_OPTIONS: authorityGuard === undefined
        ? process.env.NODE_OPTIONS
        : `${process.env.NODE_OPTIONS ?? ''} --import=${authorityGuard}`.trim(),
      WARPKEEP_ADMIN_TOKEN_SECRET: 'must-not-be-read',
      WKGR_PRODUCTION_ADMIN_SECRET_PATH: '/authority-probe/admin-secret',
    },
    timeout: 5_000,
  });
}

function createAuthorityGuard(root: string): string {
  const path = resolve(root, 'authority-guard.mjs');
  writeFileSync(path, [
    "import fs from 'node:fs';",
    "import net from 'node:net';",
    "import tls from 'node:tls';",
    "import { syncBuiltinESMExports } from 'node:module';",
    "const sentinel = '/authority-probe/admin-secret';",
    "const opened = () => { throw new Error('TEST_AUTHORITY_BOUNDARY_OPEN'); };",
    "const sensitiveEnvironmentKeys = new Set(['WARPKEEP_ADMIN_TOKEN_SECRET', 'WKGR_PRODUCTION_ADMIN_SECRET_PATH']);",
    'const sensitiveEnvironmentKey = property => typeof property === \'string\' && sensitiveEnvironmentKeys.has(property);',
    'const environment = process.env;',
    'process.env = new Proxy(environment, {',
    '  get(target, property) { if (sensitiveEnvironmentKey(property)) opened(); return Reflect.get(target, property); },',
    '  has(target, property) { if (sensitiveEnvironmentKey(property)) opened(); return Reflect.has(target, property); },',
    '  getOwnPropertyDescriptor(target, property) { if (sensitiveEnvironmentKey(property)) opened(); return Reflect.getOwnPropertyDescriptor(target, property); },',
    '  ownKeys(target) { if ([...sensitiveEnvironmentKeys].some(key => Reflect.has(target, key))) opened(); return Reflect.ownKeys(target); },',
    '  deleteProperty(target, property) { if (sensitiveEnvironmentKey(property)) opened(); return Reflect.deleteProperty(target, property); },',
    '});',
    "const readFileSync = fs.readFileSync.bind(fs);",
    "fs.readFileSync = (path, ...rest) => String(path) === sentinel ? opened() : readFileSync(path, ...rest);",
    "const openSync = fs.openSync.bind(fs);",
    "fs.openSync = (path, ...rest) => String(path) === sentinel ? opened() : openSync(path, ...rest);",
    "const readFile = fs.promises.readFile.bind(fs.promises);",
    "fs.promises.readFile = (path, ...rest) => String(path) === sentinel ? Promise.reject(new Error('TEST_AUTHORITY_BOUNDARY_OPEN')) : readFile(path, ...rest);",
    'net.Socket.prototype.connect = opened;',
    'tls.connect = opened;',
    'globalThis.fetch = opened;',
    'syncBuiltinESMExports();',
    '',
  ].join('\n'));
  return pathToFileURL(path).href;
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

  it('traps every sensitive environment authority operation in the preload guard', () => {
    const guardRoot = mkdtempSync(resolve(tmpdir(), 'warpkeep-g001-env-guard-'));
    try {
      const authorityGuard = createAuthorityGuard(guardRoot);
      const guardedEnvironment = {
        PATH: process.env.PATH,
        NODE_OPTIONS:
          `${process.env.NODE_OPTIONS ?? ''} --import=${authorityGuard}`.trim(),
        WARPKEEP_ADMIN_TOKEN_SECRET: 'must-not-be-read',
        WKGR_PRODUCTION_ADMIN_SECRET_PATH: '/authority-probe/admin-secret',
      };
      const runControl = (source: string) => spawnSync(
        process.execPath,
        ['--input-type=module', '--eval', source],
        {
          cwd: repositoryRoot,
          encoding: 'utf8',
          env: guardedEnvironment,
          timeout: 5_000,
        },
      );
      expect(runControl("process.stdout.write('guard-ready')")).toMatchObject({
        status: 0,
        stdout: 'guard-ready',
        stderr: '',
      });
      for (const [operation, source] of [
        ['get', "Reflect.get(process.env, 'WARPKEEP_ADMIN_TOKEN_SECRET')"],
        ['has', "Reflect.has(process.env, 'WARPKEEP_ADMIN_TOKEN_SECRET')"],
        [
          'descriptor',
          "Reflect.getOwnPropertyDescriptor(process.env, 'WARPKEEP_ADMIN_TOKEN_SECRET')",
        ],
        ['enumeration', 'Reflect.ownKeys(process.env)'],
        [
          'deletion',
          "Reflect.deleteProperty(process.env, 'WARPKEEP_ADMIN_TOKEN_SECRET')",
        ],
      ] as const) {
        const result = runControl(source);
        expect(result.status, operation).toBe(1);
        expect(result.stdout, operation).toBe('');
        expect(result.stderr, operation).toContain('TEST_AUTHORITY_BOUNDARY_OPEN');
        expect(result.stderr, operation).not.toContain('must-not-be-read');
      }
    } finally {
      rmSync(guardRoot, { recursive: true, force: true });
    }
  });

  it('fails each direct mutation before private-workspace or credential handling', () => {
    const guardRoot = mkdtempSync(resolve(tmpdir(), 'warpkeep-g001-authority-'));
    try {
      const authorityGuard = createAuthorityGuard(guardRoot);
      const bootstrapPrefix = [...Array(12).fill('-')];
      for (const [entrypoint, arguments_] of [
        ['scripts/greater-realm-production-publisher.ts', ['founded', '--confirm']],
        ['scripts/greater-realm-production-import-operator.ts', ['apply', '--confirm']],
        ['scripts/greater-realm-production-relocation-operator.ts', ['commit', '--confirm']],
        ['scripts/greater-realm-production-bootstrap.mjs', [...bootstrapPrefix, 'publish']],
      ] as const) {
        const result = direct(entrypoint, arguments_, authorityGuard);
        expect(result.status, entrypoint).toBe(1);
        expect(result.stdout, entrypoint).toBe('');
        expect(result.stderr, entrypoint).toContain(
          'GENESIS_001_LEGACY_GREATER_REALM_PRODUCTION_MUTATION_SEALED',
        );
        expect(result.stderr, entrypoint).not.toContain('must-not-be-read');
        expect(result.stderr, entrypoint).not.toContain('TEST_AUTHORITY_BOUNDARY_OPEN');
        expect(result.stderr, entrypoint).not.toMatch(
          /PRIVATE_INVOCATION|ADMIN_SECRET|TRANSPORT/u,
        );
      }
    } finally {
      rmSync(guardRoot, { recursive: true, force: true });
    }
  });

  it('enumerates every root script without exposing future G001 release authority', () => {
    const manifest = JSON.parse(readFileSync(resolve(repositoryRoot, 'package.json'), 'utf8'));
    const scripts = Object.entries(manifest.scripts) as [string, string][];
    expect(scripts.length).toBeGreaterThan(100);

    for (const removedAlias of [
      'stdb:ptr:publish:inspect',
      'stdb:ptr:publish:apply',
      'stdb:ptr:import:apply',
      'stdb:ptr:verify-live',
      'atlas:export-ptr-runtime-release',
    ]) {
      expect(manifest.scripts).not.toHaveProperty(removedAlias);
    }

    const directLegacyEntrypoints = [
      'scripts/greater-realm-production-publisher.ts',
      'scripts/greater-realm-production-import-operator.ts',
      'scripts/greater-realm-production-relocation-operator.ts',
      'scripts/greater-realm-production-bootstrap.mjs',
    ];
    for (const [name, command] of scripts) {
      expect(typeof command, name).toBe('string');
      for (const entrypoint of directLegacyEntrypoints) {
        expect(command, name).not.toContain(entrypoint);
      }
    }

    expect(scripts.filter(([, command]) => command.includes('genesis001'))).toEqual([
      [
        'g001:census:privacy-safe-proof',
        'node scripts/genesis001-census-privacy-safe-receipt.mjs',
      ],
      ['stdb:genesis001:freeze-publish', 'tsx scripts/genesis001-frozen-publisher.ts'],
    ]);

    const sealedAliases = scripts.filter(([, command]) => command.includes(
      'PRODUCTION_COMMAND_REQUIRES_TRUSTED_ENV_I_LAUNCH',
    ));
    expect(sealedAliases.length).toBeGreaterThan(40);
    for (const [name, command] of sealedAliases) {
      const result = spawnSync('/bin/sh', ['-c', command], {
        cwd: repositoryRoot,
        encoding: 'utf8',
        env: {
          PATH: process.env.PATH,
          WARPKEEP_ADMIN_TOKEN_SECRET: 'must-not-be-read',
          WKGR_PRODUCTION_ADMIN_SECRET_PATH: '/authority-probe/admin-secret',
        },
        timeout: 5_000,
      });
      expect(result.status, name).toBe(1);
      expect(result.stdout, name).toBe('');
      expect(result.stderr, name).toContain(
        'PRODUCTION_COMMAND_REQUIRES_TRUSTED_ENV_I_LAUNCH',
      );
      expect(result.stderr, name).not.toContain('must-not-be-read');
      expect(result.stderr, name).not.toContain('TEST_AUTHORITY_BOUNDARY_OPEN');
    }

    expect(sealedAliases.map(([name]) => name)).toEqual(expect.arrayContaining([
      'stdb:greater-realm:import:inspect',
      'stdb:greater-realm:import:apply',
      'stdb:greater-realm:publish',
      'stdb:greater-realm:relocation',
      'stdb:publish:dev',
      'stdb:seed-world',
      'stdb:admit-founder',
      'stdb:allow-fid',
    ]));
  });
});
