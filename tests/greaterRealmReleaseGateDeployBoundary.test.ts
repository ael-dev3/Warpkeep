// @vitest-environment node

import { execFileSync } from 'node:child_process';
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  greaterRealmReleaseGateDeployBoundaryTestSeams,
} from '../scripts/greater-realm-release-gate-deploy-boundary.mjs';
import {
  AUTH_BRIDGE_NOTIFICATION_PREPARED_DEPLOY_CLOSURE_MEMBER_PATHS,
} from '../scripts/auth-bridge-notification-prepared-deploy-closure.mjs';

const COMMIT = 'a'.repeat(40);
const temporaryDirectories: string[] = [];

function repository(): string {
  const root = realpathSync(mkdtempSync(join(
    tmpdir(),
    'warpkeep-release-gate-boundary-',
  )));
  temporaryDirectories.push(root);
  return root;
}

function cleanGitSpawn() {
  let ignoredCalls = 0;
  return vi.fn((_: string, arguments_: string[]) => {
    if (arguments_.includes('rev-parse')) {
      return { status: 0, stdout: `${COMMIT}\n` };
    }
    if (arguments_.includes('--ignored')) {
      ignoredCalls += 1;
      return {
        status: 0,
        stdout: ignoredCalls === 1
          ? 'node_modules\0'
          : 'node_modules\0services/auth-bridge/node_modules/\0',
      };
    }
    return { status: 0, stdout: '' };
  });
}

afterEach(() => {
  while (temporaryDirectories.length > 0) {
    rmSync(temporaryDirectories.pop()!, { recursive: true, force: true });
  }
});

