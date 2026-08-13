import { spawnSync } from 'node:child_process';
import { lstatSync, realpathSync } from 'node:fs';
import { isAbsolute, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  attestHermesSourceParserResolver,
  attestInstalledRootDependencyClosure,
  installHermesSourceParserResolver,
} from './greater-realm-production-bootstrap.mjs';

export const GREATER_REALM_RELEASE_GATE_DEPLOY_BOUNDARY_PROFILE =
  'warpkeep-greater-realm-release-gate-deploy-boundary-v1';

const COMMIT = /^[0-9a-f]{40}$/u;
const REPOSITORY_ROOT = realpathSync(resolve(import.meta.dirname, '..'));
const ROOT_DEPENDENCIES_IGNORED = Object.freeze(['node_modules']);
const RESOLVER_IGNORED = Object.freeze([
  'node_modules',
  'services/auth-bridge/node_modules/',
]);

export class GreaterRealmReleaseGateDeployBoundaryError extends Error {
  constructor(code, cause) {
    super(code, cause === undefined ? undefined : { cause });
    this.name = 'GreaterRealmReleaseGateDeployBoundaryError';
    this.code = code;
  }
}

function fail(code, cause) {
  throw new GreaterRealmReleaseGateDeployBoundaryError(code, cause);
}

function canonicalRepository(repositoryRoot) {
  try {
    if (
      typeof repositoryRoot !== 'string'
      || !isAbsolute(repositoryRoot)
      || resolve(repositoryRoot) !== repositoryRoot
      || realpathSync(repositoryRoot) !== repositoryRoot
    ) fail('GREATER_REALM_RELEASE_GATE_DEPLOY_BOUNDARY_REPOSITORY_INVALID');
    const status = lstatSync(repositoryRoot);
    if (!status.isDirectory() || status.isSymbolicLink()) {
      fail('GREATER_REALM_RELEASE_GATE_DEPLOY_BOUNDARY_REPOSITORY_INVALID');
    }
    return repositoryRoot;
  } catch (error) {
    if (error instanceof GreaterRealmReleaseGateDeployBoundaryError) throw error;
    return fail(
      'GREATER_REALM_RELEASE_GATE_DEPLOY_BOUNDARY_REPOSITORY_INVALID',
      error,
    );
  }
}

function exactGitSource(
  repositoryRoot,
  expectedCommit,
  allowedIgnoredPaths,
  spawn = spawnSync,
) {
  if (
    !COMMIT.test(expectedCommit ?? '')
    || !Array.isArray(allowedIgnoredPaths)
    || allowedIgnoredPaths.length < 1
    || allowedIgnoredPaths.some(path => (
      typeof path !== 'string'
      || !/^(?:[a-z0-9._-]+\/)*[a-z0-9._-]+\/?$/u.test(path)
    ))
  ) {
    fail('GREATER_REALM_RELEASE_GATE_DEPLOY_BOUNDARY_SOURCE_INVALID');
  }
  const options = {
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
    maxBuffer: 256 * 1_024,
  };
  const head = spawn(
    '/usr/bin/git',
    ['--no-optional-locks', 'rev-parse', '--verify', 'HEAD^{commit}'],
    options,
  );
  const status = spawn(
    '/usr/bin/git',
    [
      '--no-optional-locks',
      '-c',
      'core.fsmonitor=false',
      '-c',
      'core.untrackedCache=false',
      'status',
      '--porcelain=v1',
      '--untracked-files=all',
    ],
    options,
  );
  const ordinary = spawn(
    '/usr/bin/git',
    ['--no-optional-locks', 'ls-files', '--others', '--exclude-standard', '-z'],
    options,
  );
  const ignored = spawn(
    '/usr/bin/git',
    [
      '--no-optional-locks',
      'ls-files',
      '--others',
      '--ignored',
      '--exclude-standard',
      '--directory',
      '-z',
    ],
    options,
  );
  const canonicalIgnoredEntry = path => path.endsWith('/')
    ? path.slice(0, -1)
    : path;
  const ignoredEntries = ignored.stdout.split('\0').filter(Boolean);
  const canonicalIgnoredEntries = ignoredEntries
    .map(canonicalIgnoredEntry)
    .toSorted();
  const expectedIgnoredEntries = allowedIgnoredPaths
    .map(canonicalIgnoredEntry)
    .toSorted();
  if (
    head.status !== 0
    || head.stdout.trim() !== expectedCommit
    || status.status !== 0
    || status.stdout !== ''
    || ordinary.status !== 0
    || ordinary.stdout !== ''
    || ignored.status !== 0
    || ignoredEntries.some(path => (
      !/^(?:[a-z0-9._-]+\/)*[a-z0-9._-]+\/?$/u.test(path)
    ))
    || new Set(canonicalIgnoredEntries).size !== canonicalIgnoredEntries.length
    || canonicalIgnoredEntries.length !== expectedIgnoredEntries.length
    || canonicalIgnoredEntries.some(
      (path, index) => path !== expectedIgnoredEntries[index],
    )
  ) fail('GREATER_REALM_RELEASE_GATE_DEPLOY_BOUNDARY_SOURCE_INVALID');
}

