import { execFile } from 'node:child_process';
import { lstatSync, readFileSync, realpathSync } from 'node:fs';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { promisify } from 'node:util';

import {
  authBridgeNotificationPreparedVersionContract,
  executeAuthBridgeNotificationPreparedDeployAdapter,
  prepareAndWriteAuthBridgeNotificationPreparedReceipt,
} from './auth-bridge-notification-prepared-deploy-adapter.mjs';
import {
  buildAuthBridgeNotificationPreparedWranglerMultipart,
  createAuthBridgeNotificationPreparedCloudflareRuntime,
} from './auth-bridge-notification-prepared-cloudflare-runtime.mjs';
import {
  withAuthBridgeNotificationPreparedDeployJournal,
} from './auth-bridge-notification-prepared-deploy-journal.mjs';

const execFileAsync = promisify(execFile);
const REPOSITORY = 'ael-dev3/Warpkeep';
const WORKFLOW_PATH = '.github/workflows/notification-bridge-prepared.yml';
const WORKFLOW_REF = `${REPOSITORY}/${WORKFLOW_PATH}@refs/heads/main`;
const GITHUB_ORIGIN = 'https://api.github.com';
const SOURCE_COMMIT = /^[a-f0-9]{40}$/u;
const ACCOUNT_ID = /^[a-f0-9]{32}$/u;
const RUN_ID = /^[1-9][0-9]{0,19}$/u;
const SECRET = /^\S{20,4096}$/u;
const MAX_GITHUB_RESPONSE_BYTES = 512 * 1024;
const REQUIRED_ENVIRONMENT = Object.freeze([
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
const FORBIDDEN_ENVIRONMENT = Object.freeze([
  'CLOUDFLARE_API_BASE_URL',
  'CLOUDFLARE_API_KEY',
  'CLOUDFLARE_EMAIL',
  'CLOUDFLARE_API_TOKEN',
  'WRANGLER_API_ENVIRONMENT',
  'WRANGLER_AUTH_DOMAIN',
  'WRANGLER_PROFILE',
  'WRANGLER_SEND_METRICS',
  'NODE_OPTIONS',
  'NODE_EXTRA_CA_CERTS',
  'NODE_TLS_REJECT_UNAUTHORIZED',
  'HTTP_PROXY',
  'HTTPS_PROXY',
  'ALL_PROXY',
  'http_proxy',
  'https_proxy',
  'all_proxy',
]);

export class AuthBridgeNotificationPreparedDeployEntrypointError extends Error {
  constructor(code) {
    super(code);
    this.name = 'AuthBridgeNotificationPreparedDeployEntrypointError';
    this.code = code;
  }
}

function fail(code) {
  throw new AuthBridgeNotificationPreparedDeployEntrypointError(code);
}

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function canonicalDirectory(path, code) {
  if (typeof path !== 'string' || !isAbsolute(path)) fail(code);
  let canonical;
  let status;
  try {
    canonical = realpathSync(resolve(path));
    status = lstatSync(resolve(path));
  } catch {
    fail(code);
  }
  if (
    canonical !== resolve(path)
    || status.isSymbolicLink()
    || !status.isDirectory()
  ) fail(code);
  return canonical;
}

function copyAndScrubEnvironment(environment) {
  const values = {};
  for (const name of REQUIRED_ENVIRONMENT) {
    if (typeof environment[name] !== 'string') {
      fail('AUTH_BRIDGE_PREPARED_DEPLOY_ENVIRONMENT_INVALID');
    }
    values[name] = environment[name];
  }
  for (const name of FORBIDDEN_ENVIRONMENT) {
    if (environment[name] !== undefined) {
      fail('AUTH_BRIDGE_PREPARED_DEPLOY_ENVIRONMENT_FORBIDDEN');
    }
  }
  for (const name of [
    'GITHUB_TOKEN',
    'WARPKEEP_AUTH_BRIDGE_CLOUDFLARE_API_TOKEN',
    'WARPKEEP_PRODUCTION_ADMIN_TOKEN',
  ]) delete environment[name];
  if (
    values.GITHUB_ACTIONS !== 'true'
    || values.GITHUB_EVENT_NAME !== 'workflow_dispatch'
    || values.GITHUB_REF !== 'refs/heads/main'
    || values.GITHUB_REPOSITORY !== REPOSITORY
    || values.GITHUB_WORKFLOW_REF !== WORKFLOW_REF
    || !SOURCE_COMMIT.test(values.GITHUB_SHA)
    || !RUN_ID.test(values.GITHUB_RUN_ID)
    || !RUN_ID.test(values.GITHUB_RUN_ATTEMPT)
    || Number(values.GITHUB_RUN_ATTEMPT) > 1_000
    || !SECRET.test(values.GITHUB_TOKEN)
    || !SECRET.test(values.WARPKEEP_AUTH_BRIDGE_CLOUDFLARE_API_TOKEN)
    || !SECRET.test(values.WARPKEEP_PRODUCTION_ADMIN_TOKEN)
    || !ACCOUNT_ID.test(values.WARPKEEP_AUTH_BRIDGE_ACCOUNT_ID)
    || !ACCOUNT_ID.test(values.WARPKEEP_AUTH_BRIDGE_ZONE_ID)
  ) fail('AUTH_BRIDGE_PREPARED_DEPLOY_ENVIRONMENT_INVALID');
  return Object.freeze(values);
}

async function exactGit(repositoryRoot, args) {
  let result;
  try {
    result = await execFileAsync('/usr/bin/git', args, {
      cwd: repositoryRoot,
      encoding: 'utf8',
      env: Object.freeze({
        GIT_CONFIG_GLOBAL: '/dev/null',
        GIT_CONFIG_NOSYSTEM: '1',
        HOME: '/dev/null',
        LANG: 'C',
        LC_ALL: 'C',
        PATH: '/usr/bin:/bin',
        TZ: 'UTC',
      }),
      maxBuffer: 64 * 1024,
      timeout: 5_000,
      windowsHide: true,
    });
  } catch {
    fail('AUTH_BRIDGE_PREPARED_DEPLOY_GIT_INSPECTION_FAILED');
  }
  if (result.stderr !== '') fail('AUTH_BRIDGE_PREPARED_DEPLOY_GIT_INSPECTION_FAILED');
  return result.stdout.trim();
}

export async function attestAuthBridgeNotificationPreparedDeployCheckout({
  repositoryRoot,
  sourceCommit,
} = {}) {
  const repository = canonicalDirectory(
    repositoryRoot,
    'AUTH_BRIDGE_PREPARED_DEPLOY_REPOSITORY_INVALID',
  );
  if (!SOURCE_COMMIT.test(sourceCommit ?? '')) {
    fail('AUTH_BRIDGE_PREPARED_DEPLOY_SOURCE_COMMIT_INVALID');
  }
  const [topLevel, head, status, origin] = await Promise.all([
    exactGit(repository, ['rev-parse', '--show-toplevel']),
    exactGit(repository, ['rev-parse', 'HEAD']),
    exactGit(repository, ['status', '--porcelain=v1', '--untracked-files=no']),
    exactGit(repository, ['remote', 'get-url', 'origin']),
  ]);
  if (
    topLevel !== repository
    || head !== sourceCommit
    || status !== ''
    || ![
      `https://github.com/${REPOSITORY}`,
      `https://github.com/${REPOSITORY}.git`,
      `git@github.com:${REPOSITORY}.git`,
    ].includes(origin)
  ) fail('AUTH_BRIDGE_PREPARED_DEPLOY_CHECKOUT_MISMATCH');
  return repository;
}

async function boundedGithubJson(response) {
  if (
    !(response instanceof Response)
    || response.redirected
    || response.status !== 200
    || new URL(response.url).origin !== GITHUB_ORIGIN
    || !/^application\/json(?:;\s*charset=utf-8)?$/iu.test(
      response.headers.get('content-type') ?? '',
    )
  ) fail('AUTH_BRIDGE_PREPARED_DEPLOY_GITHUB_RESPONSE_INVALID');
  const length = response.headers.get('content-length');
  if (
    length !== null
    && (!/^[0-9]+$/u.test(length)
      || Number(length) > MAX_GITHUB_RESPONSE_BYTES)
  ) fail('AUTH_BRIDGE_PREPARED_DEPLOY_GITHUB_RESPONSE_INVALID');
  const body = Buffer.from(await response.arrayBuffer());
  if (body.byteLength > MAX_GITHUB_RESPONSE_BYTES) {
    body.fill(0);
    fail('AUTH_BRIDGE_PREPARED_DEPLOY_GITHUB_RESPONSE_INVALID');
  }
  try { return JSON.parse(body.toString('utf8')); } catch {
    fail('AUTH_BRIDGE_PREPARED_DEPLOY_GITHUB_RESPONSE_INVALID');
  } finally {
    body.fill(0);
  }
}

/** Fresh, read-only GitHub re-attestation immediately before either mutation. */
export function createAuthBridgeNotificationPreparedGithubWritePermit({
  githubToken,
  sourceCommit,
  runId,
  runAttempt,
  repositoryRoot,
  fetchImpl = fetch,
  isInterrupted = () => false,
  attestCheckout = attestAuthBridgeNotificationPreparedDeployCheckout,
} = {}) {
  if (
    !SECRET.test(githubToken ?? '')
    || !SOURCE_COMMIT.test(sourceCommit ?? '')
    || !RUN_ID.test(runId ?? '')
    || !RUN_ID.test(String(runAttempt ?? ''))
    || typeof fetchImpl !== 'function'
    || typeof isInterrupted !== 'function'
    || typeof attestCheckout !== 'function'
  ) fail('AUTH_BRIDGE_PREPARED_DEPLOY_WRITE_PERMIT_INPUT_INVALID');
  const request = async path => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 10_000);
    let response;
    try {
      response = await fetchImpl(`${GITHUB_ORIGIN}${path}`, {
        method: 'GET',
        headers: {
          accept: 'application/vnd.github+json',
          authorization: `Bearer ${githubToken}`,
          'x-github-api-version': '2022-11-28',
        },
        cache: 'no-store',
        redirect: 'error',
        referrerPolicy: 'no-referrer',
        signal: controller.signal,
      });
    } catch {
      fail('AUTH_BRIDGE_PREPARED_DEPLOY_WRITE_PERMIT_UNAVAILABLE');
    } finally {
      clearTimeout(timer);
    }
    return boundedGithubJson(response);
  };
  return async phase => {
    if (!['upload', 'release'].includes(phase) || isInterrupted()) {
      fail('AUTH_BRIDGE_PREPARED_DEPLOY_WRITE_PERMIT_REJECTED');
    }
    await attestCheckout({
      repositoryRoot,
      sourceCommit,
    });
    const [branch, run] = await Promise.all([
      request(`/repos/${REPOSITORY}/branches/main`),
      request(`/repos/${REPOSITORY}/actions/runs/${runId}`),
    ]);
    if (
      !isRecord(branch)
      || branch.name !== 'main'
      || branch.protected !== true
      || branch.commit?.sha !== sourceCommit
      || !isRecord(run)
      || String(run.id) !== runId
      || run.run_attempt !== Number(runAttempt)
      || run.event !== 'workflow_dispatch'
      || run.status !== 'in_progress'
      || run.conclusion !== null
      || run.head_branch !== 'main'
      || run.head_sha !== sourceCommit
      || run.path !== WORKFLOW_PATH
      || run.repository?.full_name !== REPOSITORY
      || isInterrupted()
    ) fail('AUTH_BRIDGE_PREPARED_DEPLOY_WRITE_PERMIT_REJECTED');
    return true;
  };
}

