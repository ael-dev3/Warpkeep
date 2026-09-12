// @vitest-environment node
// Explicit mocked descriptor/transport contract; no native credential or network access.
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { resolve } from 'node:path';
const fixture = vi.hoisted(() => ({
  events: [] as string[],
  source: 'a'.repeat(40),
  drift: false,
  invalid: false,
  reject: false,
}));
vi.mock('node:fs', async (original) => ({
  ...(await original<object>()),
  fstatSync: () => {
    fixture.events.push('stat');
    return {
      isFile: () => true,
      nlink: 1n,
      mode: fixture.invalid ? 0o644n : 0o600n,
      uid: 1000n,
      size: 64n,
      dev: 1n,
      ino: fixture.drift && fixture.events.includes('read') ? 2n : 1n,
      mtimeNs: 1n,
      ctimeNs: 1n,
    };
  },
  closeSync: (fd: number) => {
    expect(fd).toBe(4);
    fixture.events.push('close-fd');
  },
}));
vi.mock('spacetimedb', () => ({
  setGlobalLogLevel: (level: string) => {
    expect(level).toBe('error');
    fixture.events.push('logging');
  },
}));
vi.mock('../scripts/greater-realm-production-provenance.ts', () => ({
  attestGreaterRealmProductionProtectedMain: () => {
    fixture.events.push('attest');
    return fixture.source;
  },
}));
vi.mock('../scripts/greater-realm-production-transport.ts', () => ({
  readGreaterRealmProductionAdminSecretFile: vi.fn(),
  readGreaterRealmProductionAdminSecret: (environment: unknown, fd: number) => {
    expect(environment).toEqual({ WARPKEEP_ADMIN_TOKEN_SECRET_FD: '3' });
    expect(fd).toBe(4);
    fixture.events.push('read');
    return 'fixture-only-secret';
  },
  createGreaterRealmAdminTransportSession: () => {
    fixture.events.push('session');
    return {
      invalidate: async () => {
        fixture.events.push('invalidate');
      },
      inspect: async (procedure: string) => {
        expect(procedure).toBe('genesis_001_access_policy_v1');
        fixture.events.push('inspect');
        if (fixture.reject) throw Error('inspection refused');
        return policy;
      },
      close: async () => {
        fixture.events.push('close-session');
      },
    };
  },
}));
import { executeGenesis001PolicyObservationFromDescriptor } from '../scripts/genesis001-policy-observation-receipt.mjs';
const policy = {
  realmId: 'GENESIS_001',
  releaseVersion: '0.3.43',
  playerAccessEnabled: true,
  admissionStateMutationsEnabled: false,
  accessRequestSubmissionsEnabled: false,
  sourceBaselineCommit: '2ae51984e1fa6ce5b0028c1a250359fed79d819b',
  freezeReleaseNonce:
    '3f158f17acd5e1e63c74befef7cb3ccab7cb07feaaed432e7483467e1c856f00',
};
const input = () => ({
  sourceCommit: 'a'.repeat(40),
  repositoryRoot: resolve('.'),
  descriptor: 4 as const,
});
beforeEach(() => {
  fixture.events = [];
  fixture.source = 'a'.repeat(40);
  fixture.drift = false;
  fixture.invalid = false;
  fixture.reject = false;
  vi.stubGlobal(
    'process',
    Object.defineProperties(Object.create(process), {
      getuid: { value: () => 1000 },
      platform: { value: 'linux' },
    }),
  );
});
it('attests before the bounded read and closes FD before opening the actual operator session', async () => {
  const value = await executeGenesis001PolicyObservationFromDescriptor(input());
  expect(value.policy).toEqual(policy);
  expect(value.mutationSubmitted).toBe(false);
  expect(fixture.events).toEqual([
    'logging',
    'attest',
    'stat',
    'read',
    'stat',
    'close-fd',
    'session',
    'invalidate',
    'inspect',
    'close-session',
  ]);
});
it('closes transferred descriptor when source attestation fails without reading it', async () => {
  fixture.source = 'b'.repeat(40);
  await expect(
    executeGenesis001PolicyObservationFromDescriptor(input()),
  ).rejects.toThrow('SOURCE_INVALID');
  expect(fixture.events).toEqual(['logging', 'attest', 'close-fd']);
});
it.each(['invalid', 'drift'] as const)(
  'refuses descriptor %s before transport',
  async (kind) => {
    fixture[kind] = true;
    await expect(
      executeGenesis001PolicyObservationFromDescriptor(input()),
    ).rejects.toThrow('SECRET_DESCRIPTOR');
    expect(fixture.events).not.toContain('session');
    expect(fixture.events.filter((event) => event === 'close-fd')).toHaveLength(
      1,
    );
  },
);
it('closes the session after inspection failure without closing reused FD4 again', async () => {
  fixture.reject = true;
  await expect(
    executeGenesis001PolicyObservationFromDescriptor(input()),
  ).rejects.toThrow('inspection refused');
  expect(fixture.events.slice(-1)).toEqual(['close-session']);
  expect(fixture.events.filter((event) => event === 'close-fd')).toHaveLength(
    1,
  );
});
it.each([3, 5])(
  'rejects descriptor %s before ownership transfer',
  async (descriptor) => {
    await expect(
      executeGenesis001PolicyObservationFromDescriptor({
        ...input(),
        descriptor,
      } as never),
    ).rejects.toThrow('INPUT_INVALID');
    expect(fixture.events).toEqual([]);
  },
);

afterEach(() => vi.unstubAllGlobals());

it('refuses extra arguments and accessor input without taking descriptor ownership', async () => {
  await expect((executeGenesis001PolicyObservationFromDescriptor as Function)(input(), {})).rejects.toThrow('INPUT_INVALID');
  let invoked = false;
  const bad = { ...input() };
  Object.defineProperty(bad, 'descriptor', { enumerable: true, get() { invoked = true; return 4; } });
  await expect(executeGenesis001PolicyObservationFromDescriptor(bad)).rejects.toThrow('INPUT_INVALID');
  expect(invoked).toBe(false); expect(fixture.events).toEqual([]);
});
