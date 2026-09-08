// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';
import { execFileSync } from 'node:child_process';
import { chmodSync, linkSync, mkdirSync, mkdtempSync, readFileSync, renameSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { verifyPreparedReleaseCandidateBytes } from '../scripts/local-release-candidate-verification.mjs';

const roots: string[] = [];
const native = process.platform === 'linux' && process.arch === 'x64' && process.getuid?.() === 1000;
const code = 'LOCAL_RELEASE_CANDIDATE_VERIFICATION_INVALID';
const g001 = 'src/spacetime/module_bindings/keep.ts';
const generated = 'scripts/genesis002_module_bindings/index.ts';
const ptrGenerated = 'spacetimedb/ptr/generated-bindings/index.ts';
const pin = 'scripts/verify-0.4.0-sealed-launch.mjs';

afterEach(() => {
  vi.doUnmock('../scripts/local-binding-bounded-file.mjs');
  vi.resetModules();
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

function git(root: string, ...args: string[]) {
  return execFileSync('/usr/bin/git', ['--no-replace-objects', '-c', 'core.hooksPath=/dev/null',
    '-c', 'user.name=Warpkeep verification', '-c', 'user.email=local-verification@invalid.example', ...args],
  { cwd: root, encoding: 'utf8', env: { PATH: '/usr/bin:/bin', HOME: '/nonexistent',
    GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: '/dev/null' }, timeout: 10000, stdio: ['ignore', 'pipe', 'pipe'] }).trim();
}
function put(root: string, path: string, body: string | Uint8Array) {
  const absolute = join(root, path);
  mkdirSync(dirname(absolute), { recursive: true, mode: 0o755 });
  writeFileSync(absolute, body, { mode: 0o644 });
}
function fixture(additionalSource: ReadonlyArray<readonly [string, string]> = []) {
  const root = mkdtempSync(join(tmpdir(), 'warpkeep-candidate-bytes-'));
  roots.push(root);
  const sourceRoot = join(root, 'source');
  const candidateRoot = join(root, 'candidate');
  mkdirSync(sourceRoot, { mode: 0o700 });
  git(sourceRoot, 'init', '-q');
  for (const [path, body] of [
    ['README.md', 'Preserved baseline\n'],
    ['.gitignore', 'private-cache/\n'],
    [g001, 'export const existingKeep = true;\n'],
    [pin, 'export const source = "old";\n'],
    ['docs/Design (review).md', 'A normal repository path\n'],
    ...additionalSource,
  ]) put(sourceRoot, path, body);
  git(sourceRoot, 'add', '.');
  git(sourceRoot, 'commit', '-qm', 'Synthetic source');
  git(root, 'clone', '-q', '--no-local', sourceRoot, candidateRoot);
  chmodSync(candidateRoot, 0o700);
  const files = [
    { path: generated, bytes: Buffer.from('export const nextRealm = true;\n') },
    { path: pin, bytes: Buffer.from('export const source = "derived";\n') },
    { path: ptrGenerated, bytes: Buffer.from('export const rehearsalRealm = true;\n') },
  ];
  for (const file of files) put(candidateRoot, file.path, file.bytes);
  const input = { sourceRoot, candidateRoot, sourceCommit: git(sourceRoot, 'rev-parse', 'HEAD'),
    sourceTree: git(sourceRoot, 'rev-parse', 'HEAD^{tree}'), files };
  return { root, input, verify: () => verifyPreparedReleaseCandidateBytes(input) };
}

async function verifierAfterRead(afterRead: (path: string) => void) {
  vi.resetModules();
  vi.doMock('../scripts/local-binding-bounded-file.mjs', async () => {
    const actual = await vi.importActual<typeof import('../scripts/local-binding-bounded-file.mjs')>(
      '../scripts/local-binding-bounded-file.mjs',
    );
    return {
      ...actual,
      readLocalBindingBoundedFile: (...args: Parameters<typeof actual.readLocalBindingBoundedFile>) => {
        // Keep the real descriptor, bytes, validation and captured identity. The
        // mutation happens only after that file's bounded read has completed.
        const opened = actual.readLocalBindingBoundedFile(...args);
        afterRead(args[0]);
        return opened;
      },
    };
  });
  return (await import('../scripts/local-release-candidate-verification.mjs')).verifyPreparedReleaseCandidateBytes;
}

describe.skipIf(!native)('native complete candidate byte verification', () => {
  it('checks both full trees and preserves every non-output byte, without modifying either checkout', () => {
    const { input, verify } = fixture();
    const before = git(input.candidateRoot, 'status', '--porcelain=v1', '--untracked-files=all');
    const result = verify();
    expect(result).toEqual({ sourceCommit: input.sourceCommit, sourceTree: input.sourceTree,
      checkedSourceFiles: 5, checkedCandidateFiles: 7, outputFiles: 3, preservedSourceFiles: 4 });
    expect(readFileSync(join(input.candidateRoot, g001))).toEqual(readFileSync(join(input.sourceRoot, g001)));
    expect(git(input.candidateRoot, 'status', '--porcelain=v1', '--untracked-files=all')).toBe(before);
    expect(git(input.sourceRoot, 'status', '--porcelain=v1', '--untracked-files=all')).toBe('');
  });

  it.each(['source', 'candidate'] as const)('rejects changed G001 bytes in the %s tree', which => {
    const { input, verify } = fixture();
    put(which === 'source' ? input.sourceRoot : input.candidateRoot, g001, 'changed player schema\n');
    expect(verify).toThrow(code);
  });

  it('accepts an unchanged candidate through the same real-reader interception used by race tests', async () => {
    const { input } = fixture();
    const reads: string[] = [];
    const verify = await verifierAfterRead(path => reads.push(path));
    expect(verify(input)).toMatchObject({ checkedSourceFiles: 5, checkedCandidateFiles: 7 });
    expect(reads).toHaveLength(12);
    expect(new Set(reads).size).toBe(12);
  });

  it.each(['source', 'candidate'] as const)('rejects G001 bytes changed after their real bounded read in the %s tree', async which => {
    const { input } = fixture();
    const target = join(which === 'source' ? input.sourceRoot : input.candidateRoot, g001);
    const original = readFileSync(target);
    const changed = Buffer.from(original);
    changed[0] ^= 1;
    let mutated = false;
    const verify = await verifierAfterRead(path => {
      if (path !== target || mutated) return;
      writeFileSync(target, changed);
      mutated = true;
    });
    expect(() => verify(input)).toThrow(code);
    expect(mutated).toBe(true);
    expect(readFileSync(target)).toEqual(changed);
    expect(changed.length).toBe(original.length);
  });

  it('rejects generated bytes changed after their real bounded read', async () => {
    const { input } = fixture();
    const target = join(input.candidateRoot, ptrGenerated);
    const changed = Buffer.from(readFileSync(target));
    changed[0] ^= 1;
    let mutated = false;
    const verify = await verifierAfterRead(path => {
      if (path !== target || mutated) return;
      writeFileSync(target, changed);
      mutated = true;
    });
    expect(() => verify(input)).toThrow(code);
    expect(mutated).toBe(true);
    expect(readFileSync(target)).toEqual(changed);
  });

  it.each(['source', 'candidate'] as const)('rejects a same-byte file replacement after reading the %s tree', async which => {
    const { root, input } = fixture();
    const target = join(which === 'source' ? input.sourceRoot : input.candidateRoot, g001);
    const original = readFileSync(target);
    const replacement = join(root, 'replacement.ts');
    writeFileSync(replacement, original, { mode: 0o644 });
    let replaced = false;
    const verify = await verifierAfterRead(path => {
      if (path !== target || replaced) return;
      renameSync(replacement, target);
      replaced = true;
    });
    expect(() => verify(input)).toThrow(code);
    expect(replaced).toBe(true);
    expect(readFileSync(target)).toEqual(original);
  });

  it.each(['source', 'candidate'] as const)('rejects file mode drift after reading the %s tree', async which => {
    const { input } = fixture();
    const target = join(which === 'source' ? input.sourceRoot : input.candidateRoot, g001);
    let mutated = false;
    const verify = await verifierAfterRead(path => {
      if (path !== target || mutated) return;
      chmodSync(target, 0o600);
      mutated = true;
    });
    expect(() => verify(input)).toThrow(code);
    expect(mutated).toBe(true);
  });

  it.each([
    ['source', 'file'], ['candidate', 'file'],
    ['source', 'directory'], ['candidate', 'directory'],
  ] as const)('rejects a late %s-tree %s created after both initial inventories', async (which, kind) => {
    const { input } = fixture();
    const targetRoot = which === 'source' ? input.sourceRoot : input.candidateRoot;
    // This is the final candidate output: both inventories and all previous
    // bounded reads have already completed when the injection runs.
    const trigger = join(input.candidateRoot, ptrGenerated);
    let created = false;
    const verify = await verifierAfterRead(path => {
      if (path !== trigger || created) return;
      if (kind === 'file') put(targetRoot, 'docs/late-unreviewed.txt', 'late extra bytes\n');
      else mkdirSync(join(targetRoot, 'private-cache'), { mode: 0o755 });
      created = true;
    });
    expect(() => verify(input)).toThrow(code);
    expect(created).toBe(true);
  });

  it('rejects an ancestor mode change after the last bounded read', async () => {
    const { input } = fixture();
    const trigger = join(input.candidateRoot, ptrGenerated);
    let mutated = false;
    const verify = await verifierAfterRead(path => {
      if (path !== trigger || mutated) return;
      // Both modes individually satisfy the directory access policy; only the
      // comparison with the initial directory identity catches this drift.
      chmodSync(join(input.sourceRoot, 'docs'), 0o700);
      mutated = true;
    });
    expect(() => verify(input)).toThrow(code);
    expect(mutated).toBe(true);
  });

  it('rejects a missing or corrupted generated output', () => {
    const { input, verify } = fixture();
    put(input.candidateRoot, generated, 'corrupt\n');
    expect(verify).toThrow(code);
    rmSync(join(input.candidateRoot, generated));
    expect(verify).toThrow(code);
  });

  it('rejects ignored extra files that a normal Git status omits', () => {
    const { input, verify } = fixture();
    put(input.candidateRoot, 'private-cache/unreviewed.txt', 'synthetic extra bytes\n');
    expect(git(input.candidateRoot, 'status', '--porcelain=v1', '--untracked-files=all')).not.toContain('private-cache');
    expect(verify).toThrow(code);
  });

  it('rejects extra empty directories', () => {
    const { input, verify } = fixture();
    mkdirSync(join(input.candidateRoot, 'unexpected'));
    expect(verify).toThrow(code);
  });

  it('rejects source commit movement after capture', () => {
    const { input, verify } = fixture();
    put(input.sourceRoot, 'README.md', 'another commit\n');
    git(input.sourceRoot, 'add', 'README.md');
    git(input.sourceRoot, 'commit', '-qm', 'Move source');
    expect(verify).toThrow(code);
  });

  it.each([0o600, 0o755, 0o2644])('rejects unexpected generated-file mode %s', mode => {
    const { input, verify } = fixture();
    chmodSync(join(input.candidateRoot, generated), mode);
    expect(verify).toThrow(code);
  });

  it('rejects generated-file symlinks and preserves the link target', () => {
    const { root, input, verify } = fixture();
    const target = join(root, 'outside-candidate.ts');
    writeFileSync(target, input.files[0].bytes);
    rmSync(join(input.candidateRoot, generated));
    symlinkSync(target, join(input.candidateRoot, generated));
    expect(verify).toThrow(code);
    expect(readFileSync(target)).toEqual(input.files[0].bytes);
  });

  it('rejects a symlinked directory', () => {
    const { input, verify } = fixture();
    const directory = join(input.candidateRoot, 'src');
    rmSync(directory, { recursive: true });
    symlinkSync(join(input.sourceRoot, 'src'), directory, 'dir');
    expect(verify).toThrow(code);
  });

  it('rejects hardlinked preserved files', () => {
    const { input, verify } = fixture();
    rmSync(join(input.candidateRoot, g001));
    linkSync(join(input.sourceRoot, g001), join(input.candidateRoot, g001));
    expect(verify).toThrow(code);
  });

  it('never accepts the live release binding as a generated preparation output', () => {
    const { input } = fixture();
    const files = [{ path: 'config/releases/0.4.0-sealed-launch.json', bytes: Buffer.from('{}\n') }, ...input.files];
    expect(() => verifyPreparedReleaseCandidateBytes({ ...input, files })).toThrow(code);
  });

  it('rejects duplicate or unsorted generated paths', () => {
    const { input } = fixture();
    expect(() => verifyPreparedReleaseCandidateBytes({ ...input, files: [input.files[0], input.files[0]] })).toThrow(code);
    expect(() => verifyPreparedReleaseCandidateBytes({ ...input, files: [...input.files].reverse() })).toThrow(code);
  });

  it('rejects case aliases between fresh outputs', () => {
    const { input } = fixture();
    const aliases = ['scripts/genesis002_module_bindings/Alias.ts', 'scripts/genesis002_module_bindings/alias.ts']
      .map(path => ({ path, bytes: Buffer.from('export const alias = true;\n') }));
    for (const file of aliases) put(input.candidateRoot, file.path, file.bytes);
    const files = [...input.files, ...aliases].sort((left, right) => left.path < right.path ? -1 : 1);
    expect(() => verifyPreparedReleaseCandidateBytes({ ...input, files })).toThrow(code);
  });

  it('rejects a fresh output that case-aliases a preserved baseline path', () => {
    // The different-cased directory is outside the exact generated namespace,
    // so this checks baseline/output aliases independently of stale members.
    const alias = 'Scripts/genesis002_module_bindings/index.ts';
    const { input, verify } = fixture([[alias, 'export const baselineAlias = true;\n']]);
    expect(readFileSync(join(input.candidateRoot, alias))).not.toEqual(readFileSync(join(input.candidateRoot, generated)));
    expect(verify).toThrow(code);
  });

  it.each([
    'scripts/genesis002_module_bindings/obsolete.ts',
    'spacetimedb/ptr/generated-bindings/obsolete.ts',
  ])('rejects a stale tracked generated namespace member: %s', stale => {
    const { input, verify } = fixture([[stale, 'export const obsolete = true;\n']]);
    expect(readFileSync(join(input.candidateRoot, stale))).toEqual(readFileSync(join(input.sourceRoot, stale)));
    expect(input.files.some(file => file.path === stale)).toBe(false);
    expect(verify).toThrow(code);
  });

  it.each([generated, ptrGenerated])('requires a fresh complete namespace when %s is omitted', omitted => {
    const { input } = fixture();
    rmSync(join(input.candidateRoot, omitted));
    // Remove now-empty directories so namespace completeness is the failing
    // condition, rather than an unrelated unexpected-directory check.
    rmSync(dirname(join(input.candidateRoot, omitted)), { recursive: true });
    if (omitted === ptrGenerated) rmSync(join(input.candidateRoot, 'spacetimedb'), { recursive: true });
    const files = input.files.filter(file => file.path !== omitted);
    expect(() => verifyPreparedReleaseCandidateBytes({ ...input, files })).toThrow(code);
  });
});

it.skipIf(native)('rejects unsupported host before opening a candidate', () => {
  expect(() => verifyPreparedReleaseCandidateBytes({ sourceRoot: '/unopened/source', candidateRoot: '/unopened/candidate',
    sourceCommit: 'a'.repeat(40), sourceTree: 'b'.repeat(40),
    files: [{ path: generated, bytes: Buffer.from('fixture') }] })).toThrow(code);
});
