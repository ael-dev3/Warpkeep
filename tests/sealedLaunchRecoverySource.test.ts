// @vitest-environment node
import { execFileSync, spawnSync } from 'node:child_process';
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { expect, it } from 'vitest';
import { recoveryBindingCandidate } from './fixtures/recoveryBindingCandidate';
import { recoveryG002PtrAdoptionCandidate } from './fixtures/recoveryG002PtrAdoptionCandidate';
import { createRecoveryActivationBinding, createRecoveryActivationBindingFromCandidate } from '../scripts/recovery-activation-candidate.mjs';
import { recoveryBindingKeys } from '../scripts/recovery-binding-projection.mjs';
import { SEALED_LAUNCH_SOURCE_PATHS, verifySealedLaunchSources,
  verifyGenesis001PreparationProjection } from '../scripts/verify-0.4.0-sealed-launch.mjs';

const sourceRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const bindingPath = 'config/releases/0.4.0-sealed-launch.json';
const canonical = (value: unknown) => `${JSON.stringify(value, null, 2)}\n`;
const command = (root: string, args: readonly string[]) => execFileSync('git',
  ['--no-replace-objects', '-c', 'core.hooksPath=/dev/null', ...args], {
    cwd: root, encoding: 'utf8', maxBuffer: 4 * 1024 * 1024, windowsHide: true, timeout: 30000,
  });

