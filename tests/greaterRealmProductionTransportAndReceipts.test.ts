// @vitest-environment node

import {
  chmodSync,
  closeSync,
  mkdirSync,
  mkdtempSync,
  openSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { join } from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  withGreaterRealmCutoverOperatorLock,
  writePrivateGreaterRealmCutoverReceipt,
} from '../scripts/greater-realm-cutover-receipts';
import {
  bindGreaterRealmProductionStatusTransport,
  createGreaterRealmAdminTransportSession,
  createGreaterRealmFreshAdminTransport,
  GREATER_REALM_PRODUCTION_TRANSPORT_TARGET,
  readGreaterRealmProductionAdminSecret,
  requireGreaterRealmProductionTransportTarget,
} from '../scripts/greater-realm-production-transport';
import { runGreaterRealmTrustedGit } from '../scripts/atlas/greater-realm-git';
import {
  attestGreaterRealmProductionAppendApprovalOnlyDelta,
  attestGreaterRealmProductionGateOnlyDelta,
  attestGreaterRealmProductionSourceAncestry,
  greaterRealmProductionProvenanceTestSeams,
} from '../scripts/greater-realm-production-provenance';

const temporaryDirectories: string[] = [];

function temporaryDirectory(prefix: string): string {
  const directory = mkdtempSync(`/private/tmp/${prefix}`);
  chmodSync(directory, 0o700);
  temporaryDirectories.push(directory);
  return directory;
}

