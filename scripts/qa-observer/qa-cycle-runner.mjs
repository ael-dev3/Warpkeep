import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import {
  chmod,
  lstat,
  mkdir,
  open,
  readFile,
  readdir,
  realpath,
  rename,
  rm,
  stat,
  unlink,
} from 'node:fs/promises';
import { homedir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseQaObserverSnapshot } from './observer-snapshot.mjs';

const REPOSITORY_ROOT = resolve(import.meta.dirname, '..', '..');
const OBSERVATORY_ROOT = join(
  homedir(),
  'Library',
  'Application Support',
  'Warpkeep',
  'qa-observatory',
);
const REPORTS_DIRECTORY = join(OBSERVATORY_ROOT, 'reports');
const LOCK_PATH = join(OBSERVATORY_ROOT, 'qa-cycle.lock');
const RUNTIME_HOME = join(OBSERVATORY_ROOT, 'runtime-home');
const RUNTIME_TMP = join(OBSERVATORY_ROOT, 'tmp');
const NPM_CACHE = join(OBSERVATORY_ROOT, 'npm-cache');
const BROKER_HEALTH_URL = 'http://127.0.0.1:41731/healthz';
const BROKER_SNAPSHOT_URL = 'http://127.0.0.1:41731/snapshot';
const BROKER_BROWSER_ORIGIN = 'http://127.0.0.1:5173';
const NPM_EXECUTABLE = join(dirname(process.execPath), 'npm');
const SPACETIME_CLI_VERSION = '2.6.1';
const SPACETIME_CLI = join(
  homedir(),
  '.local',
  'share',
  'spacetime',
  'bin',
  SPACETIME_CLI_VERSION,
  'spacetimedb-cli',
);
const REPORT_VERSION = 1;
const REPORT_RETENTION_DAYS = 14;
const MAX_REPORTS = 200;
const MAX_CYCLE_MILLISECONDS = 50 * 60 * 1_000;
const STALE_LOCK_MILLISECONDS = 55 * 60 * 1_000;
const KILL_GRACE_MILLISECONDS = 2_000;
const REPORT_NAME = /^qa-\d{8}T\d{9}Z-[a-f0-9]{8}\.json$/;

const EXPECTED_PACKAGE_CONTRACTS = Object.freeze([
  Object.freeze({
    path: 'package.json',
    name: 'warpkeep',
    scripts: Object.freeze({
      test: 'vitest --run',
      typecheck: 'tsc -b',
      build: 'tsc -b && vite build && node scripts/verify-production-dist-exclusions.mjs',
      'verify:runtime-assets': 'node scripts/verify-runtime-assets.mjs',
      'verify:file-sizes': 'node scripts/verify-file-sizes.mjs',
      'stdb:verify-bindings': 'node scripts/verify-spacetime-bindings.mjs',
      'stdb:verify-additive-migration': 'node scripts/verify-spacetime-additive-migration.mjs',
    }),
  }),
  Object.freeze({
    path: 'services/auth-bridge/package.json',
    name: '@warpkeep/auth-bridge',
    scripts: Object.freeze({
      typecheck: 'tsc --noEmit',
      'typecheck:workerd': 'tsc --noEmit -p test-workerd/tsconfig.json',
      test: 'vitest run',
      'test:workerd': 'vitest run --config vitest.workerd.config.ts',
    }),
  }),
  Object.freeze({
    path: 'spacetimedb/package.json',
    name: 'warpkeep-spacetimedb-module',
    scripts: Object.freeze({
      typecheck: 'tsc --noEmit',
      'test:pure': 'tsx --test tests/*.test.ts',
      'stdb:build': 'spacetime build --module-path .',
    }),
  }),
]);

const QUICK_TESTS = Object.freeze([
  'tests/qaCycleRunner.test.ts',
  'tests/qaObserverLocalSecurity.test.ts',
  'tests/realmObserverSnapshot.test.ts',
  'tests/realmObserverUi.test.tsx',
  'tests/realmObserverProductionExclusion.test.ts',
]);

