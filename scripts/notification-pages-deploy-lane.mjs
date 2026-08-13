import { spawnSync } from 'node:child_process';
import {
  fstatSync,
  lstatSync,
  readFileSync,
  realpathSync,
  writeSync,
} from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

export const NOTIFICATION_PAGES_DEPLOY_LANE_PROFILE =
  'warpkeep-notification-pages-deploy-lane-v1';

const REPOSITORY_ROOT = realpathSync(resolve(import.meta.dirname, '..'));
const SHA256 = /^[0-9a-f]{64}$/u;
const COMMIT = /^[0-9a-f]{40}$/u;
const FOUNDER_COUNT = /^(?:[1-9]|[1-9][0-9]|[1-5][0-9]{2}|600)$/u;
const MAX_BINDING_SOURCE_BYTES = 64 * 1_024;

export class NotificationPagesDeployLaneError extends Error {
  constructor(code) {
    super(code);
    this.name = 'NotificationPagesDeployLaneError';
    this.code = code;
  }
}

function fail(code) {
  throw new NotificationPagesDeployLaneError(code);
}

function git(arguments_, repositoryRoot = REPOSITORY_ROOT) {
  return spawnSync('/usr/bin/git', ['--no-optional-locks', ...arguments_], {
    cwd: repositoryRoot,
    encoding: 'utf8',
    env: {
      GIT_CONFIG_GLOBAL: '/dev/null',
      GIT_CONFIG_NOSYSTEM: '1',
      GIT_CONFIG_SYSTEM: '/dev/null',
      GIT_NO_REPLACE_OBJECTS: '1',
      HOME: '/nonexistent',
      PATH: '/usr/bin:/bin',
    },
    stdio: ['ignore', 'pipe', 'ignore'],
    timeout: 10_000,
    maxBuffer: 128 * 1_024,
  });
}

function assertExactCleanSource(repositoryRoot, candidatePagesSourceCommit) {
  if (
    typeof repositoryRoot !== 'string'
    || resolve(repositoryRoot) !== repositoryRoot
    || realpathSync(repositoryRoot) !== repositoryRoot
    || !COMMIT.test(candidatePagesSourceCommit ?? '')
  ) fail('NOTIFICATION_PAGES_DEPLOY_LANE_CHECKOUT_INVALID');
  const head = git(['rev-parse', '--verify', 'HEAD^{commit}'], repositoryRoot);
  const status = git(
    ['status', '--porcelain=v1', '--untracked-files=all'],
    repositoryRoot,
  );
  if (
    head.status !== 0
    || head.stdout.trim() !== candidatePagesSourceCommit
    || status.status !== 0
    || status.stdout !== ''
  ) fail('NOTIFICATION_PAGES_DEPLOY_LANE_CHECKOUT_INVALID');
}

function escapeRegularExpression(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
}

function skipLeadingTrivia(source, code) {
  let offset = 0;
  while (offset < source.length) {
    const whitespace = /^[\t\n\r ]+/u.exec(source.slice(offset));
    if (whitespace) {
      offset += whitespace[0].length;
      continue;
    }
    if (source.startsWith('//', offset)) {
      const newline = source.indexOf('\n', offset + 2);
      offset = newline === -1 ? source.length : newline + 1;
      continue;
    }
    if (source.startsWith('/*', offset)) {
      const end = source.indexOf('*/', offset + 2);
      if (end === -1) fail(code);
      offset = end + 2;
      continue;
    }
    break;
  }
  return offset;
}

function exactHeadBindingSource(repositoryRoot, relativePath, code) {
  const absolutePath = resolve(repositoryRoot, relativePath);
  let source;
  let status;
  try {
    status = lstatSync(absolutePath);
    source = readFileSync(absolutePath, 'utf8');
  } catch {
    fail(code);
  }
  const head = git(['show', `HEAD:${relativePath}`], repositoryRoot);
  if (
    !status.isFile()
    || status.isSymbolicLink()
    || status.nlink !== 1
    || Buffer.byteLength(source) > MAX_BINDING_SOURCE_BYTES
    || head.status !== 0
    || head.stdout !== source
  ) fail(code);
  return source;
}

/**
 * Parse the first executable statement using an exact canonical grammar.
 * Leading comments are skipped deliberately; declarations hidden in comments,
 * strings, templates, or regular expressions can therefore never classify a
 * privileged lane. Candidate modules are read as inert bytes, never imported.
 */
