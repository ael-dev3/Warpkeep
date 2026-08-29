import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import {
  verifyAuthBridgeNotificationPreparedDeployClosurePolicy,
} from './auth-bridge-notification-prepared-deploy-closure-policy.mjs';

const WORKFLOW = '.github/workflows/notification-bridge-b0.yml';
const ENTRYPOINT = 'scripts/auth-bridge-notification-b0-deploy.mjs';
const DIRECT_DEPLOY_COMMAND = `node ${ENTRYPOINT} >/dev/null`;
const PROTECTED_DEPLOY_ENTRYPOINT = `'${ENTRYPOINT}';`;
const PROTECTED_DEPLOY_RUN =
  'await entrypoint.runAuthBridgeNotificationB0Deploy();';
const PROTECTED_NODE_LAUNCH =
  'exec -c "$node_executable" --input-type=module <&17 >/dev/null';
const PROTECTED_BOOTSTRAP_START =
  "exec 17<<'WARPKEEP_PROTECTED_NODE_BOOTSTRAP'";
const PREINSTALL_BOOTSTRAP_START =
  "exec 17<<'WARPKEEP_PREINSTALL_SOURCE_BOOTSTRAP'";
const IMMUTABLE_NODE_22_22_3_DARWIN_ARM64_PATH =
  '/private/var/db/warpkeep/runtime/node-v22.22.3-darwin-arm64/bin/node';
const IMMUTABLE_PNPM_11_7_0_DARWIN_ARM64_PATH =
  '/private/var/db/warpkeep/runtime/pnpm-v11.7.0-darwin-arm64/pnpm';
const OFFICIAL_NODE_22_22_3_DARWIN_ARM64_SHA256 =
  '5d9d3872911e2340a43b707962e68143de8a4e8d54628845c0c4f2de1fb7cd5c';
const OFFICIAL_PNPM_11_7_0_DARWIN_ARM64_SHA256 =
  '71867bc41587756fcbcba886effe380ca1f2914fcd166a50d3a26e58545ea034';
const NODE_AUTHORITY_STEP_SHA256 =
  '24a18dea59b836140d5fc0479e0ddba515413da806f05652952e0b589b078707';
const PROTECTED_STEP_SHA256 = Object.freeze({
  deploy: 'd368275986a3429d2fe69a54b7b37a994abac702e46adff68cbe480ba753b3eb',
  recovery: '7faadf73f99d674c415e6cf67fe3026ffadd046c87e243789e4da17611f0fd00',
});
const CANONICAL_WORKFLOW_SHA256 =
  'c2835fc2cecab6d08e7c3566a7ded255661cbf8799f6596d03ffd494d2956dea';
const PROTECTED_NODE_SELECTION =
  '          node_executable="$WARPKEEP_NODE_EXECUTABLE"';
const PROTECTED_NODE_OUTPUT_BINDING =
  '          WARPKEEP_NODE_EXECUTABLE: ${{ steps.node-authority.outputs.path }}';
const PROTECTED_SECRET_SHELL =
  '/usr/bin/env -u BASH_ENV -u ENV -u SHELLOPTS -u BASHOPTS -u PS4 -u NODE_OPTIONS -u NODE_PATH -u DYLD_INSERT_LIBRARIES -u DYLD_LIBRARY_PATH PATH=/usr/bin:/bin /bin/bash --noprofile --norc -p -e -o pipefail {0}';
const PROTECTED_NODE_ENVIRONMENT_BINDINGS = Object.freeze([
  'GITHUB_ACTIONS',
  'GITHUB_EVENT_NAME',
  'GITHUB_REF',
  'GITHUB_REPOSITORY',
  'GITHUB_RUN_ATTEMPT',
  'GITHUB_RUN_ID',
  'GITHUB_SHA',
  'GITHUB_TOKEN',
  'GITHUB_WORKFLOW_REF',
  'WARPKEEP_AUTH_BRIDGE_ACCOUNT_ID',
  'WARPKEEP_AUTH_BRIDGE_CLOUDFLARE_API_TOKEN',
  'WARPKEEP_AUTH_BRIDGE_ZONE_ID',
  'WARPKEEP_PRODUCTION_ADMIN_TOKEN',
]);
const PROTECTED_CHILD_CREDENTIAL_SEPARATION = Object.freeze([
  'values.GITHUB_TOKEN\n                === values.WARPKEEP_AUTH_BRIDGE_CLOUDFLARE_API_TOKEN',
  'values.GITHUB_TOKEN\n                === values.WARPKEEP_PRODUCTION_ADMIN_TOKEN',
  'values.WARPKEEP_AUTH_BRIDGE_CLOUDFLARE_API_TOKEN\n                === values.WARPKEEP_PRODUCTION_ADMIN_TOKEN',
]);
const DEDICATED_RUNNER =
  'runs-on: [self-hosted, macOS, ARM64, warpkeep-production-admin, warpkeep-repository-exclusive]';