const CHECKS = Object.freeze({
  targetedUnit: Object.freeze({
    id: 'targeted-unit',
    executable: NPM_EXECUTABLE,
    args: Object.freeze(['test', '--', ...QUICK_TESTS]),
    timeoutMs: 5 * 60 * 1_000,
  }),
  fullUnit: Object.freeze({
    id: 'full-unit',
    executable: NPM_EXECUTABLE,
    args: Object.freeze(['test']),
    timeoutMs: 8 * 60 * 1_000,
  }),
  typecheck: Object.freeze({
    id: 'typecheck',
    executable: NPM_EXECUTABLE,
    args: Object.freeze(['run', 'typecheck']),
    timeoutMs: 3 * 60 * 1_000,
  }),
  build: Object.freeze({
    id: 'production-build',
    executable: NPM_EXECUTABLE,
    args: Object.freeze(['run', 'build']),
    timeoutMs: 6 * 60 * 1_000,
  }),
  runtimeAssets: Object.freeze({
    id: 'runtime-assets',
    executable: NPM_EXECUTABLE,
    args: Object.freeze(['run', 'verify:runtime-assets']),
    timeoutMs: 60 * 1_000,
  }),
  fileSizes: Object.freeze({
    id: 'file-sizes',
    executable: NPM_EXECUTABLE,
    args: Object.freeze(['run', 'verify:file-sizes']),
    timeoutMs: 60 * 1_000,
  }),
  authBridgeTypecheck: Object.freeze({
    id: 'auth-bridge-typecheck',
    executable: NPM_EXECUTABLE,
    args: Object.freeze(['--prefix', 'services/auth-bridge', 'run', 'typecheck']),
    timeoutMs: 2 * 60 * 1_000,
  }),
  authBridgeWorkerdTypecheck: Object.freeze({
    id: 'auth-bridge-workerd-typecheck',
    executable: NPM_EXECUTABLE,
    args: Object.freeze(['--prefix', 'services/auth-bridge', 'run', 'typecheck:workerd']),
    timeoutMs: 2 * 60 * 1_000,
  }),
  authBridgeUnit: Object.freeze({
    id: 'auth-bridge-unit',
    executable: NPM_EXECUTABLE,
    args: Object.freeze(['--prefix', 'services/auth-bridge', 'run', 'test']),
    timeoutMs: 4 * 60 * 1_000,
  }),
  authBridgeWorkerdUnit: Object.freeze({
    id: 'auth-bridge-workerd-unit',
    executable: NPM_EXECUTABLE,
    args: Object.freeze(['--prefix', 'services/auth-bridge', 'run', 'test:workerd']),
    timeoutMs: 5 * 60 * 1_000,
  }),
  spacetimeTypecheck: Object.freeze({
    id: 'spacetimedb-typecheck',
    executable: NPM_EXECUTABLE,
    args: Object.freeze(['--prefix', 'spacetimedb', 'run', 'typecheck']),
    timeoutMs: 2 * 60 * 1_000,
  }),
  spacetimeUnit: Object.freeze({
    id: 'spacetimedb-unit',
    executable: NPM_EXECUTABLE,
    args: Object.freeze(['--prefix', 'spacetimedb', 'run', 'test:pure']),
    timeoutMs: 3 * 60 * 1_000,
  }),
  spacetimeBuild: Object.freeze({
    id: 'spacetimedb-build',
    // The standard `spacetime` launcher resolves its managed installation
    // through HOME. Deep QA deliberately uses an isolated HOME, so invoke the
    // already version-pinned local CLI directly instead of reopening the
    // user's real SpacetimeDB configuration directory.
    executable: SPACETIME_CLI,
    args: Object.freeze(['build', '--module-path', 'spacetimedb']),
    timeoutMs: 10 * 60 * 1_000,
  }),
  spacetimeBindings: Object.freeze({
    id: 'spacetimedb-bindings',
    executable: NPM_EXECUTABLE,
    args: Object.freeze(['run', 'stdb:verify-bindings']),
    timeoutMs: 5 * 60 * 1_000,
  }),
  spacetimeMigration: Object.freeze({
    id: 'spacetimedb-migration',
    executable: NPM_EXECUTABLE,
    args: Object.freeze(['run', 'stdb:verify-additive-migration']),
    timeoutMs: 15 * 60 * 1_000,
  }),
});

