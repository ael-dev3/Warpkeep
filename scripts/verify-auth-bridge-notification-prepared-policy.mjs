import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import {
  verifyAuthBridgeNotificationPreparedDeployClosurePolicy,
} from './auth-bridge-notification-prepared-deploy-closure-policy.mjs';

const DEDICATED_RUNNER =
  'runs-on: [self-hosted, macOS, ARM64, warpkeep-production-admin, warpkeep-repository-exclusive]';
const DEPLOY_ENTRYPOINT =
  'node scripts/auth-bridge-notification-prepared-deploy.mjs >/dev/null';
const BOOTSTRAP_PIN_NAMES = Object.freeze([
  'WARPKEEP_PREPARED_SOURCE_CLOSURE_VERIFIER_SHA256',
  'WARPKEEP_PREPARED_SOURCE_CLOSURE_MANIFEST_SHA256',
  'WARPKEEP_PREPARED_INSTALLED_TOOLCHAIN_VERIFIER_SHA256',
  'WARPKEEP_PREPARED_INSTALLED_TOOLCHAIN_MANIFEST_SHA256',
]);
const REVIEWED_V5_NAMESPACE_ID_LITERALS = Object.freeze([
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

function occurrenceCount(source, value) {
  return source.split(value).length - 1;
}

function exactCount(source, value, count, code) {
  if (occurrenceCount(source, value) !== count) fail(code);
}

function exactOccurrence(source, value, code) {
  exactCount(source, value, 1, code);
}

/**
 * Verifies the immutable upload/reconciliation source invariants after the
 * caller has authenticated their enclosing release closure. The production
 * static-policy entrypoint below always performs that closure verification
 * before delegating here.
 */
export function verifyAuthBridgeNotificationPreparedUploadBoundarySources({
  adapterSource,
  journalSource,
  runtimeSource,
} = {}) {
  if (
    typeof adapterSource !== 'string'
    || typeof journalSource !== 'string'
    || typeof runtimeSource !== 'string'
  ) fail('AUTH_BRIDGE_PREPARED_RUNTIME_BOUNDARY_INVALID');

  for (const [value, expected] of [
    ['!Number.isSafeInteger(value.number)', 2],
    ['value.number < 1', 2],
    ["!exactJson(metadata.keep_bindings, ['secret_text', 'secret_key'])", 1],
    ['bindings_inherit', 0],
    ["type: 'inherit'", 0],
    ['version_id: plan.predecessorVersionId', 0],
    ['function exactVersionNumber(value, expectedVersionId, code) {', 1],
    ['function expectedSuccessorVersionNumber(predecessorVersionNumber, code) {', 1],
    ['predecessorVersionNumber >= Number.MAX_SAFE_INTEGER', 1],
    ['return predecessorVersionNumber + 1;', 1],
    ['function exactVersionUploadResult(result, predecessorVersionNumber) {', 1],
    [') !== expectedSuccessorVersionNumber(', 1],
    ['const inspectLatestUploadedVersion = async () => {', 1],
    ['`${basePath}/versions?page=1&per_page=1`', 1],
    [
      "      || !VERSION_ID.test(items[0].id ?? '')\n"
        + '      || !Number.isSafeInteger(items[0].number)\n'
        + '      || items[0].number < 1\n'
        + "    ) fail('AUTH_BRIDGE_PREPARED_CLOUDFLARE_VERSION_LIST_INVALID');",
      1,
    ],
    ['versionNumber: items[0].number,', 1],
    ['const assertLatestUploadIsPredecessor = async predecessor => {', 1],
    ['latest.versionId !== predecessor.versionId', 1],
    ['latest.versionNumber !== predecessor.versionNumber', 1],
    ['await assertLatestUploadIsPredecessor(Object.freeze({', 2],
    ['versionNumber: predecessor.versionNumber,', 1],
    ['versionNumber: preparedPredecessorVersionNumber,', 1],
    ['const assertCandidateVersionLineage = async (', 1],
    ['candidateVersionNumber !== expectedSuccessorVersionNumber(', 1],
    ['await assertCandidateVersionLineage(versionId, inspected.detail);', 1],
    ['const versionNumber = await assertCandidateVersionLineage(', 1],
    ['const candidateVersionNumber = await assertCandidateVersionLineage(', 1],
    ['!Number.isSafeInteger(item.number)', 1],
    ['item.number < 1', 1],
    ['item.number !== versionNumber', 1],
    ['latest.versionId !== candidates[0]', 1],
    ['latest.versionNumber !== candidateVersionNumbers.get(candidates[0])', 1],
    ['latest.versionId !== input.versionId', 1],
    ['latest.versionNumber !== candidateVersionNumber', 2],
    ["phase === 'remote-reconcile-started' && candidates.length !== 0", 1],
    ["fail('AUTH_BRIDGE_PREPARED_DEPLOY_UNINVOKED_CANDIDATE');", 1],
    ['let sameRuntimeUploadReconciliationAuthorized = false;', 1],
    ['sameRuntimeUploadReconciliationAuthorized = true;', 1],
    ['sameRuntimeUploadReconciliationAuthorized = false;', 3],
    [
      "if (phase === 'upload-invoked') {\n"
        + '      if (sameRuntimeUploadReconciliationAuthorized !== true) {\n'
        + '        fail(\n'
        + "          'AUTH_BRIDGE_PREPARED_DEPLOY_UPLOAD_OPERATOR_ADJUDICATION_REQUIRED',\n"
        + '          true,\n'
        + '        );\n'
        + '      }\n'
        + '      sameRuntimeUploadReconciliationAuthorized = false;\n'
        + '    }\n'
        + "    if (phase === 'remote-reconcile-started') {",
      1,
    ],
    [
      "if (phase === 'upload-adjudication-required') {\n"
        + '      fail(\n'
        + "        'AUTH_BRIDGE_PREPARED_DEPLOY_UPLOAD_OPERATOR_ADJUDICATION_REQUIRED',\n"
        + '        true,\n'
        + '      );\n'
        + '    }\n'
        + "    if (phase === 'upload-invoked') {\n"
        + '      if (sameRuntimeUploadReconciliationAuthorized !== true) {\n'
        + '        fail(\n'
        + "          'AUTH_BRIDGE_PREPARED_DEPLOY_UPLOAD_OPERATOR_ADJUDICATION_REQUIRED',\n"
        + '          true,\n'
        + '        );\n'
        + '      }\n'
        + '      sameRuntimeUploadReconciliationAuthorized = false;\n'
        + '    }\n'
        + "    if (phase === 'remote-reconcile-started') {",
      1,
    ],
    [
      "await assertPredecessorStable(Object.freeze({\n"
        + "        deploymentId: plan.predecessorDeploymentId,\n"
        + "        versionId: plan.predecessorVersionId,\n"
        + "      }));\n"
        + '      await assertLatestUploadIsPredecessor(Object.freeze({\n'
        + '        versionId: plan.predecessorVersionId,\n'
        + '        versionNumber: preparedPredecessorVersionNumber,\n'
        + '      }));\n'
        + '      sameRuntimeUploadReconciliationAuthorized = true;\n'
        + "      const response = await api.json(\n"
        + "        `${basePath}/versions`,\n"
        + "        {\n"
        + "          method: 'POST',",
      1,
    ],
    [
      'const candidateVersionNumber = await assertCandidateVersionLineage(\n'
        + '      input.versionId,\n'
        + '    );\n'
        + '    await assertPredecessorStable(Object.freeze({\n'
        + '      deploymentId: input.predecessorDeploymentId,\n'
        + '      versionId: input.predecessorVersionId,\n'
        + '    }));\n'
        + '    const latest = await inspectLatestUploadedVersion();\n'
        + '    if (\n'
        + '      latest.versionId !== input.versionId\n'
        + '      || latest.versionNumber !== candidateVersionNumber\n'
        + "    ) fail('AUTH_BRIDGE_PREPARED_CLOUDFLARE_LATEST_UPLOAD_MISMATCH', true);\n"
        + '    await api.json(`${basePath}/deployments`, {',
      1,
    ],
  ]) exactCount(
    runtimeSource,
    value,
    expected,
    'AUTH_BRIDGE_PREPARED_RUNTIME_BOUNDARY_INVALID',
  );

  for (const [value, expected] of [
    ['upload = await uploadVersion(canonicalContract, uploadPlan);', 1],
    ["'uploadAdjudicationRequired',", 1],
    [
      "if (journalState.phase === 'upload-adjudication-required') {\n"
        + '    throw ambiguous(\n'
        + '      undefined,\n'
        + "      'AUTH_BRIDGE_PREPARED_DEPLOY_UPLOAD_OPERATOR_ADJUDICATION_REQUIRED',\n"
        + '    );\n'
        + '  }\n'
        + "  if (journalState.phase === 'upload-invoked') {\n"
        + '    throw ambiguous(\n'
        + '      undefined,\n'
        + "      'AUTH_BRIDGE_PREPARED_DEPLOY_UPLOAD_OPERATOR_ADJUDICATION_REQUIRED',\n"
        + '    );\n'
        + '  }\n'
        + '  let uploadPlan;',
      1,
    ],
    ["startingPhase === 'remote-reconcile-started'\n    && prior.length !== 0", 1],
    ["fail('AUTH_BRIDGE_PREPARED_DEPLOY_UNINVOKED_CANDIDATE');", 1],
    [
      "uploadResponseInvalid = [\n"
        + "        'AUTH_BRIDGE_PREPARED_CLOUDFLARE_UPLOAD_RESPONSE_INVALID',\n"
        + "        'AUTH_BRIDGE_PREPARED_CLOUDFLARE_VERSION_LINEAGE_MISMATCH',\n"
        + '      ].includes(error?.code);',
      1,
    ],
    [
      "if (uploadResponseInvalid) {\n"
        + '      await journal.uploadAdjudicationRequired(Object.freeze({\n'
        + "        reason: 'invalid-upload-response',\n"
        + '      }));\n'
        + "      fail('AUTH_BRIDGE_PREPARED_DEPLOY_UPLOAD_RESPONSE_INVALID');\n"
        + '    }\n'
        + '    if (isSanitizedProviderRejection(uploadError)) {\n'
        + '      await journal.uploadAdjudicationRequired(Object.freeze({\n'
        + "        reason: 'definitive-provider-rejection',\n"
        + '      }));\n'
        + '      throw canonicalSanitizedProviderRejection(uploadError);\n'
        + '    }\n'
        + '    let reconciled;',
      1,
    ],
  ]) exactCount(
    adapterSource,
    value,
    expected,
    'AUTH_BRIDGE_PREPARED_RUNTIME_BOUNDARY_INVALID',
  );

  for (const [value, expected] of [
    ["'upload-adjudication-required': 8,", 1],
    [
      "const PHASE_PATTERN = '(prepared|remote-reconcile-started|upload-invoked|uploaded|release-uncertain|release-invoked|completed|upload-adjudication-required)';",
      1,
    ],
    ['(0[1-8])-${PHASE_PATTERN}', 2],
    ["'upload-adjudication-required': ['reason'],", 1],
    ["phase === 'upload-adjudication-required'", 3],
    [
      "  if (\n"
        + "    phase === 'upload-adjudication-required'\n"
        + '    && ![\n'
        + "      'invalid-upload-response',\n"
        + "      'definitive-provider-rejection',\n"
        + '    ].includes(payload.reason)\n'
        + "  ) fail('AUTH_BRIDGE_PREPARED_DEPLOY_JOURNAL_PAYLOAD_INVALID');",
      1,
    ],
    ["&& previous?.value.phase !== 'upload-invoked'", 1],
    ['previous.ordinal >= ordinal', 1],
    ["record => record.value.phase === 'upload-adjudication-required'", 1],
    ['?.value.payload.reason ?? null,', 1],
    ['uploadAdjudicationRequired(value) {', 1],
    ["return transition('upload-adjudication-required', value);", 1],
  ]) exactCount(
    journalSource,
    value,
    expected,
    'AUTH_BRIDGE_PREPARED_RUNTIME_BOUNDARY_INVALID',
  );
  return true;
}

/**
 * Checks only repository-owned release policy. It performs no network or
 * control-plane operation. Production execution still requires the protected
 * environment, all dedicated credentials, and the repository-exclusive
 * persistent runner selected by the reviewed workflow.
 */
export function verifyAuthBridgeNotificationPreparedStaticPolicy({
  repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..'),
} = {}) {
  const closure = verifyAuthBridgeNotificationPreparedDeployClosurePolicy({
    repositoryRoot,
  });
  const read = path => readFileSync(resolve(repositoryRoot, path), 'utf8');
  const workerConfig = read('services/auth-bridge/wrangler.toml');
  for (const flag of [
    'PUBLIC_AUTH_ENABLED = "false"',
    'ACCESS_EXPECTED_FID_REQUIRED = "false"',
    'APPROVAL_NOTIFICATIONS_ENABLED = "false"',
  ]) exactOccurrence(workerConfig, flag, 'AUTH_BRIDGE_PREPARED_WORKER_FLAG_INVALID');

  const hermes = read('scripts/hermes-admin.ts');
  exactOccurrence(
    hermes,
    'export const FOUNDER_ADMISSION_NOTIFICATION_DELIVERY_APPROVED = false as const;',
    'AUTH_BRIDGE_PREPARED_HERMES_GATE_INVALID',
  );

  const pages = read('.github/workflows/deploy-pages.yml');
  exactOccurrence(
    pages,
    "VITE_WARPKEEP_ADMISSION_NOTIFICATIONS_ENABLED: 'false'",
    'AUTH_BRIDGE_PREPARED_PAGES_GATE_INVALID',
  );
  if (pages.includes('vars.WARPKEEP_ADMISSION_NOTIFICATIONS_ENABLED')) {
    fail('AUTH_BRIDGE_PREPARED_PAGES_GATE_MUTABLE');
  }

  const packageDocument = JSON.parse(read('services/auth-bridge/package.json'));
  if (
    packageDocument.packageManager !== 'pnpm@11.7.0'
    || packageDocument.devDependencies?.wrangler !== '4.110.0'
    || packageDocument.devDependencies?.yaml !== '2.9.0'
    || Object.keys(packageDocument.scripts ?? {})
      .some(name => /^(?:deploy|publish)(?::|$)/u.test(name))
  ) fail('AUTH_BRIDGE_PREPARED_DEPLOY_TOOLCHAIN_INVALID');
  const installedToolchain = JSON.parse(read(
    'scripts/auth-bridge-notification-prepared-installed-toolchain-darwin-arm64-v1.json',
  ));
  if (
    installedToolchain.schemaVersion !== 1
    || installedToolchain.profile
      !== 'warpkeep-auth-bridge-notification-prepared-installed-toolchain-darwin-arm64-v1'
    || installedToolchain.lockfileSha256
      !== 'e162613375a2a5534a631d38e9cf2d2b9a66bdeb4ff05be63376afaf57f7fde9'
    || installedToolchain.packageManager !== 'pnpm@11.7.0'
    || installedToolchain.platform !== 'darwin'
    || installedToolchain.architecture !== 'arm64'
    || installedToolchain.nodeVersion !== 'v22.22.3'
    || installedToolchain.resolverNamespaceEntryCount !== 24
    || installedToolchain.resolverNamespaceDirectoryCount !== 6
    || installedToolchain.resolverNamespaceFileCount !== 8
    || installedToolchain.resolverNamespaceSymbolicLinkCount !== 10
    || installedToolchain.topLevelLinks?.at(-1)?.path !== 'yaml'
    || installedToolchain.topLevelLinks?.at(-1)?.target
      !== '.pnpm/yaml@2.9.0/node_modules/yaml'
    || !/^[a-f0-9]{64}$/u.test(
      installedToolchain.resolverNamespaceSha256 ?? '',
    )
    || !Number.isSafeInteger(installedToolchain.entryCount)
    || installedToolchain.entryCount < 1
    || !Number.isSafeInteger(installedToolchain.totalFileBytes)
    || installedToolchain.totalFileBytes < 1
    || !/^[a-f0-9]{64}$/u.test(installedToolchain.treeSha256 ?? '')
  ) fail('AUTH_BRIDGE_PREPARED_DEPLOY_TOOLCHAIN_INVALID');

  const workflow = read('.github/workflows/notification-bridge-prepared.yml');
  for (const exact of [
    "WARPKEEP_BRIDGE_NOTIFICATION_DELIVERY_ENABLED: 'true'",
    "WARPKEEP_HERMES_EXECUTION_APPROVED: 'false'",
    "WARPKEEP_PAGES_PRESENTATION_ENABLED: 'false'",
    'WARPKEEP_ADMISSION_NOTIFICATIONS_ENABLED: ${{ vars.WARPKEEP_ADMISSION_NOTIFICATIONS_ENABLED }}',
    'pages_value="${WARPKEEP_ADMISSION_NOTIFICATIONS_ENABLED:-false}"',
    'if [[ "$pages_value" != \'false\' ]]; then',
    DEDICATED_RUNNER,
    "environment:\n      name: notification-bridge-prepared",
    "GITHUB_REF\" != 'refs/heads/main'",
    "GITHUB_REPOSITORY\" != 'ael-dev3/Warpkeep'",
    "gh api \"repos/ael-dev3/Warpkeep/branches/main\"",
    "--jq 'select(.protected == true) | .commit.sha'",
    'persist-credentials: false',
    'clean: true',
    'fetch-depth: 1',
    "origin_url\" != 'https://github.com/ael-dev3/Warpkeep'",
    '"${git_safe[@]}" symbolic-ref -q HEAD',
    'node-version: 22.22.3',
    'pnpm --dir services/auth-bridge install --frozen-lockfile --ignore-scripts --package-import-method=copy',
    'node scripts/auth-bridge-notification-prepared-installed-toolchain.mjs',
    "if: ${{ always() && steps.deploy.outputs.attempted == 'true' && steps.deploy.outcome != 'success' }}",
    'echo \'AUTH_BRIDGE_PREPARED_DEPLOY_OR_RECOVERY_UNVERIFIED\' >&2',
  ]) exactOccurrence(workflow, exact, 'AUTH_BRIDGE_PREPARED_WORKFLOW_POLICY_INVALID');

  for (const name of BOOTSTRAP_PIN_NAMES) {
    const definition = new RegExp(
      `^      ${name}: '[a-f0-9]{64}'$`,
      'gmu',
    );
    if ([...workflow.matchAll(definition)].length !== 1) {
      fail('AUTH_BRIDGE_PREPARED_BOOTSTRAP_POLICY_INVALID');
    }
    exactCount(
      workflow,
      `verify_bootstrap_digest "$${name}"`,
      2,
      'AUTH_BRIDGE_PREPARED_BOOTSTRAP_POLICY_INVALID',
    );
  }
  for (const exact of [
    'git_safe=(/usr/bin/git -c core.fsmonitor=false -c core.untrackedCache=false)',
    'tracked_entries="$("${git_safe[@]}" ls-files -v)"',
    '"${git_safe[@]}" diff-index --quiet --cached HEAD --',
    '"${git_safe[@]}" diff-files --quiet --',
    '"${git_safe[@]}" diff --no-ext-diff --no-textconv --exit-code HEAD --',
    '/usr/bin/shasum -a 256 -- "$path"',
  ]) exactCount(
    workflow,
    exact,
    2,
    'AUTH_BRIDGE_PREPARED_BOOTSTRAP_POLICY_INVALID',
  );

  exactCount(workflow, DEPLOY_ENTRYPOINT, 2,
    'AUTH_BRIDGE_PREPARED_GUARDED_ENTRYPOINT_INVALID');
  exactCount(
    workflow,
    'node scripts/auth-bridge-notification-prepared-deploy-closure.mjs',
    2,
    'AUTH_BRIDGE_PREPARED_SOURCE_CLOSURE_BOUNDARY_INVALID',
  );
  exactCount(workflow, 'continue-on-error: true', 2,
    'AUTH_BRIDGE_PREPARED_RECOVERY_POLICY_INVALID');
  exactCount(workflow, 'if: ${{ always() }}', 1,
    'AUTH_BRIDGE_PREPARED_RECOVERY_POLICY_INVALID');
  exactCount(
    workflow,
    "echo 'AUTH_BRIDGE_PREPARED_DEPLOY_CREDENTIALS_INVALID' >&2",
    2,
    'AUTH_BRIDGE_PREPARED_CREDENTIAL_BOUNDARY_INVALID',
  );
  const toolchainIndex = workflow.indexOf(
    'node scripts/auth-bridge-notification-prepared-installed-toolchain.mjs',
  );
  const sourceClosureIndex = workflow.indexOf(
    'node scripts/auth-bridge-notification-prepared-deploy-closure.mjs',
  );
  const sourceClosureAfterToolchainIndex = workflow.indexOf(
    'node scripts/auth-bridge-notification-prepared-deploy-closure.mjs',
    toolchainIndex + 1,
  );
  const policyIndex = workflow.indexOf(
    'node scripts/verify-auth-bridge-notification-prepared-policy.mjs',
  );
  const installIndex = workflow.indexOf(
    'pnpm --dir services/auth-bridge install --frozen-lockfile --ignore-scripts --package-import-method=copy',
  );
  const postinstallBootstrapIndex = workflow.lastIndexOf(
    'verify_bootstrap_digest "$WARPKEEP_PREPARED_INSTALLED_TOOLCHAIN_MANIFEST_SHA256"',
    sourceClosureIndex,
  );
  const protectedSecretIndex = workflow.indexOf(
    'WARPKEEP_AUTH_BRIDGE_CLOUDFLARE_API_TOKEN: ${{ secrets.',
  );
  if (
    sourceClosureIndex < 0
    || postinstallBootstrapIndex < 0
    || postinstallBootstrapIndex <= installIndex
    || postinstallBootstrapIndex >= sourceClosureIndex
    || toolchainIndex <= sourceClosureIndex
    || sourceClosureAfterToolchainIndex <= toolchainIndex
    || policyIndex <= sourceClosureAfterToolchainIndex
    || protectedSecretIndex <= policyIndex
    || workflow.includes('--print-candidate')
    || workflow.includes('pnpm --dir services/auth-bridge run check')
  ) fail('AUTH_BRIDGE_PREPARED_INSTALLED_TOOLCHAIN_BOUNDARY_INVALID');
  for (const comparison of [
    '"$GITHUB_TOKEN" == "$WARPKEEP_AUTH_BRIDGE_CLOUDFLARE_API_TOKEN"',
    '"$GITHUB_TOKEN" == "$WARPKEEP_PRODUCTION_ADMIN_TOKEN"',
    '"$WARPKEEP_AUTH_BRIDGE_CLOUDFLARE_API_TOKEN" == "$WARPKEEP_PRODUCTION_ADMIN_TOKEN"',
  ]) exactCount(
    workflow,
    comparison,
    2,
    'AUTH_BRIDGE_PREPARED_CREDENTIAL_BOUNDARY_INVALID',
  );
  for (const secret of [
    'WARPKEEP_AUTH_BRIDGE_ACCOUNT_ID',
    'WARPKEEP_AUTH_BRIDGE_CLOUDFLARE_API_TOKEN',
    'WARPKEEP_AUTH_BRIDGE_ZONE_ID',
    'WARPKEEP_PLAYER_CANARY_OWNER_FID',
    'WARPKEEP_PRODUCTION_ADMIN_TOKEN',
  ]) {
    exactCount(
      workflow,
      `${secret}: \${{ secrets.${secret} }}`,
      2,
      'AUTH_BRIDGE_PREPARED_CREDENTIAL_BOUNDARY_INVALID',
    );
  }
  exactCount(
    workflow,
    'GITHUB_TOKEN: ${{ github.token }}',
    2,
    'AUTH_BRIDGE_PREPARED_GITHUB_CREDENTIAL_INVALID',
  );

  if (
    workflow.includes('WARPKEEP_SAFE_DEPLOYMENT_MECHANICS_REVIEWED')
    || /\bwrangler\s+(?:deploy|publish|versions\s+upload)\b/u.test(workflow)
    || /\b(?:curl|wget)\b/u.test(workflow)
    || workflow.includes('actions/variables')
    || /upload-(?:artifact|pages-artifact)@/u.test(workflow)
    || /^\s+(?:CLOUDFLARE_API_TOKEN|WARPKEEP_ADMIN_TOKEN_SECRET):/mu.test(workflow)
    || /WARPKEEP_AUTH_BRIDGE_NOTIFICATION_PREPARED_RECEIPT_PATH/u.test(workflow)
    || /^\s+runs-on:\s+(?:ubuntu|windows)-/mu.test(workflow)
    || /^\s+(?:push|pull_request|schedule|workflow_run):/mu.test(workflow)
    || /^\s+(?:actions|contents):\s+write\s*$/mu.test(workflow)
  ) fail('AUTH_BRIDGE_PREPARED_UNREVIEWED_DEPLOYMENT_MECHANICS');
  const entrypoint = read('scripts/auth-bridge-notification-prepared-deploy.mjs');
  const adapter = read(
    'scripts/auth-bridge-notification-prepared-deploy-adapter.mjs',
  );
  const journal = read(
    'scripts/auth-bridge-notification-prepared-deploy-journal.mjs',
  );
  const runtime = read(
    'scripts/auth-bridge-notification-prepared-cloudflare-runtime.mjs',
  );
  verifyAuthBridgeNotificationPreparedUploadBoundarySources({
    adapterSource: adapter,
    journalSource: journal,
    runtimeSource: runtime,
  });
  for (const [exact, count] of [
    ["const REPOSITORY = 'ael-dev3/Warpkeep';", 1],
    ["const WORKFLOW_PATH = '.github/workflows/notification-bridge-prepared.yml';", 1],
    ['const WORKFLOW_REF = `${REPOSITORY}/${WORKFLOW_PATH}@refs/heads/main`;', 1],
    ['withAuthBridgeNotificationPreparedDeployJournal({', 1],
    ['prepareAndWriteAuthBridgeNotificationPreparedReceipt({', 1],
    ['apiToken: values.WARPKEEP_AUTH_BRIDGE_CLOUDFLARE_API_TOKEN', 1],
    ['playerCanaryOwnerFid:', 1],
    ['expectedPredecessorBridgeSourceCommit:', 1],
    ['AUTH_BRIDGE_NOTIFICATION_PREPARED_REVIEWED_B0_SOURCE_COMMIT', 2],
    ['values.WARPKEEP_PLAYER_CANARY_OWNER_FID', 3],
    ['adminToken: values.WARPKEEP_PRODUCTION_ADMIN_TOKEN', 1],
    ['executeAuthBridgeNotificationPreparedDeployAdapter({', 1],
    ['createAuthBridgeNotificationPreparedGithubWritePermit({', 2],
    ['verifyAuthBridgeNotificationPreparedInstalledToolchain({', 2],
    ['verifyAuthBridgeNotificationPreparedDeployClosure({', 2],
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
    ["['status', '--porcelain=v1', '--untracked-files=all']", 1],
    ["['ls-files', '-v']", 1],
    ["['diff-index', '--quiet', '--cached', 'HEAD', '--']", 1],
    ["['diff-files', '--quiet', '--']", 1],
    ["'--no-ext-diff',", 1],
    ["'--no-textconv',", 1],
    ["'--exit-code',", 1],
    ["trackedEntries.split('\\n').some(entry => !entry.startsWith('H '))", 1],
    ['delete environment[name]', 1],
  ]) exactCount(
    entrypoint,
    exact,
    count,
    'AUTH_BRIDGE_PREPARED_GUARDED_ENTRYPOINT_INVALID',
  );
  if (
    entrypoint.includes('reportedHome:')
    || entrypoint.includes('ensureAuthBridgeNotificationPreparedPlayerCanarySecret')
    || entrypoint.includes('rollbackAuthBridgeNotificationPreparedPlayerCanarySecret')
    || !entrypoint.includes("'WARPKEEP_PRODUCTION_ADMIN_TOKEN',")
    || !entrypoint.includes("'WARPKEEP_AUTH_BRIDGE_CLOUDFLARE_API_TOKEN',")
    || !entrypoint.includes("'WARPKEEP_PLAYER_CANARY_OWNER_FID',")
    || !entrypoint.includes("'GITHUB_TOKEN',")
    || /process\.(?:stdout|stderr)[\s\S]{0,256}WARPKEEP_PLAYER_CANARY_OWNER_FID/u
      .test(entrypoint)
  ) fail('AUTH_BRIDGE_PREPARED_PRIVATE_RUNTIME_BOUNDARY_INVALID');
  exactOccurrence(
    adapter,
    "export const AUTH_BRIDGE_NOTIFICATION_PREPARED_REVIEWED_B0_SOURCE_COMMIT =\n"
      + "  '308f901d91a1fb68d90f157a2ec164ed1acaf51d';",
    'AUTH_BRIDGE_PREPARED_RUNTIME_BOUNDARY_INVALID',
  );
  const installedAttestationIndex = entrypoint.indexOf(
    'verifyAuthBridgeNotificationPreparedInstalledToolchain({',
  );
  const sourceAttestationIndex = entrypoint.indexOf(
    'verifyAuthBridgeNotificationPreparedDeployClosure({',
  );
  const sourceAttestationAfterInstalledIndex = entrypoint.indexOf(
    'verifyAuthBridgeNotificationPreparedDeployClosure({',
    installedAttestationIndex + 1,
  );
  const credentialReadIndex = entrypoint.indexOf(
    'const values = copyAndScrubEnvironment(environment);',
  );
  if (
    sourceAttestationIndex < 0
    || installedAttestationIndex <= sourceAttestationIndex
    || sourceAttestationAfterInstalledIndex <= installedAttestationIndex
    || credentialReadIndex <= sourceAttestationAfterInstalledIndex
  ) fail('AUTH_BRIDGE_PREPARED_INSTALLED_TOOLCHAIN_BOUNDARY_INVALID');
  const reviewedNamedHandlerBlock = [
    'const REVIEWED_V5_API_NAMED_HANDLER_NAMES = Object.freeze([',
    ...REVIEWED_V5_API_NAMED_HANDLER_NAMES.map(name => `  '${name}',`),
    ']);',
  ].join('\n');
  exactOccurrence(
    runtime,
    reviewedNamedHandlerBlock,
    'AUTH_BRIDGE_PREPARED_RUNTIME_BOUNDARY_INVALID',
  );
  for (const [value, expected] of [
    ['function exactApiScriptAttestation(script, code) {', 1],
    ['function exactApiVersionShape(', 1],
    ['function exactExportsOrApiScript(', 1],
    ['exactApiScriptAttestation(', 2],
    ['exactApiVersionShape(', 2],
    ['exactExportsOrApiScript(', 3],
    ['const REVIEWED_V5_API_NAMED_HANDLER_NAMES = Object.freeze([', 1],
    ["!== 'etag,handlers,last_deployed_from,named_handlers'", 1],
    ["!SHA256_HEX.test(script.etag ?? '')", 1],
    ["!exactJson(script.handlers, ['fetch'])", 1],
    ["!== 'handlers,name'", 1],
    ["!exactJson(namedHandler.handlers, ['class'])", 1],
    ["script.last_deployed_from !== 'api'", 1],
    ['!Array.isArray(script.named_handlers)', 1],
    ["!== 'annotations,id,metadata,number,resources'", 1],
    ["!== 'author_email,author_id,created_on,has_preview,source'", 1],
    ["metadata.author_email !== ''", 1],
    ["!ACCOUNT_ID.test(metadata.author_id ?? '')", 1],
    ["!== 'workers/message,workers/tag,workers/triggered_by'", 1],
    ["!== 'bindings,script,script_runtime'", 1],
    ["!== 'compatibility_date,compatibility_flags,migration_tag,usage_model'", 1],
    ["runtime.usage_model !== 'standard'", 1],
    ["annotations['workers/triggered_by'] !== 'version_upload'", 1],
    ["keys === 'class_name,name,namespace_id,type'", 1],
    ['.map(detailBindingProjection)', 2],
    ['...expectedReviewedDurableObjectBindings(', 2],
    ['`notification-b0-${contract.predecessorSourceCommit}`', 1],
    ['`Warpkeep notification B0 ${contract.predecessorSourceCommit}`', 1],
    ['function validatedForbiddenResponseSubstring(value) {', 1],
    [
      'async function sanitizedMutationRejectionCode(\n'
        + '  response,\n'
        + '  forbiddenResponseSubstring,\n'
        + ') {',
      1,
    ],
    [
      "if (body.includes(forbiddenBytes)) return 'UNAVAILABLE';\n"
        + '      } finally {\n'
        + '        forbiddenBytes.fill(0);\n'
        + '      }\n'
        + '    }\n'
        + "    const envelope = JSON.parse(body.toString('utf8'));",
      1,
    ],
    ['Number.isSafeInteger(code) && code >= 1_000 && code <= 999_999_999', 1],
    ['response.status >= 400', 1],
    ['response.status <= 499', 1],
    [
      '`AUTH_BRIDGE_PREPARED_CLOUDFLARE_MUTATION_REJECTED_HTTP_${response.status}_CODE_${providerCode}`',
      1,
    ],
    [
      'const providerCode = await sanitizedMutationRejectionCode(\n'
        + '          response,\n'
        + '          forbiddenResponseSubstring,\n'
        + '        );',
      1,
    ],
    ["old_name:", 0],
    ["'workers/triggered_by':", 0],
    ["latest.triggeredBy !== 'deployment'", 1],
  ]) exactCount(
    runtime,
    value,
    expected,
    'AUTH_BRIDGE_PREPARED_RUNTIME_BOUNDARY_INVALID',
  );
  for (const literal of REVIEWED_V5_NAMESPACE_ID_LITERALS) {
    exactOccurrence(
      runtime,
      literal,
      'AUTH_BRIDGE_PREPARED_RUNTIME_BOUNDARY_INVALID',
    );
  }
  return Object.freeze({
    bridgeNotificationDeliveryEnabled: true,
    hermesExecutionApproved: false,
    pagesPresentationEnabled: false,
    checkedInWorkerGateEnabled: false,
    deploymentMechanicsReady: true,
    dedicatedPersistentRunnerRequired: true,
    guardedRecoveryRequired: true,
    privateReceiptSinkRequired: true,
    installedToolchainByteAttestationRequired: true,
    executableSecurityClosureMemberCount: closure.memberCount,
  });
}

function main() {
  const policy = verifyAuthBridgeNotificationPreparedStaticPolicy();
  if (
    policy.deploymentMechanicsReady !== true
    || policy.dedicatedPersistentRunnerRequired !== true
    || policy.guardedRecoveryRequired !== true
    || policy.privateReceiptSinkRequired !== true
    || policy.installedToolchainByteAttestationRequired !== true
    || !Number.isSafeInteger(policy.executableSecurityClosureMemberCount)
    || policy.executableSecurityClosureMemberCount < 1
  ) fail('AUTH_BRIDGE_PREPARED_DEPLOYMENT_POLICY_INVALID');
  console.log('auth bridge notification preparation: guarded deployment policy verified; protected runner and secrets still required');
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    main();
  } catch (error) {
    console.error(error instanceof Error
      ? error.message
      : 'AUTH_BRIDGE_PREPARED_STATIC_POLICY_FAILED');
    process.exitCode = 1;
  }
}