it.skipIf(process.platform !== 'linux')('runs actual checked-in and activation Verify CLI on native V2/V4/V5 Git history', () => {
  const root = mkdtempSync(join(tmpdir(), 'warpkeep-v2-verify-'));
  const repo = join(root, 'repo');
  const invoke = (phase: string) => spawnSync(process.execPath,
    [join(repo, 'scripts/verify-0.4.0-sealed-launch.mjs'), `--phase=${phase}`], {
      cwd: repo, encoding: 'utf8', timeout: 60000,
      env: { PATH: '/usr/bin:/bin', LANG: 'C.UTF-8', LC_ALL: 'C.UTF-8', TZ: 'UTC' },
    });
  try {
    command(root, ['clone', '--quiet', '--no-hardlinks', sourceRoot, repo]);
    command(repo, ['config', 'core.autocrlf', 'false']);
    // Capture the exact reviewed working source, including freshly derived pins
    // when the diagnostic runner overlays them. No receipts/provider facts are real.
    const changed = command(sourceRoot, ['diff', '--name-only', 'HEAD', '-z']).split('\0').filter(Boolean);
    const added = command(sourceRoot, ['ls-files', '--others', '--exclude-standard', '-z']).split('\0').filter(Boolean);
    for (const path of new Set([...changed, ...added])) {
      mkdirSync(dirname(join(repo, path)), { recursive: true });
      copyFileSync(join(sourceRoot, path), join(repo, path));
    }
    const workspacePath = join(repo, 'spacetimedb/pnpm-workspace.yaml');
    const exactWorkspace = readFileSync(workspacePath);
    writeFileSync(workspacePath, Buffer.concat([exactWorkspace, Buffer.from('\n# Synthetic historical change\n')]));
    command(repo, ['add', '--all']);
    command(repo, ['-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid',
      'commit', '--quiet', '-m', 'Synthetic earlier workspace change']);
    writeFileSync(workspacePath, exactWorkspace);
    command(repo, ['add', '--', 'spacetimedb/pnpm-workspace.yaml']);
    command(repo, ['-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid',
      'commit', '--quiet', '--allow-empty', '-m', 'Synthetic reviewed preparation source']);
    const preparation = command(repo, ['rev-parse', 'HEAD']).trim();
    // Actual current root/browser tooling differs from the frozen release, while
    // every module-owned file and restored workspace snapshot is still exact.
    const inert = invoke('checked-in');
    expect({ status: inert.status, stderr: inert.stderr }).toEqual({ status: 0, stderr: '' });
    expect(JSON.parse(inert.stdout)).toMatchObject({ schemaVersion: 1, phase: 'preparation' });
    const candidate = recoveryBindingCandidate();
    Object.assign(candidate, { preparationSourceCommit: preparation,
      preparationSourceTree: command(repo, ['rev-parse', 'HEAD^{tree}']).trim(),
      g001PolicySourceCommit: preparation, authBridgeSourceCommit: preparation });
    const binding = createRecoveryActivationBinding(canonical(candidate));
    writeFileSync(join(repo, bindingPath), canonical(binding));
    for (const path of ['package.json', 'package-lock.json']) {
      const value = JSON.parse(readFileSync(join(repo, path), 'utf8'));
      value.version = '0.4.0';
      if (path === 'package-lock.json') value.packages[''].version = '0.4.0';
      writeFileSync(join(repo, path), canonical(value));
    }
    command(repo, ['add', '--', bindingPath, 'package.json', 'package-lock.json']);
    const amend = () => command(repo, ['-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid',
      'commit', '--quiet', '--amend', '--no-edit']);
    command(repo, ['-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid',
      'commit', '--quiet', '-m', 'Synthetic V2 activation source']);
    const sources = Object.fromEntries(Object.entries(SEALED_LAUNCH_SOURCE_PATHS)
      .map(([key, path]) => [key, readFileSync(join(repo, path), 'utf8')]));
    expect(verifySealedLaunchSources(sources)).toMatchObject({ schemaVersion: 2,
      profile: 'warpkeep-0.4.0-sealed-launch-v2', phase: 'activation' });
    for (const phase of ['checked-in', 'activation']) {
      const result = invoke(phase);
      expect({ status: result.status, stderr: result.stderr }).toEqual({ status: 0, stderr: '' });
      expect(JSON.parse(result.stdout)).toMatchObject({ schemaVersion: 2,
        profile: 'warpkeep-0.4.0-sealed-launch-v2', phase: 'activation', pagesDeploymentApproved: true });
    }
    expect(invoke('preparation').status).toBe(1);
    const adoptionValues: Record<string, unknown> = { ...candidate, schemaVersion: 4,
      profile: 'warpkeep-0.4.0-sealed-launch-ptr-adoption-v4',
      ptrExistingUpdateReceiptDigest: '9'.repeat(64), ptrExistingUpdateReceiptCommitment: null,
      ptrExistingStateAdoptionReceiptDigest: '8'.repeat(64), ptrExistingStateAdoptionReceiptCommitment: null,
      ptrSealed: true, ptrPopulationGuardPassed: true, ptrSingletonOwnerCount: 1, ptrGeneralAdmissionCount: 0,
      ptrExpectedSealedStateHmacSha256: '7'.repeat(64), ptrExpectedOwnerInvariantHmacSha256: '6'.repeat(64) };
    for (const version of [4, 5] as const) {
      const values = version === 4 ? adoptionValues : { ...adoptionValues,
        ...Object.fromEntries(Object.entries(recoveryG002PtrAdoptionCandidate())
          .filter(([key]) => key.startsWith('g002') || ['schemaVersion', 'profile'].includes(key))) };
      const adoptionBinding = createRecoveryActivationBindingFromCandidate(canonical(Object.fromEntries(
        recoveryBindingKeys(version).map(key => [key, values[key]]))));
      writeFileSync(join(repo, bindingPath), canonical(adoptionBinding));
      command(repo, ['add', '--', bindingPath]); amend();
      for (const phase of ['checked-in', 'activation']) {
        const result = invoke(phase);
        expect({ status: result.status, stderr: result.stderr }).toEqual({ status: 0, stderr: '' });
        const summary = JSON.parse(result.stdout);
        expect(summary).toMatchObject({ schemaVersion: version,
          profile: adoptionBinding.profile, phase: 'activation', pagesDeploymentApproved: true });
        expect(summary).not.toHaveProperty('ptrPresentationEnabled');
      }
      expect(invoke('preparation').status).toBe(1);
    }
    // Canonical and internally self-consistent forged tree metadata still fails
    // the actual immutable Git check, even though pure binding parsing succeeds.
    const forged = { ...candidate, preparationSourceTree: 'a'.repeat(40) };
    writeFileSync(join(repo, bindingPath), canonical(createRecoveryActivationBinding(canonical(forged))));
    command(repo, ['add', '--', bindingPath]); amend();
    const rejected = invoke('checked-in');
    expect(rejected.status).toBe(1); expect(rejected.stdout).toBe('');
    expect(rejected.stderr).toBe('SEALED_LAUNCH_ACTIVATION_HISTORY_INVALID\n');
    // A restored binding plus unrelated source change is also not an A child.
    writeFileSync(join(repo, bindingPath), canonical(binding));
    writeFileSync(join(repo, 'unexpected-source.txt'), 'Synthetic unrelated change\n');
    command(repo, ['add', '--', bindingPath, 'unexpected-source.txt']); amend();
    expect(invoke('activation').status).toBe(1);
    expect(command(repo, ['for-each-ref', 'refs/replace']).trim()).toBe('');
    for (const path of ['spacetimedb/package.json', 'spacetimedb/pnpm-lock.yaml',
      'spacetimedb/src/index.ts', 'scripts/greater-realm-production-immutable-artifact.ts']) {
      command(repo, ['checkout', '--quiet', '--detach', preparation]);
      const before = readFileSync(join(repo, path), 'utf8');
      const changed = path === 'spacetimedb/package.json'
        ? canonical({ ...JSON.parse(before), dependencies: { spacetimedb: '0.0.0' } })
        : `${before}\n# Synthetic current byte drift\n`;
      writeFileSync(join(repo, path), changed);
      command(repo, ['add', '--', path]);
      command(repo, ['-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid',
        'commit', '--quiet', '-m', 'Synthetic current G001 mutation must fail']);
      expect(() => verifyGenesis001PreparationProjection({ repositoryRoot: repo,
        candidatePreparationCommit: command(repo, ['rev-parse', 'HEAD']).trim(), sources }))
        .toThrow('SEALED_LAUNCH_GENESIS_001_HISTORY_INVALID');
    }
  } finally { rmSync(root, { recursive: true, force: true }); }
}, 120000);
