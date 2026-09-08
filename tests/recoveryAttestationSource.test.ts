// @vitest-environment node
import { execFileSync, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, copyFileSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { afterEach, beforeEach, expect, it } from 'vitest';
import { recoveryBindingCandidate } from './fixtures/recoveryBindingCandidate';
import { createRecoveryActivationBinding } from '../scripts/recovery-activation-candidate.mjs';
import { readRecoveryAttestationSource } from '../scripts/recovery-attestation-source.mjs';
import { classifySealedLaunchPagesDeployLane } from '../scripts/verify-0.4.0-sealed-launch.mjs';
import { SEALED_REALMS_OPERATIONS, SEALED_REALMS_ACTIVATED_OPERATIONS,
  authenticateSealedRealmsProductionSourceAuthority,
  sourceCommitFromSealedRealmsProductionAuthority,
  preparationSourceCommitFromSealedRealmsProductionAuthority,
} from '../scripts/sealed-realms-production-source-authority.mjs';

let root: string;
const git = (...args: string[]) => execFileSync('git', args, { cwd: root, encoding: 'utf8', windowsHide: true, timeout: 10000 }).trim();
const json = (path: string, value: unknown) => writeFileSync(join(root, path), `${JSON.stringify(value, null, 2)}\n`);
function commit() { git('add', '.'); git('-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid', 'commit', '--quiet', '-m', 'Synthetic test only'); }
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'warpkeep-recovery-source-'));
  git('init', '--quiet'); git('config', 'core.autocrlf', 'false');
  mkdirSync(join(root, 'config/releases'), { recursive: true });
  mkdirSync(join(root, 'scripts'));
  for (const file of ['verify-0.4.0-sealed-launch.mjs', 'local-binding-bounded-file.mjs',
    'recovery-attestation-source.mjs', 'recovery-activation-candidate.mjs', 'recovery-binding-projection.mjs']) {
    copyFileSync(fileURLToPath(new URL(`../scripts/${file}`, import.meta.url)), join(root, 'scripts', file));
  }
  copyFileSync(fileURLToPath(new URL('../config/releases/0.4.0-sealed-launch.json', import.meta.url)),
    join(root, 'config/releases/0.4.0-sealed-launch.json'));
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
  git('update-ref', 'refs/remotes/origin/main', git('rev-parse', 'HEAD'));
}, 30000);
afterEach(() => rmSync(root, { recursive: true, force: true }), 30000);

it('derives identity from a real committed three-file activation child', () => {
  const result = readRecoveryAttestationSource(root);
  expect(result.candidateCommit).toBe(git('rev-parse', 'HEAD'));
  expect(result.candidateTree).toBe(git('rev-parse', 'HEAD^{tree}'));
  expect(result.recoveryAuthorizationCoreSha256).toMatch(/^[a-f0-9]{64}$/);
});

function sourceAuthority(operation: (typeof SEALED_REALMS_OPERATIONS)[number], verified: string[] = []) {
  return authenticateSealedRealmsProductionSourceAuthority({ operation,
    workflowInputSha: git('rev-parse', 'HEAD'),
    readGit: args => execFileSync('git', [...args], { cwd: root, maxBuffer: 2 * 1024 * 1024 }),
    readBinding: source => {
      const value = JSON.parse(git('show', `${source}:config/releases/0.4.0-sealed-launch.json`));
      return Object.fromEntries(['schemaVersion', 'profile', 'pagesDeploymentApproved', 'preparationSourceCommit']
        .map(key => [key, value[key]]));
    },
    // This is deterministic structural coverage, not successful provider evidence.
    verifyEvidence: source => { verified.push(source); return { verifiedSha: source }; },
  });
}

it('authenticates genuine V2 Git bytes and both S/A coordinates without widening A operations', () => {
  const candidate = git('rev-parse', 'HEAD');
  const parent = git('rev-parse', 'HEAD^');
  expect(git('for-each-ref', 'refs/replace')).toBe('');
  for (const operation of SEALED_REALMS_ACTIVATED_OPERATIONS) {
    const verified: string[] = [];
    const authority = sourceAuthority(operation, verified);
    expect(authority.mode).toBe('A');
    expect(sourceCommitFromSealedRealmsProductionAuthority(authority)).toBe(candidate);
    expect(preparationSourceCommitFromSealedRealmsProductionAuthority(authority)).toBe(parent);
    expect(verified).toEqual([parent, candidate]);
  }
  for (const operation of SEALED_REALMS_OPERATIONS.filter(value => !SEALED_REALMS_ACTIVATED_OPERATIONS.includes(value as never))) {
    expect(() => sourceAuthority(operation)).toThrow('SEALED_REALMS_SOURCE_AUTHORITY_A_OPERATION_FORBIDDEN');
  }
});

it.each(['preparationSourceTree', 'preparationSourceCommit', 'recoveryAuthorizationCoreSha256',
  'noncanonical', 'extra-field'])( 'rejects committed V2 binding corruption before Verify: %s', field => {
  const file = 'config/releases/0.4.0-sealed-launch.json';
  const binding = JSON.parse(readFileSync(join(root, file), 'utf8'));
  if (field === 'noncanonical') writeFileSync(join(root, file), JSON.stringify(binding));
  else {
    binding[field] = field === 'extra-field' ? true : 'a'.repeat(field.endsWith('Sha256') ? 64 : 40);
    // A validly recomputed core with an incorrect source tree still fails Git identity.
    if (field === 'preparationSourceTree') {
      binding.recoveryAuthorizationCoreSha256 = null;
      for (const key of Object.keys(binding)) if (key.endsWith('Commitment')) binding[key] = null;
      json(file, createRecoveryActivationBinding(`${JSON.stringify(binding, null, 2)}\n`));
    } else json(file, binding);
  }
  git('add', '.'); git('-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid', 'commit', '--amend', '--no-edit', '--quiet');
  git('update-ref', 'refs/remotes/origin/main', git('rev-parse', 'HEAD'));
  const verified: string[] = [];
  expect(() => sourceAuthority('preflight', verified)).toThrow('SEALED_REALMS_SOURCE_AUTHORITY_BINDING_INVALID');
  expect(verified).toEqual([]);
});

