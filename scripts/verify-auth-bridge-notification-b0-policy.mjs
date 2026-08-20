import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import {
  verifyAuthBridgeNotificationPreparedDeployClosurePolicy,
} from './auth-bridge-notification-prepared-deploy-closure-policy.mjs';

const WORKFLOW = '.github/workflows/notification-bridge-b0.yml';
const ENTRYPOINT = 'scripts/auth-bridge-notification-b0-deploy.mjs';
const DEPLOY_COMMAND = `node ${ENTRYPOINT} >/dev/null`;
const DEDICATED_RUNNER =
  'runs-on: [self-hosted, macOS, ARM64, warpkeep-production-admin, warpkeep-repository-exclusive]';
const BOOTSTRAP_PIN_NAMES = Object.freeze([
  'WARPKEEP_PREPARED_SOURCE_CLOSURE_VERIFIER_SHA256',
  'WARPKEEP_PREPARED_SOURCE_CLOSURE_MANIFEST_SHA256',
  'WARPKEEP_PREPARED_INSTALLED_TOOLCHAIN_VERIFIER_SHA256',
  'WARPKEEP_PREPARED_INSTALLED_TOOLCHAIN_MANIFEST_SHA256',
]);
const PREDECESSOR_REATTESTATION =
  'await assertPredecessorStable(Object.freeze({';

function fail(code) {
  throw new Error(code);
}

function count(source, value) {
  return source.split(value).length - 1;
}

function exact(source, value, expected, code) {
  if (count(source, value) !== expected) fail(code);
}

function assertExactPredecessorReattestationCount(runtime) {
  if (count(runtime, PREDECESSOR_REATTESTATION) !== 3) {
    fail('AUTH_BRIDGE_NOTIFICATION_B0_RUNTIME_BOUNDARY_INVALID');
  }
}