export async function runAuthBridgeNotificationPreparedDeploy({
  environment = process.env,
  fetchImpl = fetch,
  repositoryRoot,
  nodeExecutable = process.execPath,
  wranglerEntrypoint,
  clock = () => new Date(),
} = {}) {
  const values = copyAndScrubEnvironment(environment);
  const scriptDirectory = dirname(fileURLToPath(import.meta.url));
  const inferredRepository = resolve(scriptDirectory, '..');
  const repository = await attestAuthBridgeNotificationPreparedDeployCheckout({
    repositoryRoot: repositoryRoot ?? inferredRepository,
    sourceCommit: values.GITHUB_SHA,
  });
  if (repository !== inferredRepository) {
    fail('AUTH_BRIDGE_PREPARED_DEPLOY_REPOSITORY_INVALID');
  }
  const serviceRoot = join(repository, 'services', 'auth-bridge');
  const exactWranglerEntrypoint = wranglerEntrypoint
    ?? join(serviceRoot, 'node_modules', 'wrangler', 'bin', 'wrangler.js');
  let interrupted = false;
  const interrupt = () => { interrupted = true; };
  process.once('SIGINT', interrupt);
  process.once('SIGTERM', interrupt);
  try {
    const permit = createAuthBridgeNotificationPreparedGithubWritePermit({
      githubToken: values.GITHUB_TOKEN,
      sourceCommit: values.GITHUB_SHA,
      runId: values.GITHUB_RUN_ID,
      runAttempt: values.GITHUB_RUN_ATTEMPT,
      repositoryRoot: repository,
      fetchImpl,
      isInterrupted: () => interrupted,
    });
    return await prepareAndWriteAuthBridgeNotificationPreparedReceipt({
      adminToken: values.WARPKEEP_PRODUCTION_ADMIN_TOKEN,
      expectedBridgeSourceCommit: values.GITHUB_SHA,
      fetchImpl,
      clock,
      repositoryRoot: repository,
      deploy: async beforeModes => {
        if (interrupted) fail('AUTH_BRIDGE_PREPARED_DEPLOY_INTERRUPTED');
        const placeholder = authBridgeNotificationPreparedVersionContract({
          accountId: values.WARPKEEP_AUTH_BRIDGE_ACCOUNT_ID,
          zoneId: values.WARPKEEP_AUTH_BRIDGE_ZONE_ID,
          sourceCommit: values.GITHUB_SHA,
          sourceDigest: '0'.repeat(64),
          beforeModes,
        });
        const bundle = await buildAuthBridgeNotificationPreparedWranglerMultipart({
          contract: placeholder,
          repositoryRoot: repository,
          serviceRoot,
          nodeExecutable,
          wranglerEntrypoint: exactWranglerEntrypoint,
        });
        const contract = authBridgeNotificationPreparedVersionContract({
          accountId: values.WARPKEEP_AUTH_BRIDGE_ACCOUNT_ID,
          zoneId: values.WARPKEEP_AUTH_BRIDGE_ZONE_ID,
          sourceCommit: values.GITHUB_SHA,
          sourceDigest: bundle.sourceDigest,
          beforeModes,
        });
        try {
          await withAuthBridgeNotificationPreparedDeployJournal({
            contract,
            repositoryRoot: repository,
            runId: values.GITHUB_RUN_ID,
            runAttempt: Number(values.GITHUB_RUN_ATTEMPT),
            clock,
            operation: async journal => {
              const runtime = createAuthBridgeNotificationPreparedCloudflareRuntime({
                contract,
                apiToken: values.WARPKEEP_AUTH_BRIDGE_CLOUDFLARE_API_TOKEN,
                repositoryRoot: repository,
                serviceRoot,
                nodeExecutable,
                wranglerEntrypoint: exactWranglerEntrypoint,
                multipartBody: bundle.body,
                multipartContentType: bundle.contentType,
                fetchImpl,
                clock,
                journal,
              });
              try {
                await executeAuthBridgeNotificationPreparedDeployAdapter({
                  contract,
                  ...runtime,
                  journal,
                  assertCanStartWrite: permit,
                  clock,
                });
              } finally {
                runtime.dispose();
              }
            },
          });
        } finally {
          bundle.body.fill(0);
        }
      },
    });
  } finally {
    process.removeListener('SIGINT', interrupt);
    process.removeListener('SIGTERM', interrupt);
  }
}

const invokedPath = process.argv[1] === undefined
  ? undefined
  : pathToFileURL(resolve(process.argv[1])).href;
if (invokedPath === import.meta.url) {
  runAuthBridgeNotificationPreparedDeploy().then(
    result => {
      process.stdout.write(`AUTH_BRIDGE_PREPARED_DEPLOY_COMPLETE ${result.receiptDigest}\n`);
    },
    error => {
      const code = typeof error?.code === 'string'
        && /^[A-Z0-9_]{8,128}$/u.test(error.code)
        ? error.code
        : 'AUTH_BRIDGE_PREPARED_DEPLOY_FAILED';
      process.stderr.write(`${code}\n`);
      process.exitCode = 1;
    },
  );
}
