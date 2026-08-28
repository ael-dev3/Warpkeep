// @vitest-environment node

import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  chmodSync,
  cpSync,
  linkSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  symlinkSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

import { afterEach, describe, expect, it } from 'vitest';
import { parse } from 'yaml';

import {
  AUTH_BRIDGE_NOTIFICATION_PREPARED_DEPLOY_CLOSURE_MANIFEST_PATH,
  AUTH_BRIDGE_NOTIFICATION_PREPARED_DEPLOY_CLOSURE_MEMBER_PATHS,
  verifyAuthBridgeNotificationPreparedDeployClosure,
} from '../scripts/auth-bridge-notification-prepared-deploy-closure.mjs';
import {
  deriveAuthBridgeNotificationPreparedDeployClosurePaths,
  verifyAuthBridgeNotificationPreparedDeployClosurePolicy,
} from '../scripts/auth-bridge-notification-prepared-deploy-closure-policy.mjs';
import {
  AUTH_BRIDGE_NOTIFICATION_PREPARED_INSTALLED_TOOLCHAIN_MANIFEST_PATH,
  assertAuthBridgeNotificationPreparedInstalledToolchainAuthority,
  createAuthBridgeNotificationPreparedInstalledToolchainCandidate,
  verifyAuthBridgeNotificationPreparedInstalledToolchain,
} from '../scripts/auth-bridge-notification-prepared-installed-toolchain.mjs';
import {
  verifyAuthBridgeNotificationPreparedUploadBoundarySources,
  verifyAuthBridgeNotificationPreparedStaticPolicy,
} from '../scripts/verify-auth-bridge-notification-prepared-policy.mjs';
import {
  AUTH_BRIDGE_RELEASE_TRANSITION_FIXTURE_PATHS,
  canonicalAuthBridgeReleaseTransitionFixtureSource,
} from './helpers/authBridgeReleaseTransitionFixture';

const repositoryRoot = process.cwd();
const workflowPath = resolve(
  repositoryRoot,
  '.github/workflows/notification-bridge-prepared.yml',
);
const pagesWorkflowPath = resolve(
  repositoryRoot,
  '.github/workflows/deploy-pages.yml',
);
const bootstrapPinFiles = Object.freeze({
  WARPKEEP_PREPARED_SOURCE_CLOSURE_VERIFIER_SHA256:
    'scripts/auth-bridge-notification-prepared-deploy-closure.mjs',
  WARPKEEP_PREPARED_SOURCE_CLOSURE_MANIFEST_SHA256:
    'scripts/auth-bridge-notification-prepared-deploy-closure-v1.json',
  WARPKEEP_PREPARED_INSTALLED_TOOLCHAIN_VERIFIER_SHA256:
    'scripts/auth-bridge-notification-prepared-installed-toolchain.mjs',
  WARPKEEP_PREPARED_INSTALLED_TOOLCHAIN_MANIFEST_SHA256:
    'scripts/auth-bridge-notification-prepared-installed-toolchain-darwin-arm64-v1.json',
});
const pagesBootstrapPinFiles = Object.freeze({
  ...bootstrapPinFiles,
  WARPKEEP_NOTIFICATION_PAGES_PROTECTED_DEPLOY_LAUNCHER_SHA256:
    'scripts/notification-pages-private-deploy-launcher.mjs',
});
const ZERO_SHA256 = '0'.repeat(64);
const RELEASE_TRANSITION_PATHS = AUTH_BRIDGE_RELEASE_TRANSITION_FIXTURE_PATHS;
const BOOTSTRAP_PROJECTION_PATHS = new Set([
  '.github/workflows/deploy-pages.yml',
  '.github/workflows/notification-bridge-b0.yml',
  '.github/workflows/notification-bridge-prepared.yml',
]);
const RETAINED_TYPE_ONLY_DECLARATION_PATHS = Object.freeze([
  'scripts/production-player-canary-activation-launcher.d.mts',
  'scripts/production-player-canary-browser-launcher.d.mts',
  'scripts/production-player-canary-release-binding.d.mts',
]);
const temporaryDirectories: string[] = [];

interface PreparedRuntimeBoundarySources {
  adapterSource: string;
  journalSource: string;
  runtimeSource: string;
}

function preparedRuntimeBoundarySources(): PreparedRuntimeBoundarySources {
  return {
    adapterSource: readFileSync(resolve(
      repositoryRoot,
      'scripts/auth-bridge-notification-prepared-deploy-adapter.mjs',
    ), 'utf8'),
    journalSource: readFileSync(resolve(
      repositoryRoot,
      'scripts/auth-bridge-notification-prepared-deploy-journal.mjs',
    ), 'utf8'),
    runtimeSource: readFileSync(resolve(
      repositoryRoot,
      'scripts/auth-bridge-notification-prepared-cloudflare-runtime.mjs',
    ), 'utf8'),
  };
}

function mutatePreparedBoundarySource(
  sources: PreparedRuntimeBoundarySources,
  source: keyof PreparedRuntimeBoundarySources,
  before: string,
  after: string,
): void {
  expect(sources[source].split(before)).toHaveLength(2);
  sources[source] = sources[source].replace(before, after);
}

function mutatePreparedRuntimeSource(
  sources: PreparedRuntimeBoundarySources,
  before: string,
  after: string,
): void {
  mutatePreparedBoundarySource(sources, 'runtimeSource', before, after);
}

function mutatePreparedAdapterSource(
  sources: PreparedRuntimeBoundarySources,
  before: string,
  after: string,
): void {
  mutatePreparedBoundarySource(sources, 'adapterSource', before, after);
}

function mutatePreparedJournalSource(
  sources: PreparedRuntimeBoundarySources,
  before: string,
  after: string,
): void {
  mutatePreparedBoundarySource(sources, 'journalSource', before, after);
}

interface WorkflowStep {
  name?: string;
  id?: string;
  if?: string;
  ['continue-on-error']?: boolean;
  env?: Record<string, string>;
  run?: string;
  uses?: string;
  with?: Record<string, string>;
}

interface WorkflowJob {
  environment?: { name?: string };
  env?: Record<string, string>;
  permissions?: Record<string, string>;
  ['runs-on']?: string[];
  ['timeout-minutes']?: number;
  steps?: WorkflowStep[];
}

function workflow(): string {
  return readFileSync(workflowPath, 'utf8');
}

function pagesWorkflow(): string {
  return readFileSync(pagesWorkflowPath, 'utf8');
}

function workflowDocument(): {
  on?: Record<string, unknown>;
  permissions?: Record<string, string>;
  concurrency?: Record<string, unknown>;
  jobs?: Record<string, WorkflowJob>;
} {
  return parse(workflow());
}

function preparedJob(): WorkflowJob {
  const job = workflowDocument().jobs?.['notification-bridge-prepared'];
  if (job === undefined) throw new Error('prepared workflow job missing');
  return job;
}

function step(id: string): WorkflowStep {
  const value = preparedJob().steps?.find(candidate => candidate.id === id);
  if (value === undefined) throw new Error(`workflow step ${id} missing`);
  return value;
}

function sourceClosureDigestProfile(relativePath: string): string {
  const release = RELEASE_TRANSITION_PATHS.has(relativePath);
  const bootstrap = BOOTSTRAP_PROJECTION_PATHS.has(relativePath);
  if (release && bootstrap) {
    return 'reviewed-release-transition-plus-bootstrap-pin-projection-sha256-v1';
  }
  if (release) return 'reviewed-release-transition-projection-sha256-v1';
  if (bootstrap) return 'bootstrap-pin-projection-sha256-v1';
  return 'raw-file-sha256-v1';
}

function canonicalFixtureMember(relativePath: string, source: Buffer): Buffer {
  const original = source.toString('utf8');
  let canonical = canonicalAuthBridgeReleaseTransitionFixtureSource(
    relativePath,
    original,
  );
  if (!BOOTSTRAP_PROJECTION_PATHS.has(relativePath)) {
    return canonical === original ? source : Buffer.from(canonical, 'utf8');
  }
  const names = relativePath === '.github/workflows/deploy-pages.yml'
    ? Object.keys(pagesBootstrapPinFiles)
    : Object.keys(bootstrapPinFiles);
  const indentation = relativePath === '.github/workflows/deploy-pages.yml'
    ? '  '
    : '      ';
  for (const name of names) {
    const pattern = new RegExp(
      `^${indentation}${name}: '[a-f0-9]{64}'$`,
      'gmu',
    );
    if ([...canonical.matchAll(pattern)].length !== 1) {
      throw new Error(`fixture bootstrap pin ${name} was not exact`);
    }
    canonical = canonical.replace(
      pattern,
      `${indentation}${name}: '${ZERO_SHA256}'`,
    );
  }
  return Buffer.from(canonical, 'utf8');
}

function createPolicyFixture(): string {
  const root = realpathSync(mkdtempSync(join(
    tmpdir(),
    'warpkeep-prepared-policy-',
  )));
  temporaryDirectories.push(root);
  const copyTracked = (path: string): void => {
    const destination = resolve(root, path);
    mkdirSync(dirname(destination), { recursive: true });
    cpSync(resolve(repositoryRoot, path), destination, { recursive: true });
  };
  for (const path of AUTH_BRIDGE_NOTIFICATION_PREPARED_DEPLOY_CLOSURE_MEMBER_PATHS) {
    copyTracked(path);
  }
  for (const path of RETAINED_TYPE_ONLY_DECLARATION_PATHS) {
    copyTracked(path);
  }
  for (const path of [
    'scripts/auth-bridge-notification-prepared-cloudflare-runtime.mjs',
    'scripts/auth-bridge-notification-prepared-deploy-adapter.mjs',
    'scripts/auth-bridge-notification-prepared-deploy-journal.mjs',
    'scripts/notification-pages-build-release-validator.mjs',
    'scripts/notification-pages-deploy-lane.mjs',
    'scripts/notification-pages-private-deploy-launcher.mjs',
  ]) copyTracked(path);
  const pending = [
    'scripts/auth-bridge-notification-prepared-deploy.mjs',
    'scripts/auth-bridge-notification-prepared-cloudflare-runtime.mjs',
    'scripts/auth-bridge-notification-prepared-deploy-adapter.mjs',
    'scripts/auth-bridge-notification-prepared-deploy-closure.mjs',
    'scripts/auth-bridge-notification-prepared-deploy-journal.mjs',
    'scripts/notification-pages-build-release-validator.mjs',
    'scripts/notification-pages-deploy-lane.mjs',
    'scripts/notification-pages-private-deploy-launcher.mjs',
  ];
  const seen = new Set<string>();
  while (pending.length > 0) {
    const path = pending.shift();
    if (path === undefined || seen.has(path)) continue;
    seen.add(path);
    copyTracked(path);
    const source = readFileSync(resolve(repositoryRoot, path), 'utf8');
    for (const match of source.matchAll(/['"](\.\.?\/[^'"]+)['"]/gu)) {
      const base = resolve(repositoryRoot, dirname(path), match[1]);
      for (const candidate of [base, `${base}.mjs`, `${base}.mts`, `${base}.ts`]) {
        try {
          readFileSync(candidate);
          const relativePath = candidate.slice(repositoryRoot.length + 1);
          copyTracked(relativePath);
          if (relativePath.endsWith('.mjs')) pending.push(relativePath);
          break;
        } catch { /* Non-source literal or alternate suffix. */ }
      }
    }
  }
  for (const relativePath of RELEASE_TRANSITION_PATHS) {
    const path = resolve(root, relativePath);
    writeFileSync(
      path,
      canonicalAuthBridgeReleaseTransitionFixtureSource(
        relativePath,
        readFileSync(path, 'utf8'),
      ),
    );
  }
  const manifest = {
    schemaVersion: 2,
    profile: 'warpkeep-auth-bridge-notification-prepared-deploy-closure-v1',
    members: AUTH_BRIDGE_NOTIFICATION_PREPARED_DEPLOY_CLOSURE_MEMBER_PATHS.map(
      relativePath => {
        const body = readFileSync(resolve(root, relativePath));
        const canonical = canonicalFixtureMember(relativePath, body);
        try {
          return {
            path: relativePath,
            digestProfile: sourceClosureDigestProfile(relativePath),
            sha256: createHash('sha256').update(canonical).digest('hex'),
          };
        } finally {
          if (canonical !== body) canonical.fill(0);
          body.fill(0);
        }
      },
    ),
  };
  const manifestPath = resolve(
    root,
    AUTH_BRIDGE_NOTIFICATION_PREPARED_DEPLOY_CLOSURE_MANIFEST_PATH,
  );
  mkdirSync(dirname(manifestPath), { recursive: true });
  writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  const allPins = new Map(Object.entries(pagesBootstrapPinFiles).map(
    ([name, relativePath]) => [name, createHash('sha256')
      .update(readFileSync(relativePath ===
        AUTH_BRIDGE_NOTIFICATION_PREPARED_DEPLOY_CLOSURE_MANIFEST_PATH
        ? manifestPath
        : resolve(root, relativePath)))
      .digest('hex')],
  ));
  for (const [relativePath, names, indentation] of [
    [
      '.github/workflows/notification-bridge-b0.yml',
      Object.keys(bootstrapPinFiles),
      '      ',
    ],
    [
      '.github/workflows/notification-bridge-prepared.yml',
      Object.keys(bootstrapPinFiles),
      '      ',
    ],
    [
      '.github/workflows/deploy-pages.yml',
      Object.keys(pagesBootstrapPinFiles),
      '  ',
    ],
  ] as const) {
    const path = resolve(root, relativePath);
    let source = readFileSync(path, 'utf8');
    for (const name of names) {
      const current = source.match(new RegExp(
        `^${indentation}${name}: '([a-f0-9]{64})'$`,
        'mu',
      ))?.[1];
      const expected = allPins.get(name);
      if (current === undefined || expected === undefined) {
        throw new Error(`fixture bootstrap pin ${name} was unavailable`);
      }
      source = source.replace(current, expected);
    }
    writeFileSync(path, source);
  }
  return root;
}

