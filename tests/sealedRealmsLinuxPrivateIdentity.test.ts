// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const fixture = vi.hoisted(() => ({ homeMode: 0o750, homeGid: 1000,
  account: { username: 'warpkeep', homedir: '/home/warpkeep', uid: 1000, gid: 1000, shell: '/bin/bash' } }));
vi.mock('node:os', async original => ({ ...await original<typeof import('node:os')>(), userInfo: () => fixture.account }));
vi.mock('node:path', async original => {
  const actual = await original<typeof import('node:path')>();
  return { ...actual, ...actual.posix };
});
vi.mock('node:fs', async original => ({ ...await original<typeof import('node:fs')>(),
  realpathSync: (path: string) => path,
  lstatSync: (path: string) => ({ isDirectory: () => true, isSymbolicLink: () => false,
    uid: 1000, gid: path === '/home/warpkeep' ? fixture.homeGid : 1000,
    mode: path === '/home/warpkeep' ? fixture.homeMode : 0o700 }),
}));
import { createSealedRealmsProductionPrivateState } from '../scripts/sealed-realms-production-private-state.mjs';

describe('Linux production private account policy with mocked account/filesystem metadata', () => {
  const originals = new Map<string, PropertyDescriptor | undefined>();
  beforeEach(() => {
    fixture.homeMode = 0o750; fixture.homeGid = 1000;
    fixture.account = { username: 'warpkeep', homedir: '/home/warpkeep', uid: 1000, gid: 1000, shell: '/bin/bash' };
    for (const key of ['platform', 'getuid', 'geteuid', 'getgid', 'getegid']) {
      originals.set(key, Object.getOwnPropertyDescriptor(process, key));
      Object.defineProperty(process, key, { configurable: true, value: key === 'platform' ? 'linux' : () => 1000 });
    }
  });
  afterEach(() => {
    for (const [key, descriptor] of originals) {
      if (descriptor) Object.defineProperty(process, key, descriptor); else Reflect.deleteProperty(process, key);
    }
    originals.clear();
  });
  it('accepts the dedicated profile without test-only options', () => {
    expect(createSealedRealmsProductionPrivateState({ reportedHome: '/home/warpkeep' })).toBeDefined();
  });
  it.each(['getuid', 'geteuid', 'getgid', 'getegid'])('rejects a mismatched %s', key => {
    Object.defineProperty(process, key, { configurable: true, value: () => 1001 });
    expect(() => createSealedRealmsProductionPrivateState({ reportedHome: '/home/warpkeep' }))
      .toThrow('SEALED_REALMS_PRIVATE_STATE_OWNER_INVALID');
  });
  it.each(['username', 'uid', 'gid', 'homedir'])('rejects a mismatched account %s', key => {
    Object.assign(fixture.account, { [key]: key === 'username' ? 'runner' : key === 'homedir' ? '/home/runner' : 1001 });
    expect(() => createSealedRealmsProductionPrivateState({ reportedHome: '/home/warpkeep' }))
      .toThrow(/SEALED_REALMS_PRIVATE_STATE_(?:HOME|OWNER)_INVALID/u);
  });
  it.each([0o700, 0o755, 0o775])('rejects home mode %s', mode => {
    fixture.homeMode = mode;
    expect(() => createSealedRealmsProductionPrivateState({ reportedHome: '/home/warpkeep' }))
      .toThrow('SEALED_REALMS_PRIVATE_STATE_HOME_INVALID');
  });
  it('rejects the wrong home group', () => {
    fixture.homeGid = 1001;
    expect(() => createSealedRealmsProductionPrivateState({ reportedHome: '/home/warpkeep' }))
      .toThrow('SEALED_REALMS_PRIVATE_STATE_HOME_INVALID');
  });
});