const TIER_CHECKS = Object.freeze({
  quick: Object.freeze([CHECKS.targetedUnit, CHECKS.typecheck]),
  standard: Object.freeze([
    CHECKS.fullUnit,
    CHECKS.typecheck,
    CHECKS.runtimeAssets,
    CHECKS.fileSizes,
  ]),
  deep: Object.freeze([
    CHECKS.fullUnit,
    CHECKS.typecheck,
    CHECKS.build,
    CHECKS.runtimeAssets,
    CHECKS.fileSizes,
    CHECKS.authBridgeTypecheck,
    CHECKS.authBridgeWorkerdTypecheck,
    CHECKS.authBridgeUnit,
    CHECKS.authBridgeWorkerdUnit,
    CHECKS.spacetimeTypecheck,
    CHECKS.spacetimeUnit,
    CHECKS.spacetimeBuild,
    CHECKS.spacetimeBindings,
    CHECKS.spacetimeMigration,
  ]),
});

export class QaCycleLockError extends Error {
  constructor() {
    super('Another local QA cycle owns the lock.');
    this.name = 'QaCycleLockError';
  }
}

export function qaCycleEnvironment() {
  return Object.freeze({
    PATH: [
      dirname(process.execPath),
      join(homedir(), '.local', 'bin'),
      '/opt/homebrew/bin',
      '/usr/local/bin',
      '/usr/bin',
      '/bin',
    ].join(':'),
    HOME: RUNTIME_HOME,
    TMPDIR: RUNTIME_TMP,
    LANG: 'en_US.UTF-8',
    CI: '1',
    NO_COLOR: '1',
    // Verification scripts honour this exact binary instead of the mutable
    // `spacetime` launcher, whose lookup is intentionally unavailable inside
    // the isolated runtime HOME.
    SPACETIME_BIN: SPACETIME_CLI,
    npm_config_audit: 'false',
    npm_config_cache: NPM_CACHE,
    npm_config_fund: 'false',
    npm_config_ignore_scripts: 'true',
    npm_config_logs_max: '0',
    npm_config_update_notifier: 'false',
    npm_config_userconfig: '/dev/null',
  });
}

async function ensurePrivateDirectory(path) {
  await mkdir(path, { recursive: true, mode: 0o700 });
  const metadata = await lstat(path);
  const expectedUid = typeof process.getuid === 'function' ? process.getuid() : undefined;
  if (
    !metadata.isDirectory()
    || metadata.isSymbolicLink()
    || (expectedUid !== undefined && metadata.uid !== expectedUid)
    || resolve(await realpath(path)) !== resolve(path)
  ) throw new Error('Unsafe directory.');
  await chmod(path, 0o700);
  const secured = await lstat(path);
  if ((secured.mode & 0o077) !== 0) throw new Error('Unsafe directory.');
}

function processIsAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return error?.code === 'EPERM';
  }
}

function validLockRecord(value) {
  return value !== null
    && typeof value === 'object'
    && !Array.isArray(value)
    && Object.keys(value).length === 3
    && typeof value.runId === 'string'
    && /^[a-f0-9]{16}$/.test(value.runId)
    && Number.isSafeInteger(value.pid)
    && value.pid > 0
    && typeof value.startedAt === 'string'
    && Number.isFinite(Date.parse(value.startedAt));
}

async function readLockRecord(lockPath) {
  const metadata = await lstat(lockPath);
  if (!metadata.isFile() || metadata.isSymbolicLink() || metadata.size > 512) return undefined;
  try {
    const value = JSON.parse(await readFile(lockPath, 'utf8'));
    return validLockRecord(value) ? value : undefined;
  } catch {
    return undefined;
  }
}

export async function acquireQaCycleLock(lockPath = LOCK_PATH, options = {}) {
  const now = options.now ?? new Date();
  const pid = options.pid ?? process.pid;
  const isAlive = options.isProcessAlive ?? processIsAlive;
  const runId = options.runId ?? randomBytes(8).toString('hex');
  if (!(now instanceof Date) || !Number.isFinite(now.valueOf())) throw new QaCycleLockError();
  if (!Number.isSafeInteger(pid) || pid <= 0 || !/^[a-f0-9]{16}$/.test(runId)) {
    throw new QaCycleLockError();
  }
  await ensurePrivateDirectory(dirname(lockPath));

  const create = async () => {
    const handle = await open(lockPath, 'wx', 0o600);
    try {
      await handle.writeFile(`${JSON.stringify({ runId, pid, startedAt: now.toISOString() })}\n`);
      await handle.sync();
    } finally {
      await handle.close();
    }
    await chmod(lockPath, 0o600);
  };

  try {
    await create();
  } catch (error) {
    if (error?.code !== 'EEXIST') throw new QaCycleLockError();
    const existing = await readLockRecord(lockPath);
    if (!existing) throw new QaCycleLockError();
    const age = now.valueOf() - Date.parse(existing.startedAt);
    if (age <= STALE_LOCK_MILLISECONDS || isAlive(existing.pid)) {
      throw new QaCycleLockError();
    }
    const stalePath = `${lockPath}.stale-${runId}`;
    try {
      await rename(lockPath, stalePath);
      await unlink(stalePath);
      await create();
    } catch {
      await rm(stalePath, { force: true });
      throw new QaCycleLockError();
    }
  }

  let released = false;
  return Object.freeze({
    runId,
    async release() {
      if (released) return;
      const current = await readLockRecord(lockPath);
      if (!current || current.runId !== runId) throw new QaCycleLockError();
      await unlink(lockPath);
      released = true;
    },
  });
}

