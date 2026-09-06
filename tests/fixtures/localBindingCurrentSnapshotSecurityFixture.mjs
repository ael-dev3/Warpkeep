import { randomBytes } from 'node:crypto';
import {
  chmodSync, existsSync, mkdirSync, rmSync, writeFileSync,
} from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

import { localBindingRuntimeTestSeams } from '../../scripts/local-binding-runtime-core.mjs';

const RUNS_ROOT = '/home/snapmeter/.warpkeep/release-preparation-v1/runs';
const operationRoot = join(RUNS_ROOT, `binding-${randomBytes(16).toString('hex')}`);
const repositoryRoot = join(operationRoot, 'fixture-repository');
const ambientRoot = join(operationRoot, 'ambient');
const systemHooks = join(ambientRoot, 'system-hooks');
const globalHooks = join(ambientRoot, 'global-hooks');
const forbiddenHooks = join(ambientRoot, 'forbidden-hooks');
const templateRoot = join(ambientRoot, 'template');
const systemMarker = join(operationRoot, 'system-hook-ran');
const globalMarker = join(operationRoot, 'global-hook-ran');
const templateMarker = join(operationRoot, 'template-hook-ran');
const forbiddenMarker = join(operationRoot, 'forbidden-hook-ran');
const systemConfig = join(ambientRoot, 'system.gitconfig');
const globalConfig = join(ambientRoot, 'global.gitconfig');

function setupGit(cwd, args) {
  const result = spawnSync('/usr/bin/git', [
    '--no-pager', '--no-optional-locks', '--no-replace-objects',
    '-c', 'core.hooksPath=/dev/null', '-c', 'init.templateDir=', ...args,
  ], {
    cwd,
    encoding: 'utf8',
    killSignal: 'SIGKILL',
    maxBuffer: 1024 * 1024,
    shell: false,
    stdio: ['ignore', 'pipe', 'pipe'],
    timeout: 10_000,
    env: {
      GIT_ATTR_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_NOSYSTEM: '1',
      GIT_CONFIG_SYSTEM: '/dev/null', GIT_EXEC_PATH: '/usr/lib/git-core',
      GIT_OPTIONAL_LOCKS: '0', GIT_PAGER: 'cat', GIT_TERMINAL_PROMPT: '0',
      HOME: operationRoot, LANG: 'C', LC_ALL: 'C', PAGER: 'cat', PATH: '/usr/bin:/bin',
    },
  });
  if (result.error?.code === 'ETIMEDOUT') throw new Error('FIXTURE_GIT_TIMEOUT');
  if (result.status !== 0 || result.signal !== null || result.error !== undefined) {
    throw new Error('FIXTURE_GIT_FAILED');
  }
  return result.stdout.trim();
}

