import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';

const workflowPath = '.github/workflows/notification-bridge-prepared-linux.yml';
const manifestPath =
  'scripts/auth-bridge-notification-prepared-pnpm-linux-x64-v1.json';
const installedToolchainManifestPath =
  'scripts/auth-bridge-notification-prepared-installed-toolchain-linux-x64-v1.json';
const runnerPath = 'scripts/auth-bridge-notification-prepared-linux-runner.mjs';

describe('prepared Linux production workflow', () => {
  it('parses every production shell step before credentials or provider work', () => {
    const workflow = parse(readFileSync(workflowPath, 'utf8'));
    const bash = process.platform === 'win32' ? 'C:/Program Files/Git/bin/bash.exe' : '/bin/bash';
    const scripts = Object.values(workflow.jobs).flatMap((job: any) => job.steps)
      .filter((step: any) => typeof step.run === 'string');
    expect(scripts.length).toBeGreaterThan(0);
    for (const step of scripts) {
      expect(() => execFileSync(bash, ['--noprofile', '--norc', '-n'], {
        input: step.run, encoding: 'utf8', windowsHide: true,
      }), step.name).not.toThrow();
    }
  });
  it('reads the public PTR identity from configuration while preserving private credentials', () => {
    const workflow = parse(readFileSync(workflowPath, 'utf8')) as {
      jobs: Record<string, { steps: { name?: string; env?: Record<string, string> }[] }>;
    };
    const steps = Object.values(workflow.jobs).flatMap(job => job.steps);
    const deploy = steps.find(step => step.name === 'Run attested Linux deployment or recovery');
    expect(deploy?.env).toMatchObject({
      WARPKEEP_PTR_SPACETIMEDB_DATABASE: '${{ vars.WARPKEEP_PTR_SPACETIMEDB_DATABASE }}',
      WARPKEEP_PLAYER_CANARY_OWNER_FID: '${{ secrets.WARPKEEP_PLAYER_CANARY_OWNER_FID }}',
      WARPKEEP_RELEASE_RECOVERY_RPC_SECRET: '${{ secrets.WARPKEEP_RELEASE_RECOVERY_RPC_SECRET }}',
      WARPKEEP_RELEASE_RECOVERY_CENSUS_PEPPER: '${{ secrets.WARPKEEP_RELEASE_RECOVERY_CENSUS_PEPPER }}',
      WARPKEEP_PRODUCTION_ADMIN_TOKEN: '${{ secrets.WARPKEEP_PRODUCTION_ADMIN_TOKEN }}',
      WARPKEEP_AUTH_BRIDGE_CLOUDFLARE_API_TOKEN: '${{ secrets.WARPKEEP_AUTH_BRIDGE_CLOUDFLARE_API_TOKEN }}',
    });
  });

  it('keeps the durable caller on the attested Linux authority', () => {
    const workflow = readFileSync(workflowPath, 'utf8');
    expect(workflow).toContain(
      'runs-on: [self-hosted, Linux, X64, warpkeep-production-admin, warpkeep-repository-exclusive]',
    );
    expect(workflow).toContain(
      'WARPKEEP_AUTH_BRIDGE_PREPARED_INSTALLED_TOOLCHAIN_PROFILE: linux-x64',
    );
    expect(workflow).toContain(
      'WARPKEEP_PREPARED_LINUX_INSTALLED_TOOLCHAIN_MANIFEST_SHA256:',
    );
    expect(workflow).not.toContain(
      'WARPKEEP_PREPARED_INSTALLED_TOOLCHAIN_MANIFEST_SHA256:',
    );
    expect(workflow).toContain(
      'scripts/auth-bridge-notification-prepared-installed-toolchain-linux-x64-v1.json',
    );
    expect(workflow).toContain(
      'scripts/auth-bridge-notification-prepared-linux-runner.mjs',
    );
    expect(workflow).toContain(
      '/home/warpkeep/.warpkeep/release-preparation-v1/toolchain/node-v22.22.3-linux-x64/bin/node',
    );
    expect(workflow).toContain(
      '/home/warpkeep/.warpkeep/release-preparation-v1/toolchain/pnpm-v11.11.0-linux-x64/pnpm',
    );
    expect(workflow).toContain(
      '-u HTTP_PROXY -u HTTPS_PROXY -u ALL_PROXY -u NO_PROXY',
    );
    expect(workflow).toContain(
      'PATH=/usr/bin:/bin /bin/bash --noprofile --norc -p -e -o pipefail {0}',
    );
    expect(workflow).not.toContain('macOS');
    expect(workflow).not.toContain('darwin-arm64');
    expect(workflow).not.toContain('/private/var/db/warpkeep');
  });

  it('pins the private pnpm authority to the reviewed archive and wrapper', () => {
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as Record<string, unknown>;
    expect(manifest).toMatchObject({
      schemaVersion: 1,
      profile: 'warpkeep-auth-bridge-notification-prepared-pnpm-linux-x64-v1',
      packageManager: 'pnpm@11.11.0',
      platform: 'linux',
      architecture: 'x64',
      nodeVersion: 'v22.22.3',
      pnpmExecutableSha256:
        '60e9225a0e34ea09a78feda05282faf5bb1feb808c16a71df3ed58a684ba6edd',
      pnpmPackageSha256:
        '67b035e322203961795e8e34ca63a08c37a4386eda94107fb3d28f3246d882ad',
      pnpmLauncherPath:
        '/home/warpkeep/.warpkeep/release-preparation-v1/toolchain/pnpm-v11.11.0-linux-x64/package/bin/pnpm.mjs',
      pnpmLauncherSha256:
        'ff3224d46b47fbb24a7e9fe15fededef7e00892d07d4e376b6762d4899906bfd',
      pnpmRuntimePath:
        '/home/warpkeep/.warpkeep/release-preparation-v1/toolchain/pnpm-v11.11.0-linux-x64/package/dist/pnpm.mjs',
      pnpmRuntimeSha256:
        'e8abc02d5fbffb8f9d8817d44d6eee84c379ea8d5006dd5aa8694bb5e4428d8a',
      archiveSha256:
        '85ef2eff216a1ae90804c00c8dfbfa6685353644650d10906a893c05aedcd884',
    });
    const manifestSha = createHash('sha256')
      .update(readFileSync(manifestPath))
      .digest('hex');
    expect(manifestSha).toBe(
      '2f74f205f1a6ddd54263d8eb6f362d92491f157177e3be8e518e85bb7e53a8ab',
    );
    const runner = readFileSync(runnerPath, 'utf8');
    expect(runner).toContain(`const EXPECTED_PNPM_MANIFEST_SHA256 =\n  '${manifestSha}';`);
    expect(runner).toContain('sha256File(PNPM_LAUNCHER_PATH) !== PNPM_LAUNCHER_SHA256');
    expect(runner).toContain('manifest.pnpmLauncherPath !== PNPM_LAUNCHER_PATH');
    expect(runner).toContain('manifest.pnpmLauncherSha256 !== PNPM_LAUNCHER_SHA256');
    expect(runner).toContain('sha256File(PNPM_RUNTIME_PATH) !== PNPM_RUNTIME_SHA256');
    expect(runner).toContain('manifest.pnpmRuntimePath !== PNPM_RUNTIME_PATH');
    expect(runner).toContain('manifest.pnpmRuntimeSha256 !== PNPM_RUNTIME_SHA256');
  });

  it('keeps the patched CLI from downloading the retained package manager during installation', () => {
    const workflow = parse(readFileSync(workflowPath, 'utf8')) as {
      jobs: Record<string, { steps: { name?: string; run?: string }[] }>;
    };
    const install = Object.values(workflow.jobs).flatMap(job => job.steps)
      .find(step => step.name === 'Install exact Linux auth bridge dependencies');

    // The input/installed-graph declaration is retained evidence. pnpm's default
    // mismatch handling would download that older CLI unless this call opts out.
    expect(JSON.parse(readFileSync('services/auth-bridge/package.json', 'utf8'))
      .packageManager).toBe('pnpm@11.7.0');
    expect(JSON.parse(readFileSync(installedToolchainManifestPath, 'utf8'))
      .packageManager).toBe('pnpm@11.7.0');
    expect(install?.run).toContain(
      "pnpm_executable='/home/warpkeep/.warpkeep/release-preparation-v1/toolchain/pnpm-v11.11.0-linux-x64/pnpm'",
    );
    expect(install?.run).toMatch(
      /"\$pnpm_executable" --pm-on-fail=ignore --dir services\/auth-bridge install --frozen-lockfile/u,
    );
  });

  it('checks every wrapper, entry and implementation hop before installing dependencies', () => {
    const workflow = parse(readFileSync(workflowPath, 'utf8')) as {
      jobs: Record<string, { steps: { name?: string; run?: string }[] }>;
    };
    const install = Object.values(workflow.jobs).flatMap(job => job.steps)
      .find(step => step.name === 'Install exact Linux auth bridge dependencies')?.run;
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as Record<string, string>;
    expect(install).toBeTypeOf('string');
    const invocation = install!.indexOf('"$pnpm_executable" --pm-on-fail=ignore');
    expect(invocation).toBeGreaterThan(0);
    for (const [variable, field] of [
      ['pnpm_executable', 'pnpmExecutableSha256'],
      ['pnpm_package', 'pnpmPackageSha256'],
      ['pnpm_launcher', 'pnpmLauncherSha256'],
      ['pnpm_runtime', 'pnpmRuntimeSha256'],
    ]) {
      const guard = `test "$(/usr/bin/sha256sum -- "$${variable}" | cut -d ' ' -f1)" = '${manifest[field]}'`;
      const at = install!.indexOf(guard);
      expect(at, field).toBeGreaterThan(0);
      expect(at, field).toBeLessThan(invocation);
    }
  });

  it('binds the freshly reviewed Linux snapshot to the unchanged current dependency lock', () => {
    const manifest = JSON.parse(readFileSync(installedToolchainManifestPath, 'utf8'));
    const lockSha = createHash('sha256')
      .update(readFileSync('services/auth-bridge/pnpm-lock.yaml')).digest('hex');
    expect(lockSha).toBe('e1478d3eaaaf16505f4171f5c2570164f94a5abb17dcf592ed433c14ae524327');
    expect(manifest.lockfileSha256).toBe(lockSha);
    expect(manifest.resolverNamespaceEntryCount).toBe(27);
    expect(manifest.resolverNamespaceFileCount).toBe(9);
    expect(manifest.resolverNamespaceEntryCount).toBe(
      manifest.resolverNamespaceDirectoryCount
      + manifest.resolverNamespaceFileCount
      + manifest.resolverNamespaceSymbolicLinkCount,
    );
    const policy = readFileSync('scripts/verify-auth-bridge-notification-prepared-policy.mjs', 'utf8');
    expect(policy).toContain(`installedLinuxToolchain.lockfileSha256\n      !== '${lockSha}'`);
    expect(policy).toContain('installedLinuxToolchain.resolverNamespaceEntryCount !== 27');
    expect(policy).toContain('installedLinuxToolchain.resolverNamespaceFileCount !== 9');
  });

  it('binds the workflow and runner to the installed Linux manifest bytes', () => {
    const workflow = parse(readFileSync(workflowPath, 'utf8')) as {
      jobs: Record<string, { env: Record<string, string> }>;
    };
    const manifestSha = createHash('sha256')
      .update(readFileSync(installedToolchainManifestPath))
      .digest('hex');
    const runner = readFileSync(runnerPath, 'utf8');

    expect(workflow.jobs['notification-bridge-prepared-linux'].env
      .WARPKEEP_PREPARED_LINUX_INSTALLED_TOOLCHAIN_MANIFEST_SHA256)
      .toBe(manifestSha);
    expect(runner).toContain('const LINUX_TOOLCHAIN_MANIFEST =');
    expect(runner).toContain(
      "!== sha256File(resolve(repositoryRoot, LINUX_TOOLCHAIN_MANIFEST))",
    );
    expect(runner).not.toContain(
      'bcc41d30dbb00ecd612a1fdb5fe87b5e047d8cc777d0af9fc360b40e06bc1de2',
    );
  });
});