export function tierForLocalHour(hour) {
  if (!Number.isInteger(hour) || hour < 0 || hour > 23) throw new TypeError('Invalid local hour.');
  if (hour % 6 === 0) return 'deep';
  if (hour % 3 === 0) return 'standard';
  return 'quick';
}

export function checksForTier(tier) {
  const checks = TIER_CHECKS[tier];
  if (!checks) throw new TypeError('Invalid QA tier.');
  return checks;
}

function terminateProcessGroup(child, signal) {
  if (!child?.pid) return;
  try {
    process.kill(-child.pid, signal);
  } catch {
    try {
      child.kill(signal);
    } catch {
      // A process that already exited needs no further action.
    }
  }
}

export function runCommandCheck(check, options = {}) {
  const started = Date.now();
  const timeoutMs = options.timeoutMs ?? check.timeoutMs;
  if (!Number.isFinite(timeoutMs) || timeoutMs < 1) {
    return Promise.resolve(Object.freeze({ id: check.id, status: 'timeout', durationMs: 0 }));
  }
  return new Promise((resolveCheck) => {
    let child;
    let timedOut = false;
    let settled = false;
    let killTimer;
    let hardStopTimer;

    const finish = (status) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeoutTimer);
      clearTimeout(killTimer);
      clearTimeout(hardStopTimer);
      resolveCheck(Object.freeze({
        id: check.id,
        status,
        durationMs: Math.max(0, Date.now() - started),
      }));
    };

    const timeoutTimer = setTimeout(() => {
      timedOut = true;
      terminateProcessGroup(child, 'SIGTERM');
      killTimer = setTimeout(() => {
        terminateProcessGroup(child, 'SIGKILL');
        hardStopTimer = setTimeout(() => finish('timeout'), 1_000);
      }, KILL_GRACE_MILLISECONDS);
    }, timeoutMs);

    try {
      child = spawn(check.executable, [...check.args], {
        cwd: options.cwd ?? REPOSITORY_ROOT,
        env: options.environment ?? qaCycleEnvironment(),
        detached: true,
        shell: false,
        stdio: 'ignore',
        windowsHide: true,
      });
    } catch {
      finish('fail');
      return;
    }
    child.once('error', () => finish(timedOut ? 'timeout' : 'fail'));
    child.once('close', (code) => finish(timedOut ? 'timeout' : code === 0 ? 'pass' : 'fail'));
  });
}

async function readBoundedJson(response, maximumBytes) {
  const advertised = response.headers.get('content-length');
  if (advertised !== null && (!/^\d+$/.test(advertised) || Number(advertised) > maximumBytes)) {
    throw new Error('Bound exceeded.');
  }
  if (!response.body) throw new Error('Missing body.');
  const reader = response.body.getReader();
  const chunks = [];
  let total = 0;
  try {
    for (;;) {
      const result = await reader.read();
      if (result.done) break;
      if (!result.value) continue;
      total += result.value.byteLength;
      if (total > maximumBytes) throw new Error('Bound exceeded.');
      chunks.push(result.value);
    }
  } finally {
    try {
      await reader.cancel();
    } catch {
      // The original validation result remains authoritative.
    }
    reader.releaseLock();
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
}

export async function probeLocalBrokerHealth(fetchImpl = globalThis.fetch, timeoutMs = 5_000) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImpl(BROKER_HEALTH_URL, {
      method: 'GET',
      mode: 'cors',
      credentials: 'omit',
      cache: 'no-store',
      redirect: 'error',
      referrerPolicy: 'no-referrer',
      headers: { Accept: 'application/json' },
      signal: controller.signal,
    });
    if (
      !response.ok
      || response.status !== 200
      || (response.url && response.url !== BROKER_HEALTH_URL)
      || !/^application\/json(?:\s*;\s*charset=utf-8)?$/i.test(
        response.headers.get('content-type') ?? '',
      )
    ) throw new Error('Invalid health response.');
    const body = await readBoundedJson(response, 1_024);
    if (
      body === null
      || typeof body !== 'object'
      || Array.isArray(body)
      || Object.keys(body).sort().join(',') !== 'mode,ok'
      || body.ok !== true
      || body.mode !== 'read-only'
    ) throw new Error('Invalid health response.');
  } finally {
    clearTimeout(timeout);
  }
}

