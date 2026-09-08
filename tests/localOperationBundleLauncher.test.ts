// @vitest-environment node
import { readFileSync } from 'node:fs';
import { transformSync } from 'esbuild';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

// Evaluate the actual CLI source with a fake process and child-process boundary.
// No child process or WSL invocation occurs in this suite.
async function launch(childResult: Record<string, unknown>) {
  const file = resolve('scripts/local-operation-bundle-runtime.mjs');
  const calls: unknown[][] = [];
  let finish!: () => void;
  const finished = new Promise<void>(done => { finish = done; });
  let stdout = '', stderr = '';
  const fakeProcess = { platform: 'win32', argv: ['node', file], exitCode: 0,
    env: { WSL_DISTRO_NAME: 'other-project', HOME: '/home/other', NODE_OPTIONS: '--import=hostile' },
    stdout: { write(value: string) { stdout += value; finish(); } },
    stderr: { write(value: string) { stderr += value; finish(); } } };
  class RuntimeError extends Error { code: string; constructor(code: string) { super(code); this.code = code; } }
  const core = {
    OperationBundleRuntimeError: RuntimeError,
    derivePreparedLinuxOperationBundlesCore: () => { throw new Error('unexpected native work'); },
    derivePreparedLinuxOperationBundleFilesCore: () => { throw new Error('unexpected native work'); },
    parseOperationBundleCliMetadata: (value: string) => JSON.parse(value),
  };
  const compiled = transformSync(readFileSync(file, 'utf8'), { format: 'cjs', target: 'node22',
    define: { 'import.meta.url': JSON.stringify(pathToFileURL(file).href) } }).code;
  const requireBoundary = (specifier: string) => {
    if (specifier === 'node:child_process') return { spawnSync: (...args: unknown[]) => { calls.push(args); return childResult; } };
    if (specifier === 'node:url') return { pathToFileURL };
    if (specifier === './local-operation-bundle-runtime-core.mjs') return core;
    throw new Error('Unexpected launcher import');
  };
  new Function('require', 'process', 'module', compiled)(requireBoundary, fakeProcess, { exports: {} });
  await finished;
  return { calls, stdout, stderr, exitCode: fakeProcess.exitCode };
}

describe('dedicated local Linux CLI selection', () => {
  it('selects only WarpkeepRunner/warpkeep with the fixed Node and empty host environment', async () => {
    const result = await launch({ status: 0, signal: null, stdout: '{"ok":true}', stderr: '' });
    expect(result.calls).toHaveLength(1);
    expect(result.calls[0]?.[0]).toBe('C:/Windows/System32/wsl.exe');
    expect(result.calls[0]?.[1]).toEqual([
      '--distribution', 'WarpkeepRunner', '--user', 'warpkeep', '--',
      '/usr/bin/env', '-i', 'LANG=C.UTF-8', 'LC_ALL=C.UTF-8',
      '/home/warpkeep/.warpkeep/release-preparation-v1/toolchain/node-v22.22.3-linux-x64/bin/node',
      '/mnt/c/Users/heyas/Documents/Codex/2026-08-11/pl/Warpkeep-0.4.0-worktree/scripts/local-operation-bundle-runtime.mjs',
    ]);
    expect(result.calls[0]?.[2]).toMatchObject({ env: {}, shell: false, windowsHide: true, timeout: 45 * 60_000 });
    expect(result.stdout).toBe('{"ok":true}\n');
    expect(result.stderr).toBe('');
  });
  it.each([
    { status: 1, signal: null, stdout: '', stderr: '' },
    { status: null, signal: 'SIGTERM', error: new Error('timeout'), stdout: '', stderr: '' },
    { status: 0, signal: null, stdout: '{}', stderr: 'unexpected diagnostic' },
  ])('refuses an unsuccessful child without fallback or another spawn', async child => {
    const result = await launch(child);
    expect(result.calls).toHaveLength(1);
    expect(result.exitCode).toBe(1);
    expect(result.stdout).toBe('');
    expect(result.stderr).toBe('OPERATION_BUNDLE_RUNTIME_WSL_FAILED\n');
  });
});
