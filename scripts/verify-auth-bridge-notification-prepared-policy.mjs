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
    || /upload-(?:artifact|pages-artifact)@/u.test(workflow)
    || /^\s+(?:CLOUDFLARE_API_TOKEN|WARPKEEP_ADMIN_TOKEN_SECRET):/mu.test(workflow)
    || /WARPKEEP_AUTH_BRIDGE_NOTIFICATION_PREPARED_RECEIPT_PATH/u.test(workflow)
    || /^\s+runs-on:\s+(?:ubuntu|windows)-/mu.test(workflow)
    || /^\s+(?:push|pull_request|schedule|workflow_run):/mu.test(workflow)
    || /^\s+(?:actions|contents):\s+write\s*$/mu.test(workflow)
  ) fail('AUTH_BRIDGE_PREPARED_UNREVIEWED_DEPLOYMENT_MECHANICS');
  const entrypoint = read('scripts/auth-bridge-notification-prepared-deploy.mjs');
  for (const [exact, count] of [
    ["const REPOSITORY = 'ael-dev3/Warpkeep';", 1],
    ["const WORKFLOW_PATH = '.github/workflows/notification-bridge-prepared.yml';", 1],
    ['const WORKFLOW_REF = `${REPOSITORY}/${WORKFLOW_PATH}@refs/heads/main`;', 1],
    ['withAuthBridgeNotificationPreparedDeployJournal({', 1],
    ['prepareAndWriteAuthBridgeNotificationPreparedReceipt({', 1],
    ['apiToken: values.WARPKEEP_AUTH_BRIDGE_CLOUDFLARE_API_TOKEN', 1],
    ['playerCanaryOwnerFid:', 1],
    ['values.WARPKEEP_PLAYER_CANARY_OWNER_FID', 3],
    ['adminToken: values.WARPKEEP_PRODUCTION_ADMIN_TOKEN', 1],
    ['executeAuthBridgeNotificationPreparedDeployAdapter({', 1],
    ['createAuthBridgeNotificationPreparedGithubWritePermit({', 2],
    ['verifyAuthBridgeNotificationPreparedInstalledToolchain({', 2],
    ['verifyAuthBridgeNotificationPreparedDeployClosure({', 2],
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