export async function probeLocalBrokerSnapshot(fetchImpl = globalThis.fetch, timeoutMs = 30_000) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImpl(BROKER_SNAPSHOT_URL, {
      method: 'GET',
      mode: 'cors',
      credentials: 'omit',
      cache: 'no-store',
      redirect: 'error',
      referrerPolicy: 'no-referrer',
      headers: {
        Accept: 'application/json',
        Origin: BROKER_BROWSER_ORIGIN,
      },
      signal: controller.signal,
    });
    if (
      !response.ok
      || response.status !== 200
      || (response.url && response.url !== BROKER_SNAPSHOT_URL)
      || !/^application\/json(?:\s*;\s*charset=utf-8)?$/i.test(
        response.headers.get('content-type') ?? '',
      )
    ) throw new Error('Invalid snapshot response.');
    const body = await readBoundedJson(response, 256 * 1_024);
    if (!parseQaObserverSnapshot(body)) throw new Error('Invalid snapshot response.');
  } finally {
    clearTimeout(timeout);
  }
}

export async function runQaCycle(options = {}) {
  const startedAt = options.startedAt ?? new Date();
  const requestedTier = options.tier ?? 'auto';
  const tier = requestedTier === 'auto'
    ? tierForLocalHour(startedAt.getHours())
    : requestedTier;
  const checks = checksForTier(tier);
  const execute = options.executeCheck ?? runCommandCheck;
  const deadline = startedAt.valueOf() + MAX_CYCLE_MILLISECONDS;
  const results = [];

  if (options.broker === 'health' || options.broker === 'snapshot') {
    const brokerStarted = Date.now();
    try {
      const probe = options.probeBroker
        ?? (options.broker === 'snapshot' ? probeLocalBrokerSnapshot : probeLocalBrokerHealth);
      await probe();
      results.push(Object.freeze({
        id: `broker-${options.broker}`,
        status: 'pass',
        durationMs: Math.max(0, Date.now() - brokerStarted),
      }));
    } catch {
      results.push(Object.freeze({
        id: `broker-${options.broker}`,
        status: 'fail',
        durationMs: Math.max(0, Date.now() - brokerStarted),
      }));
    }
  } else if (options.broker !== undefined && options.broker !== 'off') {
    throw new TypeError('Invalid broker probe mode.');
  }

  for (const check of checks) {
    const remaining = deadline - Date.now();
    if (remaining <= 0) {
      results.push(Object.freeze({ id: check.id, status: 'timeout', durationMs: 0 }));
      break;
    }
    try {
      results.push(await execute(check, {
        cwd: REPOSITORY_ROOT,
        timeoutMs: Math.min(check.timeoutMs, remaining),
      }));
    } catch {
      results.push(Object.freeze({ id: check.id, status: 'fail', durationMs: 0 }));
    }
  }

  const finishedAt = new Date();
  const status = results.length === checks.length
      + (options.broker === 'health' || options.broker === 'snapshot' ? 1 : 0)
    && results.every((result) => result.status === 'pass')
    ? 'pass'
    : 'fail';
  return Object.freeze({
    version: REPORT_VERSION,
    startedAt: startedAt.toISOString(),
    finishedAt: finishedAt.toISOString(),
    tier,
    broker: options.broker ?? 'off',
    status,
    durationMs: Math.max(0, finishedAt.valueOf() - startedAt.valueOf()),
    checks: Object.freeze(results),
  });
}

function reportFilename(now, randomSuffix) {
  const timestamp = now.toISOString().replaceAll('-', '').replaceAll(':', '').replace('.', '');
  return `qa-${timestamp}-${randomSuffix}.json`;
}