try {
  mkdirSync(operationRoot, { mode: 0o700 });
  mkdirSync(repositoryRoot, { mode: 0o700 });
  mkdirSync(systemHooks, { recursive: true, mode: 0o700 });
  mkdirSync(globalHooks, { recursive: true, mode: 0o700 });
  mkdirSync(forbiddenHooks, { recursive: true, mode: 0o700 });
  mkdirSync(join(templateRoot, 'hooks'), { recursive: true, mode: 0o700 });
  writeFileSync(join(systemHooks, 'post-checkout'),
    `#!/bin/sh\n/usr/bin/printf ran > ${JSON.stringify(systemMarker)}\n`, { mode: 0o700 });
  writeFileSync(join(globalHooks, 'post-checkout'),
    `#!/bin/sh\n/usr/bin/printf ran > ${JSON.stringify(globalMarker)}\n`, { mode: 0o700 });
  writeFileSync(join(forbiddenHooks, 'post-checkout'),
    `#!/bin/sh\n/usr/bin/printf ran > ${JSON.stringify(forbiddenMarker)}\n`, { mode: 0o700 });
  writeFileSync(join(templateRoot, 'hooks', 'post-checkout'),
    `#!/bin/sh\n/usr/bin/printf ran > ${JSON.stringify(templateMarker)}\n`, { mode: 0o700 });
  writeFileSync(systemConfig, [
    '[core]', `\thooksPath = ${systemHooks}`,
    '[init]', `\ttemplateDir = ${templateRoot}`,
    '[url "https://forbidden.invalid/system/"]', `\tinsteadOf = ${repositoryRoot}`,
    '',
  ].join('\n'), { mode: 0o600 });
  writeFileSync(globalConfig, [
    '[core]', `\thooksPath = ${globalHooks}`,
    '[init]', `\ttemplateDir = ${templateRoot}`,
    '[url "https://forbidden.invalid/global/"]', `\tinsteadOf = ${repositoryRoot}`,
    '',
  ].join('\n'), { mode: 0o600 });

  setupGit(repositoryRoot, ['init', '--initial-branch=fixture']);
  writeFileSync(join(repositoryRoot, 'tracked.txt'), 'captured\n', { mode: 0o600 });
  setupGit(repositoryRoot, ['add', '--', 'tracked.txt']);
  setupGit(repositoryRoot, [
    '-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid',
    'commit', '--no-gpg-sign', '-m', 'fixture',
  ]);
  const commit = setupGit(repositoryRoot, ['rev-parse', '--verify', 'HEAD']);
  const tree = setupGit(repositoryRoot, ['rev-parse', '--verify', 'HEAD^{tree}']);
  setupGit(repositoryRoot, [
    'config', '--local', `url.https://forbidden.invalid/.insteadOf`, repositoryRoot,
  ]);

  const runSnapshot = (name, poisonedEnvironment) => {
    const caseRoot = join(operationRoot, name);
    const snapshotRoot = join(caseRoot, 'source');
    mkdirSync(caseRoot, { mode: 0o700 });
    const boundary = localBindingRuntimeTestSeams.createGenesis001CurrentFixedGitBoundary(
      caseRoot,
      {
        HOME: caseRoot, TMPDIR: caseRoot, PATH: '/usr/bin:/bin',
        LANG: 'C.UTF-8', LC_ALL: 'C.UTF-8', TZ: 'UTC', ...poisonedEnvironment,
      },
    );
    localBindingRuntimeTestSeams.initializeGenesis001CurrentIndependentSnapshot({
      repositoryRoot, root: snapshotRoot, commit, tree,
    }, boundary);
    return snapshotRoot;
  };
  const systemSnapshot = runSnapshot('system-case', {
    GIT_CONFIG_SYSTEM: systemConfig,
    GIT_CONFIG_NOSYSTEM: '0',
    GIT_TEMPLATE_DIR: templateRoot,
  });
  const globalSnapshot = runSnapshot('global-case', {
    GIT_CONFIG_GLOBAL: globalConfig,
    GIT_TEMPLATE_DIR: templateRoot,
  });

  const rejectedRoot = join(operationRoot, 'rejected-case');
  const rejectedSnapshot = join(rejectedRoot, 'source');
  mkdirSync(rejectedRoot, { mode: 0o700 });
  const rejectedBoundary = localBindingRuntimeTestSeams.createGenesis001CurrentFixedGitBoundary(
    rejectedRoot,
    { HOME: rejectedRoot, TMPDIR: rejectedRoot, PATH: '/usr/bin:/bin' },
  );
  let contextCode;
  try {
    localBindingRuntimeTestSeams.initializeGenesis001CurrentIndependentSnapshot({
      repositoryRoot, root: rejectedSnapshot, commit, tree,
    }, {
      ...rejectedBoundary,
      prepare(root) {
        rejectedBoundary.prepare(root);
        setupGit(root, ['config', '--local', 'core.hooksPath', forbiddenHooks]);
      },
    });
  }
  catch (error) { contextCode = error?.code ?? error?.message; }

  process.stdout.write(`${JSON.stringify({
    systemHookRan: existsSync(systemMarker),
    globalHookRan: existsSync(globalMarker),
    templateHookRan: existsSync(templateMarker),
    systemTemplateHookPresent: existsSync(join(systemSnapshot, '.git', 'hooks', 'post-checkout')),
    globalTemplateHookPresent: existsSync(join(globalSnapshot, '.git', 'hooks', 'post-checkout')),
    contextCode,
    forbiddenCheckoutPresent: existsSync(join(rejectedSnapshot, 'tracked.txt')),
  })}\n`);
} finally {
  if (existsSync(operationRoot)) {
    chmodSync(operationRoot, 0o700);
    rmSync(operationRoot, { recursive: true, force: false });
  }
}
