// @vitest-environment node
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { expect, it } from 'vitest';
import { readNotificationPagesReleaseSources } from '../scripts/notification-pages-release-source-parser.mjs';

it('keeps the existing notification source authority parseable alongside the recovery caller', () => {
  const source = readNotificationPagesReleaseSources({ repositoryRoot: process.cwd() });
  expect(source.phase).toEqual({ pagesPresentationEnabled: false, hermesExecutionApproved: false });
});

// Native CLI contract tests. The prepared module is synthetic; these do not
// establish production authorization, signed receipts, or artifact validity.
function run(moduleSource: string | undefined, args: string[] = []) {
  const root = mkdtempSync(join(tmpdir(), 'warpkeep-prepare-cli-'));
  try {
    mkdirSync(join(root, 'scripts'));
    const command = join(root, 'scripts/recovery-workflow-prepare-claim.mjs');
    writeFileSync(command, readFileSync('scripts/recovery-workflow-prepare-claim.mjs'));
    if (moduleSource !== undefined) {
      const directory = join(root, 'services/release-recovery/scripts');
      mkdirSync(directory, { recursive: true });
      writeFileSync(join(directory, 'prepare-recovery-workflow-claim.bundle.mjs'), moduleSource);
    }
    return spawnSync(process.execPath, [command, ...args], { cwd: root, encoding: 'utf8', timeout: 10000,
      maxBuffer: 32768, windowsHide: true, env: { PATH: process.env.PATH, SystemRoot: process.env.SystemRoot } });
  } finally { rmSync(root, { recursive: true, force: true }); }
}
it('invokes preparation once with zero arguments and emits only a bounded acknowledgment', () => {
  const result = run(`export async function prepareRecoveryWorkflowClaim(...args) {
    if (args.length) throw new Error('ARGUMENTS'); return {claimPersisted: true}; }`);
  expect(result.status, result.stderr).toBe(0);
  expect(result.stdout).toBe('RECOVERY_WORKFLOW_CLAIM_PREPARED\n'); expect(result.stderr).toBe('');
});
it.each([
  undefined,
  `throw new Error('private-import-sentinel');`,
  `export async function prepareRecoveryWorkflowClaim() { throw new Error('private-receipt-sentinel'); }`,
  `export async function prepareRecoveryWorkflowClaim() { return {claimPersisted: false}; }`,
  `export async function prepareRecoveryWorkflowClaim() { return {claimPersisted: true, receipt: 'private-sentinel'}; }`,
])('fails closed with a fixed error for missing, failed, or invalid preparation', source => {
  const result = run(source);
  expect(result.status).toBe(1); expect(result.stdout).toBe('');
  expect(result.stderr).toBe('RECOVERY_WORKFLOW_CLAIM_PREPARATION_INVALID\n');
});
it('rejects caller overrides before importing the prepared module', () => {
  const result = run(`process.stdout.write('IMPORT_MUST_NOT_RUN');`, ['--private-root=/other']);
  expect(result.status).toBe(1); expect(result.stdout).toBe('');
  expect(result.stderr).toBe('RECOVERY_WORKFLOW_CLAIM_PREPARATION_INVALID\n');
});
