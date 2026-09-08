import { chmodSync, existsSync, mkdirSync, mkdtempSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { createSealedRealmsProductionPrivateState } from '../scripts/sealed-realms-production-private-state.mjs';
import { sealedRealmsPrivateBase } from './helpers/sealedRealmsPrivateRoots';

describe('Linux sealed realm namespace', () => {
  it('uses only the dedicated namespace and retains the record version beneath each root', () => {
    const original = Object.getOwnPropertyDescriptor(process, 'platform')!;
    const home = mkdtempSync(join(tmpdir(), 'warpkeep-linux-private-'));
    const base = join(home, '.warpkeep', 'private', 'sealed-realms-v1');
    for (const relative of ['audit/private', 'runtime', 'cache']) {
      mkdirSync(join(base, relative), { recursive: true, mode: 0o700 });
      chmodSync(join(base, relative), 0o700);
    }
    try {
      Object.defineProperty(process, 'platform', { ...original, value: 'linux' });
      expect(sealedRealmsPrivateBase(home)).toBe(base);
      const state = createSealedRealmsProductionPrivateState({ reportedHome: home,
        testOnlyOwnerUid: statSync(home).uid, testOnlyFsync: () => {}, testOnlyAllowPlatformMode: true });
      for (const root of ['audit', 'runtime', 'cache'] as const) {
        state.write({ root, relativePath: 'test/record.json', bytes: Buffer.from('{}\n') });
        expect(state.read({ root, relativePath: 'test/record.json' }).toString()).toBe('{}\n');
        expect(existsSync(join(base, root === 'audit' ? 'audit/private' : root,
          'sealed-realms-v1', 'test/record.json'))).toBe(true);
      }
      expect(existsSync(join(home, 'Library'))).toBe(false);
    } finally { Object.defineProperty(process, 'platform', original); rmSync(home, { recursive: true, force: true }); }
  });

  it('does not probe or adopt historical roots when the Linux namespace is absent', () => {
    const original = Object.getOwnPropertyDescriptor(process, 'platform')!;
    const home = mkdtempSync(join(tmpdir(), 'warpkeep-linux-old-private-'));
    for (const relative of ['audit/private', 'runtime', 'cache']) {
      mkdirSync(join(home, 'Library', 'Application Support', 'Warpkeep', 'operations', relative), { recursive: true });
    }
    try {
      Object.defineProperty(process, 'platform', { ...original, value: 'linux' });
      expect(() => createSealedRealmsProductionPrivateState({ reportedHome: home,
        testOnlyOwnerUid: statSync(home).uid, testOnlyFsync: () => {}, testOnlyAllowPlatformMode: true }))
        .toThrow('SEALED_REALMS_PRIVATE_STATE_ROOT_INVALID');
      expect(existsSync(join(home, '.warpkeep'))).toBe(false);
    } finally { Object.defineProperty(process, 'platform', original); rmSync(home, { recursive: true, force: true }); }
  });
});