function sameDependencyIdentity(left, right) {
  if (JSON.stringify(left) !== JSON.stringify(right)) {
    fail('GREATER_REALM_RELEASE_GATE_DEPLOY_BOUNDARY_NPM_CLOSURE_CHANGED');
  }
}

async function importReleaseGate() {
  return import('./verify-greater-realm-release-gates.mjs');
}

async function runWithPostflight(operator, postflight) {
  let result;
  let operatorError;
  try {
    result = await operator();
  } catch (error) {
    operatorError = error;
  }
  let postflightError;
  try {
    await postflight();
  } catch (error) {
    postflightError = error;
  }
  if (operatorError !== undefined && postflightError !== undefined) {
    throw new AggregateError(
      [operatorError, postflightError],
      'GREATER_REALM_RELEASE_GATE_DEPLOY_BOUNDARY_OPERATOR_AND_POSTFLIGHT_FAILED',
    );
  }
  if (postflightError !== undefined) throw postflightError;
  if (operatorError !== undefined) throw operatorError;
  return result;
}

async function runBoundary(
  {
    repositoryRoot = REPOSITORY_ROOT,
    expectedCommit,
  } = {},
  {
    spawn = spawnSync,
    installResolver = installHermesSourceParserResolver,
    attestResolver = attestHermesSourceParserResolver,
    attestRootDependencies = attestInstalledRootDependencyClosure,
    loadReleaseGate = importReleaseGate,
  } = {},
) {
  const repository = canonicalRepository(repositoryRoot);
  if (
    !COMMIT.test(expectedCommit ?? '')
    || typeof spawn !== 'function'
    || typeof installResolver !== 'function'
    || typeof attestResolver !== 'function'
    || typeof attestRootDependencies !== 'function'
    || typeof loadReleaseGate !== 'function'
  ) fail('GREATER_REALM_RELEASE_GATE_DEPLOY_BOUNDARY_INPUT_INVALID');
  exactGitSource(
    repository,
    expectedCommit,
    ROOT_DEPENDENCIES_IGNORED,
    spawn,
  );
  const nativePackageName =
    `@typescript/typescript-${process.platform}-${process.arch}`;
  const dependencyIdentity = attestRootDependencies(
    repository,
    process.platform,
    process.arch,
  );
  const identity = installResolver(repository, nativePackageName);
  attestResolver(repository, identity);
  exactGitSource(repository, expectedCommit, RESOLVER_IGNORED, spawn);
  const phase = await runWithPostflight(async () => {
    const gate = await loadReleaseGate();
    if (typeof gate?.verifyGreaterRealmReleaseGateState !== 'function') {
      fail('GREATER_REALM_RELEASE_GATE_DEPLOY_BOUNDARY_VERIFIER_INVALID');
    }
    return gate.verifyGreaterRealmReleaseGateState();
  }, () => {
    attestResolver(repository, identity);
    sameDependencyIdentity(
      dependencyIdentity,
      attestRootDependencies(repository, process.platform, process.arch),
    );
    exactGitSource(repository, expectedCommit, RESOLVER_IGNORED, spawn);
  });
  if (typeof phase !== 'string' || phase.length < 1 || phase.length > 512) {
    fail('GREATER_REALM_RELEASE_GATE_DEPLOY_BOUNDARY_VERIFIER_INVALID');
  }
  return Object.freeze({
    schemaVersion: 1,
    profile: GREATER_REALM_RELEASE_GATE_DEPLOY_BOUNDARY_PROFILE,
    expectedCommit,
    phase,
    nativePackageName,
  });
}

export async function runGreaterRealmReleaseGateDeployBoundary(options = {}) {
  return runBoundary(options);
}

export const greaterRealmReleaseGateDeployBoundaryTestSeams = Object.freeze({
  exactGitSource,
  runBoundary,
  runWithPostflight,
});

async function main() {
  if (
    process.argv.length !== 2
    || realpathSync(process.cwd()) !== REPOSITORY_ROOT
    || !COMMIT.test(process.env.WARPKEEP_VERIFIED_SHA ?? '')
  ) fail('GREATER_REALM_RELEASE_GATE_DEPLOY_BOUNDARY_INVOCATION_INVALID');
  const result = await runGreaterRealmReleaseGateDeployBoundary({
    expectedCommit: process.env.WARPKEEP_VERIFIED_SHA,
  });
  process.stdout.write(
    `Greater Realm deployment-boundary release authority verified: ${result.phase}\n`,
  );
}

if (
  process.argv[1]
  && resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  main().catch(error => {
    const code = error instanceof GreaterRealmReleaseGateDeployBoundaryError
      ? error.code
      : error instanceof AggregateError
        ? error.message
        : 'GREATER_REALM_RELEASE_GATE_DEPLOY_BOUNDARY_FAILED';
    process.stderr.write(`${code}\n`);
    process.exitCode = 1;
  });
}
