// @vitest-environment node
import { afterAll, beforeAll, expect, it, vi } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdir, mkdtemp, realpath, rm, writeFile } from 'node:fs/promises';
import { resolve, join, dirname } from 'node:path';
import { readWindowsCaptureSource } from '../scripts/qa-observer/keep04-windows-capture.mjs';

const fixture = vi.hoisted(() => ({
  cwd: '', queries: [] as string[][], pipeFailure: false,
  git: process.platform === 'win32' ? 'C:/Program Files/Git/cmd/git.exe' : '/usr/bin/git',
}));
vi.mock('node:child_process', async importOriginal => {
  const actual = await importOriginal<typeof import('node:child_process')>();
  const { EventEmitter } = await import('node:events');
  return { ...actual, execFile: (file: string, args: string[], options: object, callback: unknown) => {
    if (file !== 'C:/Program Files/Git/cmd/git.exe') throw new Error('Unexpected source fixture executable');
    if (fixture.pipeFailure) {
      const stdin = Object.assign(new EventEmitter(), {
        end() { queueMicrotask(() => stdin.emit('error', Object.assign(new Error('private pipe details'), { code: 'EPIPE' }))); },
      });
      return { stdin };
    }
    fixture.queries.push(args); return Reflect.apply(actual.execFile, undefined, [fixture.git, args, { ...options, cwd: fixture.cwd }, callback]);
  } };
});
const parent = resolve('.cache/keep04-qa');
const baseline = 'const label = `value  \nnext`;\nMarkdown hard break  \nnext\n';
it('rejects input pipe failure without leaking OS details or returning source evidence', async () => {
  fixture.pipeFailure = true;
  try {
    await expect(readWindowsCaptureSource()).rejects.toMatchObject({
      message: 'Bounded Windows QA OS input failed.', code: 'EPIPE',
    });
  } finally { fixture.pipeFailure = false; }
});
beforeAll(async () => {
  await mkdir(parent, { recursive: true }); fixture.cwd = await mkdtemp(join(parent, 'source-test-'));
  const git = (args: string[]) => execFileSync(fixture.git, args, { cwd: fixture.cwd, windowsHide: true, timeout: 15000, maxBuffer: 1024 * 1024, stdio: 'pipe' });
  git(['init', '--quiet']); await writeFile(join(fixture.cwd, 'source.md'), baseline);
  await writeFile(join(fixture.cwd, '.gitattributes'), '*.bin -text\n');
  await writeFile(join(fixture.cwd, 'image.bin'), Buffer.from('binary\0\r\n'));
  git(['-c', 'core.autocrlf=false', 'add', '--', 'source.md', '.gitattributes', 'image.bin']);
  git(['-c', 'user.name=QA Fixture', '-c', 'user.email=qa-fixture@example.invalid', 'commit', '--quiet', '-m', 'local test fixture']);
});
it('preserves binary CRLF bytes exactly', async () => {
  await writeFile(join(fixture.cwd, 'source.md'), baseline);
  await writeFile(join(fixture.cwd, 'image.bin'), Buffer.from('binary\0\n'));
  expect(await readWindowsCaptureSource()).toMatchObject({ substantiveDirty: true });
  await writeFile(join(fixture.cwd, 'image.bin'), Buffer.from('binary\0\r\n'));
});
it.each(['filter=custom-filter', 'filter=unspecified', 'filter=unset', '-filter', 'ident', 'working-tree-encoding=UTF-8'])('fails closed before custom conversion %s', async attribute => {
  await writeFile(join(fixture.cwd, '.gitattributes'), `*.bin -text\nsource.md ${attribute}\n`);
  fixture.queries = [];
  try { await expect(readWindowsCaptureSource()).rejects.toThrow(/Unsupported source conversion/); expect(fixture.queries.some(args => args.includes('diff'))).toBe(false); }
  finally { await writeFile(join(fixture.cwd, '.gitattributes'), '*.bin -text\n'); }
});
afterAll(async () => {
  if (!fixture.cwd) return;
  const canonical = await realpath(fixture.cwd); const expectedParent = await realpath(parent);
  if (dirname(canonical).toLowerCase() !== expectedParent.toLowerCase() || !canonical.replaceAll('\\', '/').split('/').at(-1)?.startsWith('source-test-')) throw new Error('Unsafe Git fixture cleanup');
  await rm(canonical, { recursive: true }); // Exact verified fresh test repository, never workspace/cache parent.
});
it.each([
  { name: 'unchanged LF', content: baseline, dirty: false },
  { name: 'CRLF-only conversion', content: baseline.replaceAll('\n', '\r\n'), dirty: false },
  { name: 'meaningful template/Markdown trailing spaces removed', content: baseline.replaceAll('  \n', '\n'), dirty: true },
  { name: 'trailing tab added', content: baseline.replace('next`;\n', 'next`;\t\n'), dirty: true },
  { name: 'final newline removed', content: baseline.slice(0, -1), dirty: true },
])('source provenance distinguishes $name', async ({ content, dirty }) => {
  await writeFile(join(fixture.cwd, 'source.md'), content);
  expect(await readWindowsCaptureSource()).toMatchObject({ substantiveDirty: dirty, untrackedRelevantCount: 0 });
});
