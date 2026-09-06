import { describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import { chmodSync, copyFileSync, lstatSync, mkdirSync, mkdtempSync, readFileSync,
  realpathSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import * as recovery from '../scripts/local-release-recovery-journal.mjs';
const profile = 'warpkeep-spacetime-binding-final-preparation-linux-x64-v1';
const path = 'scripts/sealed-realms-production-g002-lane.bundle.mjs';
const fact = (ino: string, sha256 = 'a'.repeat(64), size = 3) => ({
  dev: '17', ino, uid: 1000 as const, mode: 420, size, sha256,
});
const original = fact('10');
const backup = fact('11');
const after = fact('12', 'b'.repeat(64));
const record = () => ({
  schemaVersion: 1 as const, profile, transactionId: '1'.repeat(32),
  sourceCommit: '2'.repeat(40), sourceTree: '3'.repeat(40),
  candidate: { dev: '17', ino: '2', uid: 1000 as const, mode: 448 as const },
  entries: [{ path, before: { target: { ...original }, backup: { ...backup } }, after: { ...after } }],
});
const observed = () => [{ path, target: { ...original }, backup: { ...backup }, stage: { ...after } }];

describe('prepared release recovery journal', () => {
  it('round-trips copied, deeply frozen canonical records without raw bodies', () => {
    const input = record();
    const bytes = recovery!.encodePreparedReleaseJournal(input);
    expect(Buffer.from(bytes).toString()).toBe(`${JSON.stringify(input)}\n`);
    const restored = recovery!.decodePreparedReleaseJournal(bytes);
    expect(restored).toEqual(input);
    input.entries[0].after.sha256 = 'c'.repeat(64);
    expect(restored.entries[0].after.sha256).toBe('b'.repeat(64));
    expect(Object.isFrozen(restored.entries[0].before!.backup)).toBe(true);
    expect(Object.isFrozen(restored.entries)).toBe(true);
  });

  it.each([
    '../outside.ts', '/tmp/x.ts', 'scripts/../outside.ts', 'scripts//x.ts',
    'scripts/genesis001_module_bindings/index.ts', 'src/main.ts',
    'scripts/genesis002_module_bindings/../secret.ts',
    'spacetimedb/ptr/generated-bindings/package.json',
    'spacetimedb/ptr/generated-bindings/.hidden.ts',
    'spacetimedb/ptr/generated-bindings/a\\b.ts',
    'spacetimedb/ptr/generated-bindings/a.ts\n',
    'scripts/local-release-recovery-journal.mjs',
  ])('rejects forbidden output %s', badPath => {
    const input = record(); input.entries[0].path = badPath;
    expect(() => recovery!.encodePreparedReleaseJournal(input)).toThrow();
  });

  it.each([
    'scripts/genesis002_module_bindings/index.ts',
    'spacetimedb/ptr/generated-bindings/types/worker.ts',
    '.github/workflows/verify.yml',
    'scripts/sealed-realms-production-activation-lane.bundle.d.mts',
  ])('accepts an eligible generated target %s', allowedPath => {
    const input = record(); input.entries[0].path = allowedPath;
    expect(recovery!.decodePreparedReleaseJournal(recovery!.encodePreparedReleaseJournal(input)).entries[0].path)
      .toBe(allowedPath);
  });

  it.each([
    ['profile', 'darwin'], ['sourceCommit', 'x'.repeat(40)],
    ['sourceTree', 'A'.repeat(40)], ['transactionId', '0'.repeat(31)],
    ['schemaVersion', 2], ['rawReceipt', 'private'],
  ])('rejects invalid top-level %s', (key, value) => {
    expect(() => recovery!.encodePreparedReleaseJournal({ ...record(), [key]: value })).toThrow();
  });

  it.each([
    ['uid', 0], ['mode', 511], ['ino', '00'], ['ino', '0'], ['dev', '-1'],
    ['dev', '18'], ['size', -1], ['size', 8 * 1024 * 1024 + 1],
    ['sha256', 'z'.repeat(64)], ['body', 'secret'],
  ])('rejects invalid recorded file %s=%s', (key, value) => {
    const input = record(); Object.assign(input.entries[0].after, { [key]: value });
    expect(() => recovery!.encodePreparedReleaseJournal(input)).toThrow();
  });

  it('rejects backup byte drift and inode aliasing before journaling', () => {
    const changed = record(); changed.entries[0].before.backup.sha256 = 'c'.repeat(64);
    expect(() => recovery!.encodePreparedReleaseJournal(changed)).toThrow();
    const alias = record(); alias.entries[0].before.backup.ino = '10';
    expect(() => recovery!.encodePreparedReleaseJournal(alias)).toThrow();
    const rootAlias = record(); rootAlias.entries[0].after.ino = '2';
    expect(() => recovery!.encodePreparedReleaseJournal(rootAlias)).toThrow();
  });

  it('rejects empty, duplicate, unsorted, or oversized families', () => {
    const input = record();
    expect(() => recovery!.encodePreparedReleaseJournal({ ...input, entries: [] })).toThrow();
    expect(() => recovery!.encodePreparedReleaseJournal({ ...input, entries: [input.entries[0], input.entries[0]] })).toThrow();
    const entries = Array.from({ length: 2049 }, (_, index) => ({
      path: `scripts/genesis002_module_bindings/f${String(index).padStart(4, '0')}.ts`,
      before: null, after: fact(String(index + 100)),
    }));
    expect(() => recovery!.encodePreparedReleaseJournal({ ...input, entries })).toThrow();
    expect(() => recovery!.encodePreparedReleaseJournal({ ...input, entries: entries.slice(0, 2).reverse() })).toThrow();
    expect(() => recovery!.encodePreparedReleaseJournal({ ...input,
      entries: entries.slice(0, 17).map(entry => ({ ...entry, after: { ...entry.after, size: 8 * 1024 * 1024 } })),
    })).toThrow();
  });

  it('rejects noncanonical encoding, duplicate keys, invalid UTF-8, and oversized input', () => {
    const source = JSON.stringify(record());
    for (const bytes of [Buffer.from('{}\n'), Buffer.from(source),
      Buffer.from(`${source}\n\n`), Buffer.from(`${JSON.stringify(record(), null, 2)}\n`),
      Buffer.from(`${source.replace('"schemaVersion":1', '"schemaVersion":1,"schemaVersion":1')}\n`),
      Buffer.from([0xff, 0x0a]), Buffer.alloc(2 * 1024 * 1024 + 1),
    ]) expect(() => recovery!.decodePreparedReleaseJournal(bytes)).toThrow();
  });

  it('rejects accessor properties without invoking them or exposing private input', () => {
    let accessed = false;
    const input = record();
    Object.defineProperty(input, 'sourceCommit', { get() { accessed = true; throw new Error('PRIVATE'); } });
    expect(() => recovery.encodePreparedReleaseJournal(input)).toThrow('LOCAL_RELEASE_RECOVERY_JOURNAL_INVALID');
    expect(accessed).toBe(false);
    expect(() => recovery.decodePreparedReleaseJournal(Buffer.from('{"PRIVATE":true}\n')))
      .toThrow(/^LOCAL_RELEASE_RECOVERY_JOURNAL_INVALID$/);
  });
});

describe('all-target rollback reconciliation', () => {
  it.each([
    ['unpublished', original, backup, after, 'retain'],
    ['published', after, backup, null, 'restore-backup'],
    ['already restored', backup, null, null, 'retain'],
  ] as const)('recognizes %s state by exact identity', (_name, target, saved, stage, operation) => {
    expect(recovery!.planPreparedReleaseRollback({ journal: record(), observations: [{ path, target, backup: saved, stage }] }))
      .toEqual([{ path, operation }]);
  });

  it.each([
    ['unpublished', null, after, 'retain'],
    ['published', after, null, 'remove-created'],
    ['already removed', null, null, 'retain'],
  ] as const)('handles a newly created target in %s state', (_name, target, stage, operation) => {
    const input = { ...record(), entries: [{ path, before: null, after }] };
    expect(recovery!.planPreparedReleaseRollback({ journal: input, observations: [{ path, target, backup: null, stage }] }))
      .toEqual([{ path, operation }]);
  });

  it.each([
    { target: fact('99') }, { target: { ...original, sha256: 'c'.repeat(64) } },
    { backup: null }, { backup: { ...backup, mode: 384 } }, { stage: null },
    { stage: { ...after, size: 4 } }, { path: 'scripts/not-allowed.mjs' },
    { target: after, stage: after }, { target: backup, backup: null, stage: after },
    { target: null }, { unexpected: true },
  ])('rejects inconsistent or changed observed state %#', mutation => {
    expect(() => recovery!.planPreparedReleaseRollback({ journal: record(),
      observations: [{ ...observed()[0], ...mutation }],
    })).toThrow('LOCAL_RELEASE_RECOVERY_STATE_INVALID');
  });

  it('rejects missing or extra observations', () => {
    for (const observations of [[], [...observed(), ...observed()]]) {
      expect(() => recovery!.planPreparedReleaseRollback({ journal: record(), observations })).toThrow();
    }
  });

  it('rejects the entire plan when a later target was changed', () => {
    const input = record();
    const secondPath = 'scripts/sealed-realms-production-ptr-lane.bundle.mjs';
    const second = { path: secondPath, before: { target: fact('20'), backup: fact('21') }, after: fact('22', 'b'.repeat(64)) };
    input.entries.push(second);
    const observations = [
      { path, target: after, backup, stage: null },
      { path: secondPath, target: fact('99'), backup: fact('21'), stage: second.after },
    ];
    const beforeInput = structuredClone(observations);
    expect(() => recovery!.planPreparedReleaseRollback({ journal: input, observations }))
      .toThrow('LOCAL_RELEASE_RECOVERY_STATE_INVALID');
    expect(observations).toEqual(beforeInput);
  });

  it('recognizes every publication boundary in a mixed existing/new family', () => {
    const entries = [
      { path: 'scripts/genesis002_module_bindings/a.ts', before: { target: fact('30'), backup: fact('31') }, after: fact('32', 'b'.repeat(64)) },
      { path: 'scripts/genesis002_module_bindings/b.ts', before: null, after: fact('33', 'b'.repeat(64)) },
      { path: 'scripts/genesis002_module_bindings/c.ts', before: { target: fact('34'), backup: fact('35') }, after: fact('36', 'b'.repeat(64)) },
    ];
    const expected = [
      ['retain', 'retain', 'retain'],
      ['restore-backup', 'retain', 'retain'],
      ['restore-backup', 'remove-created', 'retain'],
      ['restore-backup', 'remove-created', 'restore-backup'],
    ];
    for (let published = 0; published <= 3; published += 1) {
      const observations = entries.map((entry, index) => ({
        path: entry.path, target: index < published ? entry.after : (entry.before?.target ?? null),
        backup: entry.before?.backup ?? null, stage: index < published ? null : entry.after,
      }));
      const actions = recovery.planPreparedReleaseRollback({ journal: { ...record(), entries }, observations });
      expect(actions.map(action => action.operation)).toEqual(expected[published]);
      expect(Object.isFrozen(actions)).toBe(true);
      expect(actions.every(Object.isFrozen)).toBe(true);
    }
  });
});

it.skipIf(process.platform !== 'linux' || process.getuid?.() !== 1000)(
  'reconciles real Linux rename identities and rejects a changed restored file', () => {
    const root = mkdtempSync(join(realpathSync(tmpdir()), 'warpkeep-release-journal-facts-'));
    chmodSync(root, 0o700);
    try {
      mkdirSync(join(root, 'scripts'), { mode: 0o700 });
      const targetPath = join(root, path);
      const backupPath = join(root, 'backup');
      const stagePath = join(root, 'stage');
      writeFileSync(targetPath, 'original', { mode: 0o644 });
      copyFileSync(targetPath, backupPath);
      chmodSync(backupPath, 0o644);
      writeFileSync(stagePath, 'prepared', { mode: 0o644 });
      const readFact = (file: string) => {
        const stat = lstatSync(file, { bigint: true });
        return { dev: String(stat.dev), ino: String(stat.ino), uid: Number(stat.uid),
          mode: Number(stat.mode & 0o777n), size: Number(stat.size),
          sha256: createHash('sha256').update(readFileSync(file)).digest('hex') };
      };
      const rootStat = lstatSync(root, { bigint: true });
      const journal = recovery.decodePreparedReleaseJournal(recovery.encodePreparedReleaseJournal({
        ...record(), candidate: { dev: String(rootStat.dev), ino: String(rootStat.ino), uid: 1000, mode: 448 },
        entries: [{ path, before: { target: readFact(targetPath), backup: readFact(backupPath) }, after: readFact(stagePath) }],
      }));
      renameSync(stagePath, targetPath);
      expect(recovery.planPreparedReleaseRollback({ journal,
        observations: [{ path, target: readFact(targetPath), backup: readFact(backupPath), stage: null }],
      })).toEqual([{ path, operation: 'restore-backup' }]);
      renameSync(backupPath, targetPath);
      expect(readFileSync(targetPath, 'utf8')).toBe('original');
      expect(recovery.planPreparedReleaseRollback({ journal,
        observations: [{ path, target: readFact(targetPath), backup: null, stage: null }],
      })).toEqual([{ path, operation: 'retain' }]);
      writeFileSync(targetPath, 'useredit');
      expect(() => recovery.planPreparedReleaseRollback({ journal,
        observations: [{ path, target: readFact(targetPath), backup: null, stage: null }],
      })).toThrow('LOCAL_RELEASE_RECOVERY_STATE_INVALID');
      expect(readFileSync(targetPath, 'utf8')).toBe('useredit');
    } finally {
      // Only this test's freshly created, owned temporary root is removed.
      rmSync(root, { recursive: true, force: false });
    }
  },
);
