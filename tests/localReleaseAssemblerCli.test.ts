// @vitest-environment node
import { spawnSync } from 'node:child_process';
import { copyFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { runLocalReleaseAssembler } from '../scripts/local-release-assembler.mjs';

const root = mkdtempSync(join(tmpdir(), 'warpkeep assembler cli '));
const entry = join(root, 'local-release-assembler.mjs');
copyFileSync(join(process.cwd(), 'scripts/local-release-assembler.mjs'), entry);
afterAll(() => rmSync(root, { recursive: true, force: true }));

describe('local release assembler command boundary', () => {
  it.each([
    [], ['--help'], ['ship'], ['prepare', '--source', '/caller/source'],
    ['prepare', '--token', 'private-value-must-not-appear'],
    ['check'], ['recover'], ['check', '/tmp/candidate'],
    ['check', '../release-workspace-' + 'a'.repeat(32)],
    ['recover', 'release-workspace-' + 'A'.repeat(32)],
    ['recover', 'release-workspace-' + 'a'.repeat(31)],
    ['check', 'release-workspace-' + 'a'.repeat(32), '--force'],
  ])('rejects unsupported arguments before loading any preparation code: %j', async (...args: string[]) => {
    await expect(runLocalReleaseAssembler(args)).rejects.toThrow('LOCAL_RELEASE_ASSEMBLER_ARGUMENTS_INVALID');
    // This copy has no runtime beside it. Argument rejection must still work,
    // without trying to import, inspect or mutate any release workspace.
    const child = spawnSync(process.execPath, [entry, ...args], { encoding: 'utf8', timeout: 10_000 });
    expect(child.error).toBeUndefined();
    expect(child.status).toBe(1);
    expect(child.stdout).toBe('');
    expect(child.stderr).toBe('LOCAL_RELEASE_ASSEMBLER_ARGUMENTS_INVALID\n');
  });

  it.each([
    ['prepare'],
    ['check', 'release-workspace-' + 'a'.repeat(32)],
    ['recover', 'release-workspace-' + 'a'.repeat(32)],
  ])('loads the fixed runtime only after valid arguments and sanitizes a missing runtime: %j', (...args: string[]) => {
    const child = spawnSync(process.execPath, [entry, ...args], { encoding: 'utf8', timeout: 10_000 });
    expect(child.error).toBeUndefined();
    expect(child.status).toBe(1);
    expect(child.stdout).toBe('');
    expect(child.stderr).toBe('LOCAL_RELEASE_ASSEMBLER_FAILED\n');
    expect(child.stderr).not.toContain(root);
  });
});
