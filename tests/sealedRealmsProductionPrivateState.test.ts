import {
  chmodSync,
  mkdirSync,
  linkSync,
  mkdtempSync,
  renameSync,
  rmSync,
  statSync,
  symlinkSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it, vi } from 'vitest';

import {
  SealedRealmsProductionPrivateStateError,
  createSealedRealmsProductionPrivateState,
} from '../scripts/sealed-realms-production-private-state.mjs';

function privateHome() {
  const home = mkdtempSync(join(tmpdir(), 'warpkeep-sealed-realms-private-'));
  const roots = [
    join(home, 'Library', 'Application Support', 'Warpkeep', 'operations', 'audit', 'private'),
    join(home, 'Library', 'Application Support', 'Warpkeep', 'operations', 'runtime'),
    join(home, 'Library', 'Application Support', 'Warpkeep', 'operations', 'cache'),
  ];
  for (const root of roots) {
    mkdirSync(root, { recursive: true, mode: 0o700 });
    chmodSync(root, 0o700);
  }
  return {
    home,
    ownerUid: statSync(roots[0]).uid,
    cleanup: () => rmSync(home, { recursive: true, force: true }),
  };
}

describe('sealed-realms private state', () => {
  it('creates only sealed-realms-v1 descendants and writes no-clobber canonical private bytes', () => {
    const fixture = privateHome();
    const fsync = vi.fn();
    try {
      const state = createSealedRealmsProductionPrivateState({
        reportedHome: fixture.home,
        testOnlyOwnerUid: fixture.ownerUid,
        testOnlyFsync: fsync,
        testOnlyAllowPlatformMode: true,
      });
      const write = state.write({
        root: 'runtime',
        relativePath: 'publication/g002/markers/possibly-submitted-a.json',
        bytes: Buffer.from('{"private":"body"}\n'),
      });

      expect(write).toEqual({ byteLength: 19 });
      expect(state.read({
        root: 'runtime',
        relativePath: 'publication/g002/markers/possibly-submitted-a.json',
      }).toString('utf8')).toBe('{"private":"body"}\n');
      expect(fsync).toHaveBeenCalled();
      expect(() => state.write({
        root: 'runtime',
        relativePath: 'publication/g002/markers/possibly-submitted-a.json',
        bytes: Buffer.from('{}\n'),
      })).toThrow(SealedRealmsProductionPrivateStateError);
    } finally {
      fixture.cleanup();
    }
  });

  it('fails closed without a pre-existing exact root and redacts private paths', () => {
    const fixture = privateHome();
    try {
      rmSync(join(
        fixture.home, 'Library', 'Application Support', 'Warpkeep', 'operations', 'cache',
      ), { recursive: true, force: true });
      let message = '';
      try {
        createSealedRealmsProductionPrivateState({
          reportedHome: fixture.home,
          testOnlyOwnerUid: fixture.ownerUid,
          testOnlyFsync: () => {},
          testOnlyAllowPlatformMode: true,
        });
      } catch (error) {
        message = String(error);
      }
      expect(message).toContain('SEALED_REALMS_PRIVATE_STATE_ROOT_INVALID');
      expect(message).not.toContain(fixture.home);
    } finally {
      fixture.cleanup();
    }
  });

  it('rejects absolute, traversal, and caller-selected digest paths', () => {
    const fixture = privateHome();
    try {
      const state = createSealedRealmsProductionPrivateState({
        reportedHome: fixture.home,
        testOnlyOwnerUid: fixture.ownerUid,
        testOnlyFsync: () => {},
        testOnlyAllowPlatformMode: true,
      });
      for (const relativePath of ['../escape', '/absolute/private', 'bridge/../receipt', 'x'.repeat(300)]) {
        expect(() => state.write({
          root: 'runtime', relativePath, bytes: Buffer.from('{}\n'),
        })).toThrow(/SEALED_REALMS_PRIVATE_STATE_/u);
      }
    } finally {
      fixture.cleanup();
    }
  });

  it('appends only to an existing authenticated private file and fsyncs its directory', () => {
    const fixture = privateHome();
    const fsync = vi.fn();
    try {
      const state = createSealedRealmsProductionPrivateState({
        reportedHome: fixture.home,
        testOnlyOwnerUid: fixture.ownerUid,
        testOnlyFsync: fsync,
        testOnlyAllowPlatformMode: true,
      });
      const relativePath = 'bridge/authority/auth-bridge-import-authority-a.jsonl';
      state.write({
        root: 'runtime', relativePath, bytes: Buffer.from('{"first":true}\n'),
      });

      expect(state.append({
        root: 'runtime', relativePath, bytes: Buffer.from('{"second":true}\n'),
      })).toEqual({ byteLength: 16 });
      expect(state.read({ root: 'runtime', relativePath }).toString('utf8'))
        .toBe('{"first":true}\n{"second":true}\n');
      expect(fsync).toHaveBeenCalled();
      expect(() => state.append({
        root: 'runtime', relativePath: 'bridge/authority/missing.jsonl', bytes: Buffer.from('{}\n'),
      })).toThrow(/SEALED_REALMS_PRIVATE_STATE_/u);
    } finally {
      fixture.cleanup();
    }
  });

  it('rejects a caller-selected home outside an explicit test-only private-state fixture', () => {
    const fixture = privateHome();
    try {
      expect(() => createSealedRealmsProductionPrivateState({
        reportedHome: fixture.home,
      } as never)).toThrow('SEALED_REALMS_PRIVATE_STATE_HOME_INVALID');
    } finally {
      fixture.cleanup();
    }
  });

  it('revalidates every retained parent identity after directory fsync before returning a write', () => {
    const fixture = privateHome();
    let swapped = false;
    try {
      const state = createSealedRealmsProductionPrivateState({
        reportedHome: fixture.home,
        testOnlyOwnerUid: fixture.ownerUid,
        testOnlyAllowPlatformMode: true,
        testOnlyFsync: path => {
          if (!swapped && /[\\/]publication[\\/]g002[\\/]markers$/u.test(path)) {
            swapped = true;
            renameSync(path, `${path}-displaced`);
            mkdirSync(path, { mode: 0o700 });
          }
        },
      });
      expect(() => state.write({
        root: 'runtime',
        relativePath: 'publication/g002/markers/possibly-submitted-a.json',
        bytes: Buffer.from('{"private":"body"}\n'),
      })).toThrow(/SEALED_REALMS_PRIVATE_STATE_/u);
      expect(swapped).toBe(true);
    } finally {
      fixture.cleanup();
    }
  });

  it('rejects a hard-linked private file instead of treating it as a stable owner-private receipt', () => {
    const fixture = privateHome();
    try {
      const state = createSealedRealmsProductionPrivateState({
        reportedHome: fixture.home,
        testOnlyOwnerUid: fixture.ownerUid,
        testOnlyFsync: () => {},
        testOnlyAllowPlatformMode: true,
      });
      const relativePath = 'bridge/hard-link/receipt.json';
      state.write({ root: 'runtime', relativePath, bytes: Buffer.from('{"a":1}\n') });
      const target = join(
        fixture.home, 'Library', 'Application Support', 'Warpkeep', 'operations', 'runtime',
        'sealed-realms-v1', 'bridge', 'hard-link', 'receipt.json',
      );
      linkSync(target, `${target}.linked`);
      expect(() => state.read({ root: 'runtime', relativePath })).toThrow(
        'SEALED_REALMS_PRIVATE_STATE_FILE_INVALID',
      );
    } finally {
      fixture.cleanup();
    }
  });

  it('revalidates a retained append parent after directory fsync before reporting success', () => {
    const fixture = privateHome();
    let armed = false;
    let swapped = false;
    try {
      const state = createSealedRealmsProductionPrivateState({
        reportedHome: fixture.home,
        testOnlyOwnerUid: fixture.ownerUid,
        testOnlyAllowPlatformMode: true,
        testOnlyFsync: path => {
          if (armed && !swapped && /[\\/]bridge[\\/]append-parent$/u.test(path)) {
            swapped = true;
            renameSync(path, `${path}-displaced`);
            mkdirSync(path, { mode: 0o700 });
          }
        },
      });
      const relativePath = 'bridge/append-parent/authority.jsonl';
      state.write({ root: 'runtime', relativePath, bytes: Buffer.from('{"first":true}\n') });
      armed = true;
      expect(() => state.append({
        root: 'runtime', relativePath, bytes: Buffer.from('{"second":true}\n'),
      })).toThrow(/SEALED_REALMS_PRIVATE_STATE_/u);
      expect(swapped).toBe(true);
    } finally {
      fixture.cleanup();
    }
  });

  it('rejects wrong owner, wrong POSIX mode, root symlinks, and child symlinks', () => {
    const fixture = privateHome();
    try {
      expect(() => createSealedRealmsProductionPrivateState({
        reportedHome: fixture.home, testOnlyOwnerUid: fixture.ownerUid + 1,
        testOnlyFsync: () => {}, testOnlyAllowPlatformMode: true,
      })).toThrow(/OWNER|HOME_INVALID/u);
      const runtime = join(fixture.home, 'Library', 'Application Support', 'Warpkeep', 'operations', 'runtime');
      if (process.platform !== 'win32') {
        chmodSync(runtime, 0o755);
        expect(() => createSealedRealmsProductionPrivateState({
          reportedHome: fixture.home, testOnlyOwnerUid: fixture.ownerUid, testOnlyFsync: () => {},
        })).toThrow('SEALED_REALMS_PRIVATE_STATE_ROOT_INVALID');
        chmodSync(runtime, 0o700);
        renameSync(runtime, `${runtime}-real`);
        symlinkSync(`${runtime}-real`, runtime, 'dir');
        expect(() => createSealedRealmsProductionPrivateState({
          reportedHome: fixture.home, testOnlyOwnerUid: fixture.ownerUid,
          testOnlyFsync: () => {}, testOnlyAllowPlatformMode: true,
        })).toThrow('SEALED_REALMS_PRIVATE_STATE_ROOT_INVALID');
        unlinkSync(runtime);
        renameSync(`${runtime}-real`, runtime);
      }
      const state = createSealedRealmsProductionPrivateState({
        reportedHome: fixture.home, testOnlyOwnerUid: fixture.ownerUid,
        testOnlyFsync: () => {}, testOnlyAllowPlatformMode: true,
      });
      state.write({ root: 'runtime', relativePath: 'links/real/value.json', bytes: Buffer.from('{}\n') });
      const version = join(runtime, 'sealed-realms-v1');
      if (process.platform !== 'win32') {
        symlinkSync(join(version, 'links', 'real'), join(version, 'links', 'alias'), 'dir');
        expect(() => state.read({ root: 'runtime', relativePath: 'links/alias/value.json' }))
          .toThrow('SEALED_REALMS_PRIVATE_STATE_DIRECTORY_INVALID');
      }
    } finally { fixture.cleanup(); }
  });

  it('allows exactly one duplicate writer and reports FILE_EXISTS for the loser', async () => {
    const fixture = privateHome();
    try {
      const state = createSealedRealmsProductionPrivateState({
        reportedHome: fixture.home, testOnlyOwnerUid: fixture.ownerUid,
        testOnlyFsync: () => {}, testOnlyAllowPlatformMode: true,
      });
      const results = await Promise.allSettled([1, 2].map(value => Promise.resolve().then(() =>
        state.write({ root: 'runtime', relativePath: 'race/value.json', bytes: Buffer.from(`${value}\n`) }))));
      expect(results.filter(result => result.status === 'fulfilled')).toHaveLength(1);
      const loser = results.find(result => result.status === 'rejected');
      expect(String(loser && 'reason' in loser ? loser.reason : '')).toContain('FILE_EXISTS');
    } finally { fixture.cleanup(); }
  });

  it('detects target replacement during final write and append directory fsync', () => {
    const fixture = privateHome();
    let armed = false;
    let target = '';
    try {
      const state = createSealedRealmsProductionPrivateState({
        reportedHome: fixture.home, testOnlyOwnerUid: fixture.ownerUid,
        testOnlyAllowPlatformMode: true,
        testOnlyFsync: path => {
          if (armed && target && /[\\/]race-final$/u.test(path)) {
            armed = false; renameSync(target, `${target}.old`); writeFileSync(target, '{}\n');
          }
        },
      });
      const base = join(fixture.home, 'Library', 'Application Support', 'Warpkeep', 'operations',
        'runtime', 'sealed-realms-v1', 'race-final');
      state.write({ root: 'runtime', relativePath: 'race-final/seed.json', bytes: Buffer.from('{}\n') });
      target = join(base, 'write.json'); armed = true;
      expect(() => state.write({ root: 'runtime', relativePath: 'race-final/write.json', bytes: Buffer.from('{}\n') }))
        .toThrow('SEALED_REALMS_PRIVATE_STATE_FILE_REPLACED');
      target = join(base, 'append.json'); armed = false;
      state.write({ root: 'runtime', relativePath: 'race-final/append.json', bytes: Buffer.from('{}\n') });
      armed = true;
      expect(() => state.append({ root: 'runtime', relativePath: 'race-final/append.json', bytes: Buffer.from('{}\n') }))
        .toThrow('SEALED_REALMS_PRIVATE_STATE_FILE_REPLACED');
    } finally { fixture.cleanup(); }
  });

  it('detects newly-created directory replacement during parent fsync and recreated remove name', () => {
    const fixture = privateHome();
    let mode: 'create' | 'remove' = 'create';
    let removeTarget = '';
    try {
      const runtime = join(fixture.home, 'Library', 'Application Support', 'Warpkeep', 'operations', 'runtime');
      const state = createSealedRealmsProductionPrivateState({
        reportedHome: fixture.home, testOnlyOwnerUid: fixture.ownerUid,
        testOnlyAllowPlatformMode: true,
        testOnlyFsync: path => {
          if (mode === 'create' && path === runtime) {
            mode = 'remove'; const child = join(runtime, 'sealed-realms-v1');
            renameSync(child, `${child}-old`); mkdirSync(child, { mode: 0o700 });
          } else if (mode === 'remove' && removeTarget && /[\\/]remove-race$/u.test(path)) {
            mode = 'create'; writeFileSync(removeTarget, '{}\n');
          }
        },
      });
      expect(() => state.write({ root: 'runtime', relativePath: 'x/value.json', bytes: Buffer.from('{}\n') }))
        .toThrow('SEALED_REALMS_PRIVATE_STATE_DIRECTORY_REPLACED');
    } finally { fixture.cleanup(); }

    const second = privateHome();
    try {
      let armed = false;
      const state = createSealedRealmsProductionPrivateState({
        reportedHome: second.home, testOnlyOwnerUid: second.ownerUid,
        testOnlyAllowPlatformMode: true,
        testOnlyFsync: path => {
          if (armed && /[\\/]remove-race$/u.test(path)) { armed = false; writeFileSync(removeTarget, '{}\n'); }
        },
      });
      removeTarget = join(second.home, 'Library', 'Application Support', 'Warpkeep', 'operations',
        'runtime', 'sealed-realms-v1', 'remove-race', 'value.json');
      state.write({ root: 'runtime', relativePath: 'remove-race/value.json', bytes: Buffer.from('{}\n') });
      armed = true;
      expect(() => state.remove({ root: 'runtime', relativePath: 'remove-race/value.json' }))
        .toThrow('SEALED_REALMS_PRIVATE_STATE_FILE_REPLACED');
    } finally { second.cleanup(); }
  });

  it.each(['list', 'exists', 'read', 'remove'] as const)(
    'fails closed when a target or parent is swapped during %s', operation => {
      const fixture = privateHome();
      let armed = false;
      try {
        const state = createSealedRealmsProductionPrivateState({
          reportedHome: fixture.home, testOnlyOwnerUid: fixture.ownerUid,
          testOnlyFsync: () => {}, testOnlyAllowPlatformMode: true,
          testOnlyRace: (phase, path) => {
            if (!armed) return;
            if ((operation === 'list' && phase === 'list-after-read')
              || (operation === 'exists' && phase === 'exists-after-lstat')) {
              armed = false; renameSync(operation === 'list' ? path : join(path, '..'), `${operation === 'list' ? path : join(path, '..')}-old`);
              mkdirSync(operation === 'list' ? path : join(path, '..'), { mode: 0o700 });
            } else if ((operation === 'read' && phase === 'read-after-open')
              || (operation === 'remove' && phase === 'remove-before-unlink')) {
              armed = false; renameSync(path, `${path}.old`); writeFileSync(path, '{}\n');
            }
          },
        });
        state.write({ root: 'runtime', relativePath: 'op-race/value.json', bytes: Buffer.from('{}\n') });
        armed = true;
        const invoke = () => operation === 'list'
          ? state.list({ root: 'runtime', relativeDirectory: 'op-race' })
          : operation === 'exists'
            ? state.exists({ root: 'runtime', relativePath: 'op-race/value.json' })
            : operation === 'read'
              ? state.read({ root: 'runtime', relativePath: 'op-race/value.json' })
              : state.remove({ root: 'runtime', relativePath: 'op-race/value.json' });
        expect(invoke).toThrow(/SEALED_REALMS_PRIVATE_STATE_/u);
      } finally { fixture.cleanup(); }
    },
  );
});
