import { fstatSync, realpathSync, writeSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

import {
  verifyAuthBridgeNotificationPreparedDeployClosure,
} from './auth-bridge-notification-prepared-deploy-closure.mjs';
import {
  verifyAuthBridgeNotificationPreparedInstalledToolchain,
} from './auth-bridge-notification-prepared-installed-toolchain.mjs';

export const NOTIFICATION_PAGES_PRIVATE_DEPLOY_LAUNCHER_PROFILE =
  'warpkeep-notification-pages-private-deploy-launcher-v1';

const REPOSITORY_ROOT = realpathSync(resolve(import.meta.dirname, '..'));
const BASE_ENVIRONMENT_KEYS = Object.freeze([
  'CI',
  'GITHUB_ACTIONS',
  'GITHUB_EVENT_NAME',
  'GITHUB_OUTPUT_FD',
  'GITHUB_REPOSITORY',
  'GITHUB_RUN_ATTEMPT',
  'GITHUB_RUN_ID',
  'GITHUB_WORKFLOW_REF',
  'RUNNER_ARCH',
  'RUNNER_OS',
  'WARPKEEP_PAGES_SOURCE_COMMIT',
  'WARPKEEP_PRIVATE_NODE',
]);
const OPERATOR_ENVIRONMENT_KEYS = Object.freeze([
  ...BASE_ENVIRONMENT_KEYS,
  'WARPKEEP_EXPECTED_RUNNER_IDENTITY_DIGEST',
  'WARPKEEP_SOURCE_VERIFY_RUN_ATTEMPT',
  'WARPKEEP_SOURCE_VERIFY_RUN_ID',
].sort());
const DANGEROUS_KEYS = Object.freeze([
  'BASH_ENV',
  'ENV',
  'GIT_CONFIG',
  'GIT_CONFIG_COUNT',
  'GIT_CONFIG_GLOBAL',
  'GIT_CONFIG_SYSTEM',
  'GIT_DIR',
  'GIT_EXEC_PATH',
  'GIT_INDEX_FILE',
  'GIT_OBJECT_DIRECTORY',
  'GIT_REPLACE_REF_BASE',
  'GIT_WORK_TREE',
  'LD_LIBRARY_PATH',
  'NODE_EXTRA_CA_CERTS',
  'NODE_OPTIONS',
  'NODE_PATH',
  'NODE_REPL_EXTERNAL_MODULE',
  'NODE_TLS_REJECT_UNAUTHORIZED',
  'OPENSSL_CONF',
  'PATH',
  'PYTHONPATH',
  'SSL_CERT_DIR',
  'SSL_CERT_FILE',
]);

export class NotificationPagesPrivateDeployLauncherError extends Error {
  constructor(code) {
    super(code);
    this.name = 'NotificationPagesPrivateDeployLauncherError';
    this.code = code;
  }
}

function fail(code) {
  throw new NotificationPagesPrivateDeployLauncherError(code);
}

function exactEnvironment(command, environment) {
  const expectedKeys = command === 'attest-toolchain'
    ? BASE_ENVIRONMENT_KEYS
    : OPERATOR_ENVIRONMENT_KEYS;
  if (
    environment === null
    || typeof environment !== 'object'
    || Object.keys(environment).sort().join('\0')
      !== [...expectedKeys].sort().join('\0')
    || DANGEROUS_KEYS.some(key => Object.hasOwn(environment, key))
    || environment.CI !== 'true'
    || environment.GITHUB_ACTIONS !== 'true'
    || environment.GITHUB_EVENT_NAME !== 'workflow_run'
    || environment.GITHUB_REPOSITORY !== 'ael-dev3/Warpkeep'
    || environment.GITHUB_WORKFLOW_REF
      !== 'ael-dev3/Warpkeep/.github/workflows/deploy-pages.yml@refs/heads/main'
    || environment.RUNNER_OS !== 'macOS'
    || environment.RUNNER_ARCH !== 'ARM64'
    || !/^[1-9][0-9]{0,19}$/u.test(environment.GITHUB_RUN_ID ?? '')
    || !/^[1-9][0-9]{0,3}$/u.test(environment.GITHUB_RUN_ATTEMPT ?? '')
    || !/^[0-9a-f]{40}$/u.test(environment.WARPKEEP_PAGES_SOURCE_COMMIT ?? '')
    || !/^[1-9][0-9]{0,2}$/u.test(environment.GITHUB_OUTPUT_FD ?? '')
    || typeof environment.WARPKEEP_PRIVATE_NODE !== 'string'
    || (command !== 'attest-toolchain'
      && (
        !/^[0-9a-f]{64}$/u.test(
          environment.WARPKEEP_EXPECTED_RUNNER_IDENTITY_DIGEST ?? '',
        )
        || !/^[1-9][0-9]{0,19}$/u.test(
          environment.WARPKEEP_SOURCE_VERIFY_RUN_ID ?? '',
        )
        || !/^[1-9][0-9]{0,3}$/u.test(
          environment.WARPKEEP_SOURCE_VERIFY_RUN_ATTEMPT ?? '',
        )
      ))
  ) fail('NOTIFICATION_PAGES_DEPLOY_LAUNCHER_ENVIRONMENT_INVALID');
  let executable;
  try { executable = realpathSync(environment.WARPKEEP_PRIVATE_NODE); } catch {
    fail('NOTIFICATION_PAGES_DEPLOY_LAUNCHER_NODE_INVALID');
  }
  if (
    executable !== environment.WARPKEEP_PRIVATE_NODE
    || executable !== realpathSync(process.execPath)
    || process.version !== 'v22.22.3'
  ) fail('NOTIFICATION_PAGES_DEPLOY_LAUNCHER_NODE_INVALID');
  return Object.freeze({ ...environment });
}

/**
 * Builtins-only authority boundary. No module with installed-package imports
 * is loaded until the complete fixed auth-bridge resolver/tree attestation has
 * succeeded in this process.
 */
export async function runNotificationPagesPrivateDeployLauncher(
  arguments_,
  environment,
  {
    attestSourceClosure =
      verifyAuthBridgeNotificationPreparedDeployClosure,
    attestToolchain = verifyAuthBridgeNotificationPreparedInstalledToolchain,
    loadOperator = () => import('./notification-pages-private-deploy-operator.mjs'),
  } = {},
) {
  if (
    !Array.isArray(arguments_)
    || arguments_.length !== 1
    || ![
      'attest-toolchain',
      'recover-skipped-invocation',
      'attest-deployment-source',
      'predeploy',
      'mark-deploy-invoked',
      'postflight',
    ].includes(arguments_[0])
    || typeof attestSourceClosure !== 'function'
    || typeof attestToolchain !== 'function'
    || typeof loadOperator !== 'function'
  ) fail('NOTIFICATION_PAGES_DEPLOY_LAUNCHER_ARGUMENT_INVALID');
  const command = arguments_[0];
  const exact = exactEnvironment(command, environment);
  let sourceBefore;
  try {
    sourceBefore = attestSourceClosure({ repositoryRoot: REPOSITORY_ROOT });
  } catch {
    fail('NOTIFICATION_PAGES_DEPLOY_LAUNCHER_SOURCE_CLOSURE_INVALID');
  }
  let toolchainAuthority;
  try {
    toolchainAuthority = attestToolchain({
      repositoryRoot: REPOSITORY_ROOT,
      nodeExecutable: exact.WARPKEEP_PRIVATE_NODE,
    });
  } catch {
    fail('NOTIFICATION_PAGES_DEPLOY_LAUNCHER_TOOLCHAIN_INVALID');
  }
  let sourceAfter;
  try {
    sourceAfter = attestSourceClosure({ repositoryRoot: REPOSITORY_ROOT });
  } catch {
    fail('NOTIFICATION_PAGES_DEPLOY_LAUNCHER_SOURCE_CLOSURE_INVALID');
  }
  if (
    sourceBefore === null
    || typeof sourceBefore !== 'object'
    || sourceAfter === null
    || typeof sourceAfter !== 'object'
    || !/^[0-9a-f]{64}$/u.test(sourceBefore.manifestSha256 ?? '')
    || sourceAfter.manifestSha256 !== sourceBefore.manifestSha256
    || toolchainAuthority === null
    || typeof toolchainAuthority !== 'object'
    || !Object.isFrozen(toolchainAuthority)
    || !/^[0-9a-f]{64}$/u.test(toolchainAuthority.runnerIdentityDigest ?? '')
    || toolchainAuthority.sourceClosureManifestSha256
      !== sourceBefore.manifestSha256
  ) fail('NOTIFICATION_PAGES_DEPLOY_LAUNCHER_AUTHORITY_INVALID');
  const descriptor = Number(exact.GITHUB_OUTPUT_FD);
  if (command === 'attest-toolchain') {
    let status;
    try { status = fstatSync(descriptor); } catch {
      fail('NOTIFICATION_PAGES_DEPLOY_LAUNCHER_OUTPUT_INVALID');
    }
    if (!status.isFile() || status.nlink !== 1 || (status.mode & 0o022) !== 0) {
      fail('NOTIFICATION_PAGES_DEPLOY_LAUNCHER_OUTPUT_INVALID');
    }
    writeSync(
      descriptor,
      `runner-identity-digest=${toolchainAuthority.runnerIdentityDigest}\n`,
      null,
      'utf8',
    );
    return;
  }
  if (
    toolchainAuthority.runnerIdentityDigest
      !== exact.WARPKEEP_EXPECTED_RUNNER_IDENTITY_DIGEST
  ) fail('NOTIFICATION_PAGES_DEPLOY_LAUNCHER_RUNNER_IDENTITY_MISMATCH');
  let operator;
  try { operator = await loadOperator(); } catch {
    fail('NOTIFICATION_PAGES_DEPLOY_LAUNCHER_OPERATOR_INVALID');
  }
  if (typeof operator.runNotificationPagesPrivateDeployOperatorCli !== 'function') {
    fail('NOTIFICATION_PAGES_DEPLOY_LAUNCHER_OPERATOR_INVALID');
  }
  await operator.runNotificationPagesPrivateDeployOperatorCli(
    arguments_,
    exact,
    toolchainAuthority,
  );
}

if (
  process.argv[1]
  && import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  runNotificationPagesPrivateDeployLauncher(
    process.argv.slice(2),
    process.env,
  ).catch(error => {
    process.stderr.write(`${
      error instanceof NotificationPagesPrivateDeployLauncherError
        ? error.code
        : 'NOTIFICATION_PAGES_DEPLOY_LAUNCHER_FAILED'
    }\n`);
    process.exitCode = 1;
  });
}