function exactBindingDeclaration(source, variableName, fields, code) {
  const start = skipLeadingTrivia(source, code);
  const valuePatterns = fields.map(([, type]) => {
    if (type === 'digest') return `(null|'([0-9a-f]{64})')`;
    if (type === 'commit') return `(null|'([0-9a-f]{40})')`;
    if (type === 'count') return '(null|([1-9][0-9]{0,2}))';
    fail(code);
  });
  const properties = fields.map(([field], index) => (
    `  ${escapeRegularExpression(field)}: ${valuePatterns[index]},`
  )).join('\\n');
  const expression = new RegExp(
    `^export const ${escapeRegularExpression(variableName)}`
      + ` = Object\\.freeze\\(\\{\\n${properties}\\n\\}\\);`,
    'u',
  );
  const match = expression.exec(source.slice(start));
  if (match === null) fail(code);
  const values = [];
  let capture = 1;
  for (const [, type] of fields) {
    const whole = match[capture];
    const populated = match[capture + 1];
    capture += 2;
    if (whole === 'null') values.push(null);
    else if (type === 'count') {
      if (!FOUNDER_COUNT.test(populated)) fail(code);
      values.push(Number(populated));
    } else {
      const pattern = type === 'digest' ? SHA256 : COMMIT;
      if (!pattern.test(populated)) fail(code);
      values.push(populated);
    }
  }
  const allNull = values.every(value => value === null);
  const allPopulated = values.every(value => value !== null);
  if (!allNull && !allPopulated) fail(code);
  return Object.freeze(Object.fromEntries(
    fields.map(([field], index) => [field, values[index]]),
  ));
}

function exactBindings(repositoryRoot) {
  const prepared = exactBindingDeclaration(
    exactHeadBindingSource(
      repositoryRoot,
      'scripts/auth-bridge-notification-prepared-release-binding.mjs',
      'NOTIFICATION_PAGES_DEPLOY_LANE_PREPARED_BINDING_INVALID',
    ),
    'AUTH_BRIDGE_NOTIFICATION_PREPARED_RELEASE_BINDING',
    [
      ['notificationPreparedReceiptDigest', 'digest'],
      ['notificationPreparedBridgeSourceCommit', 'commit'],
    ],
    'NOTIFICATION_PAGES_DEPLOY_LANE_PREPARED_BINDING_INVALID',
  );
  const privateBinding = exactBindingDeclaration(
    exactHeadBindingSource(
      repositoryRoot,
      'scripts/notification-pages-private-release-binding.mjs',
      'NOTIFICATION_PAGES_DEPLOY_LANE_PRIVATE_BINDING_INVALID',
    ),
    'NOTIFICATION_PAGES_PRIVATE_RELEASE_BINDING',
    [
      ['notificationPagesActiveV17EvidenceDigest', 'digest'],
      ['notificationPagesDeployedModuleReceiptDigest', 'digest'],
      ['notificationPagesExpectedFounderCount', 'count'],
    ],
    'NOTIFICATION_PAGES_DEPLOY_LANE_PRIVATE_BINDING_INVALID',
  );
  const rootBinding = exactBindingDeclaration(
    exactHeadBindingSource(
      repositoryRoot,
      'scripts/notification-pages-live-release-binding.mjs',
      'NOTIFICATION_PAGES_DEPLOY_LANE_ROOT_BINDING_INVALID',
    ),
    'NOTIFICATION_PAGES_LIVE_RELEASE_BINDING',
    [
      ['notificationPagesLiveRootReceiptDigest', 'digest'],
      ['notificationPagesLiveRootPagesSourceCommit', 'commit'],
    ],
    'NOTIFICATION_PAGES_DEPLOY_LANE_ROOT_BINDING_INVALID',
  );
  return Object.freeze({
    preparedReceiptDigest: prepared.notificationPreparedReceiptDigest,
    bridgeSourceCommit: prepared.notificationPreparedBridgeSourceCommit,
    activeV17EvidenceDigest:
      privateBinding.notificationPagesActiveV17EvidenceDigest,
    deployedModuleReceiptDigest:
      privateBinding.notificationPagesDeployedModuleReceiptDigest,
    expectedFounderCount:
      privateBinding.notificationPagesExpectedFounderCount,
    chainRootReceiptDigest:
      rootBinding.notificationPagesLiveRootReceiptDigest,
    chainRootPagesSourceCommit:
      rootBinding.notificationPagesLiveRootPagesSourceCommit,
  });
}

