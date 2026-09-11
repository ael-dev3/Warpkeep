import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  lstatSync,
  readFileSync,
} from 'node:fs';
import { userInfo } from 'node:os';
import { resolve } from 'node:path';

import {
  verifyAuthBridgeNotificationPreparedDeployClosure,
} from './auth-bridge-notification-prepared-deploy-closure.mjs';
import {
  verifyAuthBridgeNotificationPreparedInstalledToolchain,
} from './auth-bridge-notification-prepared-installed-toolchain.mjs';
import {
  verifyAuthBridgeNotificationPreparedStaticPolicy,
} from './verify-auth-bridge-notification-prepared-policy.mjs';
import {
  runAuthBridgeNotificationPreparedDeploy,
  runAuthBridgeNotificationPreparedReadOnlyRecovery,
} from './auth-bridge-notification-prepared-deploy.mjs';

const REPOSITORY = 'ael-dev3/Warpkeep';
const WORKFLOW_PATH = '.github/workflows/notification-bridge-prepared-linux.yml';
const WORKFLOW_REF = `${REPOSITORY}/${WORKFLOW_PATH}@refs/heads/main`;
const SOURCE_COMMIT = /^[a-f0-9]{40}$/u;
const SHA256 = /^[a-f0-9]{64}$/u;
const NODE_EXECUTABLE =
  '/home/warpkeep/.warpkeep/release-preparation-v1/toolchain/node-v22.22.3-linux-x64/bin/node';
const PNPM_EXECUTABLE =
  '/home/warpkeep/.warpkeep/release-preparation-v1/toolchain/pnpm-v11.7.0-linux-x64/pnpm';
const PNPM_MANIFEST =
  'scripts/auth-bridge-notification-prepared-pnpm-linux-x64-v1.json';
const PNPM_EXECUTABLE_SHA256 =
  '5eb52f5b7fe3c4ef589393f81f33b28482f7657109239de7bc5dc4e4e56aafc4';
const PNPM_PACKAGE_SHA256 =
  '67b035e322203961795e8e34ca63a08c37a4386eda94107fb3d28f3246d882ad';
const PNPM_PACKAGE_PATH =
  '/home/warpkeep/.warpkeep/release-preparation-v1/toolchain/pnpm-v11.7.0-linux-x64/package/bin/pnpm.cjs';
const PNPM_ARCHIVE_SHA256 =
  'deafa7ec98a1218b6a047289b92fbe2395c1e22d3495bb711653013218ee15ee';
const EXPECTED_PNPM_MANIFEST_SHA256 =
  '346661bf89426db64f2911b6b0e7d3f5abf0d717d067b0b6c81602e6c570519a';

function fail(code) {
  const error = new Error(code);
  error.code = code;
  throw error;
}

function requireString(name) {
  const value = process.env[name];
  if (typeof value !== 'string' || value.length === 0 || /[\0\r\n]/u.test(value)) {
    fail('AUTH_BRIDGE_PREPARED_LINUX_RUNNER_ENVIRONMENT_INVALID');
  }
  return value;
}

function sha256File(path) {
  let body;
  try {
    const metadata = lstatSync(path);
    if (!metadata.isFile() || metadata.isSymbolicLink() || metadata.nlink !== 1
      || metadata.uid !== process.getuid() || (metadata.mode & 0o022) !== 0) {
      fail('AUTH_BRIDGE_PREPARED_LINUX_RUNNER_TOOL_INVALID');
    }
    body = readFileSync(path);
  } catch {
    fail('AUTH_BRIDGE_PREPARED_LINUX_RUNNER_TOOL_INVALID');
  }
  try {
    return createHash('sha256').update(body).digest('hex');
  } finally {
    body.fill(0);
  }
}

function git(args) {
  try {
    return execFileSync('/usr/bin/git', args, {
      cwd: process.cwd(),
      env: Object.freeze({
        GIT_CONFIG_GLOBAL: '/dev/null',
        GIT_CONFIG_SYSTEM: '/dev/null',
        GIT_CONFIG_NOSYSTEM: '1',
        GIT_TERMINAL_PROMPT: '0',
        GIT_NO_REPLACE_OBJECTS: '1',
        PATH: '/usr/bin:/bin',
        HOME: '/home/warpkeep',
      }),
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      maxBuffer: 256 * 1024,
    }).trim();
  } catch {
    fail('AUTH_BRIDGE_PREPARED_LINUX_RUNNER_CHECKOUT_INVALID');
  }
}