function mutatePreparedClosureMember(
  root: string,
  relativePath: string,
  before: string,
  after: string,
): void {
  const path = resolve(
    root,
    relativePath,
  );
  const source = readFileSync(path, 'utf8');
  expect(source.split(before)).toHaveLength(2);
  writeFileSync(path, source.replace(before, after));

  const manifestPath = resolve(
    root,
    AUTH_BRIDGE_NOTIFICATION_PREPARED_DEPLOY_CLOSURE_MANIFEST_PATH,
  );
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as {
    schemaVersion: number;
    profile: string;
    members: Array<{ path: string; digestProfile: string; sha256: string }>;
  };
  const member = manifest.members.find(candidate => candidate.path === relativePath);
  expect(member?.digestProfile).toBe('raw-file-sha256-v1');
  member!.sha256 = createHash('sha256').update(readFileSync(path)).digest('hex');
  writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);

  const manifestDigest = createHash('sha256')
    .update(readFileSync(manifestPath))
    .digest('hex');
  for (const [workflowRelativePath, indentation] of [
    ['.github/workflows/notification-bridge-b0.yml', '      '],
    ['.github/workflows/notification-bridge-prepared.yml', '      '],
    ['.github/workflows/deploy-pages.yml', '  '],
  ] as const) {
    const workflowFixturePath = resolve(root, workflowRelativePath);
    const workflowSource = readFileSync(workflowFixturePath, 'utf8');
    const pin = new RegExp(
      `^${indentation}WARPKEEP_PREPARED_SOURCE_CLOSURE_MANIFEST_SHA256: '[a-f0-9]{64}'$`,
      'mu',
    );
    expect([...workflowSource.matchAll(new RegExp(pin.source, 'gmu'))]).toHaveLength(1);
    writeFileSync(
      workflowFixturePath,
      workflowSource.replace(
        pin,
        `${indentation}WARPKEEP_PREPARED_SOURCE_CLOSURE_MANIFEST_SHA256: '${manifestDigest}'`,
      ),
    );
  }
}

function mutatePreparedRuntime(
  root: string,
  before: string,
  after: string,
): void {
  mutatePreparedClosureMember(
    root,
    'scripts/auth-bridge-notification-prepared-cloudflare-runtime.mjs',
    before,
    after,
  );
}

const fixtureWranglerTarget =
  '.pnpm/wrangler@4.110.0_@cloudflare+workers-types@5.20260708.1_@types+node@26.1.1/node_modules/wrangler';
const fixtureExecutablePaths = {
  esbuild:
    '.pnpm/@esbuild+darwin-arm64@0.28.1/node_modules/@esbuild/darwin-arm64/bin/esbuild',
  typescript:
    '.pnpm/@typescript+typescript-darwin-arm64@7.0.2/node_modules/@typescript/typescript-darwin-arm64/lib/tsc',
  workerd:
    '.pnpm/@cloudflare+workerd-darwin-arm64@1.20260708.1/node_modules/@cloudflare/workerd-darwin-arm64/bin/workerd',
  wrangler: `${fixtureWranglerTarget}/bin/wrangler.js`,
} as const;

function createInstalledToolchainFixture(): Readonly<{
  root: string;
  nodeModules: string;
  executables: typeof fixtureExecutablePaths;
}> {
  const root = realpathSync(mkdtempSync(join(
    tmpdir(),
    'warpkeep-prepared-toolchain-',
  )));
  temporaryDirectories.push(root);
  const service = resolve(root, 'services/auth-bridge');
  const nodeModules = resolve(service, 'node_modules');
  const virtualStore = resolve(nodeModules, '.pnpm');
  const lockfile = "lockfileVersion: '9.0'\n";
  mkdirSync(virtualStore, { recursive: true });
  writeFileSync(resolve(service, 'pnpm-lock.yaml'), lockfile);
  writeFileSync(resolve(virtualStore, 'lock.yaml'), lockfile);
  for (const [name, relativePath] of Object.entries(fixtureExecutablePaths)) {
    const path = resolve(nodeModules, relativePath);
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, `#!/bin/sh\n# ${name}\n`);
    chmodSync(path, 0o755);
  }
  const wranglerPackage = resolve(nodeModules, fixtureWranglerTarget, 'package.json');
  writeFileSync(wranglerPackage, `${JSON.stringify({
    name: 'wrangler',
    version: '4.110.0',
  })}\n`);
  const typescriptTarget = resolve(
    virtualStore,
    'typescript@7.0.2/node_modules/typescript',
  );
  mkdirSync(typescriptTarget, { recursive: true });
  writeFileSync(resolve(typescriptTarget, 'package.json'), '{"name":"typescript"}\n');
  const yamlTarget = resolve(virtualStore, 'yaml@2.9.0/node_modules/yaml');
  mkdirSync(yamlTarget, { recursive: true });
  writeFileSync(resolve(yamlTarget, 'package.json'), '{"name":"yaml"}\n');
  const viemTarget = resolve(virtualStore, 'viem@fixture/node_modules/viem');
  mkdirSync(viemTarget, { recursive: true });
  writeFileSync(resolve(viemTarget, 'package.json'), '{"name":"viem"}\n');
  const farcasterTarget = resolve(
    virtualStore,
    '@farcaster+auth-client@fixture/node_modules/@farcaster/auth-client',
  );
  mkdirSync(farcasterTarget, { recursive: true });
  writeFileSync(
    resolve(farcasterTarget, 'package.json'),
    '{"name":"@farcaster/auth-client"}\n',
  );
  symlinkSync(
    '.pnpm/typescript@7.0.2/node_modules/typescript',
    resolve(nodeModules, 'typescript'),
  );
  symlinkSync('.pnpm/viem@fixture/node_modules/viem', resolve(nodeModules, 'viem'));
  mkdirSync(resolve(nodeModules, '@farcaster'));
  symlinkSync(
    '../.pnpm/@farcaster+auth-client@fixture/node_modules/@farcaster/auth-client',
    resolve(nodeModules, '@farcaster/auth-client'),
  );
  symlinkSync(fixtureWranglerTarget, resolve(nodeModules, 'wrangler'));
  symlinkSync('.pnpm/yaml@2.9.0/node_modules/yaml', resolve(nodeModules, 'yaml'));
  symlinkSync('lock.yaml', resolve(virtualStore, 'reviewed-lock-link'));
  const shim = resolve(virtualStore, 'node_modules/.bin/wrangler');
  mkdirSync(dirname(shim), { recursive: true });
  writeFileSync(
    shim,
    `#!/bin/sh\nexec ${service}/node_modules/wrangler/bin/wrangler.js "$@"\n`,
  );
  chmodSync(shim, 0o755);
  const resolverShim = resolve(nodeModules, '.bin/wrangler');
  mkdirSync(dirname(resolverShim), { recursive: true });
  writeFileSync(
    resolverShim,
    `#!/bin/sh\nexec ${service}/node_modules/wrangler/bin/wrangler.js "$@"\n`,
  );
  chmodSync(resolverShim, 0o755);
  writeFileSync(
    resolve(nodeModules, '.pnpm-workspace-state-v1.json'),
    `${JSON.stringify({
      lastValidatedTimestamp: 1_787_222_861_637,
      projects: {
        [service]: {
          name: '@warpkeep/auth-bridge',
          version: '0.1.0',
        },
      },
      pnpmfiles: [],
      settings: {
        nodeLinker: 'isolated',
      },
      filteredInstall: false,
    }, null, 2)}\n`,
  );

  const candidate = createAuthBridgeNotificationPreparedInstalledToolchainCandidate({
    repositoryRoot: root,
  });
  const installedManifest = resolve(
    root,
    AUTH_BRIDGE_NOTIFICATION_PREPARED_INSTALLED_TOOLCHAIN_MANIFEST_PATH,
  );
  mkdirSync(dirname(installedManifest), { recursive: true });
  writeFileSync(installedManifest, `${JSON.stringify(candidate, null, 2)}\n`);
  const sourceManifest = {
    schemaVersion: 2,
    profile: 'warpkeep-auth-bridge-notification-prepared-deploy-closure-v1',
    members: [
      {
        path: '.github/workflows/deploy-pages.yml',
        digestProfile:
          'reviewed-release-transition-plus-bootstrap-pin-projection-sha256-v1',
        sha256: '1'.repeat(64),
      },
      {
        path: '.github/workflows/notification-bridge-prepared.yml',
        digestProfile: 'bootstrap-pin-projection-sha256-v1',
        sha256: '2'.repeat(64),
      },
      {
        path: 'package.json',
        digestProfile: 'reviewed-release-transition-projection-sha256-v1',
        sha256: '3'.repeat(64),
      },
      {
        path: AUTH_BRIDGE_NOTIFICATION_PREPARED_INSTALLED_TOOLCHAIN_MANIFEST_PATH,
        digestProfile: 'raw-file-sha256-v1',
        sha256: createHash('sha256')
          .update(readFileSync(installedManifest))
          .digest('hex'),
      },
      {
        path: 'services/auth-bridge/pnpm-lock.yaml',
        digestProfile: 'raw-file-sha256-v1',
        sha256: createHash('sha256').update(lockfile).digest('hex'),
      },
    ],
  };
  writeFileSync(
    resolve(root, AUTH_BRIDGE_NOTIFICATION_PREPARED_DEPLOY_CLOSURE_MANIFEST_PATH),
    `${JSON.stringify(sourceManifest, null, 2)}\n`,
  );
  return Object.freeze({ root, nodeModules, executables: fixtureExecutablePaths });
}

function verifyInstalledToolchainFixture(fixture: Readonly<{
  root: string;
  nodeModules: string;
}>): unknown {
  return verifyAuthBridgeNotificationPreparedInstalledToolchain({
    repositoryRoot: fixture.root,
    nodeExecutable: process.execPath,
    wranglerEntrypoint: resolve(
      fixture.nodeModules,
      'wrangler/bin/wrangler.js',
    ),
  });
}

function runnerIdentityFromStagedNode(
  fixture: Readonly<{ root: string; nodeModules: string }>,
  name: string,
): string {
  const stagedRoot = resolve(fixture.root, name);
  const stagedNode = resolve(stagedRoot, 'bin/node');
  mkdirSync(dirname(stagedNode), { recursive: true });
  cpSync(process.execPath, stagedNode);
  try {
    const libnode = `libnode.${process.versions.modules}.dylib`;
    const source = resolve(dirname(dirname(process.execPath)), 'lib', libnode);
    const destination = resolve(stagedRoot, 'lib', libnode);
    mkdirSync(dirname(destination), { recursive: true });
    cpSync(source, destination);
  } catch {
    // Official release Nodes are self-contained; Homebrew Nodes need libnode.
  }
  chmodSync(stagedNode, 0o755);
  const moduleUrl = pathToFileURL(resolve(
    repositoryRoot,
    'scripts/auth-bridge-notification-prepared-installed-toolchain.mjs',
  )).href;
  const source = `
    import { verifyAuthBridgeNotificationPreparedInstalledToolchain as verify }
      from ${JSON.stringify(moduleUrl)};
    const authority = verify({
      repositoryRoot: ${JSON.stringify(fixture.root)},
      nodeExecutable: process.execPath,
      wranglerEntrypoint: ${JSON.stringify(resolve(
        fixture.nodeModules,
        'wrangler/bin/wrangler.js',
      ))},
    });
    process.stdout.write(authority.runnerIdentityDigest);
  `;
  const result = spawnSync(stagedNode, ['--input-type=module', '--eval', source], {
    cwd: fixture.root,
    encoding: 'utf8',
    env: { LANG: 'C', LC_ALL: 'C', PATH: '/usr/bin:/bin' },
    stdio: ['ignore', 'pipe', 'pipe'],
    timeout: 30_000,
  });
  if (result.status !== 0 || !/^[a-f0-9]{64}$/u.test(result.stdout)) {
    throw new Error(`staged Node verifier failed: ${result.stderr}`);
  }
  return result.stdout;
}