/** Builtins-only exact source classifier used before dependency installation. */
export function classifyNotificationPagesDeployLane({
  repositoryRoot = REPOSITORY_ROOT,
  candidatePagesSourceCommit,
} = {}) {
  assertExactCleanSource(repositoryRoot, candidatePagesSourceCommit);
  const parsed = exactBindings(repositoryRoot);
  const hasPrepared = parsed.preparedReceiptDigest !== null
    || parsed.bridgeSourceCommit !== null;
  const hasPrivate = parsed.activeV17EvidenceDigest !== null
    || parsed.deployedModuleReceiptDigest !== null
    || parsed.expectedFounderCount !== null;
  const hasRoot = parsed.chainRootReceiptDigest !== null
    || parsed.chainRootPagesSourceCommit !== null;
  if (
    (hasPrepared && (
      parsed.preparedReceiptDigest === null
      || parsed.bridgeSourceCommit === null
    ))
    || (hasPrivate && (
      parsed.activeV17EvidenceDigest === null
      || parsed.deployedModuleReceiptDigest === null
      || parsed.expectedFounderCount === null
    ))
    || (hasRoot && (
      parsed.chainRootReceiptDigest === null
      || parsed.chainRootPagesSourceCommit === null
    ))
  ) fail('NOTIFICATION_PAGES_DEPLOY_LANE_BINDING_PARTIAL');
  let mode;
  if (
    !hasPrepared
    && !hasPrivate
    && !hasRoot
  ) mode = 'closed-review';
  else if (
    hasPrepared
    && hasPrivate
    && !hasRoot
  ) mode = 'gen0';
  else if (
    !hasPrepared
    && !hasPrivate
    && hasRoot
  ) mode = 'durable';
  else fail('NOTIFICATION_PAGES_DEPLOY_LANE_SOURCE_STATE_INVALID');
  return Object.freeze({
    schemaVersion: 1,
    profile: NOTIFICATION_PAGES_DEPLOY_LANE_PROFILE,
    repository: 'ael-dev3/Warpkeep',
    workflow: '.github/workflows/deploy-pages.yml',
    mode,
    candidatePagesSourceCommit,
    ...parsed,
  });
}

function main(arguments_, environment) {
  if (arguments_.length !== 0) fail('NOTIFICATION_PAGES_DEPLOY_LANE_ARGUMENT_INVALID');
  if (
    environment.GITHUB_ACTIONS !== 'true'
    || environment.CI !== 'true'
    || environment.GITHUB_REPOSITORY !== 'ael-dev3/Warpkeep'
    || environment.GITHUB_EVENT_NAME !== 'workflow_run'
    || environment.GITHUB_WORKFLOW_REF
      !== 'ael-dev3/Warpkeep/.github/workflows/deploy-pages.yml@refs/heads/main'
    || typeof environment.WARPKEEP_PAGES_SOURCE_COMMIT !== 'string'
    || typeof environment.GITHUB_OUTPUT !== 'string'
  ) fail('NOTIFICATION_PAGES_DEPLOY_LANE_ENVIRONMENT_INVALID');
  const result = classifyNotificationPagesDeployLane({
    candidatePagesSourceCommit: environment.WARPKEEP_PAGES_SOURCE_COMMIT,
  });
  const descriptor = Number(environment.GITHUB_OUTPUT_FD);
  if (!Number.isSafeInteger(descriptor) || descriptor < 3) {
    fail('NOTIFICATION_PAGES_DEPLOY_LANE_OUTPUT_INVALID');
  }
  const stat = fstatSync(descriptor);
  if (!stat.isFile() || stat.nlink !== 1 || (stat.mode & 0o022) !== 0) {
    fail('NOTIFICATION_PAGES_DEPLOY_LANE_OUTPUT_INVALID');
  }
  writeSync(descriptor, `deployment-lane=${result.mode}\n`, null, 'utf8');
}

if (
  process.argv[1]
  && import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  try { main(process.argv.slice(2), process.env); } catch (error) {
    process.stderr.write(`${
      error instanceof NotificationPagesDeployLaneError
        ? error.code
        : 'NOTIFICATION_PAGES_DEPLOY_LANE_FAILED'
    }\n`);
    process.exitCode = 1;
  }
}
