// @vitest-environment node

import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  chmodSync,
  cpSync,
  linkSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';
import { parse } from 'yaml';

import {
  authBridgeNotificationB0PolicyTestSeams,
} from '../scripts/verify-auth-bridge-notification-b0-policy.mjs';

const repository = resolve(import.meta.dirname, '..');
const workflowPath = resolve(
  repository,
  '.github/workflows/notification-bridge-b0.yml',
);
const workflowSource = readFileSync(workflowPath, 'utf8');
const workflow = parse(workflowSource) as Record<string, unknown>;
const runtimeSource = readFileSync(resolve(
  repository,
  'scripts/auth-bridge-notification-b0-cloudflare-runtime.mjs',
), 'utf8');
const predecessorReattestation =
  'await assertPredecessorStable(Object.freeze({';
const OFFICIAL_NODE_22_22_3_DARWIN_ARM64_SHA256 =
  '5d9d3872911e2340a43b707962e68143de8a4e8d54628845c0c4f2de1fb7cd5c';
const IMMUTABLE_NODE_22_22_3_DARWIN_ARM64_PATH =
  '/private/var/db/warpkeep/runtime/node-v22.22.3-darwin-arm64/bin/node';
const TEST_SOURCE_CLOSURE_MANIFEST_SHA256 = 'a'.repeat(64);
const policyTestSeams = authBridgeNotificationB0PolicyTestSeams!;
const policyExecutionBoundaryTestSeams = policyTestSeams as unknown as {
  assertProtectedWorkflowExecutionBoundary(workflowSource: string): void;
};
const temporaryDirectories: string[] = [];

interface WorkflowStep {
  id?: string;
  run?: string;
  shell?: string;
}

function step(id: string): WorkflowStep {
  const jobs = workflow.jobs as Record<string, unknown> | undefined;
  const job = jobs?.['notification-bridge-b0'] as {
    steps?: WorkflowStep[];
  } | undefined;
  const value = job?.steps?.find(candidate => candidate.id === id);
  if (value === undefined) throw new Error(`B0 workflow step ${id} missing`);
  return value;
}

function emulateBsdNodeAttestationForLinux(source: string): string {
  return source
    .replaceAll(
      "/usr/bin/stat -f '%u:%g:%l:%Lp:%HT' -- \"$component\"",
      "/usr/bin/stat -c '%u:%g:%h:%a:%F' -- \"$component\"",
    )
    .replaceAll(
      '/bin/ls -lde -- "$component"',
      '/bin/ls -ld -- "$component"',
    )
    .replaceAll('Regular File', 'regular file')
    .replaceAll('Directory', 'directory');
}

function protectedLaunchForTrustedNode(
  source: string,
  nodeExecutable: string,
  nodeDigest: string,
): string {
  const uid = String(process.getuid?.() ?? 0);
  return emulateBsdNodeAttestationForLinux(source
    .replaceAll(IMMUTABLE_NODE_22_22_3_DARWIN_ARM64_PATH, nodeExecutable)
    .replaceAll(OFFICIAL_NODE_22_22_3_DARWIN_ARM64_SHA256, nodeDigest)
    .replaceAll(
      '"$path_uid" != \'0\'',
      `"$path_uid" != '0' && "$path_uid" != '${uid}'`,
    )
    .replaceAll(
      '"$path_gid" != \'0\'',
      '0 -ne 0',
    )
    .replaceAll(
      '"$path_mode" != \'555\'',
      '"$path_mode" != \'555\' && "$path_mode" != \'755\'',
    )
    .replaceAll('/usr/bin/codesign --verify --strict --verbose=4 "$executable"', 'true')
    .replaceAll(
      'signature="$(/usr/bin/codesign -dv --verbose=4 "$executable" 2>&1)"',
      "signature='Signature=adhoc'",
    )
    .replaceAll(
      '"$signature" != *$\'TeamIdentifier=HX7739G8FX\'*',
      () => '"$signature" != *$\'TeamIdentifier=HX7739G8FX\'* '
        + '&& "$signature" != *$\'Signature=adhoc\'*',
    ));
}

function protectedLaunchForSameUidSwapTarget(
  source: string,
  nodeExecutable: string,
  nodeDigest: string,
): string {
  return emulateBsdNodeAttestationForLinux(source
    .replaceAll(IMMUTABLE_NODE_22_22_3_DARWIN_ARM64_PATH, nodeExecutable)
    .replaceAll(OFFICIAL_NODE_22_22_3_DARWIN_ARM64_SHA256, nodeDigest)
    .replaceAll(
      '"$signature" != *$\'TeamIdentifier=HX7739G8FX\'*',
      () => '"$signature" != *$\'TeamIdentifier=HX7739G8FX\'* '
        + '&& "$signature" != *$\'Signature=adhoc\'*',
    ));
}

