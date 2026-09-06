// @vitest-environment node

import { describe, expect, it, vi } from 'vitest';
import * as vm from 'node:vm';
import { createHash } from 'node:crypto';
import { existsSync, linkSync, mkdtempSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawn } from 'node:child_process';

import * as frozenSource from '../scripts/genesis001-binding-frozen-source.mjs';
import {
  GENESIS001_CHECKED_FROZEN_WRITERS,
  assertGenesis001FrozenWriterObservation,
  attestGenesis001LocalProofArtifact,
  decodeGenesis001BoundedJson,
  decodeGenesis001ProcedureResponse,
  readGenesis001BoundedResponseBody,
  runGenesis001LocalUpgradeProof,
  terminateGenesis001LocalProofProcessGroup,
} from '../scripts/genesis001-local-upgrade-proof.mjs';
import { readLocalBindingBoundedFile } from '../scripts/local-binding-bounded-file.mjs';
import {
  deriveGenesis001CompatibilitySourceGraph,
  parseLocalBindingWorkerResult,
} from '../scripts/local-binding-runtime-core.mjs';
import * as runtime from '../scripts/local-binding-runtime.mjs';

describe('fixed Genesis 001 local upgrade proof', () => {
  it('exposes only a no-argument compatibility operation and rejects explicit undefined authority', async () => {
    const derive = (runtime as unknown as Readonly<{
      derivePreparedGenesis001LinuxCompatibility: (...args: readonly unknown[]) => Promise<unknown>;
    }>).derivePreparedGenesis001LinuxCompatibility;

    expect(typeof derive).toBe('function');
    await expect(derive(undefined as never)).rejects.toThrow();
  });

  it('keeps the authenticated historical baseline inventory independent from frozen source', () => {
    const source = frozenSource as unknown as Readonly<Record<string, unknown>>;
    expect(source.GENESIS001_BASELINE_SOURCE_INVENTORY_SHA256)
      .toBe('99772bf087a8bacd8414e762a88174d19a93a8afa3fae5904ce77cc93e7921be');
    expect(source.GENESIS001_BASELINE_SOURCE_INVENTORY_SHA256)
      .not.toBe(source.GENESIS001_FROZEN_SOURCE_INVENTORY_SHA256);
    expect(typeof source.createGenesis001BaselineSourceMaterialization).toBe('function');
  });

  it('accepts only all six source-supported frozen guard rejections with unchanged state', () => {
    expect(GENESIS001_CHECKED_FROZEN_WRITERS).toEqual([
      'admin_allow_fid', 'admin_admit_founder_v1', 'admin_disable_fid',
      'admin_bump_auth_epoch', 'access_request_submit_v1', 'admin_reset_access_request_v1',
    ]);
    const before = [{ admitted: false }, [], ['GENESIS_001', false]];
    for (const writer of GENESIS001_CHECKED_FROZEN_WRITERS) {
      const reason = writer === 'access_request_submit_v1'
        ? 'GENESIS_001_ACCESS_REQUEST_SUBMISSIONS_DISABLED'
        : 'GENESIS_001_ADMISSION_STATE_MUTATIONS_DISABLED';
      const kind = writer === 'access_request_submit_v1' ? 'procedure' : 'reducer';
      expect(() => assertGenesis001FrozenWriterObservation({
        writer, status: 530, text: 'The instance encountered a fatal error.',
        serverText: `${kind} "${writer}" runtime error: Uncaught Error: ${reason}\n`, before,
        after: structuredClone(before),
      })).not.toThrow();
      expect(() => assertGenesis001FrozenWriterObservation({
        writer, status: 401, text: 'UNAUTHORIZED', serverText: 'authorization rejected', before,
        after: structuredClone(before),
      })).toThrow('GENESIS001_LOCAL_PROOF_WRITER_INVALID');
      expect(() => assertGenesis001FrozenWriterObservation({
        writer, status: 200, text: JSON.stringify({ error: reason }),
        serverText: `${kind} "${writer}" runtime error: Uncaught Error: ${reason}\n`, before,
        after: structuredClone(before),
      })).toThrow('GENESIS001_LOCAL_PROOF_WRITER_INVALID');
      expect(() => assertGenesis001FrozenWriterObservation({
        writer, status: 530, text: 'The instance encountered a fatal error.',
        serverText: `${kind} "${writer}" runtime error: Uncaught Error: ${reason}\n`, before,
        after: [{ admitted: true }, [], ['GENESIS_001', false]],
      })).toThrow('GENESIS001_LOCAL_PROOF_WRITER_INVALID');
    }
  });

  it('strictly rejects truncated, oversized, and non-UTF8 JSON evidence', () => {
    expect(decodeGenesis001BoundedJson(Buffer.from('{"ok":true}'), 64)).toEqual({ ok: true });
    expect(() => decodeGenesis001BoundedJson(Buffer.from('{"ok":'), 64)).toThrow();
    expect(() => decodeGenesis001BoundedJson(Buffer.from('{"ok":true}'), 4)).toThrow();
    expect(() => decodeGenesis001BoundedJson(Uint8Array.of(0xff), 64)).toThrow();
  });

  it('admits bounded fatal-UTF8 plain text only for procedure errors and still requires the exact guard', () => {
    const credential = 'private-proof-credential';
    const before = [{ admitted: false }];
    const expected = decodeGenesis001ProcedureResponse(
      400, Buffer.from('GENESIS_001_ADMISSION_STATE_MUTATIONS_DISABLED'), 64, credential,
    );
    expect(expected.value).toBeUndefined();
    expect(() => assertGenesis001FrozenWriterObservation({
      writer: 'admin_allow_fid', status: expected.status, text: expected.text,
      serverText: 'reducer "admin_allow_fid" runtime error: Uncaught Error: '
        + 'GENESIS_001_ADMISSION_STATE_MUTATIONS_DISABLED\n',
      before, after: structuredClone(before),
    })).not.toThrow();

    const arbitrary = decodeGenesis001ProcedureResponse(
      400, Buffer.from('UNAUTHORIZED'), 64, credential,
    );
    expect(() => assertGenesis001FrozenWriterObservation({
      writer: 'admin_allow_fid', status: arbitrary.status, text: arbitrary.text,
      serverText: 'authorization rejected', before, after: structuredClone(before),
    })).toThrow('GENESIS001_LOCAL_PROOF_WRITER_INVALID');
    for (const serverText of [
      '',
      'reducer "admin_allow_fid" runtime error: Uncaught Error: GENESIS_001_ADMISSION_STATE_MUTATIONS_',
      'reducer "admin_allow_fid" runtime error: Uncaught Error: GENESIS_001_ADMISSION_STATE_MUTATIONS_DISABLED',
      'reducer "admin_allow_fid" runtime error: Uncaught Error: GENESIS_001_ADMISSION_STATE_MUTATIONS_DISABLED_UNRELATED\n',
      'authorization rejected reducer "admin_allow_fid" runtime error: Uncaught Error: '
        + 'GENESIS_001_ADMISSION_STATE_MUTATIONS_DISABLED\n',
      'reducer "admin_disable_fid" runtime error: Uncaught Error: GENESIS_001_ADMISSION_STATE_MUTATIONS_DISABLED',
      'reducer "admin_allow_fid" runtime error: Uncaught Error: OTHER\n'
        + 'JS error: Uncaught Error: GENESIS_001_ADMISSION_STATE_MUTATIONS_DISABLED',
      'reducer "admin_allow_fid" runtime error: Uncaught Error: GENESIS_001_ADMISSION_STATE_MUTATIONS_DISABLED\n'
        + 'reducer "admin_allow_fid" runtime error: Uncaught Error: GENESIS_001_ADMISSION_STATE_MUTATIONS_DISABLED\n',
    ]) {
      expect(() => assertGenesis001FrozenWriterObservation({
        writer: 'admin_allow_fid', status: 530,
        text: 'The instance encountered a fatal error.', serverText,
        before, after: structuredClone(before),
      })).toThrow('GENESIS001_LOCAL_PROOF_WRITER_INVALID');
    }
    const stale = 'reducer "admin_allow_fid" runtime error: Uncaught Error: '
      + 'GENESIS_001_ADMISSION_STATE_MUTATIONS_DISABLED\n';
    const window = `${stale}authorization rejected\n`;
    expect(() => assertGenesis001FrozenWriterObservation({
      writer: 'admin_allow_fid', status: 530,
      text: 'The instance encountered a fatal error.', serverText: window.slice(stale.length),
      before, after: structuredClone(before),
    })).toThrow('GENESIS001_LOCAL_PROOF_WRITER_INVALID');
    expect(() => decodeGenesis001ProcedureResponse(302, Buffer.from('redirect'), 64, credential))
      .toThrow('GENESIS001_LOCAL_PROOF_REDIRECT_DENIED');
    expect(() => decodeGenesis001ProcedureResponse(400, Buffer.from('x'.repeat(65)), 64, credential))
      .toThrow('GENESIS001_LOCAL_PROOF_RESPONSE_INVALID');
    expect(() => decodeGenesis001ProcedureResponse(400, Uint8Array.of(0xff), 64, credential))
      .toThrow('GENESIS001_LOCAL_PROOF_RESPONSE_INVALID');
    expect(() => decodeGenesis001ProcedureResponse(200, Buffer.from('plain text'), 64, credential))
      .toThrow('GENESIS001_LOCAL_PROOF_JSON_INVALID');
    expect(() => decodeGenesis001ProcedureResponse(400, Buffer.from(credential), 64, credential))
      .toThrow('GENESIS001_LOCAL_PROOF_RESPONSE_INVALID');
  });

  it('stops network response reads at the configured byte bound', async () => {
    const chunks = [Buffer.from('1234'), Buffer.from('5678'), Buffer.from('9')];
    const response = new Response(new ReadableStream({
      pull(controller) {
        const chunk = chunks.shift();
        if (chunk === undefined) controller.close(); else controller.enqueue(chunk);
      },
    }));
    await expect(readGenesis001BoundedResponseBody(response, 8))
      .rejects.toThrow('GENESIS001_LOCAL_PROOF_RESPONSE_INVALID');
    await expect(readGenesis001BoundedResponseBody(
      new Response(Buffer.from('1234'), { headers: { 'content-length': '65' } }), 64,
    )).rejects.toThrow('GENESIS001_LOCAL_PROOF_RESPONSE_INVALID');
    await expect(readGenesis001BoundedResponseBody(new Response(Buffer.from('1234')), 4))
      .resolves.toEqual(Uint8Array.from(Buffer.from('1234')));
  });

  it('binds each published artifact to its exact bytes, hash, link count and inode', () => {
    const root = mkdtempSync(join(tmpdir(), 'g001-local-proof-artifact-'));
    try {
      const path = join(root, 'bundle.js');
      const body = Buffer.from('baseline-bundle');
      writeFileSync(path, body, { mode: 0o600 });
      const opened = readLocalBindingBoundedFile(path, {
        maximumBytes: 1024, expectedBytes: body.length,
        expectedSha256: createHash('sha256').update(body).digest('hex'),
      });
      const artifact = {
        path, bytes: body.length,
        sha256: createHash('sha256').update(body).digest('hex'), identity: opened.identity,
      };
      opened.body.fill(0);
      expect(() => attestGenesis001LocalProofArtifact(artifact)).not.toThrow();

      writeFileSync(path, Buffer.from('changed!-bundle'));
      expect(() => attestGenesis001LocalProofArtifact(artifact))
        .toThrow('GENESIS001_LOCAL_PROOF_ARTIFACT_CHANGED');

      const replacement = join(root, 'replacement.js');
      writeFileSync(replacement, body, { mode: 0o600 });
      renameSync(replacement, path);
      expect(readFileSync(path)).toEqual(body);
      expect(() => attestGenesis001LocalProofArtifact(artifact))
        .toThrow('GENESIS001_LOCAL_PROOF_ARTIFACT_CHANGED');

      const replacementOpened = readLocalBindingBoundedFile(path, {
        maximumBytes: 1024, expectedBytes: body.length,
        expectedSha256: artifact.sha256,
      });
      const linkedArtifact = { ...artifact, identity: replacementOpened.identity };
      replacementOpened.body.fill(0);
      const linked = join(root, 'linked.js');
      linkSync(path, linked);
      expect(() => attestGenesis001LocalProofArtifact(linkedArtifact))
        .toThrow('GENESIS001_LOCAL_PROOF_ARTIFACT_INVALID');
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it.skipIf(process.platform !== 'linux')(
    'runs the actual proof startup failure through contained cleanup without success evidence', async () => {
    const root = mkdtempSync(join(tmpdir(), 'g001-local-proof-startup-'));
    const baselinePath = join(root, 'baseline.js');
    const frozenPath = join(root, 'frozen.js');
    const artifact = (path: string, body: Buffer) => {
      writeFileSync(path, body, { mode: 0o600 });
      const opened = readLocalBindingBoundedFile(path, {
        maximumBytes: 1024, expectedBytes: body.length,
        expectedSha256: createHash('sha256').update(body).digest('hex'),
      });
      const value = {
        path, bytes: body.length, sha256: createHash('sha256').update(body).digest('hex'),
        identity: opened.identity,
      };
      opened.body.fill(0);
      return value;
    };
    const baselineArtifact = artifact(baselinePath, Buffer.from('baseline'));
    const frozenArtifact = artifact(frozenPath, Buffer.from('frozen'));
    let clock = 0;
    const now = vi.spyOn(Date, 'now').mockImplementation(() => {
      clock += 1;
      return clock <= 2 ? 0 : 1_000_000 + clock * 10_000;
    });
    let evidence: unknown;
    try {
      try {
        evidence = await runGenesis001LocalUpgradeProof({
          cliPath: process.execPath, baselineArtifact, frozenArtifact, operationRoot: root,
          environment: { PATH: process.env.PATH }, verifyExecutables() {},
        });
      } catch (error) {
        expect(error).toMatchObject({ code: 'GENESIS001_LOCAL_PROOF_STARTUP_TIMEOUT' });
      }
      expect(evidence).toBeUndefined();
      expect(existsSync(join(root, 'proof'))).toBe(true);
    } finally {
      now.mockRestore();
      rmSync(root, { recursive: true, force: true });
    }
    },
  );

  it('reports failed direct containment instead of accepting evidence while a process survives', async () => {
    const child = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], {
      stdio: 'ignore', shell: false,
    });
    try {
      await expect(terminateGenesis001LocalProofProcessGroup({
        pid: child.pid,
        kill() { return true; },
      }, 20)).rejects.toMatchObject({ code: 'GENESIS001_LOCAL_PROOF_CONTAINMENT_FAILED' });
    } finally {
      child.kill('SIGKILL');
      await new Promise<void>(resolvePromise => child.once('close', () => resolvePromise()));
    }
  });

  it('accepts only the distinct bounded compatibility worker result shape', () => {
    const nonce = 'a'.repeat(32);
    const result = {
      schemaVersion: 1,
      profile: 'warpkeep-local-binding-genesis001-compatibility-result-v1',
      nonce,
      sourceCommit: 'b'.repeat(40),
      sourceTree: 'c'.repeat(40),
      baselineBundleSha256: '1'.repeat(64),
      frozenBundleSha256: '2'.repeat(64),
      baselineDescriptorSha256: '3'.repeat(64),
      frozenDescriptorSha256: '4'.repeat(64),
      checkedFrozenWriters: GENESIS001_CHECKED_FROZEN_WRITERS,
    };
    const parse = (value: unknown) => parseLocalBindingWorkerResult(
      `${JSON.stringify(value)}\n`, nonce, '/private/unused.js',
      'warpkeep-local-binding-genesis001-compatibility-worker-v1',
    );
    expect(parse(result)).toEqual(result);
    expect(() => parse({ ...result, profile: 'warpkeep-local-binding-genesis001-worker-result-v1' }))
      .toThrow('LOCAL_BINDING_WORKER_RESULT_INVALID');
    expect(() => parse({ ...result, extra: true })).toThrow('LOCAL_BINDING_WORKER_RESULT_INVALID');
    expect(() => parse({ ...result, baselineBundleSha256: result.frozenBundleSha256 }))
      .toThrow('LOCAL_BINDING_WORKER_RESULT_INVALID');
    expect(() => parse({ ...result, checkedFrozenWriters: result.checkedFrozenWriters.slice(0, -1) }))
      .toThrow('LOCAL_BINDING_WORKER_RESULT_INVALID');
  });

  it.skipIf(vm.SourceTextModule === undefined)(
    'captures the complete fixed compatibility graph without the production publishing runtime', () => {
    const graph = deriveGenesis001CompatibilitySourceGraph(process.cwd());
    const paths = graph.modules.map(module => module.path);
    expect(graph.entry).toBe('scripts/genesis001-baseline-binding-linux-locked-source-build.ts');
    expect(paths).toEqual(expect.arrayContaining([
      'scripts/genesis001-baseline-binding-linux-locked-source-build.ts',
      'scripts/genesis001-binding-frozen-source.mjs',
      'scripts/genesis001-local-upgrade-proof.mjs',
      'scripts/genesis001-frozen-publisher-core.ts',
      'scripts/genesis001-frozen-materializer.mjs',
      'scripts/ptr-binding-locked-source-build-core.ts',
    ]));
    expect(paths).not.toContain('scripts/genesis001-frozen-publisher-runtime.ts');
    },
  );
});
