// @vitest-environment node

import { spawnSync } from 'node:child_process';
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { isAbsolute, join, resolve } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import {
  computeGreaterRealmPackageTree,
  reverifyGreaterRealmTrustedToolchain,
  verifyGreaterRealmTrustedToolchain,
} from '../scripts/atlas/greater-realm-toolchain-bootstrap.mjs';

import {
  inspectGreaterRealmTrustedGit,
  runGreaterRealmTrustedGit,
  sha256GreaterRealmAttestedFile,
} from '../scripts/atlas/greater-realm-git';

const repositoryRoot = resolve(import.meta.dirname, '..');
const temporaryRoots: string[] = [];

function temporaryRoot(): string {
  const root = mkdtempSync(join(tmpdir(), 'warpkeep-toolchain-security-'));
  temporaryRoots.push(root);
  return root;
}

const FIXTURE_COMMON_PACKAGES = Object.freeze([
  '@img/colour',
  'detect-libc',
  'esbuild',
  'semver',
  'sharp',
  'tsx',
  'typescript',
]);
const FIXTURE_PLATFORM_PACKAGES = Object.freeze([
  '@esbuild/darwin-arm64',
  '@img/sharp-darwin-arm64',
  '@img/sharp-libvips-darwin-arm64',
  '@typescript/typescript-darwin-arm64',
  '@esbuild/linux-x64',
  '@img/sharp-linux-x64',
  '@img/sharp-libvips-linux-x64',
  '@typescript/typescript-linux-x64',
  'fsevents',
]);

function toolchainFixture() {
  const root = temporaryRoot();
  const repositoryRoot = join(root, 'repository');
  const nodeModules = join(repositoryRoot, 'node_modules');
  const packageNames = [...FIXTURE_COMMON_PACKAGES, ...FIXTURE_PLATFORM_PACKAGES];
  mkdirSync(join(repositoryRoot, 'scripts', 'atlas'), { recursive: true, mode: 0o755 });
  mkdirSync(nodeModules, { mode: 0o755 });
  for (const name of packageNames) {
    const packageRoot = join(nodeModules, ...name.split('/'));
    mkdirSync(packageRoot, { recursive: true, mode: 0o755 });
    const packageMetadata: Record<string, unknown> = {
      name,
      version: '1.0.0',
      main: 'runtime.js',
    };
    if (/^@img\/sharp-(?:darwin-arm64|linux-x64)$/u.test(name)) {
      packageMetadata.exports = { './sharp.node': './runtime.js' };
    } else if (/^@img\/sharp-libvips-(?:darwin-arm64|linux-x64)$/u.test(name)) {
      packageMetadata.exports = {
        './lib': './runtime.js',
        './package': './package.json',
        './versions': './runtime.js',
      };
    }
    writeFileSync(
      join(packageRoot, 'package.json'),
      `${JSON.stringify(packageMetadata)}\n`,
      { mode: 0o644 },
    );
    writeFileSync(
      join(packageRoot, 'runtime.js'),
      `export const packageName = ${JSON.stringify(name)};\n`,
      { mode: 0o644 },
    );
    if (name === 'esbuild' || /^@esbuild\/(?:darwin-arm64|linux-x64)$/u.test(name)) {
      mkdirSync(join(packageRoot, 'bin'), { mode: 0o755 });
      writeFileSync(join(packageRoot, 'bin', 'esbuild'), 'fixture-esbuild-binary\n', {
        mode: 0o755,
      });
    }
    if (name === 'tsx') {
      mkdirSync(join(packageRoot, 'dist'), { mode: 0o755 });
      writeFileSync(join(packageRoot, 'dist', 'cli.mjs'), 'process.exitCode = 0;\n', {
        mode: 0o644,
      });
    }
  }
  const integrity = `sha512-${Buffer.alloc(64).toString('base64')}`;
  const packages = Object.fromEntries(packageNames.map(name => [name, {
    name,
    version: '1.0.0',
    integrity,
    ...computeGreaterRealmPackageTree(join(nodeModules, ...name.split('/')), {
      excludedFiles: name === 'esbuild' ? ['bin/esbuild'] : [],
    }),
  }]));
  const rootDevDependencies = Object.fromEntries(
    ['sharp', 'tsx', 'typescript'].map(name => [name, '1.0.0']),
  );
  writeFileSync(join(repositoryRoot, 'package.json'), `${JSON.stringify({
    packageManager: 'npm@10.9.8',
    engines: { node: '>=22.13 <23' },
    devDependencies: rootDevDependencies,
  })}\n`, { mode: 0o644 });
  const lockedPackages: Record<string, unknown> = {
    '': { devDependencies: rootDevDependencies },
  };
  for (const name of packageNames) {
    lockedPackages[`node_modules/${name}`] = {
      version: '1.0.0',
      resolved: `https://registry.npmjs.org/${name}/-/fixture-1.0.0.tgz`,
      integrity,
    };
  }
  writeFileSync(join(repositoryRoot, 'package-lock.json'), `${JSON.stringify({
    lockfileVersion: 3,
    packages: lockedPackages,
  })}\n`, { mode: 0o644 });
  writeFileSync(
    join(repositoryRoot, 'scripts', 'atlas', 'greater-realm-toolchain-lock.json'),
    `${JSON.stringify({
      kind: 'warpkeep.greater-realm.trusted-toolchain.v1',
      configuredNodeEngine: '>=22.13 <23',
      configuredPackageManager: 'npm@10.9.8',
      packages,
      profiles: {
        'darwin-arm64': {
          esbuildPackage: '@esbuild/darwin-arm64',
          sharpPackage: '@img/sharp-darwin-arm64',
          libvipsPackage: '@img/sharp-libvips-darwin-arm64',
          typescriptPackage: '@typescript/typescript-darwin-arm64',
          tsxOptionalPackages: ['fsevents'],
        },
        'linux-x64': {
          esbuildPackage: '@esbuild/linux-x64',
          sharpPackage: '@img/sharp-linux-x64',
          libvipsPackage: '@img/sharp-libvips-linux-x64',
          typescriptPackage: '@typescript/typescript-linux-x64',
          tsxOptionalPackages: [],
        },
      },
    })}\n`,
    { mode: 0o644 },
  );
  return Object.freeze({ nodeModules, repositoryRoot });
}