const BOOTSTRAP_PIN_NAMES = Object.freeze([
  'WARPKEEP_PREPARED_SOURCE_CLOSURE_VERIFIER_SHA256',
  'WARPKEEP_PREPARED_SOURCE_CLOSURE_MANIFEST_SHA256',
  'WARPKEEP_PREPARED_INSTALLED_TOOLCHAIN_VERIFIER_SHA256',
  'WARPKEEP_PREPARED_INSTALLED_TOOLCHAIN_MANIFEST_SHA256',
]);
const BOOTSTRAP_PIN_CANONICAL_VALUE = '0'.repeat(64);
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

function sha256(source) {
  return createHash('sha256').update(source).digest('hex');
}

function assertCanonicalWorkflowStructure(workflow) {
  const code = 'AUTH_BRIDGE_NOTIFICATION_B0_WORKFLOW_STRUCTURE_INVALID';
  let canonical = workflow;
  for (const name of BOOTSTRAP_PIN_NAMES) {
    const pattern = new RegExp(
      `^      ${name}: '[a-f0-9]{64}'$`,
      'gmu',
    );
    if ([...canonical.matchAll(pattern)].length !== 1) fail(code);
    canonical = canonical.replace(
      pattern,
      `      ${name}: '${BOOTSTRAP_PIN_CANONICAL_VALUE}'`,
    );
  }
  if (sha256(canonical) !== CANONICAL_WORKFLOW_SHA256) fail(code);
}

function protectedStep(workflow, id, code) {
  const idLine = `        id: ${id}\n`;
  exact(workflow, idLine, 1, code);
  const idIndex = workflow.indexOf(idLine);
  const start = workflow.lastIndexOf('\n      - name:', idIndex);
  const next = workflow.indexOf('\n      - name:', idIndex + idLine.length);
  if (start < 0) fail(code);
  return workflow.slice(start + 1, next < 0 ? workflow.length : next);
}

function namedStep(workflow, name, code) {
  const nameLine = `      - name: ${name}\n`;
  exact(workflow, nameLine, 1, code);
  const start = workflow.indexOf(nameLine);
  const next = workflow.indexOf('\n      - name:', start + nameLine.length);
  return workflow.slice(start, next < 0 ? workflow.length : next);
}

