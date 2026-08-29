// @vitest-environment node

import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it, vi } from 'vitest';

import {
  captureGenesis001PolicyObservationBootstrapAuthority,
  executeGenesis001PolicyObservation,
  parseGenesis001PolicyObservationArguments,
} from '../scripts/genesis001-policy-observation-receipt.mjs';

const SOURCE_COMMIT = 'a'.repeat(40);
const OTHER_SOURCE_COMMIT = 'b'.repeat(40);
const ADMIN_SECRET_PATH = '/private/credentials/g001-admin-secret-private-sentinel';
const ADMIN_SECRET = 'g001-private-secret-sentinel-000000000000000000000000';
const POLICY_RECEIPT_DIGEST =
  'acf64ca8f02dcfc1e2a162067d2132d02a7155bebe8895c56a85dbbfefd35b60';

const CLOSED_POLICY = Object.freeze({
  realmId: 'GENESIS_001',
  releaseVersion: '0.3.43',
  playerAccessEnabled: true,
  admissionStateMutationsEnabled: false,
  accessRequestSubmissionsEnabled: false,
  sourceBaselineCommit: '2ae51984e1fa6ce5b0028c1a250359fed79d819b',
  freezeReleaseNonce:
    '3f158f17acd5e1e63c74befef7cb3ccab7cb07feaaed432e7483467e1c856f00',
});

function trustedEnvironment(
  updates: Readonly<Record<string, string | undefined>> = {},
): Record<string, string | undefined> {
  return {
    WKGR_PRODUCTION_BOOTSTRAP_PROFILE:
      'warpkeep-greater-realm-production-bootstrap-v1',
    WKGR_PRODUCTION_PROTECTED_COMMIT: SOURCE_COMMIT,
    WKGR_PRODUCTION_ADMIN_SECRET_PATH: ADMIN_SECRET_PATH,
    WKGR_PRODUCTION_DEPENDENCY_CACHE_ROOT: '/private/runtime/module-cache',
    PATH: '/private/runtime:/usr/bin:/bin',
    ...updates,
  };
}

function observationFixture(rawPolicy: unknown = CLOSED_POLICY) {
  const events: string[] = [];
  const inspect = vi.fn(async (procedure: string) => {
    events.push(`inspect:${procedure}`);
    return rawPolicy;
  });
  const submit = vi.fn(async () => undefined);
  const prepareSubmission = vi.fn(async () => undefined);
  const withConnection = vi.fn(async () => undefined);
  const invalidate = vi.fn(async () => { events.push('invalidate'); });
  const close = vi.fn(async () => { events.push('close'); });
  const dispose = vi.fn(async () => undefined);
  const session = Object.freeze({
    inspect,
    submit,
    prepareSubmission,
    withConnection,
    invalidate,
    close,
    dispose,
  });
  const attestProtectedMain = vi.fn(() => {
    events.push('attest');
    return SOURCE_COMMIT;
  });
  const readAdminSecretFile = vi.fn(() => {
    events.push('read-secret');
    return ADMIN_SECRET;
  });
  const createSession = vi.fn((input: Readonly<{ adminSecret: string }>) => {
    events.push('create-session');
    if (input.adminSecret !== ADMIN_SECRET) throw new Error('wrong secret');
    return session;
  });
  const now = vi.fn(() => new Date('2026-08-28T12:00:00.000Z'));
  return {
    events,
    session,
    inspect,
    submit,
    prepareSubmission,
    withConnection,
    invalidate,
    close,
    dispose,
    dependencies: Object.freeze({
      attestProtectedMain,
      readAdminSecretFile,
      createSession,
      now,
    }),
  };
}

async function observe(rawPolicy: unknown = CLOSED_POLICY) {
  const fixture = observationFixture(rawPolicy);
  const receipt = await executeGenesis001PolicyObservation({
    sourceCommit: SOURCE_COMMIT,
    adminSecretPath: ADMIN_SECRET_PATH,
    repositoryRoot: '/private/protected-main',
    testOnlyDependencies: fixture.dependencies as never,
  });
  return { fixture, receipt };
}

