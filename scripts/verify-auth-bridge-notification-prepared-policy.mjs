import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const AUTH_BRIDGE_NOTIFICATION_PREPARED_DEPLOYMENT_BLOCKER =
  'AUTH_BRIDGE_PREPARED_DEPLOY_ADAPTER_AND_PRIVATE_SINK_UNAVAILABLE';

function fail(code) {
  throw new Error(code);
}

function exactOccurrence(source, value, code) {
  if (source.split(value).length !== 2) fail(code);
}

/**
 * Checks only repository-owned release policy. It performs no network or
 * control-plane operation and deliberately reports the deploy boundary closed.
 */
export function verifyAuthBridgeNotificationPreparedStaticPolicy({
  repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..'),
} = {}) {
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
    "VITE_WARPKEEP_ADMISSION_NOTIFICATIONS_ENABLED: ${{ vars.WARPKEEP_ADMISSION_NOTIFICATIONS_ENABLED || 'false' }}",
    'AUTH_BRIDGE_PREPARED_PAGES_GATE_INVALID',
  );

  const packageDocument = JSON.parse(read('services/auth-bridge/package.json'));
  if (
    packageDocument.packageManager !== 'pnpm@11.7.0'
    || packageDocument.devDependencies?.wrangler !== '4.110.0'
    || Object.keys(packageDocument.scripts ?? {})
      .some(name => /^(?:deploy|publish)(?::|$)/u.test(name))
  ) fail('AUTH_BRIDGE_PREPARED_DEPLOY_TOOLCHAIN_INVALID');

  const workflow = read('.github/workflows/notification-bridge-prepared.yml');
  for (const exact of [
    "WARPKEEP_BRIDGE_NOTIFICATION_DELIVERY_ENABLED: 'true'",
    "WARPKEEP_HERMES_EXECUTION_APPROVED: 'false'",
    "WARPKEEP_PAGES_PRESENTATION_ENABLED: 'false'",
    "WARPKEEP_SAFE_DEPLOYMENT_MECHANICS_REVIEWED: 'false'",
    `echo '${AUTH_BRIDGE_NOTIFICATION_PREPARED_DEPLOYMENT_BLOCKER}' >&2`,
  ]) exactOccurrence(workflow, exact, 'AUTH_BRIDGE_PREPARED_WORKFLOW_POLICY_INVALID');

  if (
    /\bwrangler\s+(?:deploy|publish|versions\s+upload)\b/u.test(workflow)
    || /\b(?:curl|wget)\b/u.test(workflow)
    || /upload-(?:artifact|pages-artifact)@/u.test(workflow)
    || workflow.includes('WARPKEEP_ADMIN_TOKEN_SECRET')
    || workflow.includes('CLOUDFLARE_API_TOKEN')
  ) fail('AUTH_BRIDGE_PREPARED_UNREVIEWED_DEPLOYMENT_MECHANICS');

  return Object.freeze({
    bridgeNotificationDeliveryEnabled: true,
    hermesExecutionApproved: false,
    pagesPresentationEnabled: false,
    checkedInWorkerGateEnabled: false,
    deploymentMechanicsReady: false,
    blocker: AUTH_BRIDGE_NOTIFICATION_PREPARED_DEPLOYMENT_BLOCKER,
  });
}

function main() {
  const policy = verifyAuthBridgeNotificationPreparedStaticPolicy();
  if (policy.deploymentMechanicsReady !== false) {
    fail('AUTH_BRIDGE_PREPARED_DEPLOYMENT_BLOCKER_INVALID');
  }
  console.log('auth bridge notification preparation: static bridge-only policy verified; deployment remains blocked');
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