function assertProtectedPreamble(workflow) {
  const code = 'AUTH_BRIDGE_NOTIFICATION_B0_BOOTSTRAP_INVALID';
  const resolution = namedStep(
    workflow,
    'Resolve exact protected main run authority',
    code,
  );
  exact(resolution, `        shell: ${PROTECTED_SECRET_SHELL}`, 1, code);
  exact(
    resolution,
    '/opt/homebrew/bin/gh api "repos/ael-dev3/Warpkeep/branches/main"',
    1,
    code,
  );
  const metadataCleanup = namedStep(
    workflow,
    'Discard prior checkout Git metadata',
    code,
  );
  exact(metadataCleanup, `        shell: ${PROTECTED_SECRET_SHELL}`, 1, code);
  for (const value of [
    '          workspace="$GITHUB_WORKSPACE"',
    '          git_metadata="$GITHUB_WORKSPACE/.git"',
    '            /bin/rm -rf -- "$git_metadata"',
  ]) exact(metadataCleanup, value, 1, code);
  const checkout = namedStep(workflow, 'Checkout exact protected source', code);
  exact(
    checkout,
    'uses: actions/checkout@9c091bb21b7c1c1d1991bb908d89e4e9dddfe3e0',
    1,
    code,
  );
  for (const name of [
    'BASH_ENV',
    'DYLD_INSERT_LIBRARIES',
    'DYLD_LIBRARY_PATH',
    'ENV',
    'NODE_OPTIONS',
    'NODE_PATH',
  ]) exact(checkout, `          ${name}: ''`, 1, code);
  for (const value of [
    "          GIT_ATTR_NOSYSTEM: '1'",
    "          GIT_CONFIG_COUNT: '2'",
    '          GIT_CONFIG_GLOBAL: /dev/null',
    '          GIT_CONFIG_KEY_0: core.hooksPath',
    '          GIT_CONFIG_KEY_1: init.templateDir',
    "          GIT_CONFIG_NOSYSTEM: '1'",
    '          GIT_CONFIG_VALUE_0: /private/var/empty',
    '          GIT_CONFIG_VALUE_1: /private/var/empty',
    '          set-safe-directory: false',
  ]) exact(checkout, value, 1, code);
  exact(checkout, '          PATH: /usr/bin:/bin', 1, code);
  const resolutionIndex = workflow.indexOf(
    '      - name: Resolve exact protected main run authority\n',
  );
  const cleanupIndex = workflow.indexOf(
    '      - name: Discard prior checkout Git metadata\n',
  );
  const checkoutIndex = workflow.indexOf(
    '      - name: Checkout exact protected source\n',
  );
  if (!(resolutionIndex >= 0
    && resolutionIndex < cleanupIndex
    && cleanupIndex < checkoutIndex)) fail(code);
}

function assertProtectedNodeAuthorityStep(workflow) {
  const code = 'AUTH_BRIDGE_NOTIFICATION_B0_CREDENTIAL_BOUNDARY_INVALID';
  const step = protectedStep(workflow, 'node-authority', code);
  exact(step, `        shell: ${PROTECTED_SECRET_SHELL}`, 1, code);
  exact(step, '        run: |\n', 1, code);
  exact(
    step,
    `node_executable='${IMMUTABLE_NODE_22_22_3_DARWIN_ARM64_PATH}'`,
    1,
    code,
  );
  exact(
    step,
    `pnpm_executable='${IMMUTABLE_PNPM_11_7_0_DARWIN_ARM64_PATH}'`,
    1,
    code,
  );
  exact(step, OFFICIAL_NODE_22_22_3_DARWIN_ARM64_SHA256, 1, code);
  exact(step, OFFICIAL_PNPM_11_7_0_DARWIN_ARM64_SHA256, 1, code);
  exact(step, 'verify_immutable_executable() {', 1, code);
  exact(step, "/usr/bin/stat -f '%u:%g:%l:%Lp:%HT' -- \"$component\"", 1, code);
  exact(step, '/bin/ls -lde -- "$component"', 1, code);
  exact(step, '"$path_uid" != \'0\'', 1, code);
  exact(step, '"$path_gid" != \'0\'', 1, code);
  exact(step, '"$path_nlink" != \'1\'', 1, code);
  exact(step, '"$path_mode" != \'555\'', 1, code);
  exact(step, '$((8#$path_mode & 0022)) -ne 0', 1, code);
  exact(step, '"$acl_listing" == *$\'\\n\'*', 1, code);
  exact(step, '"$acl_permissions" == *+*', 1, code);
  exact(step, '/usr/bin/codesign --verify --strict --verbose=4', 1, code);
  exact(step, 'TeamIdentifier=HX7739G8FX', 1, code);
  exact(step, 'Signature=adhoc', 1, code);
  exact(step, 'TeamIdentifier=not set', 1, code);
  exact(
    step,
    `printf 'path=%s\\npnpm_path=%s\\n' \\`,
    1,
    code,
  );
  exact(
    step,
    '"$node_executable" "$pnpm_executable" >> "$GITHUB_OUTPUT"',
    1,
    code,
  );
  if (sha256(step) !== NODE_AUTHORITY_STEP_SHA256) {
    fail(code);
  }
  const authority = workflow.indexOf('        id: node-authority\n');
  const preinstall = workflow.indexOf(
    '      - name: Attest source closure before package installation\n',
  );
  const install = workflow.indexOf(
    '      - name: Install exact auth bridge dependencies\n',
  );
  if (!(authority >= 0 && authority < preinstall && preinstall < install)) {
    fail(code);
  }
  if (
    workflow.includes('actions/setup-node@')
    || workflow.includes('pnpm/action-setup@')
  ) fail(code);
}