/** Repository-only B0 policy verification; performs no network or mutation. */
export function verifyAuthBridgeNotificationB0StaticPolicy({
  repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..'),
} = {}) {
  const closure = verifyAuthBridgeNotificationPreparedDeployClosurePolicy({
    repositoryRoot,
  });
  const read = path => readFileSync(resolve(repositoryRoot, path), 'utf8');
  const workflow = read(WORKFLOW);
  const entrypoint = read(ENTRYPOINT);
  const adapter = read('scripts/auth-bridge-notification-b0-deploy-adapter.mjs');
  const journal = read('scripts/auth-bridge-notification-b0-deploy-journal.mjs');
  const runtime = read('scripts/auth-bridge-notification-b0-cloudflare-runtime.mjs');
  const receipt = read('scripts/auth-bridge-notification-prepared-receipt.mjs');
  const packageDocument = JSON.parse(read('package.json'));

  for (const value of [
    'workflow_dispatch:',
    DEDICATED_RUNNER,
    'environment:\n      name: notification-bridge-b0',
    "GITHUB_REF\" != 'refs/heads/main'",
    "GITHUB_REPOSITORY\" != 'ael-dev3/Warpkeep'",
    'persist-credentials: false',
    'clean: true',
    'fetch-depth: 1',
    'node-version: 22.22.3',
    "WARPKEEP_BRIDGE_NOTIFICATION_DELIVERY_ENABLED: 'true'",
    "WARPKEEP_HERMES_EXECUTION_APPROVED: 'false'",
    "WARPKEEP_PAGES_PRESENTATION_ENABLED: 'false'",
    'WARPKEEP_ADMISSION_NOTIFICATIONS_ENABLED: ${{ vars.WARPKEEP_ADMISSION_NOTIFICATIONS_ENABLED }}',
    'pages_value="${WARPKEEP_ADMISSION_NOTIFICATIONS_ENABLED:-false}"',
    'if [[ "$pages_value" != \'false\' ]]; then',
    "if: ${{ always() && steps.deploy.outputs.attempted == 'true' && steps.deploy.outcome != 'success' }}",
    "echo 'AUTH_BRIDGE_NOTIFICATION_B0_DEPLOY_OR_RECOVERY_UNVERIFIED' >&2",
  ]) exact(workflow, value, 1, 'AUTH_BRIDGE_NOTIFICATION_B0_WORKFLOW_INVALID');
  exact(workflow, DEPLOY_COMMAND, 2,
    'AUTH_BRIDGE_NOTIFICATION_B0_ENTRYPOINT_INVALID');
  exact(workflow, 'continue-on-error: true', 2,
    'AUTH_BRIDGE_NOTIFICATION_B0_RECOVERY_INVALID');
  exact(workflow, 'if: ${{ always() }}', 1,
    'AUTH_BRIDGE_NOTIFICATION_B0_RECOVERY_INVALID');
  for (const name of BOOTSTRAP_PIN_NAMES) {
    if ([...workflow.matchAll(new RegExp(
      `^      ${name}: '[a-f0-9]{64}'$`,
      'gmu',
    ))].length !== 1) fail('AUTH_BRIDGE_NOTIFICATION_B0_BOOTSTRAP_INVALID');
    exact(workflow, `verify_bootstrap_digest "$${name}"`, 2,
      'AUTH_BRIDGE_NOTIFICATION_B0_BOOTSTRAP_INVALID');
  }
  for (const secret of [
    'WARPKEEP_AUTH_BRIDGE_ACCOUNT_ID',
    'WARPKEEP_AUTH_BRIDGE_CLOUDFLARE_API_TOKEN',
    'WARPKEEP_AUTH_BRIDGE_ZONE_ID',
    'WARPKEEP_PRODUCTION_ADMIN_TOKEN',
  ]) exact(workflow, `${secret}: \${{ secrets.${secret} }}`, 2,
    'AUTH_BRIDGE_NOTIFICATION_B0_CREDENTIAL_BOUNDARY_INVALID');
  exact(workflow, 'GITHUB_TOKEN: ${{ github.token }}', 2,
    'AUTH_BRIDGE_NOTIFICATION_B0_CREDENTIAL_BOUNDARY_INVALID');
  if (
    packageDocument.version !== '0.3.43'
    || workflow.includes('PLAYER_CANARY_OWNER_FID')
    || workflow.includes('WARPKEEP_PLAYER_CANARY_OWNER_FID')
    || workflow.includes('0.3.44')
    || workflow.includes('production-player-canary')
    || workflow.includes('spacetime publish')
    || /\bwrangler\s+(?:deploy|publish|versions|secret)\b/u.test(workflow)
    || /\b(?:curl|wget)\b/u.test(workflow)
    || workflow.includes('actions/variables')
    || /^\s+(?:push|pull_request|schedule|workflow_run):/mu.test(workflow)
    || /^\s+(?:actions|contents):\s+write\s*$/mu.test(workflow)
    || /^\s+runs-on:\s+(?:ubuntu|windows)-/mu.test(workflow)
  ) fail('AUTH_BRIDGE_NOTIFICATION_B0_UNREVIEWED_CAPABILITY');

  for (const value of [
    "const WORKFLOW_PATH = '.github/workflows/notification-bridge-b0.yml';",
    'withAuthBridgeNotificationB0DeployJournal({',
    'createAuthBridgeNotificationB0CloudflareRuntime({',
    'executeAuthBridgeNotificationB0DeployAdapter({',
    'prepareAndWriteAuthBridgeNotificationB0Receipt({',
    'withPublicationJournal: operation => {',
    'verifyAuthBridgeNotificationPreparedInstalledToolchain({',
    'verifyAuthBridgeNotificationPreparedDeployClosure({',
    'delete environment[name]',
  ]) {
    if (!entrypoint.includes(value)) {
      fail('AUTH_BRIDGE_NOTIFICATION_B0_ENTRYPOINT_INVALID');
    }
  }
  assertExactPredecessorReattestationCount(runtime);
  if (
    entrypoint.includes('reportedHome:')
    || adapter.includes('PLAYER_CANARY_OWNER_FID')
    || runtime.includes('PLAYER_CANARY_OWNER_FID')
    || runtime.includes('/secrets')
    || runtime.includes('excludeScript=true')
    || !runtime.includes("`${basePath}/versions?bindings_inherit=strict`")
    || !runtime.includes('migrations: reviewedV5Migration(contract)')
    || !runtime.includes("`${basePath}/deployments`")
    || !runtime.includes("'workers/triggered_by': 'warpkeep-notification-b0'")
    || !journal.includes('fcntl.flock(3,fcntl.LOCK_EX|fcntl.LOCK_NB)')
    || !journal.includes("stdio: ['ignore', 'pipe', 'pipe', descriptor]")
    || !journal.includes("closeSync(descriptor);")
    || journal.includes('productionAdminRecordedOwnerIsDead')
    || journal.includes('LOCK_TEMPORARY_FILE')
    || !journal.includes("'receipt-publication-intent': 8")
    || !journal.includes("'receipt-published': 9")
    || !adapter.includes(
      'authenticateAuthBridgeNotificationPreparedReceiptForPublication({',
    )
    || !adapter.includes('stableCompletedDeployment({')
    || !receipt.includes(
      'canonicalAuthBridgeNotificationPreparedReceiptPublication(',
    )
  ) fail('AUTH_BRIDGE_NOTIFICATION_B0_RUNTIME_BOUNDARY_INVALID');

  return Object.freeze({
    packageVersion: '0.3.43',
    exactSixSecretsRequired: true,
    playerCanarySecretForbidden: true,
    nondeployingVersionUploadRequired: true,
    oneDeploymentPostRequired: true,
    dedicatedPersistentRunnerRequired: true,
    guardedRecoveryRequired: true,
    executableSecurityClosureMemberCount: closure.memberCount,
  });
}

export const authBridgeNotificationB0PolicyTestSeams =
  process.env.NODE_ENV === 'test' && process.env.VITEST === 'true'
    ? Object.freeze({ assertExactPredecessorReattestationCount })
    : undefined;

function main() {
  const policy = verifyAuthBridgeNotificationB0StaticPolicy();
  if (
    policy.exactSixSecretsRequired !== true
    || policy.playerCanarySecretForbidden !== true
    || policy.nondeployingVersionUploadRequired !== true
    || policy.oneDeploymentPostRequired !== true
    || policy.dedicatedPersistentRunnerRequired !== true
    || policy.guardedRecoveryRequired !== true
    || !Number.isSafeInteger(policy.executableSecurityClosureMemberCount)
  ) fail('AUTH_BRIDGE_NOTIFICATION_B0_POLICY_INVALID');
  console.log('auth bridge notification B0: protected six-secret v5 policy verified');
}

if (
  process.argv[1]
  && import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  try { main(); } catch (error) {
    console.error(error instanceof Error
      ? error.message
      : 'AUTH_BRIDGE_NOTIFICATION_B0_STATIC_POLICY_FAILED');
    process.exitCode = 1;
  }
}