// Run the real CLI module in an isolated VM. Only its fixed host/source/tool
// attestations and authenticated entrypoint are stubbed; no provider is called.
const preparedLinuxRunnerDriver = String.raw`
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { posix } from 'node:path';
import { SourceTextModule, SyntheticModule, createContext } from 'node:vm';

const fixture = JSON.parse(readFileSync(0, 'utf8'));
const source = readFileSync(fixture.runnerPath, 'utf8');
const repositoryRoot = '/home/warpkeep/actions-runner/_work/Warpkeep/Warpkeep';
const commit = 'a'.repeat(40);
const publicBodies = new Map(fixture.publicFiles.map(([path, body]) => [
  posix.resolve(repositoryRoot, path), Buffer.from(body, 'base64'),
]));
const tools = new Map([
  ['/home/warpkeep/.warpkeep/release-preparation-v1/toolchain/pnpm-v11.11.0-linux-x64/pnpm',
    '60e9225a0e34ea09a78feda05282faf5bb1feb808c16a71df3ed58a684ba6edd'],
  ['/home/warpkeep/.warpkeep/release-preparation-v1/toolchain/pnpm-v11.11.0-linux-x64/package/bin/pnpm.cjs',
    '67b035e322203961795e8e34ca63a08c37a4386eda94107fb3d28f3246d882ad'],
  ['/home/warpkeep/.warpkeep/release-preparation-v1/toolchain/pnpm-v11.11.0-linux-x64/package/bin/pnpm.mjs',
    'ff3224d46b47fbb24a7e9fe15fededef7e00892d07d4e376b6762d4899906bfd'],
  ['/home/warpkeep/.warpkeep/release-preparation-v1/toolchain/pnpm-v11.11.0-linux-x64/package/dist/pnpm.mjs',
    'e8abc02d5fbffb8f9d8817d44d6eee84c379ea8d5006dd5aa8694bb5e4428d8a'],
]);
const observed = { stdout: '', stderr: '', exitCode: 0, deployCalls: 0, recoveryCalls: 0, githubReads: [] };
let finish;
const finished = new Promise(resolve => { finish = resolve; });
const fakeProcess = {
  platform: 'linux', arch: 'x64',
  execPath: '/home/warpkeep/.warpkeep/release-preparation-v1/toolchain/node-v22.22.3-linux-x64/bin/node',
  getuid: () => 1000, getgid: () => 1000, cwd: () => repositoryRoot,
  env: {
    WARPKEEP_EXPECTED_SOURCE_COMMIT: commit, GITHUB_ACTIONS: 'true',
    GITHUB_EVENT_NAME: 'workflow_dispatch', GITHUB_REF: 'refs/heads/main',
    GITHUB_REPOSITORY: 'ael-dev3/Warpkeep', GITHUB_SHA: commit,
    GITHUB_WORKFLOW_REF: 'ael-dev3/Warpkeep/.github/workflows/notification-bridge-prepared-linux.yml@refs/heads/main',
    GITHUB_RUN_ID: '123', GITHUB_RUN_ATTEMPT: '1', GITHUB_TOKEN: 'synthetic-caller-token',
    WARPKEEP_AUTH_BRIDGE_PREPARED_INSTALLED_TOOLCHAIN_PROFILE: 'linux-x64',
    WARPKEEP_PREPARED_LINUX_INSTALLED_TOOLCHAIN_MANIFEST_SHA256: fixture.installedSha,
    WARPKEEP_PREPARED_SOURCE_CLOSURE_MANIFEST_SHA256: fixture.closureSha,
    WARPKEEP_OPERATION: fixture.operation,
  },
  stdout: { write: value => { observed.stdout += value; finish(); } },
  stderr: { write: value => { observed.stderr += value; finish(); } },
  exitCode: 0,
};
const context = createContext({
  process: fakeProcess, Buffer, TextDecoder, AbortController, setTimeout, clearTimeout,
  fetch: async url => {
    observed.githubReads.push(url);
    let value;
    if (url === 'https://api.github.com/repos/ael-dev3/Warpkeep/branches/main') {
      value = { name: 'main', protected: true, commit: { sha: commit } };
    } else if (url === 'https://api.github.com/repos/ael-dev3/Warpkeep/actions/runs/123') {
      value = { id: 123, run_attempt: 1, event: 'workflow_dispatch', status: 'in_progress',
        conclusion: null, head_branch: 'main', head_sha: commit,
        path: '.github/workflows/notification-bridge-prepared-linux.yml',
        repository: { full_name: 'ael-dev3/Warpkeep' } };
    } else throw new Error('unexpected fixture network request');
    return new Response(JSON.stringify(value), { status: 200 });
  },
});
const mocks = {
  'node:child_process': { execFileSync: (path, args) => {
    if (path !== '/usr/bin/git') throw new Error('unexpected fixture executable');
    const call = JSON.stringify(args);
    if (call === JSON.stringify(['rev-parse', '--verify', 'HEAD^{commit}'])) return commit;
    if (call === JSON.stringify(['remote', 'get-url', 'origin'])) return 'https://github.com/ael-dev3/Warpkeep';
    if (call === JSON.stringify(['status', '--porcelain=v1', '--untracked-files=all'])) return '';
    throw new Error('unexpected fixture git read');
  } },
  'node:crypto': { createHash: algorithm => {
    const chunks = [];
    return { update(value) { chunks.push(Buffer.from(value)); return this; }, digest(encoding) {
      const body = Buffer.concat(chunks);
      const tool = tools.get(body.toString('utf8'));
      return tool ?? createHash(algorithm).update(body).digest(encoding);
    } };
  } },
  'node:fs': { lstatSync: path => {
    if (!tools.has(path) && !publicBodies.has(path)) throw new Error('unexpected fixture metadata read');
    return { isFile: () => true, isSymbolicLink: () => false, nlink: 1, uid: 1000, mode: 0o600 };
  }, readFileSync: (path, encoding) => {
    const body = tools.has(path) ? Buffer.from(path) : publicBodies.get(path);
    if (body === undefined) throw new Error('unexpected fixture file read');
    return encoding === 'utf8' ? body.toString('utf8') : Buffer.from(body);
  } },
  'node:os': { userInfo: () => ({ username: 'warpkeep' }) },
  'node:path': { resolve: posix.resolve },
  './auth-bridge-notification-prepared-deploy-closure.mjs': {
    verifyAuthBridgeNotificationPreparedDeployClosure: () => ({ manifestSha256: fixture.closureSha }),
  },
  './auth-bridge-notification-prepared-installed-toolchain.mjs': {
    verifyAuthBridgeNotificationPreparedInstalledToolchain: () => ({
      profile: 'warpkeep-auth-bridge-notification-prepared-installed-toolchain-linux-x64-v1',
    }),
  },
  './verify-auth-bridge-notification-prepared-policy.mjs': {
    verifyAuthBridgeNotificationPreparedStaticPolicy: () => ({ guardedRecoveryRequired: true }),
  },
  './auth-bridge-notification-prepared-deploy.mjs': {
    runAuthBridgeNotificationPreparedDeploy: async () => {
      observed.deployCalls += 1;
      return fixture.publication;
    },
    runAuthBridgeNotificationPreparedReadOnlyRecovery: async () => {
      observed.recoveryCalls += 1;
      return fixture.recovery;
    },
  },
};
const module = new SourceTextModule(source, { context, identifier: 'file:///synthetic/runner.mjs' });
await module.link(async specifier => {
  const values = mocks[specifier];
  if (values === undefined) throw new Error('unexpected fixture module import');
  return new SyntheticModule(Object.keys(values), function() {
    for (const [name, value] of Object.entries(values)) this.setExport(name, value);
  }, { context });
});
let timer;
try {
  await module.evaluate({ timeout: 1000 });
  await Promise.race([finished, new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error('bounded runner fixture timed out')), 3000);
  })]);
  await new Promise(resolve => setImmediate(resolve));
  observed.exitCode = fakeProcess.exitCode;
  process.stdout.write(JSON.stringify(observed));
} finally { clearTimeout(timer); }
`;

