// @vitest-environment node
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { pathToFileURL } from 'node:url';
import { expect, it } from 'vitest';
import { buildRecoveryWorkflowArtifactModule as build } from '../scripts/build-recovery-workflow-artifact-module.mjs';

it('builds repeatable module bytes and loads in a separate native Node process', async () => {
  const first = await build(), second = await build();
  expect(first.bytes.equals(second.bytes)).toBe(true); expect(first.sha256).toBe(second.sha256);
  expect(first.bytes.toString('utf8')).not.toContain('fflate/esm/index.mjs');
  expect(first.inputPaths).toContain('services/release-recovery/src/archive.ts');
  const root = mkdtempSync(join(tmpdir(), 'warpkeep-artifact-module-'));
  try {
    symlinkSync(resolve('scripts'), join(root, 'scripts'), process.platform === 'win32' ? 'junction' : 'dir');
    const directory = join(root, 'services/release-recovery/scripts'); mkdirSync(directory, { recursive: true });
    const output = join(directory, 'read-recovery-workflow-artifact.bundle.mjs'); writeFileSync(output, first.bytes);
    const program = `const m = await import(${JSON.stringify(pathToFileURL(output).href)});
      if (Object.keys(m).join(',') !== 'readRecoveryWorkflowArtifact') throw new Error('EXPORTS');
      globalThis.fetch = () => { throw new Error('NETWORK_MUST_NOT_RUN'); };
      try { await m.readRecoveryWorkflowArtifact({ override: true }); throw new Error('ACCEPTED'); }
      catch (e) { if (e.message !== 'RECOVERY_WORKFLOW_ARTIFACT_INVALID') throw e; }
      process.stdout.write('native-module-ok');`;
    const child = spawnSync(process.execPath, ['--input-type=module', '--eval', program], {
      cwd: root, encoding: 'utf8', timeout: 10000, maxBuffer: 32768,
      env: { PATH: process.env.PATH, SystemRoot: process.env.SystemRoot }, windowsHide: true });
    expect(child.status, child.stderr).toBe(0); expect(child.stdout).toBe('native-module-ok');
  } finally { rmSync(root, { recursive: true, force: true }); first.bytes.fill(0); second.bytes.fill(0); }
}, 30000);
it('rejects build overrides', async () => {
  await expect(Reflect.apply(build, null, [{ entryPoint: 'other' }])).rejects.toThrow('RECOVERY_WORKFLOW_ARTIFACT_BUILD_INVALID');
});