afterEach(() => {
  vi.restoreAllMocks();
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

function trustedGit(repositoryRoot: string, arguments_: readonly string[]): string {
  const result = runGreaterRealmTrustedGit(
    arguments_,
    repositoryRoot,
  );
  if (result.error !== undefined || result.status !== 0) {
    throw new Error('GREATER_REALM_TEST_COMMIT_UNAVAILABLE');
  }
  return result.stdout.trim();
}

function trustedCommit(reference: string, repositoryRoot = process.cwd()): string {
  return trustedGit(repositoryRoot, ['rev-parse', '--verify', `${reference}^{commit}`]);
}

describe('Greater Realm atlas/module source ancestry', () => {
  it('attests clean exact main and its remote with trusted Git under hostile process controls', () => {
    const parent = temporaryDirectory('warpkeep-gr-protected-main-');
    const remote = join(parent, 'canonical.git');
    const repositoryRoot = join(parent, 'work');
    mkdirSync(repositoryRoot, { recursive: true, mode: 0o700 });
    trustedGit(parent, ['init', '--bare', '--quiet', remote]);
    trustedGit(repositoryRoot, ['init', '--quiet']);
    trustedGit(repositoryRoot, ['symbolic-ref', 'HEAD', 'refs/heads/main']);
    writeFileSync(join(repositoryRoot, 'source.txt'), 'exact\n', { mode: 0o600 });
    trustedGit(repositoryRoot, ['add', 'source.txt']);
    trustedGit(repositoryRoot, [
      '-c', 'user.name=Warpkeep Test',
      '-c', 'user.email=warpkeep-test@example.invalid',
      'commit', '--quiet', '-m', 'protected main',
    ]);
    trustedGit(repositoryRoot, ['remote', 'add', 'origin', remote]);
    trustedGit(repositoryRoot, ['push', '--quiet', 'origin', 'main:main']);
    const sourceCommit = trustedCommit('HEAD', repositoryRoot);
    const hostile = Object.freeze({
      PATH: '/private/tmp/hostile-git-path',
      GIT_CONFIG_GLOBAL: '/private/tmp/hostile-git-config',
      GIT_CONFIG_COUNT: '1',
      GIT_CONFIG_KEY_0: 'url.file:///private/tmp/hostile/.insteadOf',
      GIT_CONFIG_VALUE_0: remote,
      GIT_REPLACE_REF_BASE: 'refs/hostile-replacements',
      GIT_DIR: '/private/tmp/hostile-git-dir',
      GIT_OBJECT_DIRECTORY: '/private/tmp/hostile-git-objects',
    });
    const prior = Object.fromEntries(Object.keys(hostile).map(key => [key, process.env[key]]));
    try {
      Object.assign(process.env, hostile);
      expect(greaterRealmProductionProvenanceTestSeams.attestProtectedMainAgainstOrigin({
        repositoryRoot,
        expectedOriginUrl: remote,
      })).toBe(sourceCommit);
    } finally {
      for (const [key, value] of Object.entries(prior)) {
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
      }
    }

    writeFileSync(join(repositoryRoot, 'untracked.txt'), 'dirty\n', { mode: 0o600 });
    expect(() => greaterRealmProductionProvenanceTestSeams.attestProtectedMainAgainstOrigin({
      repositoryRoot,
      expectedOriginUrl: remote,
    })).toThrowError('GREATER_REALM_PRODUCTION_PROTECTED_MAIN_MISMATCH');
    trustedGit(repositoryRoot, ['add', 'untracked.txt']);
    trustedGit(repositoryRoot, [
      '-c', 'user.name=Warpkeep Test',
      '-c', 'user.email=warpkeep-test@example.invalid',
      'commit', '--quiet', '-m', 'not on remote',
    ]);
    expect(() => greaterRealmProductionProvenanceTestSeams.attestProtectedMainAgainstOrigin({
      repositoryRoot,
      expectedOriginUrl: remote,
    })).toThrowError('GREATER_REALM_PRODUCTION_PROTECTED_MAIN_MISMATCH');
  });

  it('uses trusted Git and ignores hostile path, config, and replace-object controls', () => {
    const moduleSourceCommit = trustedCommit('HEAD');
    const atlasSourceCommit = trustedCommit('HEAD^');
    const hostile = Object.freeze({
      PATH: '/definitely/not/a/trusted/path',
      GIT_CONFIG_GLOBAL: '/private/tmp/hostile-git-config',
      GIT_CONFIG_COUNT: '1',
      GIT_CONFIG_KEY_0: 'core.replaceRefs',
      GIT_CONFIG_VALUE_0: 'true',
      GIT_REPLACE_REF_BASE: 'refs/hostile-replacements',
      GIT_DIR: '/private/tmp/hostile-git-dir',
      GIT_OBJECT_DIRECTORY: '/private/tmp/hostile-git-objects',
    });
    const prior = Object.fromEntries(Object.keys(hostile).map(key => [key, process.env[key]]));
    try {
      Object.assign(process.env, hostile);
      expect(() => attestGreaterRealmProductionSourceAncestry({
        repositoryRoot: process.cwd(),
        atlasSourceCommit,
        moduleSourceCommit,
      })).not.toThrow();
    } finally {
      for (const [key, value] of Object.entries(prior)) {
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
      }
    }
    expect(() => attestGreaterRealmProductionSourceAncestry({
      repositoryRoot: process.cwd(),
      atlasSourceCommit: moduleSourceCommit,
      moduleSourceCommit: atlasSourceCommit,
    })).toThrowError('GREATER_REALM_PRODUCTION_SOURCE_ANCESTRY_INVALID');
  });

  it.each(['import', 'activation'] as const)(
    'accepts only the exact %s-gate-only module delta',
    gate => {
      const repositoryRoot = temporaryDirectory(`warpkeep-gr-${gate}-gate-`);
      const sourceDirectory = join(repositoryRoot, 'spacetimedb', 'src');
      const scriptsDirectory = join(repositoryRoot, 'scripts');
      mkdirSync(sourceDirectory, { recursive: true, mode: 0o700 });
      mkdirSync(scriptsDirectory, { recursive: true, mode: 0o700 });
      const policyPath = join(sourceDirectory, 'greaterRealmV17Policy.ts');
      const publisherPath = join(scriptsDirectory, 'greater-realm-production-publisher-core.ts');
      const policy = (importAllowed: boolean, activationAllowed: boolean) => [
        `export const GREATER_REALM_V17_IMPORT_MUTATIONS_ALLOWED = ${importAllowed};`,
        `export const GREATER_REALM_V17_ACTIVATION_MUTATIONS_ALLOWED = ${activationAllowed};`,
        '',
      ].join('\n');
      const publisher = (selectedGate: 'none' | 'import' | 'activation') => [
        'export const GREATER_REALM_PRODUCTION_RELEASE_FLAGS = Object.freeze({',
        `  entryAgreementApproved: ${selectedGate === 'none' ? 'false' : 'true'},`,
        `  additivePublishApproved: ${selectedGate === 'none' ? 'false' : 'true'},`,
        `  importForwardFixApproved: ${selectedGate === 'import' ? 'true' : 'false'},`,
        `  activationForwardFixApproved: ${selectedGate === 'activation' ? 'true' : 'false'},`,
        '  clientActivationApproved: false,',
        '  admissionNotificationsApproved: false,',
        '});',
        '',
      ].join('\n');
      writeFileSync(policyPath, policy(false, false), { mode: 0o600 });
      writeFileSync(publisherPath, publisher('none'), { mode: 0o600 });
      trustedGit(repositoryRoot, ['init', '--quiet']);
      trustedGit(repositoryRoot, ['add',
        'spacetimedb/src/greaterRealmV17Policy.ts',
        'scripts/greater-realm-production-publisher-core.ts',
      ]);
      trustedGit(repositoryRoot, [
        '-c', 'user.name=Warpkeep Test',
        '-c', 'user.email=warpkeep-test@example.invalid',
        'commit', '--quiet', '-m', 'atlas source',
      ]);
      const atlasSourceCommit = trustedCommit('HEAD', repositoryRoot);
      writeFileSync(
        policyPath,
        policy(gate === 'import', gate === 'activation'),
        { mode: 0o600 },
      );
      writeFileSync(publisherPath, publisher(gate), { mode: 0o600 });
      trustedGit(repositoryRoot, ['add',
        'spacetimedb/src/greaterRealmV17Policy.ts',
        'scripts/greater-realm-production-publisher-core.ts',
      ]);
      trustedGit(repositoryRoot, [
        '-c', 'user.name=Warpkeep Test',
        '-c', 'user.email=warpkeep-test@example.invalid',
        'commit', '--quiet', '-m', `${gate} gate`,
      ]);
      const moduleSourceCommit = trustedCommit('HEAD', repositoryRoot);
      expect(() => attestGreaterRealmProductionGateOnlyDelta({
        repositoryRoot,
        atlasSourceCommit,
        moduleSourceCommit,
        gate,
      })).not.toThrow();
      expect(() => attestGreaterRealmProductionGateOnlyDelta({
        repositoryRoot,
        atlasSourceCommit,
        moduleSourceCommit,
        gate: gate === 'import' ? 'activation' : 'import',
      })).toThrowError('GREATER_REALM_PRODUCTION_GATE_DELTA_INVALID');
    },
  );

  it.each([
    ['approval-only', true],
    ['publisher-script-extra', false],
    ['unrelated-script', false],
    ['server-delta', false],
  ] as const)('enforces the inert append %s delta', (variant, accepted) => {
    const repositoryRoot = temporaryDirectory(`warpkeep-gr-append-${variant}-`);
    const scriptsDirectory = join(repositoryRoot, 'scripts');
    mkdirSync(scriptsDirectory, { recursive: true, mode: 0o700 });
    const publisherPath = join(scriptsDirectory, 'greater-realm-production-publisher-core.ts');
    const publisher = (approved: boolean, extra = '') => [
      'export const GREATER_REALM_PRODUCTION_RELEASE_FLAGS = Object.freeze({',
      `  entryAgreementApproved: ${approved},`,
      `  additivePublishApproved: ${approved},`,
      '  importForwardFixApproved: false,',
      '  activationForwardFixApproved: false,',
      '  clientActivationApproved: false,',
      '  admissionNotificationsApproved: false,',
      '});',
      extra,
      '',
    ].join('\n');
    writeFileSync(publisherPath, publisher(false), { mode: 0o600 });
    trustedGit(repositoryRoot, ['init', '--quiet']);
    trustedGit(repositoryRoot, ['add', 'scripts/greater-realm-production-publisher-core.ts']);
    trustedGit(repositoryRoot, [
      '-c', 'user.name=Warpkeep Test',
      '-c', 'user.email=warpkeep-test@example.invalid',
      'commit', '--quiet', '-m', 'reviewed atlas source',
    ]);
    const atlasSourceCommit = trustedCommit('HEAD', repositoryRoot);
    writeFileSync(
      publisherPath,
      publisher(true, variant === 'publisher-script-extra' ? 'export const extra = true;' : ''),
      { mode: 0o600 },
    );
    if (variant === 'unrelated-script') {
      writeFileSync(join(scriptsDirectory, 'unrelated.ts'), 'export const unrelated = true;\n');
    }
    if (variant === 'server-delta') {
      const serverDirectory = join(repositoryRoot, 'spacetimedb', 'src');
      mkdirSync(serverDirectory, { recursive: true, mode: 0o700 });
      writeFileSync(join(serverDirectory, 'unrelated.ts'), 'export const serverDelta = true;\n');
    }
    trustedGit(repositoryRoot, ['add', '.']);
    trustedGit(repositoryRoot, [
      '-c', 'user.name=Warpkeep Test',
      '-c', 'user.email=warpkeep-test@example.invalid',
      'commit', '--quiet', '-m', variant,
    ]);
    const moduleSourceCommit = trustedCommit('HEAD', repositoryRoot);
    const attest = () => attestGreaterRealmProductionAppendApprovalOnlyDelta({
      repositoryRoot,
      atlasSourceCommit,
      moduleSourceCommit,
    });
    if (accepted) expect(attest).not.toThrow();
    else expect(attest).toThrowError('GREATER_REALM_PRODUCTION_APPEND_APPROVAL_DELTA_INVALID');
  });
});

describe('Greater Realm fresh administrator transport', () => {
  it('reuses one serialized session across a complete import call budget', async () => {
    const requestToken = vi.fn(async () => `aaa.${'b'.repeat(24)}.ccc`);
    const procedure = vi.fn(async () => ({ state: 'ready' }));
    const authorityProcedure = vi.fn(async () => ({ releaseState: 'ready' }));
    const reducer = vi.fn(async () => undefined);
    const disconnect = vi.fn();
    const connectDatabase = vi.fn(async () => ({
      isDisconnectRequested: false,
      disconnect,
      procedures: {
        adminGetGreaterRealmStatusV1: procedure,
        adminGetGreaterRealmCutoverStatusV1: authorityProcedure,
      },
      reducers: { adminVerifyGreaterRealmBatchV1: reducer },
    }));
    const session = createGreaterRealmAdminTransportSession({
      adminSecret: 's'.repeat(32),
      requestToken: requestToken as never,
      connectDatabase: connectDatabase as never,
    });
    const transport = bindGreaterRealmProductionStatusTransport(
      session,
      'admin_get_greater_realm_status_v1',
    );
    const authority = bindGreaterRealmProductionStatusTransport(
      session,
      'admin_get_greater_realm_cutover_status_v_1',
    );

    for (let index = 0; index < 17; index += 1) {
      await expect(transport.inspect()).resolves.toEqual({ state: 'ready' });
      await expect(authority.inspect()).resolves.toEqual({ releaseState: 'ready' });
    }
    for (let index = 0; index < 8; index += 1) {
      await transport.submit('admin_verify_greater_realm_batch_v1', {
        atlasId: 'GREATER_REALM_V1', importEpoch: 7n, requestedRows: 256,
      });
    }

    expect(requestToken).toHaveBeenCalledTimes(1);
    expect(connectDatabase).toHaveBeenCalledTimes(1);
    expect(disconnect).not.toHaveBeenCalled();
    expect(procedure).toHaveBeenCalledTimes(17);
    expect(authorityProcedure).toHaveBeenCalledTimes(17);
    expect(reducer).toHaveBeenCalledTimes(8);
    await session.close();
    expect(disconnect).toHaveBeenCalledTimes(1);
    await expect(transport.inspect()).rejects.toThrow(/SESSION_CLOSED/);
  });

  it('never retries a failed reducer and reconnects only for explicit reconciliation', async () => {
    const requestToken = vi.fn(async () => `aaa.${'b'.repeat(24)}.ccc`);
    const reducer = vi.fn(async () => { throw new Error('connection broke'); });
    const disconnects = [vi.fn(), vi.fn()];
    let connections = 0;
    const connectDatabase = vi.fn(async () => {
      const index = connections++;
      return {
        isDisconnectRequested: false,
        disconnect: disconnects[index]!,
        procedures: {
          adminGetGreaterRealmStatusV1: vi.fn(async () => ({ state: 'advanced' })),
        },
        reducers: { adminVerifyGreaterRealmBatchV1: reducer },
      };
    });
    const transport = createGreaterRealmFreshAdminTransport({
      adminSecret: 's'.repeat(32),
      statusProcedure: 'admin_get_greater_realm_status_v1',
      requestToken: requestToken as never,
      connectDatabase: connectDatabase as never,
    });
    await expect(transport.submit('admin_verify_greater_realm_batch_v1', {}))
      .rejects.toThrow(/TRANSPORT_UNAVAILABLE/);
    expect(reducer).toHaveBeenCalledTimes(1);
    expect(requestToken).toHaveBeenCalledTimes(1);
    await expect(transport.inspect()).resolves.toEqual({ state: 'advanced' });
    expect(reducer).toHaveBeenCalledTimes(1);
    expect(requestToken).toHaveBeenCalledTimes(2);
    expect(connectDatabase).toHaveBeenCalledTimes(2);
    await transport.close();
    expect(disconnects[0]).toHaveBeenCalledTimes(1);
    expect(disconnects[1]).toHaveBeenCalledTimes(1);
  });

  it('rejects target overrides and environment-carried credentials', () => {
    expect(requireGreaterRealmProductionTransportTarget({})).toBe(
      GREATER_REALM_PRODUCTION_TRANSPORT_TARGET,
    );
    expect(() => requireGreaterRealmProductionTransportTarget({
      WARPKEEP_SPACETIMEDB_DATABASE: 'warpkeep',
    })).toThrow(/TARGET_OVERRIDE_REJECTED/);
    expect(() => createGreaterRealmFreshAdminTransport({
      adminSecret: 's'.repeat(32),
      statusProcedure: 'invalid-name!',
    })).toThrow(/WIRE_NAME_INVALID/);
    expect(() => readGreaterRealmProductionAdminSecret({
      WARPKEEP_ADMIN_TOKEN_SECRET: 's'.repeat(32),
      WARPKEEP_ADMIN_TOKEN_SECRET_STDIN: '1',
    })).toThrow(/STDIN_REQUIRED/);
  });

  it('reads only one bounded private stdin credential and rejects trailing controls', () => {
    const directory = temporaryDirectory('warpkeep-gr-secret-');
    const valid = join(directory, 'valid');
    writeFileSync(valid, `${'s'.repeat(32)}\n`, { mode: 0o600 });
    const descriptor = openSync(valid, 'r');
    try {
      expect(readGreaterRealmProductionAdminSecret({
        WARPKEEP_ADMIN_TOKEN_SECRET_STDIN: '1',
      }, descriptor)).toBe('s'.repeat(32));
    } finally {
      closeSync(descriptor);
    }

    const invalid = join(directory, 'invalid');
    writeFileSync(invalid, `${'s'.repeat(32)}\t\n`, { mode: 0o600 });
    const invalidDescriptor = openSync(invalid, 'r');
    try {
      expect(() => readGreaterRealmProductionAdminSecret({
        WARPKEEP_ADMIN_TOKEN_SECRET_STDIN: '1',
      }, invalidDescriptor)).toThrow(/CONTROL_CHARACTER_REJECTED/);
    } finally {
      closeSync(invalidDescriptor);
    }
  });
});

describe('Greater Realm private cutover receipts', () => {
  const record = Object.freeze({
    outcome: 'verified',
    artifactDigest: 'a'.repeat(64),
    tableCount: 84,
    importMutationsCompiled: false,
    activationMutationsCompiled: false,
  });

  it('writes an owner-only no-clobber receipt outside the repository', () => {
    const parent = temporaryDirectory('warpkeep-gr-receipt-');
    const directory = join(parent, 'dedicated');
    const now = new Date('2026-08-11T12:00:00.000Z');
    const first = writePrivateGreaterRealmCutoverReceipt({
      directory,
      repositoryRoot: process.cwd(),
      kind: 'warpkeep-greater-realm-production-publish-v1',
      record,
      now,
    });
    const second = writePrivateGreaterRealmCutoverReceipt({
      directory,
      repositoryRoot: process.cwd(),
      kind: 'warpkeep-greater-realm-production-publish-v1',
      record,
      now,
    });
    expect(first.result).toBe('installed');
    expect(second).toMatchObject({
      result: 'unchanged',
      path: first.path,
      receiptDigest: first.receiptDigest,
    });
  });

  it('rejects private identifiers, repository overlap, and symlink destinations', () => {
    const parent = temporaryDirectory('warpkeep-gr-receipt-hostile-');
    expect(() => writePrivateGreaterRealmCutoverReceipt({
      directory: join(parent, 'private-field'),
      repositoryRoot: process.cwd(),
      kind: 'warpkeep-greater-realm-production-import-v1',
      record: { ...record, actorSubject: 'must-not-persist' },
    })).toThrow(/PRIVATE_FIELD_REJECTED/);
    expect(() => writePrivateGreaterRealmCutoverReceipt({
      directory: join(process.cwd(), '.receipts'),
      repositoryRoot: process.cwd(),
      kind: 'warpkeep-greater-realm-production-import-v1',
      record,
    })).toThrow(/REPOSITORY_OVERLAP/);

    const actual = join(parent, 'actual');
    const linked = join(parent, 'linked');
    writeFileSync(join(parent, 'placeholder'), 'x');
    // Create the real private directory before replacing only the requested
    // leaf with a symbolic alias.
    const created = writePrivateGreaterRealmCutoverReceipt({
      directory: actual,
      repositoryRoot: process.cwd(),
      kind: 'warpkeep-greater-realm-production-relocation-v1',
      record,
    });
    expect(created.result).toBe('installed');
    symlinkSync(actual, linked);
    expect(() => writePrivateGreaterRealmCutoverReceipt({
      directory: linked,
      repositoryRoot: process.cwd(),
      kind: 'warpkeep-greater-realm-production-relocation-v1',
      record,
    })).toThrow(/SYMLINK_REJECTED/);
  });

  it('serializes cutover writers while still allowing an atomic receipt inside the lock', async () => {
    const parent = temporaryDirectory('warpkeep-gr-lock-');
    const directory = join(parent, 'dedicated');
    await withGreaterRealmCutoverOperatorLock({
      directory,
      repositoryRoot: process.cwd(),
      operation: async () => {
        await expect(withGreaterRealmCutoverOperatorLock({
          directory,
          repositoryRoot: process.cwd(),
          operation: async () => undefined,
        })).rejects.toThrow(/OPERATOR_ALREADY_RUNNING/);
        expect(writePrivateGreaterRealmCutoverReceipt({
          directory,
          repositoryRoot: process.cwd(),
          kind: 'warpkeep-greater-realm-production-import-v1',
          record,
        }).result).toBe('installed');
      },
    });
    await expect(withGreaterRealmCutoverOperatorLock({
      directory,
      repositoryRoot: process.cwd(),
      operation: async () => 'released',
    })).resolves.toBe('released');
  });
});