function exercisePreparedLinuxRunner(publication: unknown, operation = 'deploy', recovery: unknown = {
  outcome: 'verified-read-only-recovery',
}) {
  const publicPaths = [manifestPath, installedToolchainManifestPath,
    'scripts/auth-bridge-notification-prepared-deploy-closure-v1.json'];
  const bodies = publicPaths.map(path => [path, readFileSync(path)] as const);
  const result = execFileSync(process.execPath, [
    '--experimental-vm-modules', '--input-type=module', '--eval', preparedLinuxRunnerDriver,
  ], {
    input: JSON.stringify({
      runnerPath, publication, operation, recovery,
      publicFiles: bodies.map(([path, body]) => [path, body.toString('base64')]),
      installedSha: createHash('sha256').update(bodies[1][1]).digest('hex'),
      closureSha: createHash('sha256').update(bodies[2][1]).digest('hex'),
    }),
    encoding: 'utf8', timeout: 10_000, maxBuffer: 64 * 1024, windowsHide: true,
    env: { ...process.env, NODE_OPTIONS: '', NODE_PATH: '', NODE_NO_WARNINGS: '1' },
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  return JSON.parse(result) as {
    stdout: string; stderr: string; exitCode: number;
    deployCalls: number; recoveryCalls: number; githubReads: string[];
  };
}

describe('prepared Linux deployment result consumer', () => {
  const receiptDigest = 'c'.repeat(64);
  const path = `/home/warpkeep/.warpkeep/private/production-admin-v1/bridge-prepared-receipts-v1/auth-bridge-notification-prepared-${receiptDigest}.json`;

  it.each(['installed', 'unchanged'])('accepts the actual %s receipt-publication API shape', result => {
    const observed = exercisePreparedLinuxRunner({ path, receiptDigest, result });
    expect(observed).toMatchObject({
      stdout: 'auth-bridge prepared Linux deployment verified\n', stderr: '', exitCode: 0,
      deployCalls: 1, recoveryCalls: 0,
    });
    expect(observed.githubReads).toEqual([
      'https://api.github.com/repos/ael-dev3/Warpkeep/branches/main',
      'https://api.github.com/repos/ael-dev3/Warpkeep/actions/runs/123',
    ]);
  });

  it.each([
    ['missing publication', undefined],
    ['unrelated publisher outcome', { outcome: 'published' }],
    ['relative private path', { path: 'receipt.json', receiptDigest, result: 'installed' }],
    ['foreign private directory', { path: path.replace('production-admin-v1', 'other-profile'), receiptDigest, result: 'installed' }],
    ['filename/digest disagreement', { path: path.replace(receiptDigest, 'd'.repeat(64)), receiptDigest, result: 'installed' }],
    ['invalid digest', { path, receiptDigest: 'z'.repeat(64), result: 'installed' }],
    ['unsupported publication result', { path, receiptDigest, result: 'published' }],
  ])('rejects %s without retrying the deployment', (_name, publication) => {
    const observed = exercisePreparedLinuxRunner(publication);
    expect(observed).toMatchObject({
      stdout: '', stderr: 'AUTH_BRIDGE_PREPARED_LINUX_RUNNER_DEPLOY_INVALID\n', exitCode: 1,
      deployCalls: 1, recoveryCalls: 0,
    });
    expect(observed.githubReads).toHaveLength(2);
  });

  it('retains the actual read-only recovery result contract', () => {
    expect(exercisePreparedLinuxRunner(undefined, 'recover-expired-authority-read-only')).toMatchObject({
      stdout: 'auth-bridge prepared Linux recovery verified\n', stderr: '', exitCode: 0,
      deployCalls: 0, recoveryCalls: 1,
    });
  });

  it('rejects a publication shape as a read-only recovery outcome', () => {
    expect(exercisePreparedLinuxRunner(undefined, 'recover-expired-authority-read-only', {
      path, receiptDigest, result: 'installed',
    })).toMatchObject({
      stdout: '', stderr: 'AUTH_BRIDGE_PREPARED_LINUX_RUNNER_RECOVERY_INVALID\n', exitCode: 1,
      deployCalls: 0, recoveryCalls: 1,
    });
  });
});