function runFixtureGit(root: string, args: string[]): string {
  const result = spawnSync(
    '/usr/bin/git',
    ['-c', 'core.fsmonitor=false', '-c', 'core.untrackedCache=false', ...args],
    {
      cwd: root,
      encoding: 'utf8',
      env: { LANG: 'C', LC_ALL: 'C', PATH: '/usr/bin:/bin' },
      stdio: ['ignore', 'pipe', 'pipe'],
    },
  );
  if (result.status !== 0) {
    throw new Error(`fixture git failed: ${result.stderr}`);
  }
  return result.stdout;
}

afterEach(() => {
  for (const path of temporaryDirectories.splice(0)) {
    rmSync(path, { recursive: true, force: true });
  }
});

describe('notification-bridge-prepared protected workflow', () => {
  it('is manual-only, protected, bounded, and selects only the dedicated persistent runner', () => {
    const source = workflow();
    const document = workflowDocument();
    const job = preparedJob();
    expect(Object.keys(document.on ?? {})).toEqual(['workflow_dispatch']);
    expect(document.permissions).toEqual({ actions: 'read', contents: 'read' });
    expect(document.concurrency).toEqual({
      group: 'notification-bridge-prepared',
      'cancel-in-progress': false,
    });
    expect(job.environment?.name).toBe('notification-bridge-prepared');
    expect(job['runs-on']).toEqual([
      'self-hosted',
      'macOS',
      'ARM64',
      'warpkeep-production-admin',
      'warpkeep-repository-exclusive',
    ]);
    expect(job['timeout-minutes']).toBe(45);
    expect(job.permissions).toEqual({ actions: 'read', contents: 'read' });
    expect(source).not.toMatch(/^\s+runs-on:\s+(?:ubuntu|windows)-/mu);
    expect(source).not.toMatch(/^\s+(?:push|pull_request|workflow_run|schedule):/mu);
  });

  it('binds dispatch, checkout, and both mutations to exact current protected main', () => {
    const source = workflow();
    expect(source).toContain("GITHUB_REPOSITORY\" != 'ael-dev3/Warpkeep'");
    expect(source).toContain("GITHUB_EVENT_NAME\" != 'workflow_dispatch'");
    expect(source).toContain("GITHUB_REF\" != 'refs/heads/main'");
    expect(source).toContain(
      'GITHUB_SHA\" != \"$WARPKEEP_EXPECTED_SOURCE_COMMIT',
    );
    expect(source).toContain(
      'gh api "repos/ael-dev3/Warpkeep/branches/main"',
    );
    expect(source).toContain(
      "--jq 'select(.protected == true) | .commit.sha'",
    );
    expect(source).toContain('ref: ${{ inputs.source_commit }}');
    expect(source).toContain('persist-credentials: false');
    expect(source).toContain('clean: true');
    expect(source).toContain('fetch-depth: 1');
    expect(source).toContain(
      "origin_url\" != 'https://github.com/ael-dev3/Warpkeep'",
    );
    expect(source).toContain('"${git_safe[@]}" symbolic-ref -q HEAD');
    for (const exact of [
      'git_safe=(/usr/bin/git -c core.fsmonitor=false -c core.untrackedCache=false)',
      'tracked_entries="$("${git_safe[@]}" ls-files -v)"',
      '"${git_safe[@]}" diff-index --quiet --cached HEAD --',
      '"${git_safe[@]}" diff-files --quiet --',
      '"${git_safe[@]}" diff --no-ext-diff --no-textconv --exit-code HEAD --',
      '/usr/bin/shasum -a 256 -- "$path"',
    ]) expect(source.split(exact)).toHaveLength(3);

    const entrypoint = readFileSync(resolve(
      repositoryRoot,
      'scripts/auth-bridge-notification-prepared-deploy.mjs',
    ), 'utf8');
    expect(entrypoint).toContain(
      'createAuthBridgeNotificationPreparedGithubWritePermit({',
    );
    expect(entrypoint).toContain(
      'withAuthBridgeNotificationPreparedDeployJournal({',
    );
    expect(entrypoint).toContain(
      'prepareAndWriteAuthBridgeNotificationPreparedReceipt({',
    );
    expect(entrypoint).toContain(
      'const WORKFLOW_REF = `${REPOSITORY}/${WORKFLOW_PATH}@refs/heads/main`;',
    );
  });

  it('pins the builtins-only A/B bootstrap bytes in the protected workflow', () => {
    const source = workflow();
    const jobEnvironment = preparedJob().env ?? {};
    for (const [name, path] of Object.entries(bootstrapPinFiles)) {
      const expected = createHash('sha256')
        .update(readFileSync(resolve(repositoryRoot, path)))
        .digest('hex');
      expect(jobEnvironment[name], name).toBe(expected);
      expect(source.match(new RegExp(
        `^      ${name}: '[a-f0-9]{64}'$`,
        'gmu',
      )), name).toHaveLength(1);
      expect(source.split(`verify_bootstrap_digest "$${name}"`), name)
        .toHaveLength(3);
    }
    const lastBootstrapIndex = source.lastIndexOf(
      'verify_bootstrap_digest "$WARPKEEP_PREPARED_INSTALLED_TOOLCHAIN_MANIFEST_SHA256"',
    );
    expect(lastBootstrapIndex).toBeGreaterThan(source.indexOf(
      'pnpm --dir services/auth-bridge install --frozen-lockfile --ignore-scripts --package-import-method=copy',
    ));
    expect(lastBootstrapIndex).toBeLessThan(source.indexOf(
      'node scripts/auth-bridge-notification-prepared-deploy-closure.mjs',
    ));
  });

  it('pins and orders the Pages A/B/launcher bootstrap before private execution', () => {
    const source = pagesWorkflow();
    const document = parse(source) as {
      env?: Record<string, string>;
      jobs?: Record<string, WorkflowJob>;
    };
    for (const [name, path] of Object.entries(pagesBootstrapPinFiles)) {
      const expected = createHash('sha256')
        .update(readFileSync(resolve(repositoryRoot, path)))
        .digest('hex');
      expect(document.env?.[name], name).toBe(expected);
      expect(source.match(new RegExp(
        `^  ${name}: '[a-f0-9]{64}'$`,
        'gmu',
      )), name).toHaveLength(1);
      expect(source.split(`verify_bootstrap_digest "$${name}"`), name)
        .toHaveLength(4);
    }
    const installIndex = source.indexOf(
      'pnpm --dir services/auth-bridge install',
    );
    const postInstallPinIndex = source.indexOf(
      'verify_bootstrap_digest "$WARPKEEP_NOTIFICATION_PAGES_PROTECTED_DEPLOY_LAUNCHER_SHA256"',
      installIndex,
    );
    const toolchainLaunchIndex = source.indexOf(
      'attest-toolchain',
      postInstallPinIndex,
    );
    const deployPinIndex = source.lastIndexOf(
      'verify_bootstrap_digest "$WARPKEEP_NOTIFICATION_PAGES_PROTECTED_DEPLOY_LAUNCHER_SHA256"',
      source.indexOf('- name: Retire only a proven-skipped prior deployment invocation'),
    );
    const operatorLaunchIndex = source.indexOf(
      'recover-skipped-invocation',
      deployPinIndex,
    );
    expect(installIndex).toBeGreaterThan(0);
    expect(postInstallPinIndex).toBeGreaterThan(installIndex);
    expect(toolchainLaunchIndex).toBeGreaterThan(postInstallPinIndex);
    expect(deployPinIndex).toBeGreaterThan(toolchainLaunchIndex);
    expect(operatorLaunchIndex).toBeGreaterThan(deployPinIndex);
    expect(source.match(/NOTIFICATION_PAGES_PRIVATE_HIDDEN_INDEX_STATE_INVALID/gu))
      .toHaveLength(3);
    expect(source.match(/diff-index --quiet --cached HEAD --/gu)).toHaveLength(3);
    expect(source.match(/diff-files --quiet --/gu)).toHaveLength(3);
    expect(document.jobs?.['private-toolchain']?.['runs-on']).toEqual([
      'self-hosted', 'macOS', 'ARM64', 'warpkeep-production-admin',
      'warpkeep-repository-exclusive',
    ]);
    expect(document.jobs?.['private-deploy']?.['runs-on']).toEqual([
      'self-hosted', 'macOS', 'ARM64', 'warpkeep-production-admin',
      'warpkeep-repository-exclusive',
    ]);
  });

  it('pins Node for both full root security-suite jobs', () => {
    const fullRootSuiteCommands = new Set([
      'npm test -- --maxWorkers=2',
      [
        'npm test -- \\',
        '  --exclude tests/authBridgeNotificationPreparedWorkflow.test.ts \\',
        '  --exclude tests/productionPlayerCanaryClosure.test.ts \\',
        '  --maxWorkers=2',
        'npm test -- \\',
        '  tests/authBridgeNotificationPreparedWorkflow.test.ts \\',
        '  tests/productionPlayerCanaryClosure.test.ts \\',
        '  --maxWorkers=1 \\',
        '  --testTimeout=180000',
        '',
      ].join('\n'),
    ]);
    const verifyDocument = parse(readFileSync(
      resolve(repositoryRoot, '.github/workflows/verify.yml'),
      'utf8',
    )) as { jobs?: Record<string, WorkflowJob> };
    const pagesDocument = parse(pagesWorkflow()) as {
      jobs?: Record<string, WorkflowJob>;
    };
    const documents = [verifyDocument, pagesDocument];
    const fullSuiteJobs = documents.flatMap(document => (
      Object.values(document.jobs ?? {}).filter(job => job.steps?.some(
        candidate => fullRootSuiteCommands.has(candidate.run ?? ''),
      ))
    ));
    expect(fullSuiteJobs).toHaveLength(2);
    for (const job of fullSuiteJobs) {
      const setup = job.steps?.find(candidate => (
        candidate.uses
          === 'actions/setup-node@820762786026740c76f36085b0efc47a31fe5020'
      ));
      expect(setup).toMatchObject({
        with: { 'node-version': '22.22.3' },
      });
    }
  });

  it('detects hidden index flags and direct worktree drift that status can hide', () => {
    const root = realpathSync(mkdtempSync(join(
      tmpdir(),
      'warpkeep-prepared-git-guard-',
    )));
    temporaryDirectories.push(root);
    runFixtureGit(root, ['init', '--quiet']);
    runFixtureGit(root, ['config', 'user.name', 'Warpkeep Test']);
    runFixtureGit(root, ['config', 'user.email', 'warpkeep@example.invalid']);
    const tracked = resolve(root, 'tracked.txt');
    writeFileSync(tracked, 'reviewed\n');
    runFixtureGit(root, ['add', '--', 'tracked.txt']);
    runFixtureGit(root, ['commit', '--quiet', '-m', 'fixture']);

    runFixtureGit(root, ['update-index', '--assume-unchanged', '--', 'tracked.txt']);
    writeFileSync(tracked, 'mutated\n');
    expect(runFixtureGit(
      root,
      ['status', '--porcelain=v1', '--untracked-files=all'],
    )).toBe('');
    expect(runFixtureGit(root, ['ls-files', '-v'])).toMatch(/^h tracked\.txt\n$/u);

    runFixtureGit(root, ['update-index', '--no-assume-unchanged', '--', 'tracked.txt']);
    writeFileSync(tracked, 'reviewed\n');
    runFixtureGit(root, ['update-index', '--skip-worktree', '--', 'tracked.txt']);
    writeFileSync(tracked, 'mutated\n');
    expect(runFixtureGit(
      root,
      ['status', '--porcelain=v1', '--untracked-files=all'],
    )).toBe('');
    expect(runFixtureGit(root, ['ls-files', '-v'])).toMatch(/^S tracked\.txt\n$/u);

    runFixtureGit(root, ['update-index', '--no-skip-worktree', '--', 'tracked.txt']);
    writeFileSync(tracked, 'reviewed\n');
    expect(runFixtureGit(root, ['diff', '--no-ext-diff', '--no-textconv',
      '--exit-code', 'HEAD', '--'])).toBe('');
    writeFileSync(tracked, 'mutated\n');
    const drift = spawnSync(
      '/usr/bin/git',
      ['-c', 'core.fsmonitor=false', '-c', 'core.untrackedCache=false',
        'diff', '--no-ext-diff', '--no-textconv', '--exit-code', 'HEAD', '--'],
      { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] },
    );
    expect(drift.status).toBe(1);
  });

  it('expresses only bridge preparation while Hermes, Pages, and checked flags stay inert', () => {
    const source = workflow();
    const pages = readFileSync(
      resolve(repositoryRoot, '.github/workflows/deploy-pages.yml'),
      'utf8',
    );
    expect(source).toContain(
      "WARPKEEP_BRIDGE_NOTIFICATION_DELIVERY_ENABLED: 'true'",
    );
    expect(source).toContain(
      "WARPKEEP_HERMES_EXECUTION_APPROVED: 'false'",
    );
    expect(source).toContain(
      "WARPKEEP_PAGES_PRESENTATION_ENABLED: 'false'",
    );
    expect(source).toContain(
      'WARPKEEP_ADMISSION_NOTIFICATIONS_ENABLED: '
        + '${{ vars.WARPKEEP_ADMISSION_NOTIFICATIONS_ENABLED }}',
    );
    expect(source).toContain(
      'pages_value="${WARPKEEP_ADMISSION_NOTIFICATIONS_ENABLED:-false}"',
    );
    expect(source).toContain('if [[ "$pages_value" != \'false\' ]]; then');
    expect(source).not.toContain('actions/variables');
    expect(pages).toContain(
      "VITE_WARPKEEP_ADMISSION_NOTIFICATIONS_ENABLED: 'false'",
    );
    expect(pages).not.toContain('vars.WARPKEEP_ADMISSION_NOTIFICATIONS_ENABLED');
    const policyRoot = createPolicyFixture();
    expect(verifyAuthBridgeNotificationPreparedStaticPolicy({
      repositoryRoot: policyRoot,
    }))
      .toEqual({
        bridgeNotificationDeliveryEnabled: true,
        hermesExecutionApproved: false,
        pagesPresentationEnabled: false,
        checkedInWorkerGateEnabled: false,
        deploymentMechanicsReady: true,
        dedicatedPersistentRunnerRequired: true,
        guardedRecoveryRequired: true,
        privateReceiptSinkRequired: true,
        installedToolchainByteAttestationRequired: true,
        executableSecurityClosureMemberCount: 956,
      });
  }, 180_000);

  it('derives the exact executable, receipt, config, ABI, Worker, and toolchain closure', () => {
    const root = createPolicyFixture();
    const manifest = JSON.parse(readFileSync(resolve(
      root,
      AUTH_BRIDGE_NOTIFICATION_PREPARED_DEPLOY_CLOSURE_MANIFEST_PATH,
    ), 'utf8')) as {
      schemaVersion: number;
      members: Array<{ path: string; digestProfile: string; sha256: string }>;
    };
    const paths = deriveAuthBridgeNotificationPreparedDeployClosurePaths({
      repositoryRoot: root,
    });
    expect(paths).toEqual(manifest.members.map(member => member.path));
    expect(manifest.schemaVersion).toBe(2);
    expect(paths).toHaveLength(956);
    expect(paths).toEqual(expect.arrayContaining([
      'scripts/auth-bridge-notification-prepared-deploy.mjs',
      'scripts/auth-bridge-notification-prepared-deploy-adapter.mjs',
      'scripts/auth-bridge-notification-prepared-cloudflare-runtime.mjs',
      'scripts/auth-bridge-notification-prepared-deploy-journal.mjs',
      'scripts/auth-bridge-notification-prepared-receipt.mjs',
      'scripts/auth-bridge-config-attestation.mjs',
      'scripts/production-admin-token-budget.mjs',
      'services/auth-bridge/package.json',
      'services/auth-bridge/pnpm-lock.yaml',
      'services/auth-bridge/pnpm-workspace.yaml',
      'services/auth-bridge/tsconfig.json',
      'services/auth-bridge/wrangler.toml',
      'services/auth-bridge/src/index.ts',
      'services/auth-bridge/src/admissionNotifications.ts',
      'services/auth-bridge/test/app.test.ts',
      'services/auth-bridge/test-workerd/authBridge.workerd.test.ts',
      'services/auth-bridge/test-workerd/tsconfig.json',
      'services/auth-bridge/vitest.config.ts',
      'services/auth-bridge/vitest.workerd.config.ts',
      'scripts/auth-bridge-notification-prepared-installed-toolchain.mjs',
      'scripts/auth-bridge-notification-prepared-installed-toolchain-darwin-arm64-v1.json',
      '.github/workflows/deploy-pages.yml',
      '.github/workflows/notification-bridge-b0.yml',
      '.github/workflows/notification-bridge-prepared.yml',
      '.github/workflows/verify.yml',
      'package.json',
      'package-lock.json',
      'public/.well-known/farcaster.json',
      'scripts/greater-realm-production-bootstrap.mjs',
      'scripts/greater-realm-production-publisher-core.ts',
      'scripts/genesis001-frozen-publisher.ts',
      'scripts/greater-realm-production-pages-evidence-operator.ts',
      'scripts/greater-realm-production-verifier.ts',
      'scripts/greater-realm-release-gate-deploy-boundary.d.mts',
      'scripts/greater-realm-release-gate-deploy-boundary.mjs',
      'scripts/greater-realm-downstream-release-policy.ts',
      'scripts/hermes-admin.ts',
      'scripts/inner-keep-operator.ts',
      'scripts/notification-pages-private-deploy-launcher.mjs',
      'scripts/notification-pages-private-deploy-operator.mjs',
      'scripts/notification-pages-live-receipt.mjs',
      'scripts/notification-pages-live-hermes-authority.mjs',
      'scripts/notification-pages-live-release-binding.mjs',
      'scripts/notification-pages-private-release-binding.mjs',
      'scripts/notification-pages-release-source-parser.mjs',
      'scripts/production-player-canary-release-binding.mjs',
      'scripts/production-player-canary-operator-journal.mjs',
      'scripts/production-player-canary-operator.mjs',
      'scripts/profiles/profiles-operator.ts',
      'scripts/verify-auth-bridge-notification-prepared-receipt.mjs',
      'scripts/water-revision-operator.ts',
      'scripts/worker-return-repair-operator.ts',
      'scripts/worker-rollout-operator.ts',
      'src/greater-realm/greaterRealmTransport.ts',
      'src/spacetime/greaterRealmProviderBridge.ts',
    ]));
    const declarationOptional = new Set([
      'scripts/farcaster-miniapp-contract.mjs',
      'scripts/validate-pages-deploy-config.mjs',
      'scripts/verify-alpha-production.mjs',
      'scripts/verify-auth-bridge-notification-prepared-receipt.mjs',
      'scripts/verify-production-dist-exclusions.mjs',
    ]);
    expect(paths.filter(path => path.endsWith('.mjs')).length).toBe(
      paths.filter(path => path.endsWith('.d.mts')).length
        + declarationOptional.size
        + RETAINED_TYPE_ONLY_DECLARATION_PATHS.length,
    );
    expect(verifyAuthBridgeNotificationPreparedDeployClosurePolicy({
      repositoryRoot: root,
    })).toMatchObject({
        profile: 'warpkeep-auth-bridge-notification-prepared-deploy-closure-v1',
        memberCount: 956,
        manifestSha256: expect.stringMatching(/^[a-f0-9]{64}$/u),
      });
  }, 180_000);

  it('derives the production browser admission and request graph from the shipped entrypoint', () => {
    const paths = deriveAuthBridgeNotificationPreparedDeployClosurePaths({
      repositoryRoot,
    });
    expect(paths).toEqual(expect.arrayContaining([
      'index.html',
      'src/main.tsx',
      'src/App.tsx',
      'src/styles/global.css',
      'src/components/WarpkeepExperience.tsx',
      'src/components/WarpkeepExperience.css',
      'src/components/title/WarpkeepTitleScreen3D.tsx',
      'src/components/realm/RealmMapScreen.tsx',
      'src/components/auth/FarcasterMiniAppEntryGate.tsx',
      'src/components/auth/FarcasterMiniAppEntryGate.css',
      'src/components/auth/FarcasterAdmissionPanel.tsx',
      'src/components/auth/FarcasterAdmissionPanel.css',
      'src/components/auth/FarcasterAccessRequest.tsx',
      'src/farcaster/FarcasterAuthProvider.tsx',
      'src/farcaster/FarcasterAuthProviderCore.tsx',
      'src/farcaster/useAccessRequest.ts',
      'src/farcaster/accessRequestStateMachine.ts',
      'src/farcaster/farcasterOidcBridgeClient.ts',
      'src/release/admissionLaunchPolicy.ts',
      'src/components/menu/realmChoicePolicy.ts',
    ]));
  }, 90_000);

  it.each([
    "@import './unreviewed.css';\n",
    ".unreviewed { background-image: url('./unreviewed.png'); }\n",
  ])('rejects an unbound browser CSS dependency: %s', dependency => {
    const root = createPolicyFixture();
    const globalCss = resolve(root, 'src/styles/global.css');
    writeFileSync(
      globalCss,
      `${dependency}${readFileSync(globalCss, 'utf8')}`,
    );
    expect(() => deriveAuthBridgeNotificationPreparedDeployClosurePaths({
      repositoryRoot: root,
    })).toThrow(
      'AUTH_BRIDGE_PREPARED_DEPLOY_CLOSURE_ASSET_IMPORT_FORBIDDEN',
    );
  }, 90_000);

  it('rejects a one-byte mutation in every closure member', () => {
    const root = createPolicyFixture();
    const manifest = JSON.parse(readFileSync(resolve(
      root,
      AUTH_BRIDGE_NOTIFICATION_PREPARED_DEPLOY_CLOSURE_MANIFEST_PATH,
    ), 'utf8')) as {
      members: Array<{ path: string; digestProfile: string; sha256: string }>;
    };
    for (const member of manifest.members) {
      const path = resolve(root, member.path);
      const original = readFileSync(path);
      try {
        writeFileSync(path, Buffer.concat([original, Buffer.from('\n')]));
        expect(
          () => verifyAuthBridgeNotificationPreparedDeployClosure({
            repositoryRoot: root,
          }),
          member.path,
        ).toThrow(/AUTH_BRIDGE_PREPARED_DEPLOY_CLOSURE_/u);
      } finally {
        writeFileSync(path, original);
        original.fill(0);
      }
    }
  }, 300_000);

  it('rejects a manifest missing a derived closure member', () => {
    const missing = createPolicyFixture();
    const missingManifestPath = resolve(
      missing,
      AUTH_BRIDGE_NOTIFICATION_PREPARED_DEPLOY_CLOSURE_MANIFEST_PATH,
    );
    const missingManifest = JSON.parse(readFileSync(
      missingManifestPath,
      'utf8',
    )) as {
      schemaVersion: number;
      profile: string;
      members: Array<{ path: string; digestProfile: string; sha256: string }>;
    };
    const browserProjectionIndex = missingManifest.members.findIndex(
      member => member.path === 'src/spacetime/playerModuleBindings.ts',
    );
    expect(browserProjectionIndex).toBeGreaterThanOrEqual(0);
    missingManifest.members.splice(browserProjectionIndex, 1);
    writeFileSync(missingManifestPath, `${JSON.stringify(missingManifest, null, 2)}\n`);
    expect(() => verifyAuthBridgeNotificationPreparedDeployClosurePolicy({
      repositoryRoot: missing,
    })).toThrow('AUTH_BRIDGE_PREPARED_DEPLOY_CLOSURE_MEMBER_SET_INVALID');
  }, 90_000);

  it('rejects an extra manifest member', () => {
    const extra = createPolicyFixture();
    const extraManifestPath = resolve(
      extra,
      AUTH_BRIDGE_NOTIFICATION_PREPARED_DEPLOY_CLOSURE_MANIFEST_PATH,
    );
    const extraManifest = JSON.parse(readFileSync(extraManifestPath, 'utf8')) as {
      schemaVersion: number;
      profile: string;
      members: Array<{ path: string; digestProfile: string; sha256: string }>;
    };
    const extraPath = '.github/workflows/codeql.yml';
    mkdirSync(dirname(resolve(extra, extraPath)), { recursive: true });
    cpSync(resolve(repositoryRoot, extraPath), resolve(extra, extraPath));
    extraManifest.members.push({
      path: extraPath,
      digestProfile: 'raw-file-sha256-v1',
      sha256: createHash('sha256')
        .update(readFileSync(resolve(extra, extraPath)))
        .digest('hex'),
    });
    extraManifest.members.sort((left, right) => (
      left.path < right.path ? -1 : left.path > right.path ? 1 : 0
    ));
    writeFileSync(extraManifestPath, `${JSON.stringify(extraManifest, null, 2)}\n`);
    expect(() => verifyAuthBridgeNotificationPreparedDeployClosurePolicy({
      repositoryRoot: extra,
    })).toThrow('AUTH_BRIDGE_PREPARED_DEPLOY_CLOSURE_MANIFEST_INVALID');
  }, 90_000);

  it('rejects a newly imported local closure member', () => {
    const imported = createPolicyFixture();
    const importedDependency = 'scripts/atomic-install-file-family.mjs';
    const importedDeclaration = 'scripts/atomic-install-file-family.d.mts';
    for (const path of [importedDependency, importedDeclaration]) {
      mkdirSync(dirname(resolve(imported, path)), { recursive: true });
      cpSync(resolve(repositoryRoot, path), resolve(imported, path));
    }
    const entrypoint = resolve(
      imported,
      'scripts/auth-bridge-notification-prepared-deploy.mjs',
    );
    writeFileSync(
      entrypoint,
      `import './atomic-install-file-family.mjs';\n${readFileSync(entrypoint, 'utf8')}`,
    );
    expect(() => verifyAuthBridgeNotificationPreparedDeployClosurePolicy({
      repositoryRoot: imported,
    })).toThrow('AUTH_BRIDGE_PREPARED_DEPLOY_CLOSURE_TOO_LARGE');
  }, 90_000);

  it('rejects an unreviewed installed import', () => {
    const unreviewedInstalledImport = createPolicyFixture();
    const closureVerifier = resolve(
      unreviewedInstalledImport,
      'scripts/auth-bridge-notification-prepared-deploy-closure.mjs',
    );
    writeFileSync(
      closureVerifier,
      `import '../services/auth-bridge/node_modules/unreviewed/index.js';\n${readFileSync(closureVerifier, 'utf8')}`,
    );
    expect(() => verifyAuthBridgeNotificationPreparedDeployClosurePolicy({
      repositoryRoot: unreviewedInstalledImport,
    })).toThrow(
      'AUTH_BRIDGE_PREPARED_DEPLOY_CLOSURE_INSTALLED_IMPORT_INVALID',
    );
  }, 90_000);

  it('rejects a physically missing imported member', () => {
    const physicallyMissing = createPolicyFixture();
    rmSync(resolve(
      physicallyMissing,
      'scripts/auth-bridge-notification-prepared-deploy-adapter.mjs',
    ));
    expect(() => verifyAuthBridgeNotificationPreparedDeployClosurePolicy({
      repositoryRoot: physicallyMissing,
    })).toThrow('AUTH_BRIDGE_PREPARED_DEPLOY_CLOSURE_IMPORT_UNRESOLVED');
  }, 90_000);

  it('rejects an unreferenced Worker source', () => {
    const unreferencedWorkerSource = createPolicyFixture();
    writeFileSync(resolve(
      unreferencedWorkerSource,
      'services/auth-bridge/src/unreviewed.ts',
    ), 'export const unreviewed = true\n');
    expect(() => verifyAuthBridgeNotificationPreparedDeployClosurePolicy({
      repositoryRoot: unreferencedWorkerSource,
    })).toThrow(
      'AUTH_BRIDGE_PREPARED_DEPLOY_CLOSURE_WORKER_GRAPH_INCOMPLETE',
    );
  }, 90_000);

  it('rejects noncanonical or byte-mutated closure manifests', () => {
    const root = createPolicyFixture();
    const path = resolve(
      root,
      AUTH_BRIDGE_NOTIFICATION_PREPARED_DEPLOY_CLOSURE_MANIFEST_PATH,
    );
    writeFileSync(path, `${readFileSync(path, 'utf8')}\n`);
    expect(() => verifyAuthBridgeNotificationPreparedDeployClosurePolicy({
      repositoryRoot: root,
    })).toThrow(
      'AUTH_BRIDGE_PREPARED_DEPLOY_CLOSURE_MANIFEST_NOT_CANONICAL',
    );
  }, 180_000);

  it('rejects altered or duplicate protected-workflow bootstrap pins', () => {
    for (const mutation of ['altered', 'duplicate'] as const) {
      const root = createPolicyFixture();
      const path = resolve(
        root,
        '.github/workflows/notification-bridge-prepared.yml',
      );
      const source = readFileSync(path, 'utf8');
      const name = 'WARPKEEP_PREPARED_SOURCE_CLOSURE_VERIFIER_SHA256';
      const current = source.match(new RegExp(
        `^      ${name}: '([a-f0-9]{64})'$`,
        'mu',
      ))?.[1];
      if (current === undefined) throw new Error('bootstrap fixture pin missing');
      writeFileSync(path, mutation === 'altered'
        ? source.replace(current, `${current.slice(0, -1)}${
          current.endsWith('0') ? '1' : '0'
        }`)
        : source.replace(
          `      ${name}: '${current}'`,
          `      ${name}: '${current}'\n      ${name}: '${current}'`,
        ));
      expect(() => verifyAuthBridgeNotificationPreparedDeployClosure({
        repositoryRoot: root,
      })).toThrow('AUTH_BRIDGE_PREPARED_DEPLOY_CLOSURE_BOOTSTRAP_INVALID');
    }
  });

  it('verifies the fixed installed package tree authority', () => {
    const fixture = createInstalledToolchainFixture();
    const authority = verifyInstalledToolchainFixture(fixture) as ReturnType<
      typeof verifyAuthBridgeNotificationPreparedInstalledToolchain
    >;
    expect(authority).toMatchObject({
      profile:
        'warpkeep-auth-bridge-notification-prepared-installed-toolchain-darwin-arm64-v1',
      runnerIdentityDigest: expect.stringMatching(/^[a-f0-9]{64}$/u),
      resolverNamespaceEntryCount: expect.any(Number),
      resolverNamespaceSha256: expect.stringMatching(/^[a-f0-9]{64}$/u),
      entryCount: expect.any(Number),
      totalFileBytes: expect.any(Number),
      treeSha256: expect.stringMatching(/^[a-f0-9]{64}$/u),
    });
    expect(assertAuthBridgeNotificationPreparedInstalledToolchainAuthority(
      authority,
      { repositoryRoot: fixture.root },
    )).toBe(authority);
    expect(() => assertAuthBridgeNotificationPreparedInstalledToolchainAuthority(
      { ...authority },
      { repositoryRoot: fixture.root },
    )).toThrow('AUTH_BRIDGE_PREPARED_TOOLCHAIN_AUTHORITY_INVALID');
  });

  it('accepts a valid source-closure manifest within the 256 KiB bound', () => {
    const fixture = createInstalledToolchainFixture();
    const sourceManifestPath = resolve(
      fixture.root,
      AUTH_BRIDGE_NOTIFICATION_PREPARED_DEPLOY_CLOSURE_MANIFEST_PATH,
    );
    const sourceManifest = JSON.parse(readFileSync(
      sourceManifestPath,
      'utf8',
    )) as {
      members: Array<{
        path: string;
        digestProfile: string;
        sha256: string;
      }>;
    };
    let index = 0;
    while (Buffer.byteLength(
      `${JSON.stringify(sourceManifest, null, 2)}\n`,
      'utf8',
    ) <= 200 * 1_024) {
      sourceManifest.members.push({
        path: `zz-fixture/${index.toString().padStart(4, '0')}-${'a'.repeat(850)}`,
        digestProfile: 'raw-file-sha256-v1',
        sha256: 'f'.repeat(64),
      });
      index += 1;
    }
    const source = `${JSON.stringify(sourceManifest, null, 2)}\n`;
    expect(Buffer.byteLength(source, 'utf8')).toBeGreaterThan(192 * 1_024);
    expect(Buffer.byteLength(source, 'utf8')).toBeLessThanOrEqual(256 * 1_024);
    writeFileSync(sourceManifestPath, source);

    expect(verifyInstalledToolchainFixture(fixture)).toMatchObject({
      profile:
        'warpkeep-auth-bridge-notification-prepared-installed-toolchain-darwin-arm64-v1',
    });
  });

  it('normalizes pnpm CI global virtual-store false to the existing manifest', () => {
    const fixture = createInstalledToolchainFixture();
    const manifest = JSON.parse(readFileSync(resolve(
      fixture.root,
      AUTH_BRIDGE_NOTIFICATION_PREPARED_INSTALLED_TOOLCHAIN_MANIFEST_PATH,
    ), 'utf8')) as Record<string, unknown>;
    const workspaceStatePath = resolve(
      fixture.nodeModules,
      '.pnpm-workspace-state-v1.json',
    );
    const workspaceState = JSON.parse(
      readFileSync(workspaceStatePath, 'utf8'),
    ) as { settings: Record<string, unknown> };
    workspaceState.settings.enableGlobalVirtualStore = false;
    writeFileSync(
      workspaceStatePath,
      `${JSON.stringify(workspaceState, null, 2)}\n`,
    );

    expect(createAuthBridgeNotificationPreparedInstalledToolchainCandidate({
      repositoryRoot: fixture.root,
    })).toEqual(manifest);
    expect(verifyInstalledToolchainFixture(fixture)).toMatchObject({
      resolverNamespaceSha256: manifest.resolverNamespaceSha256,
      treeSha256: manifest.treeSha256,
    });
  });

  it('rejects true and malformed pnpm global virtual-store settings', () => {
    for (const value of [true, null, 0, 'false', {}, []]) {
      const fixture = createInstalledToolchainFixture();
      const workspaceStatePath = resolve(
        fixture.nodeModules,
        '.pnpm-workspace-state-v1.json',
      );
      const workspaceState = JSON.parse(
        readFileSync(workspaceStatePath, 'utf8'),
      ) as { settings: Record<string, unknown> };
      workspaceState.settings.enableGlobalVirtualStore = value;
      writeFileSync(
        workspaceStatePath,
        `${JSON.stringify(workspaceState, null, 2)}\n`,
      );
      expect(
        () => verifyInstalledToolchainFixture(fixture),
        JSON.stringify(value),
      ).toThrow('AUTH_BRIDGE_PREPARED_TOOLCHAIN_RESOLVER_INVALID');
    }
  });

  it('rejects missing or non-record pnpm workspace settings', () => {
    for (const settings of [undefined, null]) {
      const fixture = createInstalledToolchainFixture();
      const workspaceStatePath = resolve(
        fixture.nodeModules,
        '.pnpm-workspace-state-v1.json',
      );
      const workspaceState = JSON.parse(
        readFileSync(workspaceStatePath, 'utf8'),
      ) as { settings?: unknown };
      if (settings === undefined) delete workspaceState.settings;
      else workspaceState.settings = settings;
      writeFileSync(
        workspaceStatePath,
        `${JSON.stringify(workspaceState, null, 2)}\n`,
      );
      expect(() => verifyInstalledToolchainFixture(fixture)).toThrow(
        'AUTH_BRIDGE_PREPARED_TOOLCHAIN_RESOLVER_INVALID',
      );
    }
  });

  it('requires raw source-closure digest profiles for toolchain binding inputs', () => {
    const legacy = createInstalledToolchainFixture();
    const legacyPath = resolve(
      legacy.root,
      AUTH_BRIDGE_NOTIFICATION_PREPARED_DEPLOY_CLOSURE_MANIFEST_PATH,
    );
    const legacyManifest = JSON.parse(readFileSync(legacyPath, 'utf8')) as {
      schemaVersion: number;
    };
    legacyManifest.schemaVersion = 1;
    writeFileSync(legacyPath, `${JSON.stringify(legacyManifest, null, 2)}\n`);
    expect(() => verifyInstalledToolchainFixture(legacy)).toThrow(
      'AUTH_BRIDGE_PREPARED_TOOLCHAIN_SOURCE_MANIFEST_INVALID',
    );

    for (const [relativePath, digestProfile, code] of [
      [
        AUTH_BRIDGE_NOTIFICATION_PREPARED_INSTALLED_TOOLCHAIN_MANIFEST_PATH,
        'reviewed-release-transition-projection-sha256-v1',
        'AUTH_BRIDGE_PREPARED_TOOLCHAIN_SOURCE_BINDING_INVALID',
      ],
      [
        'services/auth-bridge/pnpm-lock.yaml',
        'bootstrap-pin-projection-sha256-v1',
        'AUTH_BRIDGE_PREPARED_TOOLCHAIN_SOURCE_BINDING_INVALID',
      ],
      [
        'services/auth-bridge/pnpm-lock.yaml',
        'unknown-sha256-v1',
        'AUTH_BRIDGE_PREPARED_TOOLCHAIN_SOURCE_MANIFEST_INVALID',
      ],
    ] as const) {
      const fixture = createInstalledToolchainFixture();
      const path = resolve(
        fixture.root,
        AUTH_BRIDGE_NOTIFICATION_PREPARED_DEPLOY_CLOSURE_MANIFEST_PATH,
      );
      const manifest = JSON.parse(readFileSync(path, 'utf8')) as {
        members: Array<{
          path: string;
          digestProfile: string;
          sha256: string;
        }>;
      };
      const member = manifest.members.find(entry => entry.path === relativePath);
      if (member === undefined) throw new Error(`fixture member ${relativePath} missing`);
      member.digestProfile = digestProfile;
      writeFileSync(path, `${JSON.stringify(manifest, null, 2)}\n`);
      expect(() => verifyInstalledToolchainFixture(fixture)).toThrow(code);
    }

    for (const relativePath of [
      AUTH_BRIDGE_NOTIFICATION_PREPARED_INSTALLED_TOOLCHAIN_MANIFEST_PATH,
      'services/auth-bridge/pnpm-lock.yaml',
    ]) {
      const fixture = createInstalledToolchainFixture();
      const path = resolve(
        fixture.root,
        AUTH_BRIDGE_NOTIFICATION_PREPARED_DEPLOY_CLOSURE_MANIFEST_PATH,
      );
      const manifest = JSON.parse(readFileSync(path, 'utf8')) as {
        members: Array<{ path: string }>;
      };
      manifest.members = manifest.members.filter(
        member => member.path !== relativePath,
      );
      writeFileSync(path, `${JSON.stringify(manifest, null, 2)}\n`);
      expect(() => verifyInstalledToolchainFixture(fixture)).toThrow(
        'AUTH_BRIDGE_PREPARED_TOOLCHAIN_SOURCE_BINDING_INVALID',
      );
    }
  });

  it('accepts Linux native symlink modes while retaining exact tree authority', () => {
    if (process.platform !== 'linux') return;
    const fixture = createInstalledToolchainFixture();
    const link = lstatSync(resolve(fixture.nodeModules, 'wrangler'));
    expect(link.isSymbolicLink()).toBe(true);
    expect(link.mode & 0o022).toBe(0o022);
    expect(verifyInstalledToolchainFixture(fixture)).toMatchObject({
      resolverNamespaceSha256: expect.stringMatching(/^[a-f0-9]{64}$/u),
      treeSha256: expect.stringMatching(/^[a-f0-9]{64}$/u),
    });

    const writableTarget = createInstalledToolchainFixture();
    const packagePath = resolve(
      writableTarget.nodeModules,
      fixtureWranglerTarget,
      'package.json',
    );
    chmodSync(packagePath, 0o664);
    expect(() => verifyInstalledToolchainFixture(writableTarget)).toThrow(
      /AUTH_BRIDGE_PREPARED_TOOLCHAIN_/u,
    );

    const escapingTarget = createInstalledToolchainFixture();
    unlinkSync(resolve(escapingTarget.nodeModules, 'wrangler'));
    symlinkSync('/tmp', resolve(escapingTarget.nodeModules, 'wrangler'));
    expect(() => verifyInstalledToolchainFixture(escapingTarget)).toThrow(
      /AUTH_BRIDGE_PREPARED_TOOLCHAIN_/u,
    );
  });

  it('keeps runner identity stable across staged Node copies and runner-bound', () => {
    const firstRunner = createInstalledToolchainFixture();
    expect(runnerIdentityFromStagedNode(firstRunner, 'node-first')).toBe(
      runnerIdentityFromStagedNode(firstRunner, 'node-second'),
    );

    const otherRunnerWorkspace = createInstalledToolchainFixture();
    expect(runnerIdentityFromStagedNode(otherRunnerWorkspace, 'node-third'))
      .not.toBe(runnerIdentityFromStagedNode(firstRunner, 'node-fourth'));
  });

  it('rejects one-byte package and native-binary mutations', () => {
    for (const relativePath of [
      `${fixtureWranglerTarget}/package.json`,
      '.pnpm/node_modules/.bin/wrangler',
      fixtureExecutablePaths.wrangler,
      fixtureExecutablePaths.workerd,
    ]) {
      const fixture = createInstalledToolchainFixture();
      const path = resolve(fixture.nodeModules, relativePath);
      const body = readFileSync(path);
      body[0] ^= 0x01;
      writeFileSync(path, body);
      body.fill(0);
      expect(
        () => verifyInstalledToolchainFixture(fixture),
        relativePath,
      ).toThrow(/AUTH_BRIDGE_PREPARED_TOOLCHAIN_/u);
    }
  });

  it('rejects package substitution, escaping links, and symlinked executables', () => {
    const substituted = createInstalledToolchainFixture();
    writeFileSync(
      resolve(substituted.nodeModules, fixtureWranglerTarget, 'package.json'),
      '{"name":"wrangler-substitute","version":"4.110.0"}\n',
    );
    expect(() => verifyInstalledToolchainFixture(substituted)).toThrow(
      /AUTH_BRIDGE_PREPARED_TOOLCHAIN_/u,
    );

    const escaping = createInstalledToolchainFixture();
    unlinkSync(resolve(escaping.nodeModules, 'wrangler'));
    symlinkSync('/tmp', resolve(escaping.nodeModules, 'wrangler'));
    expect(() => verifyInstalledToolchainFixture(escaping)).toThrow(
      /AUTH_BRIDGE_PREPARED_TOOLCHAIN_/u,
    );

    const linkedExecutable = createInstalledToolchainFixture();
    const native = resolve(
      linkedExecutable.nodeModules,
      fixtureExecutablePaths.workerd,
    );
    const replacement = `${native}.replacement`;
    writeFileSync(replacement, '#!/bin/sh\n# replacement\n');
    chmodSync(replacement, 0o755);
    unlinkSync(native);
    symlinkSync('workerd.replacement', native);
    expect(() => verifyInstalledToolchainFixture(linkedExecutable)).toThrow(
      /AUTH_BRIDGE_PREPARED_TOOLCHAIN_/u,
    );
  });

  it('rejects a redirected top-level viem resolver', () => {
    const redirectedViem = createInstalledToolchainFixture();
    unlinkSync(resolve(redirectedViem.nodeModules, 'viem'));
    symlinkSync(
      '.pnpm/typescript@7.0.2/node_modules/typescript',
      resolve(redirectedViem.nodeModules, 'viem'),
    );
    expect(() => verifyInstalledToolchainFixture(redirectedViem)).toThrow(
      /AUTH_BRIDGE_PREPARED_TOOLCHAIN_/u,
    );
  });

  it('rejects a redirected scoped Farcaster resolver', () => {
    const redirectedFarcaster = createInstalledToolchainFixture();
    unlinkSync(resolve(
      redirectedFarcaster.nodeModules,
      '@farcaster/auth-client',
    ));
    symlinkSync(
      '../.pnpm/typescript@7.0.2/node_modules/typescript',
      resolve(redirectedFarcaster.nodeModules, '@farcaster/auth-client'),
    );
    expect(() => verifyInstalledToolchainFixture(redirectedFarcaster)).toThrow(
      /AUTH_BRIDGE_PREPARED_TOOLCHAIN_/u,
    );
  });

  it('rejects an extra top-level resolver entry', () => {
    const extra = createInstalledToolchainFixture();
    symlinkSync(
      '.pnpm/typescript@7.0.2/node_modules/typescript',
      resolve(extra.nodeModules, 'unreviewed-package'),
    );
    expect(() => verifyInstalledToolchainFixture(extra)).toThrow(
      /AUTH_BRIDGE_PREPARED_TOOLCHAIN_/u,
    );
  });

  it('rejects missing, writable, and hard-linked native toolchain members', () => {
    const missing = createInstalledToolchainFixture();
    rmSync(resolve(missing.nodeModules, fixtureExecutablePaths.esbuild));
    expect(() => verifyInstalledToolchainFixture(missing)).toThrow(
      /AUTH_BRIDGE_PREPARED_TOOLCHAIN_/u,
    );

    const writable = createInstalledToolchainFixture();
    chmodSync(resolve(writable.nodeModules, fixtureExecutablePaths.workerd), 0o775);
    expect(() => verifyInstalledToolchainFixture(writable)).toThrow(
      /AUTH_BRIDGE_PREPARED_TOOLCHAIN_/u,
    );

    const hardLinked = createInstalledToolchainFixture();
    const workerd = resolve(hardLinked.nodeModules, fixtureExecutablePaths.workerd);
    linkSync(workerd, `${workerd}.foreign-link`);
    expect(() => verifyInstalledToolchainFixture(hardLinked)).toThrow(
      /AUTH_BRIDGE_PREPARED_TOOLCHAIN_/u,
    );
  });

  it('rejects missing or unreviewed preflight check inputs', () => {
    const missing = createPolicyFixture();
    rmSync(resolve(missing, 'services/auth-bridge/vitest.workerd.config.ts'));
    expect(() => verifyAuthBridgeNotificationPreparedDeployClosurePolicy({
      repositoryRoot: missing,
    })).toThrow(/AUTH_BRIDGE_PREPARED_DEPLOY_CLOSURE_/u);

    const extra = createPolicyFixture();
    writeFileSync(
      resolve(extra, 'services/auth-bridge/test/unreviewed.test.ts'),
      'export const unreviewed = true\n',
    );
    expect(() => verifyAuthBridgeNotificationPreparedDeployClosurePolicy({
      repositoryRoot: extra,
    })).toThrow('AUTH_BRIDGE_PREPARED_DEPLOY_CLOSURE_TOO_LARGE');
  }, 180_000);

  it('loads separated credentials only into the guarded no-argv entrypoint', () => {
    const source = workflow();
    const expectedEnvironment = {
      GITHUB_TOKEN: '${{ github.token }}',
      WARPKEEP_AUTH_BRIDGE_ACCOUNT_ID:
        '${{ secrets.WARPKEEP_AUTH_BRIDGE_ACCOUNT_ID }}',
      WARPKEEP_AUTH_BRIDGE_CLOUDFLARE_API_TOKEN:
        '${{ secrets.WARPKEEP_AUTH_BRIDGE_CLOUDFLARE_API_TOKEN }}',
      WARPKEEP_AUTH_BRIDGE_ZONE_ID:
        '${{ secrets.WARPKEEP_AUTH_BRIDGE_ZONE_ID }}',
      WARPKEEP_PLAYER_CANARY_OWNER_FID:
        '${{ secrets.WARPKEEP_PLAYER_CANARY_OWNER_FID }}',
      WARPKEEP_PRODUCTION_ADMIN_TOKEN:
        '${{ secrets.WARPKEEP_PRODUCTION_ADMIN_TOKEN }}',
    };
    expect(step('deploy').env).toEqual(expectedEnvironment);
    expect(step('recovery').env).toEqual(expectedEnvironment);
    expect(preparedJob().env).not.toHaveProperty('GITHUB_TOKEN');
    expect(preparedJob().env).not.toHaveProperty(
      'WARPKEEP_AUTH_BRIDGE_CLOUDFLARE_API_TOKEN',
    );
    expect(preparedJob().env).not.toHaveProperty('WARPKEEP_PRODUCTION_ADMIN_TOKEN');
    expect(preparedJob().env).not.toHaveProperty(
      'WARPKEEP_PLAYER_CANARY_OWNER_FID',
    );
    expect(source.match(/secrets\./gu)).toHaveLength(10);
    expect(source.match(
      /WARPKEEP_PLAYER_CANARY_OWNER_FID: \$\{\{ secrets\.WARPKEEP_PLAYER_CANARY_OWNER_FID \}\}/gu,
    )).toHaveLength(2);
    expect(source).not.toMatch(/^\s+PLAYER_CANARY_OWNER_FID:/mu);
    expect(source.match(
      /AUTH_BRIDGE_PREPARED_DEPLOY_CREDENTIALS_INVALID/gu,
    )).toHaveLength(2);
    for (const comparison of [
      '"$GITHUB_TOKEN" == "$WARPKEEP_AUTH_BRIDGE_CLOUDFLARE_API_TOKEN"',
      '"$GITHUB_TOKEN" == "$WARPKEEP_PRODUCTION_ADMIN_TOKEN"',
      '"$WARPKEEP_AUTH_BRIDGE_CLOUDFLARE_API_TOKEN" == "$WARPKEEP_PRODUCTION_ADMIN_TOKEN"',
    ]) expect(source.match(new RegExp(
      comparison.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&'),
      'gu',
    ))).toHaveLength(2);
    expect(source.match(
      /node scripts\/auth-bridge-notification-prepared-deploy\.mjs >\/dev\/null/gu,
    )).toHaveLength(2);
    expect(source).not.toMatch(
      /auth-bridge-notification-prepared-deploy\.mjs\s+--/u,
    );
    expect(source).not.toContain(
      'WARPKEEP_AUTH_BRIDGE_NOTIFICATION_PREPARED_RECEIPT_PATH',
    );
    expect(source).not.toMatch(/\bwrangler\s+(?:deploy|publish|versions\s+upload)\b/u);
    expect(source).not.toMatch(/\b(?:curl|wget)\b/u);
    expect(source).not.toContain('upload-artifact@');
    expect(source).not.toContain('upload-pages-artifact@');
    expect(source).not.toMatch(/^\s+CLOUDFLARE_API_TOKEN:/mu);
    expect(source).not.toContain('WARPKEEP_ADMIN_TOKEN_SECRET');
    const entrypoint = readFileSync(resolve(
      repositoryRoot,
      'scripts/auth-bridge-notification-prepared-deploy.mjs',
    ), 'utf8');
    const installedIndex = entrypoint.indexOf(
      'verifyAuthBridgeNotificationPreparedInstalledToolchain({',
    );
    const sourceIndex = entrypoint.indexOf(
      'verifyAuthBridgeNotificationPreparedDeployClosure({',
    );
    const sourceAfterInstalledIndex = entrypoint.indexOf(
      'verifyAuthBridgeNotificationPreparedDeployClosure({',
      installedIndex + 1,
    );
    const scrubIndex = entrypoint.indexOf(
      'const values = copyAndScrubEnvironment(environment);',
    );
    const runtimeImportIndex = entrypoint.indexOf(
      "import('./auth-bridge-notification-prepared-deploy-adapter.mjs')",
    );
    expect(sourceIndex).toBeGreaterThan(0);
    expect(installedIndex).toBeGreaterThan(sourceIndex);
    expect(sourceAfterInstalledIndex).toBeGreaterThan(installedIndex);
    expect(scrubIndex).toBeGreaterThan(sourceAfterInstalledIndex);
    expect(runtimeImportIndex).toBeGreaterThan(scrubIndex);
    expect(entrypoint).toContain("'WARPKEEP_PLAYER_CANARY_OWNER_FID'");
    expect(entrypoint).not.toMatch(
      /process\.(?:stdout|stderr)[\s\S]{0,256}WARPKEEP_PLAYER_CANARY_OWNER_FID/u,
    );
  });

  it('always attempts guarded recovery after failure and rejects an unverified outcome', () => {
    const deploy = step('deploy');
    const recovery = step('recovery');
    const final = preparedJob().steps?.find(candidate => (
      candidate.name === 'Require a verified deployment or recovery'
    ));
    expect(deploy['continue-on-error']).toBe(true);
    expect(deploy.run).toContain(
      `printf '%s\\n' 'attempted=true' >> "$GITHUB_OUTPUT"`,
    );
    const deployRun = deploy.run ?? '';
    expect(deployRun.indexOf('attempted=true')).toBeLessThan(
      deployRun.indexOf('auth-bridge-notification-prepared-deploy.mjs'),
    );
    expect(recovery.if).toBe(
      "${{ always() && steps.deploy.outputs.attempted == 'true' && steps.deploy.outcome != 'success' }}",
    );
    expect(recovery['continue-on-error']).toBe(true);
    expect(final?.if).toBe('${{ always() }}');
    expect(final?.run).toContain("$DEPLOY_OUTCOME\" == 'success'");
    expect(final?.run).toContain("$RECOVERY_OUTCOME\" == 'success'");
    expect(final?.run).toContain(
      'AUTH_BRIDGE_PREPARED_DEPLOY_OR_RECOVERY_UNVERIFIED',
    );
  });

  it('attests the installed tree after install and before any protected secret', () => {
    const source = workflow();
    const installIndex = source.indexOf(
      'pnpm --dir services/auth-bridge install --frozen-lockfile --ignore-scripts --package-import-method=copy',
    );
    const attestIndex = source.indexOf(
      'node scripts/auth-bridge-notification-prepared-installed-toolchain.mjs',
    );
    const sourceAttestIndex = source.indexOf(
      'node scripts/auth-bridge-notification-prepared-deploy-closure.mjs',
    );
    const sourceReattestIndex = source.indexOf(
      'node scripts/auth-bridge-notification-prepared-deploy-closure.mjs',
      attestIndex + 1,
    );
    const secretIndex = source.indexOf(
      'WARPKEEP_AUTH_BRIDGE_CLOUDFLARE_API_TOKEN: ${{ secrets.',
    );
    expect(installIndex).toBeGreaterThan(0);
    expect(sourceAttestIndex).toBeGreaterThan(installIndex);
    expect(attestIndex).toBeGreaterThan(sourceAttestIndex);
    expect(sourceReattestIndex).toBeGreaterThan(attestIndex);
    expect(secretIndex).toBeGreaterThan(sourceReattestIndex);
    expect(source.match(
      /node scripts\/auth-bridge-notification-prepared-installed-toolchain\.mjs/gu,
    )).toHaveLength(1);
    expect(source.match(
      /node scripts\/auth-bridge-notification-prepared-deploy-closure\.mjs/gu,
    )).toHaveLength(2);
  });

  it('keeps the A then B bootstrap verifiers builtins-only', () => {
    for (const path of [
      'scripts/auth-bridge-notification-prepared-deploy-closure.mjs',
      'scripts/auth-bridge-notification-prepared-installed-toolchain.mjs',
    ]) {
      const source = readFileSync(resolve(repositoryRoot, path), 'utf8');
      const specifiers = [...source.matchAll(
        /^import(?:[\s\S]*?from\s+)?['"]([^'"]+)['"];$/gmu,
      )].map(match => match[1]);
      expect(specifiers.length, path).toBeGreaterThan(0);
      expect(specifiers.every(specifier => specifier?.startsWith('node:')), path)
        .toBe(true);
    }
  });

  it('rejects a mutated B verifier before B can execute', () => {
    const root = createPolicyFixture();
    const verifier = resolve(
      root,
      'scripts/auth-bridge-notification-prepared-installed-toolchain.mjs',
    );
    writeFileSync(verifier, `${readFileSync(verifier, 'utf8')}\n`);
    let toolchainExecuted = false;
    expect(() => {
      verifyAuthBridgeNotificationPreparedDeployClosure({ repositoryRoot: root });
      toolchainExecuted = true;
    }).toThrow('AUTH_BRIDGE_PREPARED_DEPLOY_CLOSURE_BOOTSTRAP_INVALID');
    expect(toolchainExecuted).toBe(false);
  });

  it('never executes installed commands when the fixed tree authority mismatches', () => {
    const fixture = createInstalledToolchainFixture();
    const marker = resolve(fixture.root, 'installed-command-ran');
    const maliciousCommand = resolve(
      fixture.nodeModules,
      fixtureExecutablePaths.wrangler,
    );
    writeFileSync(maliciousCommand, `#!/bin/sh\ntouch ${marker}\n`);
    chmodSync(maliciousCommand, 0o755);
    expect(() => verifyInstalledToolchainFixture(fixture)).toThrow(
      /AUTH_BRIDGE_PREPARED_TOOLCHAIN_/u,
    );
    expect(() => readFileSync(marker)).toThrow();
    const source = workflow();
    expect(source).not.toContain('pnpm --dir services/auth-bridge run check');
    expect(source.indexOf(
      'node scripts/auth-bridge-notification-prepared-installed-toolchain.mjs',
    )).toBeLessThan(source.indexOf(
      'node scripts/auth-bridge-notification-prepared-deploy.mjs >/dev/null',
    ));
  });

  it('rejects hosted-runner or direct-secret mutations in the static policy', () => {
    const hosted = createPolicyFixture();
    const hostedWorkflow = resolve(
      hosted,
      '.github/workflows/notification-bridge-prepared.yml',
    );
    writeFileSync(
      hostedWorkflow,
      readFileSync(hostedWorkflow, 'utf8').replace(
        'runs-on: [self-hosted, macOS, ARM64, warpkeep-production-admin, warpkeep-repository-exclusive]',
        'runs-on: ubuntu-latest',
      ),
    );
    expect(() => verifyAuthBridgeNotificationPreparedStaticPolicy({
      repositoryRoot: hosted,
    })).toThrow(/AUTH_BRIDGE_PREPARED_/u);

    const directSecret = createPolicyFixture();
    const directSecretWorkflow = resolve(
      directSecret,
      '.github/workflows/notification-bridge-prepared.yml',
    );
    writeFileSync(
      directSecretWorkflow,
      `${readFileSync(directSecretWorkflow, 'utf8')}\n    CLOUDFLARE_API_TOKEN: unsafe\n`,
    );
    expect(() => verifyAuthBridgeNotificationPreparedStaticPolicy({
      repositoryRoot: directSecret,
    })).toThrow(/AUTH_BRIDGE_PREPARED_DEPLOY_CLOSURE_/u);
  }, 180_000);

  it('accepts only the reviewed keep-bindings latest-head upload contract', () => {
    expect(() => verifyAuthBridgeNotificationPreparedUploadBoundarySources(
      preparedRuntimeBoundarySources(),
    )).not.toThrow();
  }, 180_000);

  it.each([
    {
      name: 'inherit query',
      before: '`${basePath}/versions`,\n        {\n          method: \'POST\'',
      after:
        '`${basePath}/versions?bindings_inherit=strict`,\n        {\n          method: \'POST\'',
    },
    {
      name: 'inherit descriptor',
      before:
        'bindings: Object.freeze([\n        ...local.metadata.bindings,\n        Object.freeze({',
      after: 'bindings: Object.freeze([\n        ...local.metadata.bindings,\n'
        + '        Object.freeze({ name: \'ADMIN_TOKEN_SECRET\', type: \'inherit\' }),\n'
        + '        Object.freeze({',
    },
    {
      name: 'inherit version pin',
      before:
        "name: AUTH_BRIDGE_NOTIFICATION_PREPARED_PLAYER_CANARY_SECRET_BINDING,\n          text: playerCanaryOwnerFid,",
      after:
        "name: AUTH_BRIDGE_NOTIFICATION_PREPARED_PLAYER_CANARY_SECRET_BINDING,\n"
        + '          version_id: plan.predecessorVersionId,\n'
        + '          text: playerCanaryOwnerFid,',
    },
  ])('rejects reintroduced $name mechanics', ({ before, after }) => {
    const sources = preparedRuntimeBoundarySources();
    mutatePreparedRuntimeSource(sources, before, after);
    expect(() => verifyAuthBridgeNotificationPreparedUploadBoundarySources(
      sources,
    )).toThrow('AUTH_BRIDGE_PREPARED_RUNTIME_BOUNDARY_INVALID');
  }, 180_000);

  it.each([
    {
      name: 'missing',
      after: '|| metadata.keep_bindings !== undefined',
    },
    {
      name: 'reordered',
      after: "|| !exactJson(metadata.keep_bindings, ['secret_key', 'secret_text'])",
    },
  ])('rejects $name keep-binding types', ({ after }) => {
    const sources = preparedRuntimeBoundarySources();
    mutatePreparedRuntimeSource(
      sources,
      "|| !exactJson(metadata.keep_bindings, ['secret_text', 'secret_key'])",
      after,
    );
    expect(() => verifyAuthBridgeNotificationPreparedUploadBoundarySources(
      sources,
    )).toThrow('AUTH_BRIDGE_PREPARED_RUNTIME_BOUNDARY_INVALID');
  }, 180_000);

  it.each([
    {
      name: 'filtered latest-version lookup',
      before: '`${basePath}/versions?page=1&per_page=1`',
      after: '`${basePath}/versions?deployable=true&page=1&per_page=1`',
    },
    {
      name: 'optional latest-version number',
      before: '!Number.isSafeInteger(items[0].number)',
      after: '(items[0].number !== undefined && !Number.isSafeInteger(items[0].number))',
    },
    {
      name: 'overflowing predecessor number',
      before: 'predecessorVersionNumber >= Number.MAX_SAFE_INTEGER',
      after: 'predecessorVersionNumber > Number.MAX_SAFE_INTEGER',
    },
    {
      name: 'unsequenced upload response',
      before: ') !== expectedSuccessorVersionNumber(',
      after: ') === expectedSuccessorVersionNumber(',
    },
    {
      name: 'unsequenced candidate detail',
      before: 'candidateVersionNumber !== expectedSuccessorVersionNumber(',
      after: 'candidateVersionNumber === expectedSuccessorVersionNumber(',
    },
    {
      name: 'missing candidate-list number validation',
      before: '|| !Number.isSafeInteger(item.number)',
      after: '|| false /* candidate number unchecked */',
    },
    {
      name: 'candidate no longer latest at release',
      before: 'latest.versionId !== input.versionId',
      after: 'latest.versionId === input.versionId',
    },
    {
      name: 'runtime adoption before upload WAL',
      before: "phase === 'remote-reconcile-started' && candidates.length !== 0",
      after: "phase === 'upload-invoked' && candidates.length !== 0",
    },
  ])('rejects $name lineage mutation', ({ before, after }) => {
    const sources = preparedRuntimeBoundarySources();
    mutatePreparedRuntimeSource(sources, before, after);
    expect(() => verifyAuthBridgeNotificationPreparedUploadBoundarySources(
      sources,
    )).toThrow('AUTH_BRIDGE_PREPARED_RUNTIME_BOUNDARY_INVALID');
  }, 180_000);

  it('rejects adapter adoption before the upload-invoked WAL marker', () => {
    const sources = preparedRuntimeBoundarySources();
    mutatePreparedAdapterSource(
      sources,
      "startingPhase === 'remote-reconcile-started'\n    && prior.length !== 0",
      "startingPhase === 'upload-invoked'\n    && prior.length !== 0",
    );
    expect(() => verifyAuthBridgeNotificationPreparedUploadBoundarySources(
      sources,
    )).toThrow('AUTH_BRIDGE_PREPARED_RUNTIME_BOUNDARY_INVALID');
  }, 180_000);

  it.each([
    {
      name: 'lineage error removed from invalid upload responses',
      before:
        "        'AUTH_BRIDGE_PREPARED_CLOUDFLARE_UPLOAD_RESPONSE_INVALID',\n"
        + "        'AUTH_BRIDGE_PREPARED_CLOUDFLARE_VERSION_LINEAGE_MISMATCH',",
      after: "        'AUTH_BRIDGE_PREPARED_CLOUDFLARE_UPLOAD_RESPONSE_INVALID',",
    },
    {
      name: 'provider rejection terminal branch is conditionally skipped',
      before: '    if (isSanitizedProviderRejection(uploadError)) {\n'
        + '      await journal.uploadAdjudicationRequired(Object.freeze({',
      after: '    if (uploadError === undefined\n'
        + '      && isSanitizedProviderRejection(uploadError)) {\n'
        + '      await journal.uploadAdjudicationRequired(Object.freeze({',
    },
  ])('rejects adapter mutation: $name', ({ before, after }) => {
    const sources = preparedRuntimeBoundarySources();
    mutatePreparedAdapterSource(sources, before, after);
    expect(() => verifyAuthBridgeNotificationPreparedUploadBoundarySources(
      sources,
    )).toThrow('AUTH_BRIDGE_PREPARED_RUNTIME_BOUNDARY_INVALID');
  }, 180_000);

  it('rejects moving predecessor stability after the final release latest check', () => {
    const sources = preparedRuntimeBoundarySources();
    const stableThenLatest =
      '    await assertPredecessorStable(Object.freeze({\n'
      + '      deploymentId: input.predecessorDeploymentId,\n'
      + '      versionId: input.predecessorVersionId,\n'
      + '    }));\n'
      + '    const latest = await inspectLatestUploadedVersion();';
    mutatePreparedRuntimeSource(
      sources,
      stableThenLatest,
      '    const latest = await inspectLatestUploadedVersion();\n'
        + '    await assertPredecessorStable(Object.freeze({\n'
        + '      deploymentId: input.predecessorDeploymentId,\n'
        + '      versionId: input.predecessorVersionId,\n'
        + '    }));',
    );
    expect(() => verifyAuthBridgeNotificationPreparedUploadBoundarySources(
      sources,
    )).toThrow('AUTH_BRIDGE_PREPARED_RUNTIME_BOUNDARY_INVALID');
  }, 180_000);

  it('rejects a missing final latest-head check', () => {
    const guardedUpload =
      '      await assertLatestUploadIsPredecessor(Object.freeze({\n'
      + '        versionId: plan.predecessorVersionId,\n'
      + '        versionNumber: preparedPredecessorVersionNumber,\n'
      + '      }));\n';
    const sources = preparedRuntimeBoundarySources();
    mutatePreparedRuntimeSource(
      sources,
      guardedUpload,
      '',
    );
    expect(() => verifyAuthBridgeNotificationPreparedUploadBoundarySources(
      sources,
    )).toThrow('AUTH_BRIDGE_PREPARED_RUNTIME_BOUNDARY_INVALID');
  }, 180_000);

  it('rejects a moved final latest-head check', () => {
    const guardedUpload =
      '      await assertLatestUploadIsPredecessor(Object.freeze({\n'
      + '        versionId: plan.predecessorVersionId,\n'
      + '        versionNumber: preparedPredecessorVersionNumber,\n'
      + '      }));\n';
    const sources = preparedRuntimeBoundarySources();
    mutatePreparedRuntimeSource(
      sources,
      guardedUpload,
      '',
    );
    mutatePreparedRuntimeSource(
      sources,
      "      if (response.resultInfo !== undefined) {",
      '      await assertLatestUploadIsPredecessor(Object.freeze({\n'
        + '        versionId: plan.predecessorVersionId,\n'
        + '        versionNumber: preparedPredecessorVersionNumber,\n'
        + '      }));\n'
        + '      if (response.resultInfo !== undefined) {',
    );
    expect(() => verifyAuthBridgeNotificationPreparedUploadBoundarySources(
      sources,
    )).toThrow('AUTH_BRIDGE_PREPARED_RUNTIME_BOUNDARY_INVALID');
  }, 180_000);

  it('rejects a second or retried version-upload POST', () => {
    // Keep one full closure-authenticated negative case to prove the
    // production static-policy entrypoint delegates to the source verifier.
    const root = createPolicyFixture();
    mutatePreparedRuntime(
      root,
      '      const response = await api.json(\n'
        + '        `${basePath}/versions`,',
      '      await api.json(\n'
        + '        `${basePath}/versions`,\n'
        + '        { method: \'POST\', headers: { \'content-type\': source.contentType }, body, mutation: true },\n'
        + '      );\n'
        + '      const response = await api.json(\n'
        + '        `${basePath}/versions`,',
    );
    expect(() => verifyAuthBridgeNotificationPreparedStaticPolicy({
      repositoryRoot: root,
    })).toThrow('AUTH_BRIDGE_PREPARED_RUNTIME_BOUNDARY_INVALID');
  }, 180_000);

  it('rejects a second adapter upload invocation', () => {
    const sources = preparedRuntimeBoundarySources();
    mutatePreparedAdapterSource(
      sources,
      '      upload = await uploadVersion(canonicalContract, uploadPlan);',
      '      upload = await uploadVersion(canonicalContract, uploadPlan);\n'
        + '      upload = await uploadVersion(canonicalContract, uploadPlan);',
    );
    expect(() => verifyAuthBridgeNotificationPreparedUploadBoundarySources(
      sources,
    )).toThrow('AUTH_BRIDGE_PREPARED_RUNTIME_BOUNDARY_INVALID');
  }, 180_000);

  it.each([
    {
      name: 'nonterminal adjudication ordinal',
      before: "'upload-adjudication-required': 8,",
      after: "'upload-adjudication-required': 4,",
    },
    {
      name: 'adjudication phase removed from record grammar',
      before:
        "const PHASE_PATTERN = '(prepared|remote-reconcile-started|upload-invoked|uploaded|release-uncertain|release-invoked|completed|upload-adjudication-required)';",
      after:
        "const PHASE_PATTERN = '(prepared|remote-reconcile-started|upload-invoked|uploaded|release-uncertain|release-invoked|completed)';",
    },
    {
      name: 'arbitrary adjudication reason',
      before: "      'definitive-provider-rejection',\n    ].includes(payload.reason)",
      after: "      'definitive-provider-rejection',\n      payload.reason,\n    ].includes(payload.reason)",
    },
    {
      name: 'adjudication allowed before upload invocation',
      before:
        "phase === 'upload-adjudication-required'\n        && previous?.value.phase !== 'upload-invoked'",
      after:
        "phase === 'upload-adjudication-required'\n        && previous?.value.phase !== 'remote-reconcile-started'",
    },
    {
      name: 'adjudication API writes a nonterminal phase',
      before: "return transition('upload-adjudication-required', value);",
      after: "return transition('uploaded', value);",
    },
    {
      name: 'monotonic ordinal guard permits terminal regression',
      before: 'previous.ordinal >= ordinal',
      after: 'previous.ordinal < ordinal',
    },
  ])('rejects journal terminal mutation: $name', ({ before, after }) => {
    const sources = preparedRuntimeBoundarySources();
    mutatePreparedJournalSource(sources, before, after);
    expect(() => verifyAuthBridgeNotificationPreparedUploadBoundarySources(
      sources,
    )).toThrow('AUTH_BRIDGE_PREPARED_RUNTIME_BOUNDARY_INVALID');
  }, 180_000);

  it.each([
    {
      name: 'missing invalid-response terminal append',
      before:
        '      await journal.uploadAdjudicationRequired(Object.freeze({\n'
        + "        reason: 'invalid-upload-response',\n"
        + '      }));',
      after: '      // adjudication append removed',
    },
    {
      name: 'missing provider-rejection terminal append',
      before:
        '      await journal.uploadAdjudicationRequired(Object.freeze({\n'
        + "        reason: 'definitive-provider-rejection',\n"
        + '      }));',
      after: '      // adjudication append removed',
    },
    {
      name: 'restart ignores durable adjudication',
      before: "if (journalState.phase === 'upload-adjudication-required') {",
      after: "if (journalState.phase === 'upload-invoked') {",
    },
    {
      name: 'adjudication journal API no longer required',
      before: "      'uploadAdjudicationRequired',\n",
      after: '',
    },
  ])('rejects adapter terminal mutation: $name', ({ before, after }) => {
    const sources = preparedRuntimeBoundarySources();
    mutatePreparedAdapterSource(sources, before, after);
    expect(() => verifyAuthBridgeNotificationPreparedUploadBoundarySources(
      sources,
    )).toThrow('AUTH_BRIDGE_PREPARED_RUNTIME_BOUNDARY_INVALID');
  }, 180_000);

  it('rejects runtime reconciliation that fetches after durable adjudication', () => {
    const sources = preparedRuntimeBoundarySources();
    mutatePreparedRuntimeSource(
      sources,
      "    if (phase === 'upload-adjudication-required') {\n"
        + '      fail(\n'
        + "        'AUTH_BRIDGE_PREPARED_DEPLOY_UPLOAD_OPERATOR_ADJUDICATION_REQUIRED',\n"
        + '        true,\n'
        + '      );\n'
        + '    }\n',
      '',
    );
    expect(() => verifyAuthBridgeNotificationPreparedUploadBoundarySources(
      sources,
    )).toThrow('AUTH_BRIDGE_PREPARED_RUNTIME_BOUNDARY_INVALID');
  }, 180_000);

  it('rejects adapter restart reconciliation from a bare upload-invoked WAL state', () => {
    const sources = preparedRuntimeBoundarySources();
    mutatePreparedAdapterSource(
      sources,
      "  if (journalState.phase === 'upload-invoked') {\n"
        + '    throw ambiguous(\n'
        + '      undefined,\n'
        + "      'AUTH_BRIDGE_PREPARED_DEPLOY_UPLOAD_OPERATOR_ADJUDICATION_REQUIRED',\n"
        + '    );\n'
        + '  }\n',
      '',
    );
    expect(() => verifyAuthBridgeNotificationPreparedUploadBoundarySources(
      sources,
    )).toThrow('AUTH_BRIDGE_PREPARED_RUNTIME_BOUNDARY_INVALID');
  }, 180_000);

  it.each([
    {
      name: 'bare upload-invoked state may fetch candidates',
      before: 'if (sameRuntimeUploadReconciliationAuthorized !== true) {',
      after: 'if (sameRuntimeUploadReconciliationAuthorized === undefined) {',
    },
    {
      name: 'same-instance authorization is not consumed before reads',
      before: '      sameRuntimeUploadReconciliationAuthorized = false;\n'
        + '    }\n'
        + "    if (phase === 'remote-reconcile-started') {",
      after: '    }\n'
        + "    if (phase === 'remote-reconcile-started') {",
    },
    {
      name: 'upload authorization is not immediately before the sole POST',
      before: '      sameRuntimeUploadReconciliationAuthorized = true;\n'
        + '      const response = await api.json(',
      after: '      const response = await api.json(',
    },
    {
      name: 'dispose retains same-instance upload authorization',
      before: '      preparedPredecessorVersionNumber = undefined;\n'
        + '      sameRuntimeUploadReconciliationAuthorized = false;\n'
        + '    },',
      after: '      preparedPredecessorVersionNumber = undefined;\n'
        + '    },',
    },
  ])('rejects runtime upload-invoked authorization mutation: $name', ({ before, after }) => {
    const sources = preparedRuntimeBoundarySources();
    mutatePreparedRuntimeSource(sources, before, after);
    expect(() => verifyAuthBridgeNotificationPreparedUploadBoundarySources(
      sources,
    )).toThrow('AUTH_BRIDGE_PREPARED_RUNTIME_BOUNDARY_INVALID');
  }, 180_000);

  it('uses only the exact lockfile toolchain from the protected checkout', () => {
    const source = workflow();
    expect(source).toContain(
      'pnpm/action-setup@0ebf47130e4866e96fce0953f49152a61190b271',
    );
    expect(source).toContain('version: 11.7.0');
    expect(source).toContain(
      'pnpm --dir services/auth-bridge install --frozen-lockfile --ignore-scripts --package-import-method=copy',
    );
    expect(source).not.toContain('pnpm --dir services/auth-bridge run check');
    expect(source).toContain(
      'node scripts/verify-auth-bridge-notification-prepared-policy.mjs',
    );
    expect(source).toContain(
      'node scripts/auth-bridge-notification-prepared-installed-toolchain.mjs',
    );
    expect(source.indexOf(
      'node scripts/auth-bridge-notification-prepared-installed-toolchain.mjs',
    )).toBeLessThan(source.indexOf(
      'WARPKEEP_AUTH_BRIDGE_CLOUDFLARE_API_TOKEN: ${{ secrets.',
    ));
    expect(source).not.toContain('--print-candidate');
  });

  it('keeps the private receipt path out of argv and diagnostic output', () => {
    const privatePath = '/private/sensitive-receipt-location.json';
    const result = spawnSync(
      process.execPath,
      [resolve(
        repositoryRoot,
        'scripts/verify-auth-bridge-notification-prepared-receipt.mjs',
      )],
      {
        cwd: repositoryRoot,
        encoding: 'utf8',
        env: {
          ...process.env,
          WARPKEEP_AUTH_BRIDGE_NOTIFICATION_PREPARED_RECEIPT_PATH: privatePath,
        },
      },
    );
    expect(result.status).toBe(1);
    expect(result.stdout).toBe('');
    expect(result.stderr).toMatch(/^AUTH_BRIDGE_PREPARED_[A-Z_]+\n$/u);
    expect(result.stderr).not.toContain(privatePath);
  });
});