function exactIsoTimestamp(value) {
  if (typeof value !== 'string') return false;
  const parsed = new Date(value);
  return Number.isFinite(parsed.valueOf()) && parsed.toISOString() === value;
}

function sanitizeReport(report) {
  if (
    report === null
    || typeof report !== 'object'
    || Array.isArray(report)
    || Object.keys(report).sort().join(',')
      !== 'broker,checks,durationMs,finishedAt,startedAt,status,tier,version'
    || report.version !== REPORT_VERSION
    || !exactIsoTimestamp(report.startedAt)
    || !exactIsoTimestamp(report.finishedAt)
    || !['quick', 'standard', 'deep'].includes(report.tier)
    || !['off', 'health', 'snapshot'].includes(report.broker)
    || !['pass', 'fail'].includes(report.status)
    || !Number.isSafeInteger(report.durationMs)
    || report.durationMs < 0
    || report.durationMs > 24 * 60 * 60 * 1_000
    || !Array.isArray(report.checks)
    || report.checks.length < 1
    || report.checks.length > 24
  ) throw new TypeError('Invalid QA report.');

  const checks = report.checks.map((check) => {
    if (
      check === null
      || typeof check !== 'object'
      || Array.isArray(check)
      || Object.keys(check).sort().join(',') !== 'durationMs,id,status'
      || typeof check.id !== 'string'
      || !/^[a-z0-9-]{1,48}$/.test(check.id)
      || !['pass', 'fail', 'timeout'].includes(check.status)
      || !Number.isSafeInteger(check.durationMs)
      || check.durationMs < 0
      || check.durationMs > MAX_CYCLE_MILLISECONDS
    ) throw new TypeError('Invalid QA report check.');
    return Object.freeze({
      id: check.id,
      status: check.status,
      durationMs: check.durationMs,
    });
  });
  return Object.freeze({
    version: REPORT_VERSION,
    startedAt: report.startedAt,
    finishedAt: report.finishedAt,
    tier: report.tier,
    broker: report.broker,
    status: report.status,
    durationMs: report.durationMs,
    checks: Object.freeze(checks),
  });
}

export async function writePrivateReport(report, options = {}) {
  const reportsDirectory = options.reportsDirectory ?? REPORTS_DIRECTORY;
  const now = options.now ?? new Date();
  const randomSuffix = options.randomSuffix ?? randomBytes(4).toString('hex');
  if (!/^[a-f0-9]{8}$/.test(randomSuffix)) throw new TypeError('Invalid report suffix.');
  await ensurePrivateDirectory(reportsDirectory);
  const name = reportFilename(now, randomSuffix);
  if (!REPORT_NAME.test(name)) throw new TypeError('Invalid report name.');
  const destination = join(reportsDirectory, name);
  const temporary = join(reportsDirectory, `.${name}.tmp`);
  const sanitized = sanitizeReport(report);
  let handle;
  try {
    handle = await open(temporary, 'wx', 0o600);
    await handle.writeFile(`${JSON.stringify(sanitized)}\n`);
    await handle.sync();
    await handle.close();
    handle = undefined;
    await rename(temporary, destination);
    await chmod(destination, 0o600);
    return destination;
  } catch (error) {
    await handle?.close().catch(() => {});
    await rm(temporary, { force: true });
    throw error;
  }
}

export async function prunePrivateReports(options = {}) {
  const reportsDirectory = options.reportsDirectory ?? REPORTS_DIRECTORY;
  const now = options.now ?? new Date();
  const retentionDays = options.retentionDays ?? REPORT_RETENTION_DAYS;
  const maximumReports = options.maximumReports ?? MAX_REPORTS;
  if (
    !Number.isSafeInteger(retentionDays)
    || retentionDays < 1
    || retentionDays > 365
    || !Number.isSafeInteger(maximumReports)
    || maximumReports < 1
    || maximumReports > 10_000
  ) throw new TypeError('Invalid report retention policy.');
  const cutoff = now.valueOf() - retentionDays * 24 * 60 * 60 * 1_000;
  const entries = await readdir(reportsDirectory, { withFileTypes: true });
  const reports = [];
  for (const entry of entries) {
    if (!entry.isFile() || !REPORT_NAME.test(entry.name)) continue;
    const path = join(reportsDirectory, entry.name);
    const metadata = await stat(path);
    reports.push({ path, modified: metadata.mtimeMs });
  }
  reports.sort((left, right) => right.modified - left.modified);
  const removals = reports.filter((report, index) => (
    report.modified < cutoff || index >= maximumReports
  ));
  await Promise.all(removals.map((report) => unlink(report.path)));
  return removals.length;
}