function assertProtectedPreinstallStep(workflow) {
  const code = 'AUTH_BRIDGE_NOTIFICATION_B0_BOOTSTRAP_INVALID';
  const step = namedStep(
    workflow,
    'Attest source closure before package installation',
    code,
  );
  exact(step, `        shell: ${PROTECTED_SECRET_SHELL}`, 1, code);
  exact(step, PROTECTED_NODE_OUTPUT_BINDING, 1, code);
  exact(step, PROTECTED_NODE_SELECTION, 1, code);
  exact(step, IMMUTABLE_NODE_22_22_3_DARWIN_ARM64_PATH, 1, code);
  exact(step, PREINSTALL_BOOTSTRAP_START, 1, code);
  exact(step, 'fstatSync(descriptor).isFIFO()', 1, code);
  exact(
    step,
    'exec 18< <(printf \'%s\\n\' "$WARPKEEP_PREPARED_SOURCE_CLOSURE_VERIFIER_SHA256")',
    1,
    code,
  );
  exact(
    step,
    'exec 19< <(printf \'%s\\n\' "$WARPKEEP_PREPARED_SOURCE_CLOSURE_MANIFEST_SHA256")',
    1,
    code,
  );
  exact(
    step,
    'exec 20< scripts/auth-bridge-notification-prepared-deploy-closure.mjs',
    1,
    code,
  );
  exact(step, "'data:text/javascript;base64,'", 1, code);
  exact(
    step,
    '.verifyAuthBridgeNotificationPreparedDeployClosure({',
    1,
    code,
  );
  exact(step, 'authority.manifestSha256 !== expectedManifestSha256', 1, code);
  exact(step, '.importAuthBridgeNotificationPreparedAttestedModules({', 0, code);
  exact(step, '<<<', 0, code);
  exact(step, PROTECTED_NODE_LAUNCH, 1, code);
  const importIndex = step.indexOf("await import(\n              'data:text/javascript;base64,'");
  const verifyIndex = step.indexOf(
    '.verifyAuthBridgeNotificationPreparedDeployClosure({',
  );
  const manifestIndex = step.indexOf(
    'authority.manifestSha256 !== expectedManifestSha256',
  );
  if (!(importIndex >= 0 && importIndex < verifyIndex && verifyIndex < manifestIndex)) {
    fail(code);
  }
}

function assertProtectedPackageInstallStep(workflow) {
  const code = 'AUTH_BRIDGE_NOTIFICATION_B0_INSTALLED_TOOLCHAIN_BOUNDARY_INVALID';
  const step = namedStep(workflow, 'Install exact auth bridge dependencies', code);
  exact(step, `        shell: ${PROTECTED_SECRET_SHELL}`, 1, code);
  exact(
    step,
    'WARPKEEP_PNPM_EXECUTABLE: ${{ steps.node-authority.outputs.pnpm_path }}',
    1,
    code,
  );
  exact(step, IMMUTABLE_PNPM_11_7_0_DARWIN_ARM64_PATH, 1, code);
  exact(step, 'forbidden_package_manager_config=(', 1, code);
  for (const path of [
    '.npmrc',
    '.pnpmfile.cjs',
    '.pnpmfile.mjs',
    'pnpmfile.cjs',
    'pnpmfile.mjs',
    'services/auth-bridge/.npmrc',
    'services/auth-bridge/.pnpmfile.cjs',
    'services/auth-bridge/.pnpmfile.mjs',
    'services/auth-bridge/pnpmfile.cjs',
    'services/auth-bridge/pnpmfile.mjs',
  ]) exact(step, `            ${path}\n`, 1, code);
  exact(
    step,
    '(configDependencies|globalPnpmfile|pnpmfile|scriptShell|shellEmulator)',
    1,
    code,
  );
  exact(step, '/usr/bin/mktemp -d /private/tmp/warpkeep-auth-bridge-pnpm.XXXXXX', 1, code);
  exact(step, '/usr/bin/env -i \\', 1, code);
  exact(step, 'NPM_CONFIG_GLOBALCONFIG=/dev/null', 1, code);
  exact(step, 'NPM_CONFIG_USERCONFIG=/dev/null', 1, code);
  exact(step, '            PATH=/usr/bin:/bin \\', 1, code);
  exact(step, '"$pnpm_executable" \\', 1, code);
  for (const option of [
    '--frozen-lockfile',
    '--ignore-scripts',
    '--ignore-pnpmfile',
    '--package-import-method=copy',
    '--store-dir "$install_state/store"',
    '--verify-store-integrity',
  ]) exact(step, option, 1, code);
  if (/^\s*run:\s+pnpm\b/mu.test(step)) fail(code);
}

