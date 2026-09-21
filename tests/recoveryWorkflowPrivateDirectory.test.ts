// @vitest-environment node
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
const fs = vi.hoisted(() => ({ names: [] as string[], uid: 1000n, mode: 0o40700n,
  redirect: false, realpath: vi.fn(), stat: vi.fn(), fstat: vi.fn(), open: vi.fn(), close: vi.fn() }));
vi.mock('node:fs', () => ({ constants: { O_RDONLY: 0, O_DIRECTORY: 1, O_NOFOLLOW: 2 },
  openSync: fs.open, closeSync: fs.close, lstatSync: fs.stat, fstatSync: fs.fstat,
  realpathSync: fs.realpath, readdirSync: () => fs.names,
  mkdirSync: () => { throw new Error('must never create'); }, fsyncSync: () => {},
}));
import { findRecoveryWorkflowPriorDirectory as find } from '../scripts/recovery-workflow-private-directory.mjs';
const root = '/home/warpkeep/.warpkeep-recovery-v1';
beforeEach(() => {
  vi.resetAllMocks(); fs.names = []; fs.uid = 1000n; fs.mode = 0o40700n; fs.redirect = false;
  vi.stubGlobal('process', Object.create(process, { platform: { value: 'linux' }, getuid: { value: () => 1000 } }));
  fs.realpath.mockImplementation(path => fs.redirect ? '/elsewhere' : path);
  const state = () => ({ dev: 1n, ino: 2n, uid: fs.uid, mode: fs.mode, isDirectory: () => true });
  fs.stat.mockImplementation(state); fs.fstat.mockImplementation(state); fs.open.mockReturnValue(3);
});
afterEach(() => vi.unstubAllGlobals());
it('returns no retained claim without allocating or selecting another run', () => {
  fs.names = ['pages-999-1'];
  expect(find('123', '2')).toBe(null);
});
it('resolves only the exact earlier attempt of the verified run', () => {
  fs.names = ['pages-123-1', 'pages-999-5'];
  expect(find('123', '2')).toBe(`${root}/pages-123-1`);
  expect(fs.close).toHaveBeenCalledTimes(3);
});
it.each([
  { names: ['pages-123-1', 'pages-123-2'] }, { names: ['pages-123-3'] }, { names: ['pages-123-4'] },
  { names: ['pages-123-01'] }, { names: ['pages-123-../1'] },
])('refuses ambiguous, current, future or malformed private attempts $names', ({ names }) => {
  fs.names = names;
  expect(() => find('123', '3')).toThrow('RECOVERY_WORKFLOW_PRIVATE_DIRECTORY_INVALID');
});
it('rejects a symlink or broadened ownership before reading retained claim state', () => {
  fs.redirect = true;
  expect(() => find('123', '2')).toThrow('RECOVERY_WORKFLOW_PRIVATE_DIRECTORY_INVALID');
  fs.redirect = false; fs.uid = 1001n;
  expect(() => find('123', '2')).toThrow('RECOVERY_WORKFLOW_PRIVATE_DIRECTORY_INVALID');
  fs.uid = 1000n; fs.mode = 0o40755n;
  expect(() => find('123', '2')).toThrow('RECOVERY_WORKFLOW_PRIVATE_DIRECTORY_INVALID');
});
it('does not accept path overrides or untrusted run coordinates', () => {
  expect(() => Reflect.apply(find, null, ['123', '2', '/tmp/override'])).toThrow('RECOVERY_WORKFLOW_PRIVATE_DIRECTORY_INVALID');
  expect(() => find('../123', '2')).toThrow('RECOVERY_WORKFLOW_PRIVATE_DIRECTORY_INVALID');
  expect(fs.open).not.toHaveBeenCalled();
});