function parseArguments(argv) {
  let tier = 'auto';
  let broker = 'off';
  for (const argument of argv) {
    if (argument === '--help') return { help: true, tier, broker };
    if (argument.startsWith('--tier=')) {
      tier = argument.slice('--tier='.length);
      if (!['auto', 'quick', 'standard', 'deep'].includes(tier)) throw new TypeError();
      continue;
    }
    if (argument.startsWith('--broker=')) {
      broker = argument.slice('--broker='.length);
      if (!['off', 'health', 'snapshot'].includes(broker)) throw new TypeError();
      continue;
    }
    throw new TypeError();
  }
  return { help: false, tier, broker };
}

export async function attestQaRepository(repositoryRoot = REPOSITORY_ROOT) {
  for (const contract of EXPECTED_PACKAGE_CONTRACTS) {
    const packageJson = JSON.parse(await readFile(join(repositoryRoot, contract.path), 'utf8'));
    if (
      packageJson?.name !== contract.name
      || packageJson?.private !== true
      || packageJson?.scripts === null
      || typeof packageJson?.scripts !== 'object'
      || Array.isArray(packageJson.scripts)
    ) throw new Error('Repository command contract mismatch.');
    for (const [name, command] of Object.entries(contract.scripts)) {
      if (packageJson.scripts[name] !== command) {
        throw new Error('Repository command contract mismatch.');
      }
    }
  }
}

async function main() {
  process.umask(0o077);
  let argumentsValue;
  try {
    argumentsValue = parseArguments(process.argv.slice(2));
  } catch {
    process.stderr.write('Usage: qa-cycle-runner [--tier=auto|quick|standard|deep] [--broker=off|health|snapshot]\n');
    process.exitCode = 64;
    return;
  }
  if (argumentsValue.help) {
    process.stdout.write('Usage: qa-cycle-runner [--tier=auto|quick|standard|deep] [--broker=off|health|snapshot]\n');
    return;
  }

  try {
    await Promise.all([
      ensurePrivateDirectory(OBSERVATORY_ROOT),
      ensurePrivateDirectory(RUNTIME_HOME),
      ensurePrivateDirectory(RUNTIME_TMP),
      ensurePrivateDirectory(NPM_CACHE),
    ]);
    await attestQaRepository();
  } catch {
    process.stderr.write('Warpkeep QA cycle failed closed.\n');
    process.exitCode = 1;
    return;
  }

  let lock;
  try {
    lock = await acquireQaCycleLock();
  } catch (error) {
    process.stderr.write(error instanceof QaCycleLockError
      ? 'Warpkeep QA cycle not started: another local cycle owns the lock.\n'
      : 'Warpkeep QA cycle failed closed.\n');
    process.exitCode = error instanceof QaCycleLockError ? 75 : 1;
    return;
  }

  let report;
  try {
    report = await runQaCycle(argumentsValue);
  } catch {
    const now = new Date();
    const tier = argumentsValue.tier === 'auto'
      ? tierForLocalHour(now.getHours())
      : argumentsValue.tier;
    report = Object.freeze({
      version: REPORT_VERSION,
      startedAt: now.toISOString(),
      finishedAt: now.toISOString(),
      tier,
      broker: argumentsValue.broker,
      status: 'fail',
      durationMs: 0,
      checks: Object.freeze([{ id: 'runner', status: 'fail', durationMs: 0 }]),
    });
  }

  try {
    await lock.release();
  } catch {
    report = Object.freeze({
      ...report,
      status: 'fail',
      checks: Object.freeze([
        ...report.checks,
        Object.freeze({ id: 'runner-lock-release', status: 'fail', durationMs: 0 }),
      ]),
    });
  }

  try {
    const reportPath = await writePrivateReport(report);
    await prunePrivateReports();
    process.stdout.write(`Warpkeep QA cycle ${report.status}: ${report.tier}; report ${basename(reportPath)}\n`);
  } catch {
    process.stderr.write('Warpkeep QA cycle failed closed while writing its private report.\n');
    process.exitCode = 1;
    return;
  }
  process.exitCode = report.status === 'pass' ? 0 : 1;
}

const isMain = process.argv[1]
  && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) void main();