afterEach(() => {
  for (const root of temporaryRoots.splice(0)) {
    rmSync(root, { force: true, recursive: true });
  }
});

describe('Greater Realm toolchain provenance', () => {
  it('verifies the locked local executable package trees before TypeScript or Sharp loads', () => {
    const receipt = verifyGreaterRealmTrustedToolchain({ runtimeNode: '22.13.0' });

    expect(receipt.profile).toBe(`${process.platform}-${process.arch}`);
    expect(receipt.manifestSha256).toMatch(/^[0-9a-f]{64}$/u);
    expect(receipt.verifiedPackageCount).toBe(process.platform === 'darwin' ? 12 : 11);
    expect(receipt.tsxCli).toMatch(/[/\\]tsx[/\\]dist[/\\]cli\.mjs$/u);
  });

  it('rejects a malicious tsx tree before its injected module can execute', () => {
    const fixture = toolchainFixture();
    const marker = join(fixture.repositoryRoot, 'malicious-tsx-ran');
    const tsxCli = join(fixture.nodeModules, 'tsx', 'dist', 'cli.mjs');
    writeFileSync(
      tsxCli,
      `import { writeFileSync } from 'node:fs'; writeFileSync(${JSON.stringify(marker)}, 'ran');\n`,
      { mode: 0o644 },
    );

    expect(() => verifyGreaterRealmTrustedToolchain({
      repositoryRoot: fixture.repositoryRoot,
      runtimeNode: '22.13.0',
      platform: 'darwin',
      architecture: 'arm64',
    })).toThrow('GREATER_REALM_TOOLCHAIN_BOOTSTRAP_PACKAGE_TAMPERED');
    expect(existsSync(marker)).toBe(false);
  });

  it('rejects package-tree drift during the child run at final re-attestation', () => {
    const fixture = toolchainFixture();
    const input = Object.freeze({
      repositoryRoot: fixture.repositoryRoot,
      runtimeNode: '22.13.0',
      platform: 'darwin',
      architecture: 'arm64',
    });
    const receipt = verifyGreaterRealmTrustedToolchain(input);
    writeFileSync(
      join(fixture.nodeModules, 'semver', 'runtime.js'),
      'export const packageName = "mutated-during-child";\n',
      { mode: 0o644 },
    );

    expect(() => reverifyGreaterRealmTrustedToolchain(receipt, input))
      .toThrow('GREATER_REALM_TOOLCHAIN_BOOTSTRAP_PACKAGE_TAMPERED');
  });

  it('binds npm\'s installed esbuild executable to the locked native package', () => {
    const fixture = toolchainFixture();
    writeFileSync(
      join(fixture.nodeModules, 'esbuild', 'bin', 'esbuild'),
      'substituted-native-binary\n',
      { mode: 0o755 },
    );

    expect(() => verifyGreaterRealmTrustedToolchain({
      repositoryRoot: fixture.repositoryRoot,
      runtimeNode: '22.13.0',
      platform: 'darwin',
      architecture: 'arm64',
    })).toThrow('GREATER_REALM_TOOLCHAIN_BOOTSTRAP_PACKAGE_TAMPERED');
  });

  it('accepts the Linux closure only when the macOS-only optional module is absent', () => {
    const fixture = toolchainFixture();
    rmSync(join(fixture.nodeModules, 'fsevents'), { recursive: true });

    const receipt = verifyGreaterRealmTrustedToolchain({
      repositoryRoot: fixture.repositoryRoot,
      runtimeNode: '22.13.0',
      platform: 'linux',
      architecture: 'x64',
    });

    expect(receipt.profile).toBe('linux-x64');
    expect(receipt.verifiedPackageCount).toBe(11);
  });

  it('rejects an undeclared optional-module shadow in the Linux resolution path', () => {
    const fixture = toolchainFixture();

    expect(() => verifyGreaterRealmTrustedToolchain({
      repositoryRoot: fixture.repositoryRoot,
      runtimeNode: '22.13.0',
      platform: 'linux',
      architecture: 'x64',
    })).toThrow('GREATER_REALM_TOOLCHAIN_BOOTSTRAP_RESOLUTION_INVALID');
  });

  it('rejects lockfile integrity drift before inspecting runtime versions', () => {
    const fixture = toolchainFixture();
    const lockPath = join(fixture.repositoryRoot, 'package-lock.json');
    const lock = JSON.parse(readFileSync(lockPath, 'utf8')) as {
      packages: Record<string, { integrity?: string }>;
    };
    lock.packages['node_modules/tsx']!.integrity = `sha512-${Buffer.alloc(64, 7).toString('base64')}`;
    writeFileSync(lockPath, `${JSON.stringify(lock)}\n`, { mode: 0o644 });

    expect(() => verifyGreaterRealmTrustedToolchain({
      repositoryRoot: fixture.repositoryRoot,
      runtimeNode: '22.13.0',
      platform: 'darwin',
      architecture: 'arm64',
    })).toThrow('GREATER_REALM_TOOLCHAIN_BOOTSTRAP_LOCK_MISMATCH');
  });

  it('rejects dependency and native-loader overrides before runtime inspection', () => {
    const bootstrap = join(
      repositoryRoot,
      'scripts',
      'atlas',
      'greater-realm-toolchain-bootstrap.mjs',
    );
    const result = spawnSync(process.execPath, [bootstrap, '--verify-only'], {
      cwd: repositoryRoot,
      encoding: 'utf8',
      env: {
        ESBUILD_BINARY_PATH: join(temporaryRoot(), 'untrusted-esbuild'),
      },
    });

    expect(result.status).toBe(1);
    expect(result.stdout).toBe('');
    expect(result.stderr).toBe('GREATER_REALM_TOOLCHAIN_BOOTSTRAP_ENVIRONMENT_INVALID\n');
  });

  it('rejects case-folded loader overrides on every supported host', () => {
    const bootstrap = join(
      repositoryRoot,
      'scripts',
      'atlas',
      'greater-realm-toolchain-bootstrap.mjs',
    );
    const result = spawnSync(process.execPath, [bootstrap, '--verify-only'], {
      cwd: repositoryRoot,
      encoding: 'utf8',
      env: {
        node_options: '--require=untrusted-loader',
      },
    });

    expect(result.status).toBe(1);
    expect(result.stdout).toBe('');
    expect(result.stderr).toBe('GREATER_REALM_TOOLCHAIN_BOOTSTRAP_ENVIRONMENT_INVALID\n');
  });

  it('permits only the exact trusted host public-digest metadata key', () => {
    const bootstrap = join(
      repositoryRoot,
      'scripts',
      'atlas',
      'greater-realm-toolchain-bootstrap.mjs',
    );
    const digest = 'A'.repeat(64);
    const accepted = spawnSync(process.execPath, [bootstrap, '--verify-only'], {
      cwd: repositoryRoot,
      encoding: 'utf8',
      env: { NODE_REPL_TRUSTED_BROWSER_CLIENT_SHA256S: digest },
    });

    expect(accepted.status).toBe(0);
    expect(accepted.stderr).toBe('');
    expect(JSON.parse(accepted.stdout)).toMatchObject({ verified: true });

    for (const environment of [
      { PUBLIC_ATLAS_SHA256: digest },
      { GENERIC_VALUE: Buffer.alloc(32, 0xff).toString('base64url') },
    ]) {
      const rejected = spawnSync(process.execPath, [bootstrap, '--verify-only'], {
        cwd: repositoryRoot,
        encoding: 'utf8',
        env: environment,
      });
      expect(rejected.status).toBe(1);
      expect(rejected.stdout).toBe('');
      expect(rejected.stderr).toBe('GREATER_REALM_PRIVATE_INVOCATION_REJECTED\n');
    }
  });

  it('uses an attested absolute Git binary and disables inherited executable config', () => {
    const root = temporaryRoot();
    const fakeGit = join(root, 'git');
    const marker = join(root, 'fake-git-ran');
    const maliciousConfig = join(root, 'malicious.gitconfig');
    writeFileSync(fakeGit, `#!/bin/sh\ntouch "${marker}"\nexit 99\n`, { mode: 0o700 });
    chmodSync(fakeGit, 0o700);
    writeFileSync(maliciousConfig, '[core]\n\tfsmonitor = malicious-monitor\n\thooksPath = malicious-hooks\n');
    const prior = Object.freeze({
      PATH: process.env.PATH,
      GIT_CONFIG_GLOBAL: process.env.GIT_CONFIG_GLOBAL,
      GIT_CONFIG_SYSTEM: process.env.GIT_CONFIG_SYSTEM,
      GIT_EXEC_PATH: process.env.GIT_EXEC_PATH,
    });
    try {
      process.env.PATH = root;
      process.env.GIT_CONFIG_GLOBAL = maliciousConfig;
      process.env.GIT_CONFIG_SYSTEM = maliciousConfig;
      process.env.GIT_EXEC_PATH = root;
      const attestation = inspectGreaterRealmTrustedGit();
      expect(isAbsolute(attestation.binaryPath)).toBe(true);
      expect(isAbsolute(attestation.execPath)).toBe(true);
      expect(attestation.binaryPath).not.toBe(fakeGit);
      expect(attestation.binarySha256).toMatch(/^[0-9a-f]{64}$/u);
      expect(attestation.version).toMatch(/^git version /u);
      const hooks = runGreaterRealmTrustedGit(
        ['config', '--get', 'core.hooksPath'],
        repositoryRoot,
      );
      const fsmonitor = runGreaterRealmTrustedGit(
        ['config', '--get', 'core.fsmonitor'],
        repositoryRoot,
      );
      const untrackedCache = runGreaterRealmTrustedGit(
        ['config', '--get', 'core.untrackedCache'],
        repositoryRoot,
      );
      expect(hooks.status).toBe(0);
      expect(hooks.stdout.trim()).toBe(process.platform === 'win32' ? 'NUL' : '/dev/null');
      expect(fsmonitor.status).toBe(0);
      expect(fsmonitor.stdout.trim()).toBe('false');
      expect(untrackedCache.status).toBe(0);
      expect(untrackedCache.stdout.trim()).toBe('false');
      expect(() => sha256GreaterRealmAttestedFile(fakeGit, root)).not.toThrow();
      expect(() => sha256GreaterRealmAttestedFile(fakeGit, repositoryRoot))
        .toThrow('GREATER_REALM_TOOLCHAIN_INVALID');
    } finally {
      for (const [key, value] of Object.entries(prior)) {
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
      }
    }
  });

  it('rejects an attested-file symlink that escapes its allowed root', () => {
    const root = temporaryRoot();
    const allowed = join(root, 'allowed');
    mkdirSync(allowed, { mode: 0o700 });
    const outside = join(root, 'outside.bin');
    const link = join(allowed, 'escaped.bin');
    writeFileSync(outside, 'controlled-toolchain-artifact', { mode: 0o600 });
    symlinkSync(outside, link);

    expect(() => sha256GreaterRealmAttestedFile(link, allowed))
      .toThrow('GREATER_REALM_TOOLCHAIN_INVALID');
  });
});
