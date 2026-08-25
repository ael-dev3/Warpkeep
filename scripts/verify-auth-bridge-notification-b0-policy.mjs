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
const REVIEWED_LIVE_V5_PREDECESSOR_LITERALS = Object.freeze([
  "deploymentId: 'bb527e8d-c7dc-4eba-92a8-21beae4d3965'",
  "versionId: '3aaf1957-7613-47f5-b40b-24018aec1335'",
  "'5db8091c35db39f07c9b714441a9a8291c5a4636900a90ec19c3c5ea0b6982f7'",
  "'Promote main:e8bd065 single admission notification; rollback:481f8b94'",
  "versionMessage: 'main:e8bd065 single admission notification; rollback:481f8b94'",
  "namespaceId: '01d53045d07a4f79ab21646de395d82c'",
  "namespaceId: 'd800d603256f4a0f9907ba0b9267bc89'",
  "namespaceId: 'bbda3461bd4c4caf91478705d65374fc'",
  "namespaceId: '28d55581e3124399b8cfbc2bd4019bef'",
  "namespaceId: 'b4525a7a374743deb3666471fe2ae06c'",
]);
const REVIEWED_V5_API_NAMED_HANDLER_NAMES = Object.freeze([
  'AdmissionNotification',
  'AuthRateLimiter',
  'ChallengeReplayGuard',
  'DurableObjectAdmissionNotificationStore',
  'DurableObjectChallengeStore',
  'DurableObjectQaObserverChallengeStore',
  'DurableObjectSessionFamilyStore',
  'MemoryChallengeStore',
  'MemoryQaObserverChallengeStore',
  'MemorySessionFamilyStore',
  'MiniAppWebhookInvalidError',
  'MiniAppWebhookVerifierUnavailableError',
  'QaChallengeReplayGuard',
  'SessionFamily',
  'SpacetimeHttpAccessRequestResolver',
  'SpacetimeHttpAuthEpochResolver',
  'SpacetimeHttpQaObserverResolver',
  'admissionNotificationDeliveryContractDigest',
  'admissionNotificationDeliveryContractVector',
  'createAuthBridge',
  'createMiniAppWebhookVerifier',
  'serializeAdmissionNotificationDeliveryContract',
]);

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
  for (const [value, expected] of [
    ['const MAX_GIT_OUTPUT_BYTES = 64 * 1024;', 1],
    ['const MAX_TRACKED_LISTING_BYTES = 256 * 1024;', 1],
    ['MAX_GIT_OUTPUT_BYTES', 2],
    ['MAX_TRACKED_LISTING_BYTES', 2],
    ['boundedExactGit(', 3],
    ['maxBuffer: maximumOutputBytes,', 1],
    ["Buffer.byteLength(result.stdout, 'utf8') > maximumOutputBytes", 1],
    ['return boundedExactGit(repositoryRoot, args, MAX_GIT_OUTPUT_BYTES);', 1],
    ["['ls-files', '-v'],\n    MAX_TRACKED_LISTING_BYTES,", 1],
    ['exactGit(repository,', 7],
    ['exactTrackedListing(repository),', 1],
    ['async function settleGitInspections(inspections) {', 1],
    ['const results = await Promise.allSettled(inspections);', 1],
    ["results.some(result => result.status === 'rejected')", 1],
    ['return results.map(result => result.value);', 1],
    ['await settleGitInspections([', 1],
  ]) exact(
    entrypoint,
    value,
    expected,
    'AUTH_BRIDGE_NOTIFICATION_B0_ENTRYPOINT_INVALID',
  );
  assertExactPredecessorReattestationCount(runtime);
  const reviewedNamedHandlerBlock = [
    'const REVIEWED_V5_API_NAMED_HANDLER_NAMES = Object.freeze([',
    ...REVIEWED_V5_API_NAMED_HANDLER_NAMES.map(name => `  '${name}',`),
    ']);',
  ].join('\n');
  exact(
    runtime,
    reviewedNamedHandlerBlock,
    1,
    'AUTH_BRIDGE_NOTIFICATION_B0_RUNTIME_BOUNDARY_INVALID',
  );
  for (const [value, expected] of [
    ['function exactApiScriptAttestation(script, code) {', 1],
    ['function exactApiVersionShape(', 1],
    ['function exactExportsOrApiScript(', 1],
    ['exactApiScriptAttestation(', 2],
    ['exactApiVersionShape(', 2],
    ['exactExportsOrApiScript(', 2],
    ['const REVIEWED_V5_API_NAMED_HANDLER_NAMES = Object.freeze([', 1],
    ["!== 'etag,handlers,last_deployed_from,named_handlers'", 1],
    ["!SHA256_HEX.test(script.etag ?? '')", 1],
    ["!exactJson(script.handlers, ['fetch'])", 2],
    ["!== 'handlers,name'", 1],
    ["!exactJson(namedHandler.handlers, ['class'])", 1],
    ["script.last_deployed_from !== 'api'", 1],
    ['!Array.isArray(script.named_handlers)', 2],
    ["!== 'annotations,id,metadata,number,resources'", 1],
    ['value.number < 1', 1],
    ["!== 'author_email,author_id,created_on,has_preview,source'", 1],
    ["metadata.author_email !== ''", 1],
    ["!ACCOUNT_ID.test(metadata.author_id ?? '')", 1],
    ["!== 'workers/message,workers/tag,workers/triggered_by'", 1],
    ["!== 'bindings,script,script_runtime'", 1],
    ["!== 'compatibility_date,compatibility_flags,migration_tag,usage_model'", 2],
    ["runtime.usage_model !== 'standard'", 2],
    ["annotations['workers/triggered_by'] !== 'version_upload'", 1],
    ["keys === 'class_name,name,namespace_id,type'", 2],
    ['.map(detailBindingProjection)', 1],
    ['...expectedReviewedDurableObjectBindings(', 1],
  ]) exact(
    runtime,
    value,
    expected,
    'AUTH_BRIDGE_NOTIFICATION_B0_RUNTIME_BOUNDARY_INVALID',
  );
  for (const literal of REVIEWED_LIVE_V5_PREDECESSOR_LITERALS) {
    exact(
      runtime,
      literal,
      1,
      'AUTH_BRIDGE_NOTIFICATION_B0_RUNTIME_BOUNDARY_INVALID',
    );
  }
  if (
    entrypoint.includes('reportedHome:')
    || adapter.includes('PLAYER_CANARY_OWNER_FID')
    || runtime.includes('PLAYER_CANARY_OWNER_FID')
    || runtime.includes('/secrets')
    || runtime.includes('excludeScript=true')
    || !runtime.includes("`${basePath}/versions?bindings_inherit=strict`")
    || runtime.includes('reviewedV5Migration')
    || runtime.includes('AUTH_BRIDGE_NOTIFICATION_B0_DEPLOY_V4_PREREQUISITE_REQUIRED')
    || !runtime.includes(
      'value === null || (Array.isArray(value) && value.length === 0)',
    )
    || !runtime.includes('|| metadata.migrations !== undefined')
    || !runtime.includes(
      'predecessorVersionId !== REVIEWED_LIVE_V5_PREDECESSOR.versionId',
    )
    || !runtime.includes(
      'script.migration_tag !== REVIEWED_LIVE_V5_PREDECESSOR.migrationTag',
    )
    || !runtime.includes(
      'runtime.migration_tag !== REVIEWED_LIVE_V5_PREDECESSOR.migrationTag',
    )
    || !runtime.includes('.map(exactReviewedLiveV5BindingProjection)')
    || !runtime.includes('namespaceId: binding.namespace_id')
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