async function verifyWorkflowAuthority(sourceCommit, token) {
  const request = async path => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 10_000);
    try {
      const response = await fetch(`https://api.github.com${path}`, {
        headers: {
          accept: 'application/vnd.github+json',
          authorization: `Bearer ${token}`,
          'x-github-api-version': '2022-11-28',
        },
        redirect: 'error',
        signal: controller.signal,
      });
      if (!response.ok || response.redirected || response.body === null) {
        fail('AUTH_BRIDGE_PREPARED_LINUX_RUNNER_AUTHORITY_UNAVAILABLE');
      }
      const body = await response.arrayBuffer();
      if (body.byteLength > 512 * 1024) {
        fail('AUTH_BRIDGE_PREPARED_LINUX_RUNNER_AUTHORITY_UNAVAILABLE');
      }
      try {
        return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(body));
      } catch {
        fail('AUTH_BRIDGE_PREPARED_LINUX_RUNNER_AUTHORITY_UNAVAILABLE');
      }
    } catch (error) {
      if (typeof error?.code === 'string'
        && error.code.startsWith('AUTH_BRIDGE_PREPARED_LINUX_RUNNER_')) throw error;
      fail('AUTH_BRIDGE_PREPARED_LINUX_RUNNER_AUTHORITY_UNAVAILABLE');
    } finally {
      clearTimeout(timer);
    }
  };
  const [branch, run] = await Promise.all([
    request(`/repos/${REPOSITORY}/branches/main`),
    request(`/repos/${REPOSITORY}/actions/runs/${requireString('GITHUB_RUN_ID')}`),
  ]);
  if (
    branch?.name !== 'main'
    || branch.protected !== true
    || branch.commit?.sha !== sourceCommit
    || String(run?.id) !== process.env.GITHUB_RUN_ID
    || run.run_attempt !== Number(process.env.GITHUB_RUN_ATTEMPT)
    || run.event !== 'workflow_dispatch'
    || run.status !== 'in_progress'
    || run.conclusion !== null
    || run.head_branch !== 'main'
    || run.head_sha !== sourceCommit
    || run.path !== WORKFLOW_PATH
    || run.repository?.full_name !== REPOSITORY
  ) fail('AUTH_BRIDGE_PREPARED_LINUX_RUNNER_AUTHORITY_INVALID');
}

