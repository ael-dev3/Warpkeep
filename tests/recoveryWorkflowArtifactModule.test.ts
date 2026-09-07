// @vitest-environment node
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { pathToFileURL } from 'node:url';
import { expect, it } from 'vitest';
import { buildRecoveryWorkflowArtifactModule as build, buildRecoveryWorkflowClaimModule as buildClaim } from '../scripts/build-recovery-workflow-artifact-module.mjs';
import { recoveryArtifactNativeFixture } from './fixtures/recoveryArtifactNativeFixture';
import { buildRecoveryWorkflowModule as buildEngine } from '../scripts/recovery-workflow-bundle-engine.mjs';

it('rejects invalid engine inputs before calling a compiler', async () => {
  let calls = 0;
  const compiler = () => { calls++; throw new Error('COMPILER_MUST_NOT_RUN'); };
  for (const args of [[resolve('.'), compiler, 'other'], ['relative', compiler, 'claim'],
    [resolve('.'), null, 'claim'], [resolve('.'), compiler, 'claim', undefined]]) {
    await expect(Reflect.apply(buildEngine, null, args)).rejects.toThrow('RECOVERY_WORKFLOW_ARTIFACT_BUILD_INVALID');
  }
  expect(calls).toBe(0);
});

it.each(['export', 'external', 'warning'] as const)('rejects compiler output with invalid %s', async fault => {
  const compiler = async () => ({ outputFiles: [{contents: Buffer.from('diagnostic')}], errors: [],
    warnings: fault === 'warning' ? ['warning'] : [], metafile: {inputs: {}, outputs: {bundle: {
      exports: [fault === 'export' ? 'other' : 'prepareRecoveryWorkflowClaim'],
      imports: fault === 'external' ? [{external: true, path: 'unreviewed-package'}] : [],
    }}} });
  await expect(Reflect.apply(buildEngine, null, [resolve('.'), compiler, 'claim']))
    .rejects.toThrow('RECOVERY_WORKFLOW_ARTIFACT_BUILD_INVALID');
});

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
  await expect(Reflect.apply(buildClaim, null, [{ entryPoint: 'other' }])).rejects.toThrow('RECOVERY_WORKFLOW_ARTIFACT_BUILD_INVALID');
});
it('packages claim preparation for native import without running authority requests', async () => {
  const first = await buildClaim(), second = await buildClaim();
  expect(first.sha256).toBe(second.sha256);
  const root = mkdtempSync(join(tmpdir(), 'warpkeep-claim-module-'));
  try {
    symlinkSync(resolve('scripts'), join(root, 'scripts'), process.platform === 'win32' ? 'junction' : 'dir');
    const directory = join(root, 'services/release-recovery/scripts'); mkdirSync(directory, { recursive: true });
    const output = join(directory, 'prepare-recovery-workflow-claim.bundle.mjs'); writeFileSync(output, first.bytes);
    const program = `import assert from 'node:assert/strict';
      const m = await import(${JSON.stringify(pathToFileURL(output).href)});
      assert.deepEqual(Object.keys(m), ['prepareRecoveryWorkflowClaim']);
      globalThis.fetch = () => { throw new Error('NETWORK_MUST_NOT_RUN'); };
      await assert.rejects(m.prepareRecoveryWorkflowClaim({ override: true }), {message: 'RECOVERY_WORKFLOW_CLAIM_PREPARATION_INVALID'});
      process.stdout.write('native-claim-module-ok');`;
    const child = spawnSync(process.execPath, ['--input-type=module', '--eval', program], {
      cwd: root, encoding: 'utf8', timeout: 10000, maxBuffer: 32768, windowsHide: true,
      env: { PATH: process.env.PATH, SystemRoot: process.env.SystemRoot } });
    expect(child.status, child.stderr).toBe(0); expect(child.stdout).toBe('native-claim-module-ok');
  } finally { rmSync(root, { recursive: true, force: true }); first.bytes.fill(0); second.bytes.fill(0); }
}, 30000);
it('ingests a real compressed fixture through the compiled parser in a native child', async () => {
  const built = await build(), fixture = recoveryArtifactNativeFixture();
  const root = mkdtempSync(join(tmpdir(), 'warpkeep-artifact-ingestion-'));
  try {
    const scripts = join(root, 'scripts'); mkdirSync(scripts);
    // Only independently tested source/API/dist boundaries are synthetic here.
    // The compiled download transport, ZIP/TAR parser and digest comparisons are real.
    writeFileSync(join(scripts, 'recovery-workflow-run-context.mjs'), `export async function readRecoveryWorkflowArtifactMetadata() { return ${JSON.stringify(fixture.metadata)}; }`);
    writeFileSync(join(scripts, 'recovery-attestation-source.mjs'), `export function readRecoveryAttestationSource() { return ${JSON.stringify(fixture.identity)}; }`);
    writeFileSync(join(scripts, 'generate-warpkeep-deployment-attestation.mjs'), `export function verifyWarpkeepDeploymentAttestation() { return ${JSON.stringify({ deploymentAttestationSha256: fixture.expected.deploymentAttestationSha256, contentManifestSha256: fixture.expected.contentManifestSha256 })}; }`);
    writeFileSync(join(scripts, 'local-binding-bounded-file.mjs'), `export function readLocalBindingBoundedFile() { return {body: Buffer.from('test-binding')}; }`);
    const directory = join(root, 'services/release-recovery/scripts'); mkdirSync(directory, { recursive: true });
    const output = join(directory, 'read-recovery-workflow-artifact.bundle.mjs'); writeFileSync(output, built.bytes);
    const program = `import assert from 'node:assert/strict';
      import {readFileSync} from 'node:fs';
      process.on('uncaughtException', error => { process.stderr.write(error.message); process.exitCode = 1; });
      const fixture = JSON.parse(readFileSync(0, 'utf8'));
      const {readRecoveryWorkflowArtifact: read} = await import(${JSON.stringify(pathToFileURL(output).href)});
      const target = 'https://results-receiver.actions.githubusercontent.com/test-artifact.zip';
      let calls = 0, corrupt = false;
      globalThis.fetch = async (url, init) => {
        calls++;
        if (String(url).endsWith('/zip')) {
          assert.equal(init.headers.authorization, 'Bearer test-only-token');
          assert.equal(init.redirect, 'manual');
          const r = new Response(null, {status: 302, headers: {location: target}});
          Object.defineProperty(r, 'url', {value: String(url)}); return r;
        }
        assert.equal(String(url), target); assert.equal(init.headers, undefined);
        const bytes = Buffer.from(fixture.zip, 'base64');
        if (corrupt) bytes[0] ^= 1;
        const r = new Response(bytes, {headers: {'content-type':'application/zip','content-length':String(bytes.length)}});
        Object.defineProperty(r, 'url', {value: target}); return r;
      };
      const result = await read(); const context = JSON.parse(result.contextSource);
      for (const [key, value] of Object.entries(fixture.expected)) assert.equal(context[key], value);
      assert.equal(calls, 2); assert.equal(result.bindingSource, 'test-binding');
      corrupt = true;
      await assert.rejects(read(), {message: 'RECOVERY_WORKFLOW_ARTIFACT_INVALID'});
      assert.equal(calls, 4); process.stdout.write('native-archive-ok');`;
    const child = spawnSync(process.execPath, ['--input-type=module', '--eval', program], {
      cwd: root, input: JSON.stringify({ zip: fixture.zip.toString('base64'), expected: fixture.expected }),
      encoding: 'utf8', timeout: 10000, maxBuffer: 32768, windowsHide: true,
      env: { PATH: process.env.PATH, SystemRoot: process.env.SystemRoot, GITHUB_TOKEN: 'test-only-token' } });
    expect(child.status, child.stderr).toBe(0); expect(child.stdout).toBe('native-archive-ok');
  } finally { rmSync(root, { recursive: true, force: true }); built.bytes.fill(0); }
}, 30000);