describe('Genesis 001 protected live-policy observation', () => {
  it('suppresses SDK informational logging before any production session can open', () => {
    const source = readFileSync(
      resolve('scripts/genesis001-policy-observation-receipt.mjs'),
      'utf8',
    );
    expect(source).toContain("import { setGlobalLogLevel } from 'spacetimedb';");
    const configure = source.indexOf("setGlobalLogLevel('error');");
    const capture = source.indexOf(
      'captureGenesis001PolicyObservationBootstrapAuthority(',
      source.indexOf('async function main()'),
    );
    expect(configure).toBeGreaterThan(source.indexOf('async function main()'));
    expect(configure).toBeLessThan(capture);
  });

  it('emits the exact sanitized canonical receipt from the exact live policy', async () => {
    const { fixture, receipt } = await observe();

    expect(receipt).toEqual({
      schemaVersion: 1,
      profile: 'warpkeep-genesis-001-live-policy-observation-v1',
      sourceCommit: SOURCE_COMMIT,
      observedAt: '2026-08-28T12:00:00.000Z',
      databaseIdentity:
        'c2001f161d44e50c0a75356d79a4d10fa4a9d77ea4eddd56cda7ac6af50b570e',
      procedure: 'genesis_001_access_policy_v1',
      mutationSubmitted: false,
      policy: CLOSED_POLICY,
      policyReceiptDigest: POLICY_RECEIPT_DIGEST,
    });
    expect(Reflect.ownKeys(receipt)).toEqual([
      'schemaVersion',
      'profile',
      'sourceCommit',
      'observedAt',
      'databaseIdentity',
      'procedure',
      'mutationSubmitted',
      'policy',
      'policyReceiptDigest',
    ]);
    expect(Reflect.ownKeys(receipt.policy)).toEqual([
      'realmId',
      'releaseVersion',
      'playerAccessEnabled',
      'admissionStateMutationsEnabled',
      'accessRequestSubmissionsEnabled',
      'sourceBaselineCommit',
      'freezeReleaseNonce',
    ]);
    expect(fixture.events).toEqual([
      'attest',
      'read-secret',
      'create-session',
      'invalidate',
      'inspect:genesis_001_access_policy_v1',
      'close',
    ]);

    const rendered = JSON.stringify(receipt);
    for (const privateValue of [
      ADMIN_SECRET,
      ADMIN_SECRET_PATH,
      '/private/protected-main',
      '/private/runtime/module-cache',
    ]) expect(rendered).not.toContain(privateValue);
    expect(rendered).not.toMatch(/(?:adminSecret|secretPath|privateInput|token)/iu);
  });

  it('uses exactly one refreshed policy inspection and no mutation-capable method', async () => {
    const { fixture } = await observe();

    expect(fixture.invalidate).toHaveBeenCalledOnce();
    expect(fixture.inspect).toHaveBeenCalledOnce();
    expect(fixture.inspect).toHaveBeenCalledWith(
      'genesis_001_access_policy_v1',
    );
    expect(fixture.submit).not.toHaveBeenCalled();
    expect(fixture.prepareSubmission).not.toHaveBeenCalled();
    expect(fixture.withConnection).not.toHaveBeenCalled();
    expect(fixture.dispose).not.toHaveBeenCalled();
    expect(fixture.close).toHaveBeenCalledOnce();
  });

  it('rejects reopened, stale, partial, extended, or non-plain live policy', async () => {
    const missingField = { ...CLOSED_POLICY } as Record<string, unknown>;
    delete missingField.freezeReleaseNonce;
    const nullPrototype = Object.assign(Object.create(null), CLOSED_POLICY);
    const accessorPolicy = Object.fromEntries(Object.entries(CLOSED_POLICY).map(
      ([key, value]) => [key, value],
    ));
    Object.defineProperty(accessorPolicy, 'realmId', {
      configurable: true,
      enumerable: true,
      get: () => 'GENESIS_001',
    });
    const invalidPolicies: unknown[] = [
      { ...CLOSED_POLICY, releaseVersion: '0.3.44' },
      { ...CLOSED_POLICY, playerAccessEnabled: false },
      { ...CLOSED_POLICY, admissionStateMutationsEnabled: true },
      { ...CLOSED_POLICY, accessRequestSubmissionsEnabled: true },
      { ...CLOSED_POLICY, sourceBaselineCommit: OTHER_SOURCE_COMMIT },
      { ...CLOSED_POLICY, freezeReleaseNonce: '0'.repeat(64) },
      { ...CLOSED_POLICY, privatePopulation: ['must-not-exist'] },
      missingField,
      nullPrototype,
      accessorPolicy,
      [
        'GENESIS_001',
        '0.3.43',
        true,
        false,
        false,
        CLOSED_POLICY.sourceBaselineCommit,
        CLOSED_POLICY.freezeReleaseNonce,
      ],
      null,
    ];

    for (const rawPolicy of invalidPolicies) {
      const fixture = observationFixture(rawPolicy);
      await expect(executeGenesis001PolicyObservation({
        sourceCommit: SOURCE_COMMIT,
        adminSecretPath: ADMIN_SECRET_PATH,
        repositoryRoot: '/private/protected-main',
        testOnlyDependencies: fixture.dependencies as never,
      })).rejects.toThrow(/GENESIS_001_POLICY_OBSERVATION_LIVE_POLICY_INVALID/u);
      expect(fixture.close).toHaveBeenCalledOnce();
    }
  });

  it('propagates live inspection failure while always closing the session', async () => {
    const fixture = observationFixture();
    fixture.inspect.mockRejectedValueOnce(new Error('network-private-detail'));

    await expect(executeGenesis001PolicyObservation({
      sourceCommit: SOURCE_COMMIT,
      adminSecretPath: ADMIN_SECRET_PATH,
      repositoryRoot: '/private/protected-main',
      testOnlyDependencies: fixture.dependencies as never,
    })).rejects.toThrow('network-private-detail');
    expect(fixture.close).toHaveBeenCalledOnce();
    expect(fixture.events.at(-1)).toBe('close');
  });

  it('closes a created session when refresh fails before inspection', async () => {
    const fixture = observationFixture();
    fixture.invalidate.mockRejectedValueOnce(new Error('refresh-unavailable'));

    await expect(executeGenesis001PolicyObservation({
      sourceCommit: SOURCE_COMMIT,
      adminSecretPath: ADMIN_SECRET_PATH,
      repositoryRoot: '/private/protected-main',
      testOnlyDependencies: fixture.dependencies as never,
    })).rejects.toThrow('refresh-unavailable');
    expect(fixture.inspect).not.toHaveBeenCalled();
    expect(fixture.close).toHaveBeenCalledOnce();
  });

  it('rejects a source mismatch before opening the secret or transport', async () => {
    const fixture = observationFixture();
    fixture.dependencies.attestProtectedMain.mockReturnValueOnce(
      OTHER_SOURCE_COMMIT,
    );

    await expect(executeGenesis001PolicyObservation({
      sourceCommit: SOURCE_COMMIT,
      adminSecretPath: ADMIN_SECRET_PATH,
      repositoryRoot: '/private/protected-main',
      testOnlyDependencies: fixture.dependencies as never,
    })).rejects.toThrow(/GENESIS_001_POLICY_OBSERVATION_SOURCE_INVALID/u);
    expect(fixture.dependencies.readAdminSecretFile).not.toHaveBeenCalled();
    expect(fixture.dependencies.createSession).not.toHaveBeenCalled();
  });

  it('captures and deletes only the trusted bootstrap authority bindings', () => {
    const environment = trustedEnvironment({ PRESERVED_PUBLIC_VALUE: 'public' });
    expect(captureGenesis001PolicyObservationBootstrapAuthority(environment))
      .toEqual({
        sourceCommit: SOURCE_COMMIT,
        adminSecretPath: ADMIN_SECRET_PATH,
      });
    expect(environment).toEqual({
      PATH: '/private/runtime:/usr/bin:/bin',
      PRESERVED_PUBLIC_VALUE: 'public',
    });
  });

  it('rejects unavailable or competing administrator-secret authority', () => {
    const missing = trustedEnvironment({
      WKGR_PRODUCTION_ADMIN_SECRET_PATH: undefined,
    });
    expect(() => captureGenesis001PolicyObservationBootstrapAuthority(missing))
      .toThrow(/GENESIS_001_POLICY_OBSERVATION_SECRET_AUTHORITY_UNAVAILABLE/u);

    for (const competing of [
      { WARPKEEP_ADMIN_TOKEN_SECRET: ADMIN_SECRET },
      { WARPKEEP_ADMIN_TOKEN_SECRET_FD: '3' },
      { WARPKEEP_ADMIN_TOKEN_SECRET_STDIN: '1' },
      { WARPKEEP_PRODUCTION_ADMIN_SECRET_PATH: '/private/other-secret' },
      { WKGR_PRODUCTION_PRIVATE_INPUT_PATH: '/private/input' },
      { WKGR_PRODUCTION_NOTIFICATION_SECRET_PATH: '/private/notification-secret' },
    ]) {
      const environment = trustedEnvironment(competing);
      expect(() => captureGenesis001PolicyObservationBootstrapAuthority(environment))
        .toThrow(/GENESIS_001_POLICY_OBSERVATION_SECRET_AUTHORITY_AMBIGUOUS/u);
      expect(environment).not.toHaveProperty('WKGR_PRODUCTION_ADMIN_SECRET_PATH');
      expect(environment).not.toHaveProperty('WKGR_PRODUCTION_PROTECTED_COMMIT');
    }
  });

  it('rejects direct invocation and accepts only the fixed observe argument', () => {
    expect(() => captureGenesis001PolicyObservationBootstrapAuthority({}))
      .toThrow(/GENESIS_001_POLICY_OBSERVATION_TRUSTED_BOOTSTRAP_REQUIRED/u);
    expect(parseGenesis001PolicyObservationArguments(['observe']))
      .toEqual({ command: 'observe' });
    for (const arguments_ of [
      [],
      ['observe', '--source-commit=' + SOURCE_COMMIT],
      ['observe', '--confirm'],
      ['publish'],
    ]) expect(() => parseGenesis001PolicyObservationArguments(arguments_))
      .toThrow(/GENESIS_001_POLICY_OBSERVATION_ARGUMENTS_INVALID/u);

    const direct = spawnSync(process.execPath, [
      resolve('node_modules/tsx/dist/cli.mjs'),
      resolve('scripts/genesis001-policy-observation-receipt.mjs'),
      'observe',
    ], {
      encoding: 'utf8',
      env: { PATH: '/usr/bin:/bin' },
      timeout: 15_000,
    });
    expect(direct.status).toBe(1);
    expect(direct.stdout).toBe('');
    expect(direct.stderr).toBe(
      'GENESIS_001_POLICY_OBSERVATION_TRUSTED_BOOTSTRAP_REQUIRED\n',
    );
  });
});