async function main() {
  if (process.platform !== 'linux' || process.arch !== 'x64'
    || process.execPath !== NODE_EXECUTABLE
    || process.getuid?.() !== 1000
    || process.getgid?.() !== 1000
    || userInfo().username !== 'warpkeep') {
    fail('AUTH_BRIDGE_PREPARED_LINUX_RUNNER_IDENTITY_INVALID');
  }
  const sourceCommit = requireString('WARPKEEP_EXPECTED_SOURCE_COMMIT');
  if (!SOURCE_COMMIT.test(sourceCommit)
    || requireString('GITHUB_ACTIONS') !== 'true'
    || requireString('GITHUB_EVENT_NAME') !== 'workflow_dispatch'
    || requireString('GITHUB_REF') !== 'refs/heads/main'
    || requireString('GITHUB_REPOSITORY') !== REPOSITORY
    || requireString('GITHUB_SHA') !== sourceCommit
    || requireString('GITHUB_WORKFLOW_REF') !== WORKFLOW_REF
    || requireString('WARPKEEP_AUTH_BRIDGE_PREPARED_INSTALLED_TOOLCHAIN_PROFILE')
      !== 'linux-x64') {
    fail('AUTH_BRIDGE_PREPARED_LINUX_RUNNER_ENVIRONMENT_INVALID');
  }
  const repositoryRoot = resolve(process.cwd());
  if (git(['rev-parse', '--verify', 'HEAD^{commit}']) !== sourceCommit
    || git(['remote', 'get-url', 'origin']) !== 'https://github.com/ael-dev3/Warpkeep'
    || git(['status', '--porcelain=v1', '--untracked-files=all']) !== '') {
    fail('AUTH_BRIDGE_PREPARED_LINUX_RUNNER_CHECKOUT_INVALID');
  }
  if (sha256File(PNPM_EXECUTABLE) !== PNPM_EXECUTABLE_SHA256
    || sha256File(PNPM_PACKAGE_PATH) !== PNPM_PACKAGE_SHA256) {
    fail('AUTH_BRIDGE_PREPARED_LINUX_RUNNER_TOOL_INVALID');
  }
  const manifestPath = resolve(repositoryRoot, PNPM_MANIFEST);
  let manifest;
  try { manifest = JSON.parse(readFileSync(manifestPath, 'utf8')); } catch {
    fail('AUTH_BRIDGE_PREPARED_LINUX_RUNNER_MANIFEST_INVALID');
  }
  if (
    manifest.schemaVersion !== 1
    || manifest.profile !== 'warpkeep-auth-bridge-notification-prepared-pnpm-linux-x64-v1'
    || manifest.packageManager !== 'pnpm@11.7.0'
    || manifest.platform !== 'linux'
    || manifest.architecture !== 'x64'
    || manifest.nodeVersion !== 'v22.22.3'
    || manifest.pnpmExecutable !== PNPM_EXECUTABLE
    || manifest.pnpmExecutableSha256 !== PNPM_EXECUTABLE_SHA256
    || manifest.pnpmPackagePath !== PNPM_PACKAGE_PATH
    || manifest.pnpmPackageSha256 !== PNPM_PACKAGE_SHA256
    || manifest.archiveSha256 !== PNPM_ARCHIVE_SHA256
  ) fail('AUTH_BRIDGE_PREPARED_LINUX_RUNNER_MANIFEST_INVALID');
  if (requireString('WARPKEEP_PREPARED_LINUX_INSTALLED_TOOLCHAIN_MANIFEST_SHA256')
      !== 'bcc41d30dbb00ecd612a1fdb5fe87b5e047d8cc777d0af9fc360b40e06bc1de2'
    || !SHA256.test(EXPECTED_PNPM_MANIFEST_SHA256)
    || sha256File(manifestPath) !== EXPECTED_PNPM_MANIFEST_SHA256) {
    fail('AUTH_BRIDGE_PREPARED_LINUX_RUNNER_MANIFEST_PIN_INVALID');
  }
  const closure = verifyAuthBridgeNotificationPreparedDeployClosure({ repositoryRoot });
  if (closure.manifestSha256 !== requireString('WARPKEEP_PREPARED_SOURCE_CLOSURE_MANIFEST_SHA256')) {
    fail('AUTH_BRIDGE_PREPARED_LINUX_RUNNER_CLOSURE_INVALID');
  }
  const installed = verifyAuthBridgeNotificationPreparedInstalledToolchain({
    repositoryRoot,
    nodeExecutable: process.execPath,
  });
  const policy = verifyAuthBridgeNotificationPreparedStaticPolicy({ repositoryRoot });
  if (installed.profile
      !== 'warpkeep-auth-bridge-notification-prepared-installed-toolchain-linux-x64-v1'
    || policy.guardedRecoveryRequired !== true) {
    fail('AUTH_BRIDGE_PREPARED_LINUX_RUNNER_POLICY_INVALID');
  }
  const token = requireString('GITHUB_TOKEN');
  await verifyWorkflowAuthority(sourceCommit, token);
  const operation = requireString('WARPKEEP_OPERATION');
  if (operation === 'deploy') {
    const result = await runAuthBridgeNotificationPreparedDeploy();
    if (result?.outcome !== 'published') fail('AUTH_BRIDGE_PREPARED_LINUX_RUNNER_DEPLOY_INVALID');
    process.stdout.write('auth-bridge prepared Linux deployment verified\n');
  } else if (operation === 'recover-expired-authority-read-only') {
    const result = await runAuthBridgeNotificationPreparedReadOnlyRecovery();
    if (result?.outcome !== 'verified-read-only-recovery') {
      fail('AUTH_BRIDGE_PREPARED_LINUX_RUNNER_RECOVERY_INVALID');
    }
    process.stdout.write('auth-bridge prepared Linux recovery verified\n');
  } else {
    fail('AUTH_BRIDGE_PREPARED_LINUX_RUNNER_OPERATION_INVALID');
  }
}

main().catch(error => {
  const code = typeof error?.code === 'string' && /^[A-Z0-9_]{8,128}$/u.test(error.code)
    ? error.code
    : 'AUTH_BRIDGE_PREPARED_LINUX_RUNNER_FAILED';
  process.stderr.write(`${code}\n`);
  process.exitCode = 1;
});
