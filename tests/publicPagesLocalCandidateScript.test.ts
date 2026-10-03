import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

const SCRIPT = join(process.cwd(), 'scripts', 'public-pages-local-candidate.sh');
// Never resolve a bare `bash` on Windows: System32 may hold the WSL launcher.
const BASH = process.platform === 'win32'
  ? join(process.env.ProgramFiles ?? 'C:/Program Files', 'Git', 'bin', 'bash.exe')
  : 'bash';
const SOURCE = 'd'.repeat(40);
const TREE = 'e'.repeat(40);
const PARENT = 'b6afe92e7b09197b1578d992103ac3c8f916d8ad';
const PRESERVED = '7699d03b70c901e4fb8453b8b515af03376d398bf79e9eabea1c85f6e303c3ef';
const sha = (value: string) => createHash('sha256').update(value).digest('hex');

/** Source the script (its main is skipped) and run one guard function. */
function guard(body: string, env: Record<string, string> = {}) {
  const result = spawnSync(BASH, ['-c', `source "${SCRIPT.replaceAll('\\', '/')}"; ${body}`], {
    encoding: 'utf8', env: { ...process.env, ...env }, windowsHide: true,
  });
  return { status: result.status, stdout: result.stdout, stderr: result.stderr };
}

const roots: string[] = [];
function tempRoot() {
  const root = mkdtempSync(join(tmpdir(), 'wk-p3-candidate-'));
  roots.push(root);
  return root;
}
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });

describe.skipIf(!existsSync(BASH) && process.platform === 'win32')('public Pages local candidate script guards', () => {
  it('requires exactly one full source commit and tree', () => {
    expect(guard(`p3_validate_arguments ${SOURCE} ${TREE}`).status).toBe(0);
    for (const args of [`${SOURCE}`, `${SOURCE} ${TREE} extra`, `${SOURCE.slice(0, 8)} ${TREE}`, `${SOURCE} HEAD`]) {
      const result = guard(`p3_validate_arguments ${args}`);
      expect(result.status).toBe(2);
      expect(result.stderr).toContain('P3_CANDIDATE_ARGUMENTS_INVALID');
    }
  });

  it('drops caller build variables before exporting only the reviewed production values', () => {
    const result = guard(
      `p3_scrub_build_environment; p3_export_build_environment ${SOURCE}; `
        + 'echo "uri=${VITE_PTR_SPACETIMEDB_URI-unset} stray=${VITE_STRAY-unset} base=$DEPLOY_BASE sha=$VITE_WARPKEEP_BUILD_SHA ptr=$VITE_WARPKEEP_PTR_ENABLED msys=$MSYS_NO_PATHCONV"',
      { VITE_PTR_SPACETIMEDB_URI: 'https://example.invalid', VITE_STRAY: 'x', DEPLOY_BASE: '/' },
    );
    expect(result.status).toBe(0);
    expect(result.stdout.trim()).toBe(`uri=unset stray=unset base=/ptr/ sha=${SOURCE} ptr=true msys=1`);
  });

  it('refuses to replace any earlier plan, receipt or export for the same source', () => {
    const root = tempRoot();
    expect(guard(`p3_require_fresh_evidence "${root.replaceAll('\\', '/')}" dddddddd`).status).toBe(0);
    for (const name of ['plan-dddddddd.json', 'prepare-dddddddd.json', 'pages-upload-dddddddd']) {
      const path = join(root, name);
      if (name.startsWith('pages-upload')) mkdirSync(path); else writeFileSync(path, '{}');
      const result = guard(`p3_require_fresh_evidence "${root.replaceAll('\\', '/')}" dddddddd`);
      expect(result.status).toBe(8);
      expect(result.stderr).toContain('P3_CANDIDATE_EVIDENCE_EXISTS');
      rmSync(path, { recursive: true, force: true });
    }
  });

  it('accepts only a plan for the exact source and tree on the unchanged Alpha root', () => {
    const root = tempRoot();
    const plan = join(root, 'plan.json');
    const write = (overrides: Record<string, unknown> = {}) => writeFileSync(plan, JSON.stringify({
      sourceCommit: SOURCE, sourceTree: TREE, publicParentCommit: PARENT,
      preservedRootEntryCount: 341, preservedRootManifestSha256: PRESERVED, ...overrides,
    }));
    const check = () => guard(`p3_assert_plan_identity "${plan.replaceAll('\\', '/')}" ${SOURCE} ${TREE}`);
    write();
    expect(check().status).toBe(0);
    for (const overrides of [
      { sourceCommit: 'a'.repeat(40) }, { sourceTree: 'a'.repeat(40) }, { publicParentCommit: 'a'.repeat(40) },
      { preservedRootEntryCount: 340 }, { preservedRootManifestSha256: 'a'.repeat(64) },
    ]) {
      write(overrides);
      const result = check();
      expect(result.status).toBe(9);
      expect(result.stderr).toContain('P3_CANDIDATE_PLAN_IDENTITY_INVALID');
    }
  });

  it('verifies an export byte for byte and rejects a changed, missing or extra file', () => {
    const root = tempRoot();
    const exportRoot = join(root, 'export');
    const plan = join(root, 'plan.json');
    const files: Record<string, string> = { 'index.html': 'alpha', 'ptr/index.html': 'ptr' };
    const build = () => {
      rmSync(exportRoot, { recursive: true, force: true });
      for (const [path, body] of Object.entries(files)) {
        mkdirSync(join(exportRoot, path, '..'), { recursive: true });
        writeFileSync(join(exportRoot, path), body);
      }
    };
    writeFileSync(plan, JSON.stringify({ targetEntries: Object.entries(files).map(([path, body]) => ({
      path, byteLength: body.length, sha256: sha(body),
    })) }));
    const check = () => guard(`p3_verify_export "${plan.replaceAll('\\', '/')}" "${exportRoot.replaceAll('\\', '/')}"`);
    build();
    expect(check()).toMatchObject({ status: 0 });
    expect(JSON.parse(check().stdout)).toEqual({ verified: 2, planned: 2, onDisk: 2 });
    writeFileSync(join(exportRoot, 'ptr/index.html'), 'PTR');
    expect(check().status).toBe(7);
    build(); rmSync(join(exportRoot, 'index.html'));
    expect(check().status).toBe(7);
    build(); writeFileSync(join(exportRoot, 'stale.js'), 'old export');
    expect(check().status).toBe(7);
  });
});