describe('Greater Realm release-gate deployment boundary', () => {
  it('installs and preattests the platform parser resolver before literal verification', async () => {
    const order: string[] = [];
    const identity = Object.freeze({ digest: 'resolver-identity' });
    const installResolver = vi.fn((root: unknown, native: unknown) => {
      order.push('install');
      expect(root).toBeTypeOf('string');
      expect(native).toBe(
        `@typescript/typescript-${process.platform}-${process.arch}`,
      );
      return identity;
    });
    const attestResolver = vi.fn((_root: unknown, value: unknown) => {
      order.push('attest');
      expect(value).toBe(identity);
      return identity;
    });
    const loadReleaseGate = vi.fn(async () => {
      order.push('load');
      return {
        verifyGreaterRealmReleaseGateState: async () => {
          order.push('verify');
          return 'Greater Realm release phase=pre-generation; exact.';
        },
      };
    });
    const dependencyIdentity = Object.freeze({ digest: 'npm-identity' });
    const attestRootDependencies = vi.fn(() => {
      order.push('dependencies');
      return dependencyIdentity;
    });
    await expect(greaterRealmReleaseGateDeployBoundaryTestSeams.runBoundary({
      repositoryRoot: repository(),
      expectedCommit: COMMIT,
    }, {
      spawn: cleanGitSpawn(),
      installResolver,
      attestResolver,
      attestRootDependencies,
      loadReleaseGate,
    })).resolves.toMatchObject({
      schemaVersion: 1,
      expectedCommit: COMMIT,
      nativePackageName:
        `@typescript/typescript-${process.platform}-${process.arch}`,
    });
    expect(order).toEqual([
      'dependencies',
      'install',
      'attest',
      'load',
      'verify',
      'attest',
      'dependencies',
    ]);
    expect(attestResolver).toHaveBeenCalledTimes(2);
    expect(attestRootDependencies).toHaveBeenCalledTimes(2);
  });

  it('always post-attests and preserves both verifier and postflight failures', async () => {
    const verifierFailure = new Error('verifier-failed');
    const postflightFailure = new Error('resolver-changed');
    let attestCount = 0;
    await expect(greaterRealmReleaseGateDeployBoundaryTestSeams.runBoundary({
      repositoryRoot: repository(),
      expectedCommit: COMMIT,
    }, {
      spawn: cleanGitSpawn(),
      installResolver: () => Object.freeze({ digest: 'resolver-identity' }),
      attestResolver: () => {
        attestCount += 1;
        if (attestCount === 2) throw postflightFailure;
      },
      attestRootDependencies: () => Object.freeze({ digest: 'npm-identity' }),
      loadReleaseGate: async () => ({
        verifyGreaterRealmReleaseGateState: async () => {
          throw verifierFailure;
        },
      }),
    })).rejects.toSatisfy((error: unknown) =>
      error instanceof AggregateError
      && error.errors[0] === verifierFailure
      && error.errors[1] === postflightFailure);
    expect(attestCount).toBe(2);
  });

  it('rejects any ordinary or extra ignored checkout namespace', () => {
    const root = repository();
    const spawnWith = (ordinary: string, ignored: string) =>
      vi.fn((_: string, arguments_: string[]) => {
        if (arguments_.includes('rev-parse')) {
          return { status: 0, stdout: `${COMMIT}\n` };
        }
        if (arguments_.includes('--ignored')) {
          return { status: 0, stdout: ignored };
        }
        if (arguments_.includes('--others')) {
          return { status: 0, stdout: ordinary };
        }
        return { status: 0, stdout: '' };
      });
    expect(() => greaterRealmReleaseGateDeployBoundaryTestSeams.exactGitSource(
      root,
      COMMIT,
      ['node_modules'],
      spawnWith('', 'node_modules\0.cache/\0'),
    )).toThrow(/SOURCE_INVALID/u);
    expect(() => greaterRealmReleaseGateDeployBoundaryTestSeams.exactGitSource(
      root,
      COMMIT,
      ['node_modules'],
      spawnWith('unreviewed.txt\0', 'node_modules\0'),
    )).toThrow(/SOURCE_INVALID/u);
  });

  it('accepts the exact ignored inventory emitted after production-equivalent installs', () => {
    const root = repository();
    mkdirSync(join(root, 'services', 'auth-bridge'), { recursive: true });
    writeFileSync(join(root, '.gitignore'), 'node_modules\n');
    writeFileSync(join(root, 'services', 'auth-bridge', 'tracked'), 'tracked\n');
    execFileSync('/usr/bin/git', ['init', '--quiet'], { cwd: root });
    execFileSync('/usr/bin/git', ['add', '.'], { cwd: root });
    execFileSync('/usr/bin/git', [
      '-c', 'user.name=Warpkeep Test',
      '-c', 'user.email=warpkeep-test@example.invalid',
      'commit', '--quiet', '-m', 'fixture',
    ], { cwd: root });
    mkdirSync(join(root, 'node_modules'));
    mkdirSync(join(root, 'services', 'auth-bridge', 'node_modules'));
    writeFileSync(join(root, 'node_modules', 'root-package'), 'ignored\n');
    writeFileSync(
      join(root, 'services', 'auth-bridge', 'node_modules', 'service-package'),
      'ignored\n',
    );
    const head = execFileSync(
      '/usr/bin/git',
      ['rev-parse', '--verify', 'HEAD^{commit}'],
      { cwd: root, encoding: 'utf8' },
    ).trim();
    expect(() => greaterRealmReleaseGateDeployBoundaryTestSeams.exactGitSource(
      root,
      head,
      ['node_modules', 'services/auth-bridge/node_modules/'],
    )).not.toThrow();
  });

  it('accepts an isolated root npm ci inventory before resolver installation', () => {
    const root = repository();
    writeFileSync(join(root, '.gitignore'), 'node_modules\n');
    writeFileSync(join(root, 'tracked'), 'tracked\n');
    execFileSync('/usr/bin/git', ['init', '--quiet'], { cwd: root });
    execFileSync('/usr/bin/git', ['add', '.'], { cwd: root });
    execFileSync('/usr/bin/git', [
      '-c', 'user.name=Warpkeep Test',
      '-c', 'user.email=warpkeep-test@example.invalid',
      'commit', '--quiet', '-m', 'fixture',
    ], { cwd: root });
    mkdirSync(join(root, 'node_modules'));
    writeFileSync(join(root, 'node_modules', 'root-package'), 'ignored\n');
    const head = execFileSync(
      '/usr/bin/git',
      ['rev-parse', '--verify', 'HEAD^{commit}'],
      { cwd: root, encoding: 'utf8' },
    ).trim();
    expect(() => greaterRealmReleaseGateDeployBoundaryTestSeams.exactGitSource(
      root,
      head,
      ['node_modules'],
    )).not.toThrow();
  });

  it('binds both deployment boundary members after the separate closure refreeze', () => {
    const manifest = JSON.parse(readFileSync(
      'scripts/auth-bridge-notification-prepared-deploy-closure-v1.json',
      'utf8',
    )) as { members: Array<{ path: string }> };
    const boundaryMembers = [
      'scripts/greater-realm-release-gate-deploy-boundary.d.mts',
      'scripts/greater-realm-release-gate-deploy-boundary.mjs',
    ];
    const policy = readFileSync(
      'scripts/auth-bridge-notification-prepared-deploy-closure-policy.mjs',
      'utf8',
    );
    const checkedMembers = manifest.members.map(member => member.path);
    expect(checkedMembers).toEqual(
      AUTH_BRIDGE_NOTIFICATION_PREPARED_DEPLOY_CLOSURE_MEMBER_PATHS,
    );
    expect(checkedMembers).toHaveLength(384);
    for (const member of boundaryMembers) {
      expect(checkedMembers).toContain(member);
      expect(policy.split(`'${member}'`)).toHaveLength(2);
    }
  });
  it('contains one literal verifier import and no resolver shell construction', () => {
    const source = readFileSync(
      'scripts/greater-realm-release-gate-deploy-boundary.mjs',
      'utf8',
    );
    expect(source.match(
      /import\('\.\/verify-greater-realm-release-gates\.mjs'\)/gu,
    )).toHaveLength(1);
    expect(source).toContain('installHermesSourceParserResolver');
    expect(source).toContain('attestHermesSourceParserResolver');
    expect(source).toContain('attestInstalledRootDependencyClosure');
    expect(source).toContain("Object.freeze(['node_modules'])");
    expect(source).toContain("'services/auth-bridge/node_modules/'");
    expect(source).not.toMatch(/\beval\b|new Function|symlinkSync|exec(?:File)?Sync/u);
  });
});
