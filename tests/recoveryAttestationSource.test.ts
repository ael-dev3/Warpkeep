// @vitest-environment node
import { execFileSync, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { afterEach, beforeEach, expect, it } from 'vitest';
import { recoveryBindingCandidate } from './fixtures/recoveryBindingCandidate';
import { createRecoveryActivationBinding } from '../scripts/recovery-activation-candidate.mjs';
import { readRecoveryAttestationSource } from '../scripts/recovery-attestation-source.mjs';

let root: string;
const git = (...args: string[]) => execFileSync('git', args, { cwd: root, encoding: 'utf8', windowsHide: true }).trim();
const json = (path: string, value: unknown) => writeFileSync(join(root, path), `${JSON.stringify(value, null, 2)}\n`);
function commit() { git('add', '.'); git('-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid', 'commit', '--quiet', '-m', 'Synthetic test only'); }
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'warpkeep-recovery-source-'));
  git('init', '--quiet'); git('config', 'core.autocrlf', 'false');
  mkdirSync(join(root, 'config/releases'), { recursive: true });
  json('config/releases/0.4.0-sealed-launch.json', { preparation: true });
  json('package.json', { name: 'warpkeep', version: '0.3.43' });
  json('package-lock.json', { name: 'warpkeep', version: '0.3.43', lockfileVersion: 3, requires: true,
    packages: { '': { name: 'warpkeep', version: '0.3.43' } } });
  writeFileSync(join(root, 'source.js'), 'unchanged'); commit();
  const candidate = recoveryBindingCandidate();
  const parent = git('rev-parse', 'HEAD');
  Object.assign(candidate, { preparationSourceCommit: parent, preparationSourceTree: git('rev-parse', 'HEAD^{tree}'),
    g001PolicySourceCommit: parent, authBridgeSourceCommit: parent });
  json('config/releases/0.4.0-sealed-launch.json', createRecoveryActivationBinding(`${JSON.stringify(candidate, null, 2)}\n`));
  json('package.json', { name: 'warpkeep', version: '0.4.0' });
  json('package-lock.json', { name: 'warpkeep', version: '0.4.0', lockfileVersion: 3, requires: true,
    packages: { '': { name: 'warpkeep', version: '0.4.0' } } });
  commit();
});
afterEach(() => rmSync(root, { recursive: true, force: true }));

it('derives identity from a real committed three-file activation child', () => {
  const result = readRecoveryAttestationSource(root);
  expect(result.candidateCommit).toBe(git('rev-parse', 'HEAD'));
  expect(result.candidateTree).toBe(git('rev-parse', 'HEAD^{tree}'));
  expect(result.recoveryAuthorizationCoreSha256).toMatch(/^[a-f0-9]{64}$/);
});
it('rejects dirty source outside the three activation files', () => {
  writeFileSync(join(root, 'source.js'), 'changed');
  expect(() => readRecoveryAttestationSource(root)).toThrow();
});
it('rejects an extra source change committed into the activation child', () => {
  writeFileSync(join(root, 'source.js'), 'changed'); git('add', '.');
  git('-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid', 'commit', '--amend', '--no-edit', '--quiet');
  expect(() => readRecoveryAttestationSource(root)).toThrow();
});
it('rejects package changes beyond the exact version transition', () => {
  json('package.json', { name: 'warpkeep', version: '0.4.0', scripts: { build: 'substituted' } });
  git('add', '.'); git('-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid', 'commit', '--amend', '--no-edit', '--quiet');
  expect(() => readRecoveryAttestationSource(root)).toThrow();
});
it('does not accept a descendant instead of the activation child', () => {
  writeFileSync(join(root, 'other.txt'), 'later'); commit();
  expect(() => readRecoveryAttestationSource(root)).toThrow();
});
it.each(['--assume-unchanged', '--skip-worktree'])('rejects hidden index changes: %s', flag => {
  git('update-index', flag, 'source.js');
  writeFileSync(join(root, 'source.js'), 'hidden change');
  expect(() => readRecoveryAttestationSource(root)).toThrow();
});

const cli = fileURLToPath(new URL('../scripts/generate-warpkeep-deployment-attestation.mjs', import.meta.url));
function command(...args: string[]) {
  return spawnSync(process.execPath, [cli, ...args], { cwd: root, encoding: 'utf8', timeout: 15000, windowsHide: true });
}
it.skipIf(process.platform !== 'linux')('writes and checks the fixed dist artifact through the real CLI', () => {
  mkdirSync(join(root, 'dist')); writeFileSync(join(root, 'dist/index.html'), 'synthetic build');
  const written = command('--write');
  expect(written.status).toBe(0); expect(written.stderr).toBe('');
  expect(JSON.parse(written.stdout)).toEqual({ deploymentAttestationSha256: expect.stringMatching(/^[a-f0-9]{64}$/) });
  const checked = command('--check');
  expect(checked.status).toBe(0); expect(checked.stdout).toBe(written.stdout);
  expect(command('--write').status).toBe(1);
  writeFileSync(join(root, 'dist/index.html'), 'changed build');
  expect(command('--check').status).toBe(1);
});
it.each([[], ['--write', '--identity=caller'], ['--dist=/tmp/other'], ['--check', '--write']])
  ('rejects CLI overrides: %j', (...args) => {
    const result = command(...args);
    expect(result.status).toBe(1); expect(result.stdout).toBe('');
    expect(result.stderr).toBe('WARPKEEP_DEPLOYMENT_ATTESTATION_INVALID\n');
  });