it('rejects a V2 source whose package behavior changes alongside the version', () => {
  json('package.json', { name: 'warpkeep', version: '0.4.0', scripts: { postinstall: 'unreviewed' } });
  git('add', '.'); git('-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid', 'commit', '--amend', '--no-edit', '--quiet');
  git('update-ref', 'refs/remotes/origin/main', git('rev-parse', 'HEAD'));
  expect(() => sourceAuthority('preflight')).toThrow('SEALED_REALMS_SOURCE_AUTHORITY_BINDING_INVALID');
});
// The Pages classifier intentionally uses the fixed /usr/bin/git boundary.
it.skipIf(process.platform !== 'linux')('routes an exact schema-2 activation child only to the recovery lane', () => {
  const candidatePagesSourceCommit = git('rev-parse', 'HEAD');
  expect(classifySealedLaunchPagesDeployLane({ repositoryRoot: root, candidatePagesSourceCommit })).toEqual({
    profile: 'warpkeep-0.4.0-sealed-launch-v2', candidatePagesSourceCommit, mode: 'sealed-g002-recovery',
  });
});
it.skipIf(process.platform !== 'linux')('rejects recovery routing with a stale source SHA or untracked source', () => {
  expect(() => classifySealedLaunchPagesDeployLane({ repositoryRoot: root, candidatePagesSourceCommit: 'a'.repeat(40) })).toThrow();
  writeFileSync(join(root, 'untracked.js'), 'unreviewed');
  expect(() => classifySealedLaunchPagesDeployLane({ repositoryRoot: root, candidatePagesSourceCommit: git('rev-parse', 'HEAD') })).toThrow();
});
it('rejects dirty source outside the three activation files', () => {
  writeFileSync(join(root, 'source.js'), 'changed');
  expect(() => readRecoveryAttestationSource(root)).toThrow();
});
it.skipIf(process.platform !== 'linux')('runs the real recovery Pages build CLI and rejects wrong PTR targeting', () => {
  const candidate = git('rev-parse', 'HEAD');
  const binding = JSON.parse(readFileSync(join(root, 'config/releases/0.4.0-sealed-launch.json'), 'utf8'));
  const env = { PATH: '/usr/bin:/bin', CI: 'true', GITHUB_ACTIONS: 'true',
    GITHUB_REPOSITORY: 'ael-dev3/Warpkeep', GITHUB_EVENT_NAME: 'workflow_run',
    GITHUB_WORKFLOW_REF: 'ael-dev3/Warpkeep/.github/workflows/deploy-pages.yml@refs/heads/main',
    WARPKEEP_PAGES_SOURCE_COMMIT: candidate, VITE_WARPKEEP_PTR_ENABLED: 'true',
    VITE_PTR_SPACETIMEDB_DATABASE: binding.ptrDatabaseIdentity };
  const invoke = (environment: NodeJS.ProcessEnv) => spawnSync(process.execPath,
    [join(root, 'scripts/verify-0.4.0-sealed-launch.mjs'), '--phase=pages-build'],
    { cwd: root, env: environment, encoding: 'utf8', timeout: 15000 });
  const accepted = invoke(env);
  expect(accepted.stderr).toBe(''); expect(accepted.status).toBe(0);
  expect(JSON.parse(accepted.stdout)).toEqual({ profile: 'warpkeep-0.4.0-sealed-launch-v2',
    candidatePagesSourceCommit: candidate, mode: 'sealed-g002-recovery', ptrEnabled: true,
    ptrDatabaseIdentity: binding.ptrDatabaseIdentity });
  const rejected = invoke({ ...env, VITE_PTR_SPACETIMEDB_DATABASE: binding.g001DatabaseIdentity });
  expect(rejected.status).toBe(1); expect(rejected.stdout).toBe('');
  expect(rejected.stderr).toBe('SEALED_LAUNCH_PAGES_PTR_ENVIRONMENT_INVALID\n');
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
  expect(JSON.parse(written.stdout)).toEqual({
    deploymentAttestationSha256: expect.stringMatching(/^[a-f0-9]{64}$/),
    contentManifestSha256: expect.stringMatching(/^[a-f0-9]{64}$/),
  });
  const checked = command('--check');
  expect(checked.status).toBe(0); expect(checked.stdout).toBe(written.stdout);
  expect(command('--write').status).toBe(1);
  writeFileSync(join(root, 'dist/index.html'), 'changed build');
  expect(command('--check').status).toBe(1);
});
it.each([[], ['--write', '--identity=caller'], ['--dist=/tmp/other'], ['--check', '--write']].map(args => ({ args })))
  ('rejects CLI overrides: $args', ({ args }) => {
    const result = command(...args);
    expect(result.status).toBe(1); expect(result.stdout).toBe('');
    expect(result.stderr).toBe('WARPKEEP_DEPLOYMENT_ATTESTATION_INVALID\n');
  });