function writeProtectedLaunchClosureFixture(
  root: string,
  entrypointRelativePath: string,
  manifestSha256 = TEST_SOURCE_CLOSURE_MANIFEST_SHA256,
): string {
  const entrypointDigest = createHash('sha256')
    .update(readFileSync(resolve(root, entrypointRelativePath)))
    .digest('hex');
  const closureSource = [
    "import { createHash } from 'node:crypto';",
    "import { readFileSync } from 'node:fs';",
    "import { resolve } from 'node:path';",
    'const entrypointRelativePath = '
      + JSON.stringify(entrypointRelativePath)
      + ';',
    'const entrypointDigest = ' + JSON.stringify(entrypointDigest) + ';',
    'const authorities = new WeakSet();',
    'function fail(code) {',
    '  const error = new Error(code);',
    '  error.code = code;',
    '  throw error;',
    '}',
    'export function verifyAuthBridgeNotificationPreparedDeployClosure({ repositoryRoot } = {}) {',
    '  const repository = resolve(repositoryRoot);',
    "  if (repository !== process.cwd()) fail('TEST_CLOSURE_REPOSITORY_INVALID');",
    '  const authority = Object.freeze({ repositoryRoot: repository, manifestSha256: '
      + JSON.stringify(manifestSha256)
      + ' });',
    '  authorities.add(authority);',
    '  return authority;',
    '}',
    'export async function importAuthBridgeNotificationPreparedAttestedModules({ authority, repositoryRoot, memberPaths } = {}) {',
    '  const repository = resolve(repositoryRoot);',
    '  if (!authorities.has(authority)',
    '    || authority.repositoryRoot !== repository) {',
    "    fail('TEST_CLOSURE_MODULE_SET_INVALID');",
    '  }',
    '  if (Array.isArray(memberPaths)',
    '    && memberPaths.length === 2',
    "    && memberPaths[0] === 'scripts/auth-bridge-notification-prepared-installed-toolchain.mjs'",
    "    && memberPaths[1].startsWith('scripts/verify-auth-bridge-notification-')) {",
    '    return Object.freeze([',
    '      Object.freeze({',
    '        verifyAuthBridgeNotificationPreparedInstalledToolchain() {',
    '          return Object.freeze({',
    '            sourceClosureManifestSha256: authority.manifestSha256,',
    "            wranglerEntrypoint: resolve(repository, 'services/auth-bridge/node_modules/wrangler/bin/wrangler.js'),",
    '          });',
    '        },',
    '      }),',
    '      Object.freeze({',
    '        verifyAuthBridgeNotificationB0StaticPolicy() {',
    '          return Object.freeze({ guardedRecoveryRequired: true });',
    '        },',
    '        verifyAuthBridgeNotificationPreparedStaticPolicy() {',
    '          return Object.freeze({ guardedRecoveryRequired: true });',
    '        },',
    '      }),',
    '    ]);',
    '  }',
    '  if (JSON.stringify(memberPaths) !== JSON.stringify([entrypointRelativePath])) {',
    "    fail('TEST_CLOSURE_MODULE_SET_INVALID');",
    '  }',
    '  const body = readFileSync(resolve(repository, entrypointRelativePath));',
    "  if (createHash('sha256').update(body).digest('hex') !== entrypointDigest) {",
    "    fail('TEST_CLOSURE_MODULE_DIGEST_MISMATCH');",
    '  }',
    "  const moduleUrl = 'data:text/javascript;base64,' + body.toString('base64');",
    '  return Object.freeze([await import(moduleUrl)]);',
    '}',
    '',
  ].join('\n');
  writeFileSync(
    resolve(root, 'scripts/auth-bridge-notification-prepared-deploy-closure.mjs'),
    closureSource,
  );
  return createHash('sha256').update(closureSource).digest('hex');
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe('notification bridge B0 protected workflow', () => {
  it('is manual-only, protected-main-only, and repository-exclusive', () => {
    expect(workflowSource).toContain('workflow_dispatch:');
    expect(workflowSource).not.toMatch(/\b(?:push|schedule|pull_request):/u);
    expect(workflowSource).toContain("GITHUB_REF\" != 'refs/heads/main'");
    expect(workflowSource).toContain(
      "gh api \"repos/ael-dev3/Warpkeep/branches/main\"",
    );
    expect(workflowSource).toContain(
      'runs-on: [self-hosted, macOS, ARM64, warpkeep-production-admin, warpkeep-repository-exclusive]',
    );
    expect(workflowSource).not.toContain('ubuntu-latest');
    expect(workflowSource).toContain('persist-credentials: false');
    expect(workflowSource).toContain('clean: true');
    expect(workflowSource).toContain('fetch-depth: 1');
    expect(workflowSource).toContain(
      '- name: Discard prior checkout Git metadata',
    );
    for (const exact of [
      "git_metadata=\"$GITHUB_WORKSPACE/.git\"",
      '/bin/rm -rf -- "$git_metadata"',
      "GIT_ATTR_NOSYSTEM: '1'",
      "GIT_CONFIG_COUNT: '2'",
      'GIT_CONFIG_GLOBAL: /dev/null',
      'GIT_CONFIG_KEY_0: core.hooksPath',
      'GIT_CONFIG_KEY_1: init.templateDir',
      "GIT_CONFIG_NOSYSTEM: '1'",
      'GIT_CONFIG_VALUE_0: /private/var/empty',
      'GIT_CONFIG_VALUE_1: /private/var/empty',
      'set-safe-directory: false',
    ]) expect(workflowSource).toContain(exact);
    expect(workflow).toBeTruthy();
  });

  it('loads only the existing four workflow credentials and never the seventh secret', () => {
    const expected = [
      'GITHUB_TOKEN',
      'WARPKEEP_AUTH_BRIDGE_ACCOUNT_ID',
      'WARPKEEP_AUTH_BRIDGE_CLOUDFLARE_API_TOKEN',
      'WARPKEEP_AUTH_BRIDGE_ZONE_ID',
      'WARPKEEP_PRODUCTION_ADMIN_TOKEN',
    ];
    for (const name of expected) expect(workflowSource).toContain(name);
    expect(workflowSource).not.toContain('PLAYER_CANARY_OWNER_FID');
    expect(workflowSource).not.toContain('WARPKEEP_PLAYER_CANARY_OWNER_FID');
    expect(workflowSource).not.toContain('PTR_SPACETIMEDB_DATABASE');
    expect(workflowSource).not.toContain('PTR_OIDC_AUDIENCE');
    expect(workflowSource).not.toContain('WARPKEEP_PTR_SPACETIMEDB_DATABASE');
    expect(workflowSource).not.toMatch(/\bsecrets:\s*inherit\b/u);
    expect(workflowSource).not.toMatch(/wrangler\s+(?:deploy|versions|secret)/u);
  });

  it('has one syntactically valid byte-attested bootstrap in each protected launch', () => {
    const bootstrapStart = "exec 17<<'WARPKEEP_PROTECTED_NODE_BOOTSTRAP'";
    const finalNodeLaunch =
      'exec -c "$node_executable" --input-type=module <&17 >/dev/null';
    for (const stepId of ['deploy', 'recovery']) {
      const launch = step(stepId).run ?? '';
      expect(launch.split(bootstrapStart), stepId).toHaveLength(2);
      expect(launch.match(
        /^WARPKEEP_PROTECTED_NODE_BOOTSTRAP$/gmu,
      ), stepId).toHaveLength(1);
      expect(launch.split(
        'exec 18< <(printf \'%s\\n\' "$WARPKEEP_PREPARED_SOURCE_CLOSURE_VERIFIER_SHA256")',
      ), stepId).toHaveLength(2);
      expect(launch.split(
        'exec 19< <(printf \'%s\\n\' "$WARPKEEP_PREPARED_SOURCE_CLOSURE_MANIFEST_SHA256")',
      ), stepId).toHaveLength(2);
      expect(launch.split(
        'exec 20< scripts/auth-bridge-notification-prepared-deploy-closure.mjs',
      ), stepId).toHaveLength(2);
      expect(launch).toContain('fstatSync(descriptor).isFIFO()');
      expect(launch).toContain(
        'authority.manifestSha256 !== expectedManifestSha256',
      );
      expect(launch.indexOf(
        'authority.manifestSha256 !== expectedManifestSha256',
      )).toBeLessThan(launch.indexOf(
        '.importAuthBridgeNotificationPreparedAttestedModules({',
      ));
      expect(launch).toContain("const closureUrl = 'data:text/javascript;base64,'");
      expect(launch).toContain(
        '.verifyAuthBridgeNotificationPreparedDeployClosure({',
      );
      expect(launch).toContain(
        '.importAuthBridgeNotificationPreparedAttestedModules({',
      );
      expect(launch).toContain(
        "memberPaths: [entrypointPath]",
      );
      expect(launch).toContain(
        'await entrypoint.runAuthBridgeNotificationB0Deploy();',
      );
      const manifestAuthorityIndex = launch.indexOf(
        'authority.manifestSha256 !== expectedManifestSha256',
      );
      const toolchainImportIndex = launch.indexOf(
        'memberPaths: [installedToolchainPath, staticPolicyPath]',
      );
      const toolchainVerifyIndex = launch.indexOf(
        '.verifyAuthBridgeNotificationPreparedInstalledToolchain({',
      );
      const policyVerifyIndex = launch.indexOf(
        'staticPolicy.verifyAuthBridgeNotificationB0StaticPolicy({',
      );
      const credentialReadIndex = launch.indexOf(
        'const values = Object.create(null);',
      );
      expect(manifestAuthorityIndex, stepId).toBeGreaterThan(0);
      expect(toolchainImportIndex, stepId).toBeGreaterThan(
        manifestAuthorityIndex,
      );
      expect(toolchainVerifyIndex, stepId).toBeGreaterThan(
        toolchainImportIndex,
      );
      expect(policyVerifyIndex, stepId).toBeGreaterThan(toolchainImportIndex);
      expect(credentialReadIndex, stepId).toBeGreaterThan(toolchainVerifyIndex);
      expect(credentialReadIndex, stepId).toBeGreaterThan(policyVerifyIndex);
      expect(launch.split(finalNodeLaunch), stepId).toHaveLength(2);
      expect(launch).not.toContain('<<<');
      expect(launch.split(
        'verify_immutable_executable_path "$node_executable"',
      ), stepId).toHaveLength(3);
      expect(launch).not.toContain(
        'exec -c "$node_executable" scripts/auth-bridge-notification-b0-deploy.mjs',
      );
      expect(launch).toContain('"$path_nlink" != \'1\'');
      expect(launch).toContain('$((8#$path_mode & 0022)) -ne 0');

      const root = realpathSync(mkdtempSync(join(
        tmpdir(),
        'warpkeep-b0-protected-launch-syntax-',
      )));
      temporaryDirectories.push(root);
      const runScript = resolve(root, 'run.sh');
      writeFileSync(runScript, launch);
      const syntax = spawnSync('/bin/bash', ['-n', runScript], {
        encoding: 'utf8',
      });
      expect(syntax.status, `${stepId}: ${syntax.stderr}`).toBe(0);
    }

    const authority = step('node-authority').run ?? '';
    expect(authority).toContain(
      '/private/var/db/warpkeep/runtime/node-v22.22.3-darwin-arm64/bin/node',
    );
    expect(authority).toContain(
      '/private/var/db/warpkeep/runtime/pnpm-v11.7.0-darwin-arm64/pnpm',
    );
    expect(authority).toContain('verify_immutable_executable');
    expect(authority).toContain('"$path_uid" != \'0\'');
    expect(authority).toContain('acl_listing');
    expect(authority).toContain('/usr/bin/codesign --verify --strict');
    expect(authority).toContain('"$path_nlink" != \'1\'');
    expect(authority).toContain('$((8#$path_mode & 0022)) -ne 0');
    expect(authority).toContain(
      '71867bc41587756fcbcba886effe380ca1f2914fcd166a50d3a26e58545ea034',
    );
    expect(workflowSource).not.toContain('pnpm/action-setup@');
    expect(workflowSource).not.toContain('actions/setup-node@');
    expect(workflowSource).toContain(
      'WARPKEEP_PNPM_EXECUTABLE: ${{ steps.node-authority.outputs.pnpm_path }}',
    );
    expect(workflowSource).toContain('--ignore-pnpmfile');
    expect(workflowSource).toContain('NPM_CONFIG_USERCONFIG=/dev/null');
    expect(workflowSource).toContain("forbidden_package_manager_config=(");
    expect(workflowSource).not.toContain(
      'run: pnpm --dir services/auth-bridge install',
    );
    expect(() => policyExecutionBoundaryTestSeams
      .assertProtectedWorkflowExecutionBoundary(workflowSource)).not.toThrow();
  });

  it('uses a clean allowlisted environment for both B0 launches', () => {
    for (const stepId of ['deploy', 'recovery']) {
      const root = realpathSync(mkdtempSync(join(
        tmpdir(),
        'warpkeep-b0-protected-node-launch-',
      )));
      temporaryDirectories.push(root);
      const bin = resolve(root, 'bin');
      const marker = resolve(root, 'sanitized');
      const hostileNodeMarker = resolve(root, 'hostile-node-ran');
      const preload = resolve(root, 'ambient-preload.sh');
      const preloadMarker = resolve(root, 'preload-ran');
      const functionMarker = resolve(root, 'imported-function-ran');
      const runScript = resolve(root, 'run.sh');
      mkdirSync(bin);
      writeFileSync(resolve(bin, 'node'), `#!/bin/bash -p
set -euo pipefail
/usr/bin/printenv GITHUB_TOKEN > ${JSON.stringify(hostileNodeMarker)}
`);
      chmodSync(resolve(bin, 'node'), 0o755);
      const scripts = resolve(root, 'scripts');
      mkdirSync(scripts);
      writeFileSync(
        resolve(scripts, 'auth-bridge-notification-b0-deploy.mjs'),
        `import { writeFileSync } from 'node:fs';
export async function runAuthBridgeNotificationB0Deploy() {
const forbidden = ${JSON.stringify([
  'NODE_OPTIONS',
  'NODE_PATH',
  'NODE_EXTRA_CA_CERTS',
  'NODE_TLS_REJECT_UNAUTHORIZED',
  'NODE_COMPILE_CACHE',
  'NODE_DISABLE_COMPILE_CACHE',
  'HTTP_PROXY',
  'HTTPS_PROXY',
  'ALL_PROXY',
  'http_proxy',
  'https_proxy',
  'all_proxy',
  'WARPKEEP_HOSTILE_UNKNOWN',
  'WARPKEEP_NODE_EXECUTABLE',
  'WARPKEEP_TEST_MARKER',
])};
for (const name of forbidden) {
  if (Object.hasOwn(process.env, name)) process.exit(41);
}
const required = ${JSON.stringify([
  'GITHUB_TOKEN',
  'WARPKEEP_AUTH_BRIDGE_ACCOUNT_ID',
  'WARPKEEP_AUTH_BRIDGE_CLOUDFLARE_API_TOKEN',
  'WARPKEEP_AUTH_BRIDGE_ZONE_ID',
  'WARPKEEP_PRODUCTION_ADMIN_TOKEN',
])};
for (const name of required) {
  if (!Object.hasOwn(process.env, name)) process.exit(42);
}
writeFileSync(${JSON.stringify(marker)}, 'sanitized');
}
`,
      );
      const closureDigest = writeProtectedLaunchClosureFixture(
        root,
        'scripts/auth-bridge-notification-b0-deploy.mjs',
      );
      const trustedNode = realpathSync(process.execPath);
      const trustedNodeDigest = createHash('sha256')
        .update(readFileSync(trustedNode))
        .digest('hex');
      writeFileSync(preload, `printf '%s' "$GITHUB_TOKEN" > "$WARPKEEP_PRELOAD_MARKER"\n`);
      const protectedRun = step(stepId).run ?? '';
      expect(protectedRun).toContain(
        OFFICIAL_NODE_22_22_3_DARWIN_ARM64_SHA256,
      );
      writeFileSync(
        runScript,
        protectedLaunchForTrustedNode(
          protectedRun,
          trustedNode,
          trustedNodeDigest,
        ),
      );
      expect(step(stepId).shell).toBe(
        '/usr/bin/env -u BASH_ENV -u ENV -u SHELLOPTS -u BASHOPTS -u PS4 -u NODE_OPTIONS -u NODE_PATH -u DYLD_INSERT_LIBRARIES -u DYLD_LIBRARY_PATH PATH=/usr/bin:/bin /bin/bash --noprofile --norc -p -e -o pipefail {0}',
      );
      const result = spawnSync('/usr/bin/env', [
        '-u',
        'BASH_ENV',
        '-u',
        'ENV',
        '-u',
        'SHELLOPTS',
        '-u',
        'BASHOPTS',
        '-u',
        'PS4',
        '/bin/bash',
        '--noprofile',
        '--norc',
        '-p',
        '-e',
        '-o',
        'pipefail',
        runScript,
      ], {
        cwd: root,
        encoding: 'utf8',
        env: {
          ALL_PROXY: 'http://ambient.invalid',
          BASH_ENV: preload,
          'BASH_FUNC_printf%%':
            '() { /usr/bin/printenv GITHUB_TOKEN > "$WARPKEEP_FUNCTION_MARKER"; }',
          ENV: preload,
          GITHUB_ACTIONS: 'true',
          GITHUB_EVENT_NAME: 'workflow_dispatch',
          GITHUB_OUTPUT: resolve(root, 'github-output'),
          GITHUB_REF: 'refs/heads/main',
          GITHUB_REPOSITORY: 'ael-dev3/Warpkeep',
          GITHUB_RUN_ATTEMPT: '1',
          GITHUB_RUN_ID: '1001',
          GITHUB_SHA: 'c'.repeat(40),
          GITHUB_TOKEN: 'github-owner-test-token-value',
          GITHUB_WORKFLOW_REF:
            'ael-dev3/Warpkeep/.github/workflows/notification-bridge-b0.yml@refs/heads/main',
          HTTP_PROXY: 'http://ambient.invalid',
          HTTPS_PROXY: 'http://ambient.invalid',
          NODE_EXTRA_CA_CERTS: '/ambient/ca.pem',
          NODE_COMPILE_CACHE: resolve(root, 'ambient-node-compile-cache'),
          NODE_DISABLE_COMPILE_CACHE: '1',
          NODE_OPTIONS: '--require=/ambient/preload.cjs',
          NODE_PATH: '/ambient/node_modules',
          NODE_TLS_REJECT_UNAUTHORIZED: '0',
          PATH: `${bin}:/usr/bin:/bin`,
          PS4: 'TRACE:$GITHUB_TOKEN:',
          SHELLOPTS: 'xtrace',
          WARPKEEP_AUTH_BRIDGE_ACCOUNT_ID: 'a'.repeat(32),
          WARPKEEP_AUTH_BRIDGE_CLOUDFLARE_API_TOKEN:
            'cloudflare-owner-test-token-value',
          WARPKEEP_AUTH_BRIDGE_ZONE_ID: 'b'.repeat(32),
          WARPKEEP_FUNCTION_MARKER: functionMarker,
          WARPKEEP_PRODUCTION_ADMIN_TOKEN:
            'production-admin-test-token-value',
          WARPKEEP_PRELOAD_MARKER: preloadMarker,
          WARPKEEP_PREPARED_SOURCE_CLOSURE_MANIFEST_SHA256:
            TEST_SOURCE_CLOSURE_MANIFEST_SHA256,
          WARPKEEP_PREPARED_SOURCE_CLOSURE_VERIFIER_SHA256: closureDigest,
          WARPKEEP_TEST_MARKER: marker,
          WARPKEEP_HOSTILE_UNKNOWN: 'hostile-ambient-value',
          WARPKEEP_NODE_EXECUTABLE: trustedNode,
          all_proxy: 'http://ambient.invalid',
          http_proxy: 'http://ambient.invalid',
          https_proxy: 'http://ambient.invalid',
        },
      });
      expect(result.signal, stepId).toBeNull();
      expect(result.status, `${stepId}: ${result.stderr}`).toBe(0);
      expect(readFileSync(marker, 'utf8'), stepId).toBe('sanitized');
      expect(() => readFileSync(hostileNodeMarker), stepId).toThrow();
      expect(() => readFileSync(preloadMarker), stepId).toThrow();
      expect(() => readFileSync(functionMarker), stepId).toThrow();
      expect(result.stderr, stepId)
        .not.toContain('github-owner-test-token-value');
    }
  });

  it('rejects a forged selected Node before it can receive credentials', () => {
    for (const stepId of ['deploy', 'recovery']) {
      const root = realpathSync(mkdtempSync(join(
        tmpdir(),
        'warpkeep-b0-forged-protected-node-',
      )));
      temporaryDirectories.push(root);
      const forgedNode = resolve(root, 'node');
      const marker = resolve(root, 'forged-node-ran');
      const runScript = resolve(root, 'run.sh');
      const scripts = resolve(root, 'scripts');
      mkdirSync(scripts);
      writeFileSync(
        resolve(scripts, 'auth-bridge-notification-b0-deploy.mjs'),
        'export async function runAuthBridgeNotificationB0Deploy() {}\n',
      );
      const closureDigest = writeProtectedLaunchClosureFixture(
        root,
        'scripts/auth-bridge-notification-b0-deploy.mjs',
      );
      writeFileSync(forgedNode, `#!/bin/bash -p
/usr/bin/printenv GITHUB_TOKEN > ${JSON.stringify(marker)}
`);
      chmodSync(forgedNode, 0o755);
      writeFileSync(runScript, step(stepId).run ?? '');
      const result = spawnSync('/usr/bin/env', [
        '-u', 'BASH_ENV', '-u', 'ENV', '-u', 'SHELLOPTS', '-u', 'BASHOPTS',
        '-u', 'PS4', '/bin/bash', '--noprofile', '--norc', '-p', '-e', '-o',
        'pipefail', runScript,
      ], {
        cwd: root,
        encoding: 'utf8',
        env: {
          GITHUB_ACTIONS: 'true',
          GITHUB_EVENT_NAME: 'workflow_dispatch',
          GITHUB_OUTPUT: resolve(root, 'github-output'),
          GITHUB_REF: 'refs/heads/main',
          GITHUB_REPOSITORY: 'ael-dev3/Warpkeep',
          GITHUB_RUN_ATTEMPT: '1',
          GITHUB_RUN_ID: '1001',
          GITHUB_SHA: 'c'.repeat(40),
          GITHUB_TOKEN: 'github-b0-forged-node-test-token',
          GITHUB_WORKFLOW_REF:
            'ael-dev3/Warpkeep/.github/workflows/notification-bridge-b0.yml@refs/heads/main',
          PATH: `${root}:/usr/bin:/bin`,
          WARPKEEP_AUTH_BRIDGE_ACCOUNT_ID: 'a'.repeat(32),
          WARPKEEP_AUTH_BRIDGE_CLOUDFLARE_API_TOKEN:
            'cloudflare-b0-forged-node-test-token',
          WARPKEEP_AUTH_BRIDGE_ZONE_ID: 'b'.repeat(32),
          WARPKEEP_NODE_EXECUTABLE: forgedNode,
          WARPKEEP_PREPARED_SOURCE_CLOSURE_MANIFEST_SHA256:
            TEST_SOURCE_CLOSURE_MANIFEST_SHA256,
          WARPKEEP_PREPARED_SOURCE_CLOSURE_VERIFIER_SHA256: closureDigest,
          WARPKEEP_PRODUCTION_ADMIN_TOKEN:
            'production-admin-b0-forged-node-test-token',
        },
      });
      expect(result.signal, stepId).toBeNull();
      expect(result.status, stepId).not.toBe(0);
      expect(() => readFileSync(marker), stepId).toThrow();
      expect(result.stderr, stepId)
        .not.toContain('github-b0-forged-node-test-token');
    }
  });

  it.each(['hard-linked', 'group-writable'] as const)(
    'rejects a %s selected Node even when its digest is pinned',
    nodeState => {
      for (const stepId of ['deploy', 'recovery']) {
        const root = realpathSync(mkdtempSync(join(
          tmpdir(),
          'warpkeep-b0-untrusted-node-state-',
        )));
        temporaryDirectories.push(root);
        const node = resolve(root, 'node');
        const marker = resolve(root, 'untrusted-node-ran');
        const runScript = resolve(root, 'run.sh');
        cpSync(realpathSync(process.execPath), node);
        chmodSync(node, nodeState === 'group-writable' ? 0o575 : 0o555);
        if (nodeState === 'hard-linked') linkSync(node, resolve(root, 'node-alias'));
        const digest = createHash('sha256')
          .update(readFileSync(node))
          .digest('hex');
        writeFileSync(
          runScript,
          protectedLaunchForTrustedNode(
            step(stepId).run ?? '',
            node,
            digest,
          ),
        );
        const secret = 'github-b0-untrusted-node-state-token';
        const result = spawnSync('/usr/bin/env', [
          '-u', 'BASH_ENV', '-u', 'ENV', '-u', 'SHELLOPTS', '-u', 'BASHOPTS',
          '-u', 'PS4', '/bin/bash', '--noprofile', '--norc', '-p', '-e', '-o',
          'pipefail', runScript,
        ], {
          cwd: root,
          encoding: 'utf8',
          env: {
            GITHUB_ACTIONS: 'true',
            GITHUB_EVENT_NAME: 'workflow_dispatch',
            GITHUB_OUTPUT: resolve(root, 'github-output'),
            GITHUB_REF: 'refs/heads/main',
            GITHUB_REPOSITORY: 'ael-dev3/Warpkeep',
            GITHUB_RUN_ATTEMPT: '1',
            GITHUB_RUN_ID: '1001',
            GITHUB_SHA: 'c'.repeat(40),
            GITHUB_TOKEN: secret,
            GITHUB_WORKFLOW_REF:
              'ael-dev3/Warpkeep/.github/workflows/notification-bridge-b0.yml@refs/heads/main',
            WARPKEEP_AUTH_BRIDGE_ACCOUNT_ID: 'a'.repeat(32),
            WARPKEEP_AUTH_BRIDGE_CLOUDFLARE_API_TOKEN:
              'cloudflare-b0-untrusted-node-state-token',
            WARPKEEP_AUTH_BRIDGE_ZONE_ID: 'b'.repeat(32),
            WARPKEEP_NODE_EXECUTABLE: node,
            WARPKEEP_PREPARED_SOURCE_CLOSURE_MANIFEST_SHA256:
              TEST_SOURCE_CLOSURE_MANIFEST_SHA256,
            WARPKEEP_PREPARED_SOURCE_CLOSURE_VERIFIER_SHA256: 'd'.repeat(64),
            WARPKEEP_PRODUCTION_ADMIN_TOKEN:
              'production-admin-b0-untrusted-node-state-token',
          },
        });
        expect(result.signal, `${nodeState}:${stepId}`).toBeNull();
        expect(result.status, `${nodeState}:${stepId}`).not.toBe(0);
        expect(() => readFileSync(marker), `${nodeState}:${stepId}`).toThrow();
        expect(result.stderr, `${nodeState}:${stepId}`).toContain(
          'AUTH_BRIDGE_NOTIFICATION_B0_DEPLOY_NODE_INVALID',
        );
        expect(result.stderr, `${nodeState}:${stepId}`).not.toContain(secret);
      }
    },
  );

  it('rejects a same-UID final-swap target before either B0 Node launch', () => {
    for (const stepId of ['deploy', 'recovery']) {
      const root = realpathSync(mkdtempSync(join(
        tmpdir(),
        'warpkeep-b0-final-swap-node-',
      )));
      temporaryDirectories.push(root);
      const node = resolve(root, 'node');
      const runScript = resolve(root, 'run.sh');
      cpSync(realpathSync(process.execPath), node);
      chmodSync(node, 0o555);
      const digest = createHash('sha256')
        .update(readFileSync(node))
        .digest('hex');
      writeFileSync(
        runScript,
        protectedLaunchForSameUidSwapTarget(
          step(stepId).run ?? '',
          node,
          digest,
        ),
      );
      const secret = 'github-b0-final-swap-target-token';
      const result = spawnSync('/usr/bin/env', [
        '-u', 'BASH_ENV', '-u', 'ENV', '-u', 'SHELLOPTS', '-u', 'BASHOPTS',
        '-u', 'PS4', '/bin/bash', '--noprofile', '--norc', '-p', '-e', '-o',
        'pipefail', runScript,
      ], {
        cwd: root,
        encoding: 'utf8',
        env: {
          GITHUB_ACTIONS: 'true',
          GITHUB_EVENT_NAME: 'workflow_dispatch',
          GITHUB_OUTPUT: resolve(root, 'github-output'),
          GITHUB_REF: 'refs/heads/main',
          GITHUB_REPOSITORY: 'ael-dev3/Warpkeep',
          GITHUB_RUN_ATTEMPT: '1',
          GITHUB_RUN_ID: '1001',
          GITHUB_SHA: 'c'.repeat(40),
          GITHUB_TOKEN: secret,
          GITHUB_WORKFLOW_REF:
            'ael-dev3/Warpkeep/.github/workflows/notification-bridge-b0.yml@refs/heads/main',
          WARPKEEP_AUTH_BRIDGE_ACCOUNT_ID: 'a'.repeat(32),
          WARPKEEP_AUTH_BRIDGE_CLOUDFLARE_API_TOKEN:
            'cloudflare-b0-final-swap-target-token',
          WARPKEEP_AUTH_BRIDGE_ZONE_ID: 'b'.repeat(32),
          WARPKEEP_NODE_EXECUTABLE: node,
          WARPKEEP_PREPARED_SOURCE_CLOSURE_MANIFEST_SHA256: 'a'.repeat(64),
          WARPKEEP_PREPARED_SOURCE_CLOSURE_VERIFIER_SHA256: 'd'.repeat(64),
          WARPKEEP_PRODUCTION_ADMIN_TOKEN:
            'production-admin-b0-final-swap-target-token',
        },
      });
      expect(result.signal, stepId).toBeNull();
      expect(result.status, stepId).not.toBe(0);
      expect(result.stderr, stepId).toContain(
        'AUTH_BRIDGE_NOTIFICATION_B0_DEPLOY_NODE_INVALID',
      );
      expect(result.stderr, stepId).not.toContain(secret);
    }
  });

  it('rejects a byte-mutated B0 entrypoint before either secret launch', () => {
    for (const stepId of ['deploy', 'recovery']) {
      const root = realpathSync(mkdtempSync(join(
        tmpdir(),
        'warpkeep-b0-mutated-entrypoint-',
      )));
      temporaryDirectories.push(root);
      const scripts = resolve(root, 'scripts');
      const marker = resolve(root, 'mutated-entrypoint-ran');
      const runScript = resolve(root, 'run.sh');
      mkdirSync(scripts);
      const entrypoint = resolve(
        scripts,
        'auth-bridge-notification-b0-deploy.mjs',
      );
      writeFileSync(
        entrypoint,
        'export async function runAuthBridgeNotificationB0Deploy() {}\n',
      );
      const closureDigest = writeProtectedLaunchClosureFixture(
        root,
        'scripts/auth-bridge-notification-b0-deploy.mjs',
      );
      writeFileSync(entrypoint, [
        "import { writeFileSync } from 'node:fs';",
        'writeFileSync('
          + JSON.stringify(marker)
          + ", 'mutated');",
        'export async function runAuthBridgeNotificationB0Deploy() {}',
        '',
      ].join('\n'));
      const trustedNode = realpathSync(process.execPath);
      const trustedNodeDigest = createHash('sha256')
        .update(readFileSync(trustedNode))
        .digest('hex');
      writeFileSync(
        runScript,
        protectedLaunchForTrustedNode(
          step(stepId).run ?? '',
          trustedNode,
          trustedNodeDigest,
        ),
      );
      const result = spawnSync('/usr/bin/env', [
        '-u', 'BASH_ENV', '-u', 'ENV', '-u', 'SHELLOPTS', '-u', 'BASHOPTS',
        '-u', 'PS4', '/bin/bash', '--noprofile', '--norc', '-p', '-e', '-o',
        'pipefail', runScript,
      ], {
        cwd: root,
        encoding: 'utf8',
        env: {
          GITHUB_ACTIONS: 'true',
          GITHUB_EVENT_NAME: 'workflow_dispatch',
          GITHUB_OUTPUT: resolve(root, 'github-output'),
          GITHUB_REF: 'refs/heads/main',
          GITHUB_REPOSITORY: 'ael-dev3/Warpkeep',
          GITHUB_RUN_ATTEMPT: '1',
          GITHUB_RUN_ID: '1001',
          GITHUB_SHA: 'c'.repeat(40),
          GITHUB_TOKEN: 'github-b0-mutated-entrypoint-token',
          GITHUB_WORKFLOW_REF:
            'ael-dev3/Warpkeep/.github/workflows/notification-bridge-b0.yml@refs/heads/main',
          WARPKEEP_AUTH_BRIDGE_ACCOUNT_ID: 'a'.repeat(32),
          WARPKEEP_AUTH_BRIDGE_CLOUDFLARE_API_TOKEN:
            'cloudflare-b0-mutated-entrypoint-token',
          WARPKEEP_AUTH_BRIDGE_ZONE_ID: 'b'.repeat(32),
          WARPKEEP_NODE_EXECUTABLE: trustedNode,
          WARPKEEP_PREPARED_SOURCE_CLOSURE_MANIFEST_SHA256:
            TEST_SOURCE_CLOSURE_MANIFEST_SHA256,
          WARPKEEP_PREPARED_SOURCE_CLOSURE_VERIFIER_SHA256: closureDigest,
          WARPKEEP_PRODUCTION_ADMIN_TOKEN:
            'production-admin-b0-mutated-entrypoint-token',
        },
      });
      expect(result.signal, stepId).toBeNull();
      expect(result.status, stepId).not.toBe(0);
      expect(() => readFileSync(marker), stepId).toThrow();
      expect(result.stderr, stepId)
        .not.toContain('github-b0-mutated-entrypoint-token');
    }
  });

  it('rejects a self-consistent refrozen closure before importing B0 code', () => {
    for (const stepId of ['deploy', 'recovery']) {
      const root = realpathSync(mkdtempSync(join(
        tmpdir(),
        'warpkeep-b0-refrozen-closure-',
      )));
      temporaryDirectories.push(root);
      const scripts = resolve(root, 'scripts');
      const marker = resolve(root, 'refrozen-entrypoint-ran');
      const runScript = resolve(root, 'run.sh');
      mkdirSync(scripts);
      writeFileSync(
        resolve(scripts, 'auth-bridge-notification-b0-deploy.mjs'),
        [
          "import { writeFileSync } from 'node:fs';",
          `writeFileSync(${JSON.stringify(marker)}, 'refrozen');`,
          'export async function runAuthBridgeNotificationB0Deploy() {}',
          '',
        ].join('\n'),
      );
      const closureDigest = writeProtectedLaunchClosureFixture(
        root,
        'scripts/auth-bridge-notification-b0-deploy.mjs',
        'b'.repeat(64),
      );
      const trustedNode = realpathSync(process.execPath);
      const trustedNodeDigest = createHash('sha256')
        .update(readFileSync(trustedNode))
        .digest('hex');
      writeFileSync(
        runScript,
        protectedLaunchForTrustedNode(
          step(stepId).run ?? '',
          trustedNode,
          trustedNodeDigest,
        ),
      );
      const result = spawnSync('/usr/bin/env', [
        '-u', 'BASH_ENV', '-u', 'ENV', '-u', 'SHELLOPTS', '-u', 'BASHOPTS',
        '-u', 'PS4', '/bin/bash', '--noprofile', '--norc', '-p', '-e', '-o',
        'pipefail', runScript,
      ], {
        cwd: root,
        encoding: 'utf8',
        env: {
          GITHUB_ACTIONS: 'true',
          GITHUB_EVENT_NAME: 'workflow_dispatch',
          GITHUB_OUTPUT: resolve(root, 'github-output'),
          GITHUB_REF: 'refs/heads/main',
          GITHUB_REPOSITORY: 'ael-dev3/Warpkeep',
          GITHUB_RUN_ATTEMPT: '1',
          GITHUB_RUN_ID: '1001',
          GITHUB_SHA: 'c'.repeat(40),
          GITHUB_TOKEN: 'github-b0-refrozen-token',
          GITHUB_WORKFLOW_REF:
            'ael-dev3/Warpkeep/.github/workflows/notification-bridge-b0.yml@refs/heads/main',
          WARPKEEP_AUTH_BRIDGE_ACCOUNT_ID: 'a'.repeat(32),
          WARPKEEP_AUTH_BRIDGE_CLOUDFLARE_API_TOKEN:
            'cloudflare-b0-refrozen-token',
          WARPKEEP_AUTH_BRIDGE_ZONE_ID: 'b'.repeat(32),
          WARPKEEP_NODE_EXECUTABLE: trustedNode,
          WARPKEEP_PREPARED_SOURCE_CLOSURE_MANIFEST_SHA256:
            TEST_SOURCE_CLOSURE_MANIFEST_SHA256,
          WARPKEEP_PREPARED_SOURCE_CLOSURE_VERIFIER_SHA256: closureDigest,
          WARPKEEP_PRODUCTION_ADMIN_TOKEN:
            'production-admin-b0-refrozen-token',
        },
      });
      expect(result.signal, stepId).toBeNull();
      expect(result.status, stepId).not.toBe(0);
      expect(() => readFileSync(marker), stepId).toThrow();
      expect(result.stderr, stepId).not.toContain('github-b0-refrozen-token');
    }
  });

  it.each([
    ['LF', '\n'],
    ['CR', '\r'],
  ])('rejects a %s-bearing binding before either B0 relay', (_, separator) => {
    for (const stepId of ['deploy', 'recovery']) {
      const root = realpathSync(mkdtempSync(join(
        tmpdir(),
        'warpkeep-b0-malformed-binding-',
      )));
      temporaryDirectories.push(root);
      const scripts = resolve(root, 'scripts');
      const marker = resolve(root, 'entrypoint-ran');
      const runScript = resolve(root, 'run.sh');
      mkdirSync(scripts);
      writeFileSync(
        resolve(scripts, 'auth-bridge-notification-b0-deploy.mjs'),
        [
          "import { writeFileSync } from 'node:fs';",
          'export async function runAuthBridgeNotificationB0Deploy() {',
          '  writeFileSync(' + JSON.stringify(marker) + ", 'ran');",
          '}',
          '',
        ].join('\n'),
      );
      const closureDigest = writeProtectedLaunchClosureFixture(
        root,
        'scripts/auth-bridge-notification-b0-deploy.mjs',
      );
      const trustedNode = realpathSync(process.execPath);
      const trustedNodeDigest = createHash('sha256')
        .update(readFileSync(trustedNode))
        .digest('hex');
      writeFileSync(
        runScript,
        protectedLaunchForTrustedNode(
          step(stepId).run ?? '',
          trustedNode,
          trustedNodeDigest,
        ),
      );
      const sharedCredential = 'shared-owner-credential-value';
      const result = spawnSync('/usr/bin/env', [
        '-u', 'BASH_ENV', '-u', 'ENV', '-u', 'SHELLOPTS', '-u', 'BASHOPTS',
        '-u', 'PS4', '/bin/bash', '--noprofile', '--norc', '-p', '-e', '-o',
        'pipefail', runScript,
      ], {
        cwd: root,
        encoding: 'utf8',
        env: {
          GITHUB_ACTIONS: 'true',
          GITHUB_EVENT_NAME: 'workflow_dispatch',
          GITHUB_OUTPUT: resolve(root, 'github-output'),
          GITHUB_REF: 'refs/heads/main',
          GITHUB_REPOSITORY: 'ael-dev3/Warpkeep',
          GITHUB_RUN_ATTEMPT: '1',
          GITHUB_RUN_ID: '1001',
          GITHUB_SHA: 'c'.repeat(40),
          GITHUB_TOKEN:
            sharedCredential + separator + 'malformed-tail',
          GITHUB_WORKFLOW_REF:
            'ael-dev3/Warpkeep/.github/workflows/notification-bridge-b0.yml@refs/heads/main',
          WARPKEEP_AUTH_BRIDGE_ACCOUNT_ID: 'a'.repeat(32),
          WARPKEEP_AUTH_BRIDGE_CLOUDFLARE_API_TOKEN: sharedCredential,
          WARPKEEP_AUTH_BRIDGE_ZONE_ID: 'b'.repeat(32),
          WARPKEEP_NODE_EXECUTABLE: trustedNode,
          WARPKEEP_PREPARED_SOURCE_CLOSURE_MANIFEST_SHA256:
            TEST_SOURCE_CLOSURE_MANIFEST_SHA256,
          WARPKEEP_PREPARED_SOURCE_CLOSURE_VERIFIER_SHA256: closureDigest,
          WARPKEEP_PRODUCTION_ADMIN_TOKEN:
            'production-admin-b0-malformed-binding-token',
        },
      });
      expect(result.signal, stepId).toBeNull();
      expect(result.status, stepId).not.toBe(0);
      expect(() => readFileSync(marker), stepId).toThrow();
      expect(result.stderr, stepId).not.toContain(sharedCredential);
    }
  });

  it('rechecks B0 credential separation after protected child reads', () => {
    for (const stepId of ['deploy', 'recovery']) {
      const root = realpathSync(mkdtempSync(join(
        tmpdir(),
        'warpkeep-b0-child-credential-separation-',
      )));
      temporaryDirectories.push(root);
      const scripts = resolve(root, 'scripts');
      const marker = resolve(root, 'entrypoint-ran');
      const runScript = resolve(root, 'run.sh');
      mkdirSync(scripts);
      writeFileSync(
        resolve(scripts, 'auth-bridge-notification-b0-deploy.mjs'),
        [
          "import { writeFileSync } from 'node:fs';",
          'export async function runAuthBridgeNotificationB0Deploy() {',
          '  writeFileSync(' + JSON.stringify(marker) + ", 'ran');",
          '}',
          '',
        ].join('\n'),
      );
      const closureDigest = writeProtectedLaunchClosureFixture(
        root,
        'scripts/auth-bridge-notification-b0-deploy.mjs',
      );
      const trustedNode = realpathSync(process.execPath);
      const trustedNodeDigest = createHash('sha256')
        .update(readFileSync(trustedNode))
        .digest('hex');
      const launch = step(stepId).run ?? '';
      const guardStart = launch.indexOf('if [[ -z "$GITHUB_TOKEN" \\');
      const guardEnd = launch.indexOf('\nfi\n', guardStart) + '\nfi\n'.length;
      expect(guardStart, stepId).toBeGreaterThan(0);
      expect(guardEnd, stepId).toBeGreaterThan(guardStart);
      const withoutOuterCredentialGuard =
        launch.slice(0, guardStart) + launch.slice(guardEnd);
      writeFileSync(
        runScript,
        protectedLaunchForTrustedNode(
          withoutOuterCredentialGuard,
          trustedNode,
          trustedNodeDigest,
        ),
      );
      const sharedCredential = 'shared-b0-child-credential-value';
      const result = spawnSync('/usr/bin/env', [
        '-u', 'BASH_ENV', '-u', 'ENV', '-u', 'SHELLOPTS', '-u', 'BASHOPTS',
        '-u', 'PS4', '/bin/bash', '--noprofile', '--norc', '-p', '-e', '-o',
        'pipefail', runScript,
      ], {
        cwd: root,
        encoding: 'utf8',
        env: {
          GITHUB_ACTIONS: 'true',
          GITHUB_EVENT_NAME: 'workflow_dispatch',
          GITHUB_OUTPUT: resolve(root, 'github-output'),
          GITHUB_REF: 'refs/heads/main',
          GITHUB_REPOSITORY: 'ael-dev3/Warpkeep',
          GITHUB_RUN_ATTEMPT: '1',
          GITHUB_RUN_ID: '1001',
          GITHUB_SHA: 'c'.repeat(40),
          GITHUB_TOKEN: sharedCredential,
          GITHUB_WORKFLOW_REF:
            'ael-dev3/Warpkeep/.github/workflows/notification-bridge-b0.yml@refs/heads/main',
          WARPKEEP_AUTH_BRIDGE_ACCOUNT_ID: 'a'.repeat(32),
          WARPKEEP_AUTH_BRIDGE_CLOUDFLARE_API_TOKEN: sharedCredential,
          WARPKEEP_AUTH_BRIDGE_ZONE_ID: 'b'.repeat(32),
          WARPKEEP_NODE_EXECUTABLE: trustedNode,
          WARPKEEP_PREPARED_SOURCE_CLOSURE_MANIFEST_SHA256:
            TEST_SOURCE_CLOSURE_MANIFEST_SHA256,
          WARPKEEP_PREPARED_SOURCE_CLOSURE_VERIFIER_SHA256: closureDigest,
          WARPKEEP_PRODUCTION_ADMIN_TOKEN:
            'production-admin-b0-child-separation-token',
        },
      });
      expect(result.signal, stepId).toBeNull();
      expect(result.status, stepId).not.toBe(0);
      expect(() => readFileSync(marker), stepId).toThrow();
      expect(result.stderr, stepId).not.toContain(sharedCredential);
    }
  });

  it('keeps all downstream activation gates inert and executes only the B0 entrypoint', () => {
    expect(workflowSource).toContain(
      "WARPKEEP_BRIDGE_NOTIFICATION_DELIVERY_ENABLED: 'true'",
    );
    expect(workflowSource).toContain(
      "WARPKEEP_HERMES_EXECUTION_APPROVED: 'false'",
    );
    expect(workflowSource).toContain(
      "WARPKEEP_PAGES_PRESENTATION_ENABLED: 'false'",
    );
    expect(workflowSource).toContain(
      'WARPKEEP_ADMISSION_NOTIFICATIONS_ENABLED: '
        + '${{ vars.WARPKEEP_ADMISSION_NOTIFICATIONS_ENABLED }}',
    );
    expect(workflowSource).toContain(
      'pages_value="${WARPKEEP_ADMISSION_NOTIFICATIONS_ENABLED:-false}"',
    );
    expect(workflowSource).toContain(
      'if [[ "$pages_value" != \'false\' ]]; then',
    );
    expect(workflowSource).not.toContain('actions/variables');
    expect(workflowSource).not.toContain('0.3.44');
    expect(workflowSource).not.toContain('0.4.');
    expect(workflowSource).not.toContain('deploy-pages');
    expect(workflowSource).not.toContain('spacetime publish');
    expect(workflowSource).not.toContain('production-player-canary');
    expect(workflowSource).toContain(
      'staticPolicy.verifyAuthBridgeNotificationB0StaticPolicy({',
    );
    expect(workflowSource).not.toContain(
      'node scripts/verify-auth-bridge-notification-b0-policy.mjs',
    );
    for (const stepId of ['deploy', 'recovery']) {
      expect((step(stepId).run ?? '').match(
        /^exec -c "\$node_executable" --input-type=module <&17 >\/dev\/null$/gmu,
      )).toHaveLength(1);
    }
    expect(workflowSource).not.toContain(
      'node scripts/auth-bridge-notification-b0-deploy.mjs >/dev/null',
    );
  });

  it('rejects both stale and active release identities in the B0 workflow', () => {
    expect(() => policyTestSeams.assertInertReleaseIdentity(
      workflowSource,
      { version: '0.3.43' },
    )).not.toThrow();
    for (const forbiddenVersion of ['0.3.44', '0.4.0', '0.4.1']) {
      expect(() => policyTestSeams.assertInertReleaseIdentity(
        `${workflowSource}\n# ${forbiddenVersion}\n`,
        { version: '0.3.43' },
      )).toThrow('AUTH_BRIDGE_NOTIFICATION_B0_UNREVIEWED_CAPABILITY');
    }
    expect(() => policyTestSeams.assertInertReleaseIdentity(
      workflowSource,
      { version: '0.4.0' },
    )).toThrow('AUTH_BRIDGE_NOTIFICATION_B0_UNREVIEWED_CAPABILITY');
  });

  it('always attempts one recovery pass after a failed guarded invocation', () => {
    expect(workflowSource).toContain('continue-on-error: true');
    expect(workflowSource).toContain(
      "steps.deploy.outputs.attempted == 'true' && steps.deploy.outcome != 'success'",
    );
    expect(workflowSource).toContain(
      'AUTH_BRIDGE_NOTIFICATION_B0_DEPLOY_OR_RECOVERY_UNVERIFIED',
    );
  });

  it('rejects both missing and surplus predecessor reattestation boundaries', () => {
    const missingBoundary = runtimeSource.replace(predecessorReattestation, '');
    const surplusBoundary = runtimeSource.replace(
      predecessorReattestation,
      `${predecessorReattestation}${predecessorReattestation}`,
    );

    expect(() => policyTestSeams.assertExactPredecessorReattestationCount(
      runtimeSource,
    )).not.toThrow();
    expect(() => policyTestSeams.assertExactPredecessorReattestationCount(
      missingBoundary,
    )).toThrow('AUTH_BRIDGE_NOTIFICATION_B0_RUNTIME_BOUNDARY_INVALID');
    expect(() => policyTestSeams.assertExactPredecessorReattestationCount(
      surplusBoundary,
    )).toThrow('AUTH_BRIDGE_NOTIFICATION_B0_RUNTIME_BOUNDARY_INVALID');
  });
});