function assertProtectedSecretStep(workflow, id) {
  const code = 'AUTH_BRIDGE_NOTIFICATION_B0_CREDENTIAL_BOUNDARY_INVALID';
  const step = protectedStep(workflow, id, code);
  exact(step, `        shell: ${PROTECTED_SECRET_SHELL}`, 1, code);
  exact(step, '        run: |\n', 1, code);
  exact(step, PROTECTED_NODE_OUTPUT_BINDING, 1, code);
  exact(step, PROTECTED_NODE_SELECTION, 1, code);
  exact(step, 'command -v node', 0, code);
  exact(step, IMMUTABLE_NODE_22_22_3_DARWIN_ARM64_PATH, 1, code);
  exact(step, OFFICIAL_NODE_22_22_3_DARWIN_ARM64_SHA256, 1, code);
  exact(step, PROTECTED_BOOTSTRAP_START, 1, code);
  exact(step, '\n          WARPKEEP_PROTECTED_NODE_BOOTSTRAP\n', 1, code);
  exact(
    step,
    'exec 18< <(printf \'%s\\n\' "$WARPKEEP_PREPARED_SOURCE_CLOSURE_VERIFIER_SHA256")',
    1,
    code,
  );
  exact(
    step,
    'exec 19< <(printf \'%s\\n\' "$WARPKEEP_PREPARED_SOURCE_CLOSURE_MANIFEST_SHA256")',
    1,
    code,
  );
  exact(
    step,
    'exec 20< scripts/auth-bridge-notification-prepared-deploy-closure.mjs',
    1,
    code,
  );
  exact(step, '<<<', 0, code);
  exact(step, 'fstatSync(descriptor).isFIFO()', 1, code);
  exact(step, "const closureUrl = 'data:text/javascript;base64,'", 1, code);
  exact(
    step,
    '.verifyAuthBridgeNotificationPreparedDeployClosure({',
    2,
    code,
  );
  exact(
    step,
    '.importAuthBridgeNotificationPreparedAttestedModules({',
    2,
    code,
  );
  exact(step, 'authority.manifestSha256 !== expectedManifestSha256', 1, code);
  exact(
    step,
    'authorityAfterPreflight.manifestSha256\n                !== expectedManifestSha256',
    1,
    code,
  );
  exact(step, 'memberPaths: [installedToolchainPath, staticPolicyPath]', 1, code);
  exact(
    step,
    '.verifyAuthBridgeNotificationPreparedInstalledToolchain({',
    1,
    code,
  );
  exact(
    step,
    'staticPolicy.verifyAuthBridgeNotificationB0StaticPolicy({',
    1,
    code,
  );
  exact(
    step,
    'toolchainAuthority.sourceClosureManifestSha256\n                !== expectedManifestSha256',
    1,
    code,
  );
  exact(step, 'memberPaths: [entrypointPath]', 1, code);
  exact(step, PROTECTED_DEPLOY_ENTRYPOINT, 1, code);
  exact(step, PROTECTED_DEPLOY_RUN, 1, code);
  exact(step, PROTECTED_NODE_LAUNCH, 1, code);
  exact(step, DIRECT_DEPLOY_COMMAND, 0, code);
  exact(step, 'protected_node_environment=(', 0, code);
  exact(step, 'delete process.env.__CF_USER_TEXT_ENCODING;', 1, code);
  exact(step, 'Object.keys(process.env).length !== 0', 1, code);
  for (const byteCheck of [
    'valueBody.includes(0x00)',
    'valueBody.includes(0x0a)',
    'valueBody.includes(0x0d)',
  ]) exact(step, byteCheck, 1, code);
  for (const [index, name] of PROTECTED_NODE_ENVIRONMENT_BINDINGS.entries()) {
    exact(step, `['${name}', ${21 + index}]`, 1, code);
    exact(
      step,
      `exec ${21 + index}< <(printf '%s\\n' "$${name}")`,
      1,
      code,
    );
  }
  const unexportBlock = [
    'export -n \\',
    ...PROTECTED_NODE_ENVIRONMENT_BINDINGS.map((name, index) => (
      `            ${name}${
        index === PROTECTED_NODE_ENVIRONMENT_BINDINGS.length - 1 ? '' : ' \\'
      }`
    )),
  ].join('\n');
  exact(step, unexportBlock, 1, code);
  for (const separation of PROTECTED_CHILD_CREDENTIAL_SEPARATION) {
    exact(step, separation, 1, code);
  }
  exact(step, 'verify_immutable_executable_path() {', 1, code);
  exact(step, 'verify_immutable_executable_path "$node_executable"', 2, code);
  exact(step, "/usr/bin/stat -f '%u:%g:%l:%Lp:%HT' -- \"$component\"", 1, code);
  exact(step, '/bin/ls -lde -- "$component"', 1, code);
  exact(step, '"$path_uid" != \'0\'', 1, code);
  exact(step, '"$path_gid" != \'0\'', 1, code);
  exact(step, '"$path_nlink" != \'1\'', 1, code);
  exact(step, '"$path_mode" != \'555\'', 1, code);
  exact(step, '$((8#$path_mode & 0022)) -ne 0', 1, code);
  exact(step, '/usr/bin/codesign --verify --strict --verbose=4', 1, code);
  exact(step, 'TeamIdentifier=HX7739G8FX', 1, code);
  const malformedGuard = step.indexOf('"$protected_binding" == *$\'\\n\'*');
  const outerSeparation = step.indexOf(
    '"$GITHUB_TOKEN" == "$WARPKEEP_AUTH_BRIDGE_CLOUDFLARE_API_TOKEN"',
  );
  const bootstrap = step.indexOf(PROTECTED_BOOTSTRAP_START);
  const unexport = step.indexOf(unexportBlock);
  const manifestAuthority = step.indexOf(
    'authority.manifestSha256 !== expectedManifestSha256',
  );
  const preflightImport = step.indexOf(
    'memberPaths: [installedToolchainPath, staticPolicyPath]',
  );
  const toolchainVerify = step.indexOf(
    '.verifyAuthBridgeNotificationPreparedInstalledToolchain({',
  );
  const policyVerify = step.indexOf(
    'staticPolicy.verifyAuthBridgeNotificationB0StaticPolicy({',
  );
  const entrypointImport = step.indexOf('memberPaths: [entrypointPath]');
  const credentialRead = step.indexOf('const values = Object.create(null);');
  const relay = step.indexOf('exec 21< <(printf \'%s\\n\' "$GITHUB_ACTIONS")');
  const firstNodeVerification = step.indexOf(
    'verify_immutable_executable_path "$node_executable"',
  );
  const finalNodeVerification = step.lastIndexOf(
    'verify_immutable_executable_path "$node_executable"',
  );
  const launch = step.indexOf(PROTECTED_NODE_LAUNCH);
  const runBody = step.slice(step.indexOf('        run: |\n'));
  const beforeUnexport = runBody.slice(0, runBody.indexOf(unexportBlock));
  if (!(malformedGuard >= 0
    && malformedGuard < outerSeparation
    && outerSeparation < unexport
    && unexport < firstNodeVerification
    && firstNodeVerification < bootstrap
    && bootstrap < manifestAuthority
    && manifestAuthority < preflightImport
    && preflightImport < toolchainVerify
    && preflightImport < policyVerify
    && toolchainVerify < entrypointImport
    && policyVerify < entrypointImport
    && entrypointImport < credentialRead
    && bootstrap < relay
    && relay < finalNodeVerification
    && finalNodeVerification < launch)) fail(code);
  if (/^\s+(?:\/usr\/bin|\/bin)\//mu.test(beforeUnexport)) fail(code);
  if (sha256(step) !== PROTECTED_STEP_SHA256[id]) {
    fail(code);
  }
}

function assertProtectedWorkflowExecutionBoundary(workflow) {
  assertProtectedPreamble(workflow);
  assertProtectedNodeAuthorityStep(workflow);
  assertProtectedPreinstallStep(workflow);
  assertProtectedPackageInstallStep(workflow);
  for (const id of ['deploy', 'recovery']) {
    assertProtectedSecretStep(workflow, id);
  }
  assertCanonicalWorkflowStructure(workflow);
}

function assertExactPredecessorReattestationCount(runtime) {
  if (count(runtime, PREDECESSOR_REATTESTATION) !== 3) {
    fail('AUTH_BRIDGE_NOTIFICATION_B0_RUNTIME_BOUNDARY_INVALID');
  }
}

function assertInertReleaseIdentity(workflow, packageDocument) {
  if (
    packageDocument.version !== '0.3.43'
    || workflow.includes('0.3.44')
    || workflow.includes('0.4.')
  ) fail('AUTH_BRIDGE_NOTIFICATION_B0_UNREVIEWED_CAPABILITY');
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
    '/opt/homebrew/bin/gh api "repos/ael-dev3/Warpkeep/branches/main"',
    `node_executable='${IMMUTABLE_NODE_22_22_3_DARWIN_ARM64_PATH}'`,
    `pnpm_executable='${IMMUTABLE_PNPM_11_7_0_DARWIN_ARM64_PATH}'`,
    "WARPKEEP_BRIDGE_NOTIFICATION_DELIVERY_ENABLED: 'true'",
    "WARPKEEP_HERMES_EXECUTION_APPROVED: 'false'",
    "WARPKEEP_PAGES_PRESENTATION_ENABLED: 'false'",
    'WARPKEEP_ADMISSION_NOTIFICATIONS_ENABLED: ${{ vars.WARPKEEP_ADMISSION_NOTIFICATIONS_ENABLED }}',
    'pages_value="${WARPKEEP_ADMISSION_NOTIFICATIONS_ENABLED:-false}"',
    'if [[ "$pages_value" != \'false\' ]]; then',
    "if: ${{ always() && steps.deploy.outputs.attempted == 'true' && steps.deploy.outcome != 'success' }}",
    "echo 'AUTH_BRIDGE_NOTIFICATION_B0_DEPLOY_OR_RECOVERY_UNVERIFIED' >&2",
  ]) exact(workflow, value, 1, 'AUTH_BRIDGE_NOTIFICATION_B0_WORKFLOW_INVALID');
  exact(workflow, PROTECTED_DEPLOY_ENTRYPOINT, 2,
    'AUTH_BRIDGE_NOTIFICATION_B0_ENTRYPOINT_INVALID');
  exact(workflow, PROTECTED_DEPLOY_RUN, 2,
    'AUTH_BRIDGE_NOTIFICATION_B0_ENTRYPOINT_INVALID');
  exact(workflow, PROTECTED_NODE_LAUNCH, 3,
    'AUTH_BRIDGE_NOTIFICATION_B0_ENTRYPOINT_INVALID');
  exact(workflow, DIRECT_DEPLOY_COMMAND, 0,
    'AUTH_BRIDGE_NOTIFICATION_B0_ENTRYPOINT_INVALID');
  for (const directRepositoryCommand of [
    'node scripts/auth-bridge-notification-prepared-deploy-closure.mjs',
    'node scripts/auth-bridge-notification-prepared-installed-toolchain.mjs',
    'node scripts/verify-auth-bridge-notification-b0-policy.mjs',
  ]) exact(
    workflow,
    directRepositoryCommand,
    0,
    'AUTH_BRIDGE_NOTIFICATION_B0_INSTALLED_TOOLCHAIN_BOUNDARY_INVALID',
  );
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
  exact(
    workflow,
    `shell: ${PROTECTED_SECRET_SHELL}`,
    11,
    'AUTH_BRIDGE_NOTIFICATION_B0_CREDENTIAL_BOUNDARY_INVALID',
  );
  exact(
    workflow,
    PROTECTED_NODE_OUTPUT_BINDING,
    3,
    'AUTH_BRIDGE_NOTIFICATION_B0_CREDENTIAL_BOUNDARY_INVALID',
  );
  exact(
    workflow,
    OFFICIAL_NODE_22_22_3_DARWIN_ARM64_SHA256,
    3,
    'AUTH_BRIDGE_NOTIFICATION_B0_CREDENTIAL_BOUNDARY_INVALID',
  );
  exact(
    workflow,
    'command -v node',
    0,
    'AUTH_BRIDGE_NOTIFICATION_B0_CREDENTIAL_BOUNDARY_INVALID',
  );
  exact(
    workflow,
    PROTECTED_BOOTSTRAP_START,
    2,
    'AUTH_BRIDGE_NOTIFICATION_B0_CREDENTIAL_BOUNDARY_INVALID',
  );
  exact(
    workflow,
    PREINSTALL_BOOTSTRAP_START,
    1,
    'AUTH_BRIDGE_NOTIFICATION_B0_BOOTSTRAP_INVALID',
  );
  exact(
    workflow,
    'protected_node_environment=(',
    0,
    'AUTH_BRIDGE_NOTIFICATION_B0_CREDENTIAL_BOUNDARY_INVALID',
  );
  exact(
    workflow,
    'shell: bash',
    0,
    'AUTH_BRIDGE_NOTIFICATION_B0_BOOTSTRAP_INVALID',
  );
  const installIndex = workflow.indexOf(
    '      - name: Install exact auth bridge dependencies\n',
  );
  const postinstallBootstrapIndex = workflow.lastIndexOf(
    'verify_bootstrap_digest "$WARPKEEP_PREPARED_INSTALLED_TOOLCHAIN_MANIFEST_SHA256"',
  );
  const protectedSecretIndex = workflow.indexOf(
    'WARPKEEP_AUTH_BRIDGE_CLOUDFLARE_API_TOKEN: ${{ secrets.',
  );
  if (
    installIndex < 0
    || postinstallBootstrapIndex <= installIndex
    || protectedSecretIndex <= postinstallBootstrapIndex
    || workflow.includes('--print-candidate')
    || workflow.includes('pnpm --dir services/auth-bridge run check')
  ) fail('AUTH_BRIDGE_NOTIFICATION_B0_INSTALLED_TOOLCHAIN_BOUNDARY_INVALID');
  assertProtectedWorkflowExecutionBoundary(workflow);
  assertInertReleaseIdentity(workflow, packageDocument);
  if (
    workflow.includes('PLAYER_CANARY_OWNER_FID')
    || workflow.includes('WARPKEEP_PLAYER_CANARY_OWNER_FID')
    || workflow.includes('PTR_SPACETIMEDB_DATABASE')
    || workflow.includes('PTR_OIDC_AUDIENCE')
    || workflow.includes('WARPKEEP_PTR_SPACETIMEDB_DATABASE')
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
    'await importAuthBridgeNotificationPreparedAttestedModules({',
    'authority: sourceClosureAfterToolchain,',
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
    ['await importAuthBridgeNotificationPreparedAttestedModules({', 1],
    ['authority: sourceClosureAfterToolchain,', 1],
    ["'scripts/auth-bridge-notification-b0-deploy-adapter.mjs',", 1],
    ["'scripts/auth-bridge-notification-b0-cloudflare-runtime.mjs',", 1],
    ["'scripts/auth-bridge-notification-b0-deploy-journal.mjs',", 1],
    ["import('./auth-bridge-notification-b0-", 0],
    ["  'PLAYER_CANARY_OWNER_FID',", 1],
    ["  'PTR_ENABLED',", 1],
    ["  'PTR_OIDC_AUDIENCE',", 1],
    ["  'PTR_SPACETIMEDB_DATABASE',", 1],
    ["  'WARPKEEP_PLAYER_CANARY_OWNER_FID',", 1],
    ["  'WARPKEEP_PTR_SPACETIMEDB_DATABASE',", 1],
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
    || adapter.includes('PTR_SPACETIMEDB_DATABASE')
    || adapter.includes('PTR_OIDC_AUDIENCE')
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
    || runtime.includes("'workers/triggered_by':")
    || !runtime.includes("latest.triggeredBy !== 'deployment'")
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
    || count(adapter, "PTR_ENABLED: 'false'") !== 1
    || count(runtime, "['PTR_ENABLED', 'false']") !== 1
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
    ? Object.freeze({
      assertExactPredecessorReattestationCount,
      assertInertReleaseIdentity,
      assertProtectedWorkflowExecutionBoundary,
    })
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
