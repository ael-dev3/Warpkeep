// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
// These fixtures execute the actual local opener against an explicit fake directory/FD model.
// They prove call ordering and failure propagation, not filesystem crash durability or provider authority.
const model = vi.hoisted(() => {
  const sep = process.platform === 'win32' ? '\\' : '/', home = process.platform === 'win32' ? 'C:\\bootstrap-fixture-owner' : '/bootstrap-fixture-owner';
  const parent = [home, '.warpkeep', 'private', 'production-admin-v1'].join(sep);
  const outer = `${parent}${sep}ptr-compatibility-bootstrap-v1`, inner = `${outer}${sep}ptr-initial-owner-updates-v1`;
  return { home, parent, outer, inner, sep, events: [] as string[], existing: new Set<string>(),
    fdPaths: new Map<number, string>(), fd: 900, failSync: null as string | null, changed: null as string | null };
});
vi.mock('node:fs', async () => {
  const actual = await vi.importActual<typeof import('node:fs')>('node:fs');
  const isModel = (path: unknown) => typeof path === 'string' && path.startsWith(model.home);
  const metadata = (path: string) => ({ isDirectory: () => true, isSymbolicLink: () => false,
    dev: 1n, ino: BigInt(1 + path.length) + (model.changed === path ? 100n : 0n),
    mode: path === model.home ? 0o40755n : 0o40700n, uid: 1000n, gid: 1000n });
  return { ...actual,
    existsSync: (path: any) => isModel(path) ? model.existing.has(path) : actual.existsSync(path),
    mkdirSync: (path: any, options: any) => { if (!isModel(path)) return actual.mkdirSync(path, options);
      model.events.push(`mkdir:${path}`); model.existing.add(path); },
    lstatSync: (path: any, options: any) => { if (!isModel(path)) return actual.lstatSync(path, options);
      const value = metadata(path); return options?.bigint ? value : { ...value, dev: Number(value.dev), ino: Number(value.ino),
        mode: Number(value.mode), uid: Number(value.uid), gid: Number(value.gid) }; },
    realpathSync: (path: any) => isModel(path) ? path : actual.realpathSync(path),
    openSync: (path: any, flags: any) => { if (!isModel(path)) return actual.openSync(path, flags);
      model.events.push(`open:${path}`); const fd = model.fd++; model.fdPaths.set(fd, path); return fd; },
    fstatSync: (fd: any, options: any) => model.fdPaths.has(fd) ? metadata(model.fdPaths.get(fd)!) : actual.fstatSync(fd, options),
    fsyncSync: (fd: number) => { const path = model.fdPaths.get(fd); if (!path) return actual.fsyncSync(fd);
      model.events.push(`fsync:${path}`); if (model.failSync === path) throw new Error('fixture fsync failure'); },
    closeSync: (fd: number) => { if (!model.fdPaths.has(fd)) return actual.closeSync(fd);
      model.events.push(`close:${model.fdPaths.get(fd)}`); model.fdPaths.delete(fd); },
  };
});
vi.mock('../scripts/production-admin-token-budget.mjs', async () => {
  const actual = await vi.importActual<any>('../scripts/production-admin-token-budget.mjs');
  return { ...actual, assertProductionAdminTrustedAncestors: () => {},
    ensureCanonicalProductionAdminStateDirectory: () => model.parent, defaultProductionAdminStateDirectory: () => model.parent };
});
vi.mock('../scripts/ptr-initial-owner-update-operator', () => ({ openPtrInitialOwnerUpdateJournal: () => {
  model.events.push(`journal:${model.inner}`); model.existing.add(model.inner);
  return { assert: () => { model.events.push('store:assert'); }, write: () => { model.events.push('marker:write'); },
    read: () => null, present: () => false };
} }));
import { openPtrCompatibilityBootstrapJournal } from '../scripts/ptr-compatibility-bootstrap-operator';
function reset() {
  model.events.length = 0; model.fdPaths.clear(); model.existing = new Set([model.home, model.parent]);
  model.failSync = null; model.changed = null;
}
describe('bootstrap ancestor persistence before marker admission', () => {
  it('fsyncs all six exact directories child-to-parent before returning the marker writer', () => {
    reset(); const store = openPtrCompatibilityBootstrapJournal(true); store.write('submission', 'a'.repeat(64), {});
    const paths = [model.inner, model.outer, model.parent, [model.home, '.warpkeep', 'private'].join(model.sep), [model.home, '.warpkeep'].join(model.sep), model.home];
    expect(model.events.filter(event => event.startsWith('fsync:'))).toEqual(paths.map(path => `fsync:${path}`));
    expect(model.events.indexOf('marker:write')).toBeGreaterThan(model.events.indexOf(`close:${model.home}`));
    expect(model.fdPaths.size).toBe(0); store.assert();
  });
  it.each(['inner', 'outer', 'parent', 'home'] as const)('refuses marker admission when %s fsync fails and closes its FD', key => {
    reset(); model.failSync = model[key]; expect(() => openPtrCompatibilityBootstrapJournal(true)).toThrow('fixture fsync failure');
    expect(model.events).not.toContain('marker:write'); expect(model.fdPaths.size).toBe(0);
  });
  it('retains each ancestor identity and refuses a replacement before later journal use', () => {
    reset(); const store = openPtrCompatibilityBootstrapJournal(true); model.changed = model.home;
    expect(() => store.assert()).toThrow('JOURNAL_ANCESTOR_CHANGED');
  });
  it('read-only reconciliation validates ancestors without creating or fsyncing entries', () => {
    reset(); model.existing.add(model.outer); model.existing.add(model.inner);
    openPtrCompatibilityBootstrapJournal(false).assert();
    expect(model.events.some(event => event.startsWith('fsync:') || event.startsWith('mkdir:'))).toBe(false);
    expect(model.fdPaths.size).toBe(0);
  });
});
