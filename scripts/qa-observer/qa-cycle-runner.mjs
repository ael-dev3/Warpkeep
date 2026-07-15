import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { rmSync } from 'node:fs';
import { request as httpRequest } from 'node:http';
import {
  chmod,
  lstat,
  mkdir,
  mkdtemp,
  open,
  readFile,
  readdir,
  realpath,
  rename,
  rm,
  stat,
  unlink,
  writeFile,
} from 'node:fs/promises';
import { homedir } from 'node:os';
import { createServer as createNetServer } from 'node:net';
import { basename, dirname, join, parse, relative, resolve } from 'node:path';
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
const AUDIT_DIRECTORY = join(OBSERVATORY_ROOT, 'audit');
const HELPER_DIRECTORY = join(OBSERVATORY_ROOT, 'bin');
const LOCK_PATH = join(OBSERVATORY_ROOT, 'qa-cycle.lock');
const RUNTIME_HOME = join(OBSERVATORY_ROOT, 'runtime-home');
const RUNTIME_TMP = join(OBSERVATORY_ROOT, 'tmp');
const NPM_CACHE = join(OBSERVATORY_ROOT, 'npm-cache');
const SOCKET_TMP_ROOT = join(
  '/private/tmp',
  `wkqa-${typeof process.getuid === 'function' ? process.getuid() : 'local'}-${randomBytes(6).toString('hex')}`,
);
process.once('exit', () => {
  try {
    rmSync(SOCKET_TMP_ROOT, { recursive: true, force: true });
  } catch {
    // A failed cleanup cannot widen the owner-private socket authority.
  }
});
const BUILD_OUTPUT_ROOT = join(REPOSITORY_ROOT, 'dist');
const ROOT_TSC_CACHE_ROOT = join(REPOSITORY_ROOT, 'node_modules', '.tmp');
const ROOT_VITE_CACHE_ROOT = join(REPOSITORY_ROOT, 'node_modules', '.vite');
const ROOT_VITE_CONFIG_ROOT = join(REPOSITORY_ROOT, 'node_modules', '.vite-temp');
const AUTH_VITE_CACHE_ROOT = join(
  REPOSITORY_ROOT,
  'services',
  'auth-bridge',
  'node_modules',
  '.vite',
);
const AUTH_VITE_CONFIG_ROOT = join(
  REPOSITORY_ROOT,
  'services',
  'auth-bridge',
  'node_modules',
  '.vite-temp',
);
const SPACETIME_DIST_ROOT = join(REPOSITORY_ROOT, 'spacetimedb', 'dist');
const SPACETIME_V1_DIST_ROOT = join(
  REPOSITORY_ROOT,
  'spacetimedb',
  'migration-fixtures',
  'production-v1',
  'dist',
);
const SPACETIME_V2_DIST_ROOT = join(
  REPOSITORY_ROOT,
  'spacetimedb',
  'migration-fixtures',
  'additive-v2-schema',
  'dist',
);
const SPACETIME_V3_DIST_ROOT = join(
  REPOSITORY_ROOT,
  'spacetimedb',
  'migration-fixtures',
  'additive-v3-schema',
  'dist',
);
const BROKER_SOCKET_PATH = join(OBSERVATORY_ROOT, 'broker.sock');
const BROKER_HEALTH_PATH = '/healthz';
const BROKER_SNAPSHOT_PATH = '/snapshot';
const MAX_UNIX_SOCKET_PATH_BYTES = 90;
const SANDBOX_EXECUTABLE = '/usr/bin/sandbox-exec';
const NETWORK_SANDBOX_PROFILE = join(
  REPOSITORY_ROOT,
  'scripts',
  'qa-observer',
  'qa-cycle-network.sb',
);
const PRODUCTION_BRIDGE_CONFIG = join(
  REPOSITORY_ROOT,
  'services',
  'auth-bridge',
  'wrangler.toml',
);
const PRODUCTION_GATE_MAXIMUM_BYTES = 64 * 1_024;
const EXPECTED_DISABLED_PRODUCTION_GATES = Object.freeze([
  Object.freeze({
    key: 'PUBLIC_AUTH_ENABLED',
    line: 'PUBLIC_AUTH_ENABLED = "false"',
  }),
  Object.freeze({
    key: 'QA_OBSERVER_ENABLED',
    line: 'QA_OBSERVER_ENABLED = "false"',
  }),
]);
const FORBIDDEN_QA_REGISTRATION_KEYS = Object.freeze([
  'QA_OBSERVER_PUBLIC_JWK',
  'QA_OBSERVER_KEY_REGISTERED_AT',
  'QA_OBSERVER_KEY_EXPIRES_AT',
]);
const EXPECTED_NETWORK_SANDBOX_PROFILE = `(version 1)

(define observatory-root (param "OBSERVATORY_ROOT"))
(define repository-root (param "REPOSITORY_ROOT"))
(define user-home (param "USER_HOME"))
(define spacetime-cli-root (param "SPACETIME_CLI_ROOT"))
(define runtime-home (param "RUNTIME_HOME"))
(define runtime-tmp (param "RUNTIME_TMP"))
(define npm-cache (param "NPM_CACHE"))
(define socket-tmp-root (param "SOCKET_TMP_ROOT"))
(define build-output-root (param "BUILD_OUTPUT_ROOT"))
(define root-tsc-cache-root (param "ROOT_TSC_CACHE_ROOT"))
(define root-vite-cache-root (param "ROOT_VITE_CACHE_ROOT"))
(define root-vite-config-root (param "ROOT_VITE_CONFIG_ROOT"))
(define auth-vite-cache-root (param "AUTH_VITE_CACHE_ROOT"))
(define auth-vite-config-root (param "AUTH_VITE_CONFIG_ROOT"))
(define spacetime-dist-root (param "SPACETIME_DIST_ROOT"))
(define spacetime-v1-dist-root (param "SPACETIME_V1_DIST_ROOT"))
(define spacetime-v2-dist-root (param "SPACETIME_V2_DIST_ROOT"))
(define spacetime-v3-dist-root (param "SPACETIME_V3_DIST_ROOT"))

; Every repository-owned child is limited to numeric loopback TCP and one
; fresh owner-private Unix-socket directory. Shared /private/tmp control
; sockets and the persistent observatory broker are outside this authority.
(allow default)
(deny network*)
(allow network* (local ip "localhost:*"))
(allow network* (remote ip "localhost:*"))
(allow network* (local unix-socket (subpath socket-tmp-root)))
(allow network* (remote unix-socket (subpath socket-tmp-root)))

; Source, scripts, dependencies, reports, audit records, and the installed
; helper are read-only. Only disposable runtime state and exact reviewed build
; or tool caches can be changed by repository code.
(deny file-write*)
(allow file-write* (subpath runtime-home))
(allow file-write* (subpath runtime-tmp))
(allow file-write* (subpath npm-cache))
(allow file-write* (subpath socket-tmp-root))
(allow file-write* (subpath build-output-root))
(allow file-write* (subpath root-tsc-cache-root))
(allow file-write* (subpath root-vite-cache-root))
(allow file-write* (subpath root-vite-config-root))
(allow file-write* (subpath auth-vite-cache-root))
(allow file-write* (subpath auth-vite-config-root))
(allow file-write* (subpath spacetime-dist-root))
(allow file-write* (subpath spacetime-v1-dist-root))
(allow file-write* (subpath spacetime-v2-dist-root))
(allow file-write* (subpath spacetime-v3-dist-root))
(allow file-write* (literal "/dev/null"))

; Do not expose the rest of the signed-in account or shared temporary files.
; The checkout, isolated runtime, exact socket root, and pinned CLI are the
; complete read exceptions required by the autonomous local fixtures.
(deny file-read* (subpath user-home))
(deny file-read* (subpath "/private/tmp"))
(allow file-read-metadata (subpath user-home))
(allow file-read-metadata (subpath "/private/tmp"))
(allow file-read* (subpath repository-root))
(allow file-read* (subpath runtime-home))
(allow file-read* (subpath runtime-tmp))
(allow file-read* (subpath npm-cache))
(allow file-read* (subpath socket-tmp-root))
(allow file-read* (subpath spacetime-cli-root))

; Mutable repository code cannot invoke the installed observer/helper or the
; macOS credential and control-plane command-line surfaces.
(deny process-exec (subpath observatory-root))
(deny process-exec (literal "/usr/bin/security"))
(deny process-exec (literal "/usr/bin/osascript"))
(deny process-exec (literal "/usr/bin/open"))
(deny process-exec (literal "/bin/launchctl"))
(deny mach-lookup (global-name "com.apple.securityd"))
(deny mach-lookup (global-name "com.apple.securityd.xpc"))
`;
const NPM_EXECUTABLE = join(dirname(process.execPath), 'npm');
const RENDERED_WEBGL_BROWSER_PROBE = join(
  REPOSITORY_ROOT,
  'scripts',
  'qa-observer',
  'rendered-webgl-browser-probe.mjs',
);
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
const SPACETIME_CLI_ROOT = dirname(SPACETIME_CLI);
const REPORT_VERSION = 1;
const REPORT_RETENTION_DAYS = 14;
const MAX_REPORTS = 200;
const MAX_CYCLE_MILLISECONDS = 50 * 60 * 1_000;
const STALE_LOCK_MILLISECONDS = 55 * 60 * 1_000;
const KILL_GRACE_MILLISECONDS = 2_000;
const REPORT_NAME = /^qa-\d{8}T\d{9}Z-[a-f0-9]{8}\.json$/;
const SANDBOX_PROBE_SUFFIX = basename(SOCKET_TMP_ROOT);
const SANDBOX_BOUNDARY_PATHS = Object.freeze({
  allowedFile: join(SOCKET_TMP_ROOT, `.sandbox-allowed-${SANDBOX_PROBE_SUFFIX}`),
  allowedSocket: join(SOCKET_TMP_ROOT, 'sandbox-allowed.sock'),
  auditSentinel: join(AUDIT_DIRECTORY, `.sandbox-private-${SANDBOX_PROBE_SUFFIX}`),
  helperSentinel: join(HELPER_DIRECTORY, `.sandbox-private-${SANDBOX_PROBE_SUFFIX}`),
  reportSentinel: join(REPORTS_DIRECTORY, `.sandbox-private-${SANDBOX_PROBE_SUFFIX}`),
  sourceProbe: join(
    REPOSITORY_ROOT,
    'scripts',
    'qa-observer',
    `.sandbox-source-${SANDBOX_PROBE_SUFFIX}`,
  ),
});

function sandboxBoundaryProgram(unrelatedSocketPath) {
  const privateSentinels = [
    SANDBOX_BOUNDARY_PATHS.auditSentinel,
    SANDBOX_BOUNDARY_PATHS.helperSentinel,
    SANDBOX_BOUNDARY_PATHS.reportSentinel,
  ];
  return [
    "const fs=require('node:fs');",
    "const net=require('node:net');",
    `const privateSentinels=${JSON.stringify(privateSentinels)};`,
    `const sourceProbe=${JSON.stringify(SANDBOX_BOUNDARY_PATHS.sourceProbe)};`,
    `const allowedFile=${JSON.stringify(SANDBOX_BOUNDARY_PATHS.allowedFile)};`,
    `const allowedSocket=${JSON.stringify(SANDBOX_BOUNDARY_PATHS.allowedSocket)};`,
    `const unrelatedSocket=${JSON.stringify(unrelatedSocketPath)};`,
    "const denied=(operation,cleanup)=>{try{operation();try{cleanup?.();}catch{}return false;}catch(error){return ['EPERM','EACCES'].includes(error?.code);}};",
    "if(!privateSentinels.every((path)=>denied(()=>fs.readFileSync(path))))process.exit(20);",
    "if(!privateSentinels.every((path)=>denied(()=>fs.appendFileSync(path,'forbidden'))))process.exit(21);",
    "if(!denied(()=>fs.writeFileSync(sourceProbe,'forbidden',{flag:'wx'}),()=>fs.unlinkSync(sourceProbe)))process.exit(22);",
    "try{fs.writeFileSync(allowedFile,'allowed',{flag:'wx',mode:0o600});if(fs.readFileSync(allowedFile,'utf8')!=='allowed')process.exit(23);fs.unlinkSync(allowedFile);}catch{process.exit(24);}",
    "const canConnect=(path)=>new Promise((resolve)=>{let settled=false;const socket=net.createConnection({path});const finish=(value)=>{if(settled)return;settled=true;clearTimeout(timer);socket.destroy();resolve(value);};const timer=setTimeout(()=>finish(false),1500);socket.once('connect',()=>finish(true));socket.once('error',()=>finish(false));});",
    "(async()=>{if(await canConnect(unrelatedSocket))process.exit(25);if(!await canConnect(allowedSocket))process.exit(26);})().catch(()=>process.exit(27));",
  ].join('');
}

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
      'qa:rendered-webgl': 'node scripts/qa-observer/rendered-webgl-browser-probe.mjs',
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

const SYNTHETIC_APP_STATE_TESTS = Object.freeze([
  'tests/qaJourneyLab.test.tsx',
  'tests/localQaRuntime.test.ts',
  'tests/alphaParticipationTermsDialog.test.tsx',
  'tests/farcasterQrAuthPanel.test.tsx',
  'tests/farcasterAdmissionPanel.test.tsx',
  'tests/menuFarcasterAuthIntegration.test.tsx',
  'tests/WarpkeepExperienceRealm.test.tsx',
  'tests/WarpkeepExperience.test.tsx',
  'tests/WarpkeepSpacetimeTermsGate.test.tsx',
  'tests/WarpkeepSpacetimeCanonicalReadiness.test.tsx',
  'tests/menuMainMenu.test.tsx',
  'tests/settingsPanel.test.tsx',
  'tests/creditsRoll.test.tsx',
  'tests/warpkeepBuildStamp.test.tsx',
  'tests/latestPatchNotes.test.ts',
  'tests/realmMapScreen.test.tsx',
  'tests/realmAccessibilityControls.test.tsx',
  'tests/realmInteractionState.test.ts',
  'tests/castleInspectionPanel.test.tsx',
  'tests/realmHud.test.tsx',
  'tests/renderedWebglQaFixture.test.ts',
  'tests/renderedWebglQaHarness.test.tsx',
  'tests/renderedWebglQaContract.test.ts',
  'tests/renderedWebglBrowserProbe.test.ts',
]);

const CHECKS = Object.freeze({
  targetedUnit: Object.freeze({
    id: 'targeted-unit',
    executable: NPM_EXECUTABLE,
    args: Object.freeze(['test', '--', ...QUICK_TESTS]),
    timeoutMs: 5 * 60 * 1_000,
  }),
  syntheticAppStates: Object.freeze({
    id: 'synthetic-app-states',
    executable: NPM_EXECUTABLE,
    args: Object.freeze(['test', '--', ...SYNTHETIC_APP_STATE_TESTS]),
    timeoutMs: 6 * 60 * 1_000,
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
  renderedWebglBrowser: Object.freeze({
    id: 'rendered-webgl-browser',
    executable: process.execPath,
    args: Object.freeze([RENDERED_WEBGL_BROWSER_PROBE]),
    networkBoundary: 'self-contained-browser',
    timeoutMs: 9 * 60 * 1_000,
  }),
  sandboxBoundary: Object.freeze({
    id: 'sandbox-boundary',
    executable: process.execPath,
    args: Object.freeze([]),
    timeoutMs: 10 * 1_000,
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
  quick: Object.freeze([
    CHECKS.renderedWebglBrowser,
    CHECKS.sandboxBoundary,
    CHECKS.targetedUnit,
    CHECKS.syntheticAppStates,
    CHECKS.typecheck,
  ]),
  standard: Object.freeze([
    CHECKS.renderedWebglBrowser,
    CHECKS.sandboxBoundary,
    CHECKS.fullUnit,
    CHECKS.typecheck,
    CHECKS.runtimeAssets,
    CHECKS.fileSizes,
  ]),
  deep: Object.freeze([
    CHECKS.renderedWebglBrowser,
    CHECKS.sandboxBoundary,
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
      '/opt/homebrew/bin',
      '/usr/local/bin',
      '/usr/bin',
      '/bin',
    ].join(':'),
    HOME: RUNTIME_HOME,
    // `tsx` and local SpacetimeDB fixtures create Unix IPC below TMPDIR, so
    // temp files and sockets share the one fresh sandbox-authorized namespace.
    TMPDIR: SOCKET_TMP_ROOT,
    LANG: 'en_US.UTF-8',
    CI: '1',
    NO_COLOR: '1',
    // Verification scripts honour this exact binary instead of the mutable
    // `spacetime` launcher, whose lookup is intentionally unavailable inside
    // the isolated runtime HOME.
    SPACETIME_BIN: SPACETIME_CLI,
    // Reviewed local fixtures can create sockets only in this fresh namespace.
    WARPKEEP_QA_SOCKET_TMP: SOCKET_TMP_ROOT,
    npm_config_audit: 'false',
    npm_config_cache: NPM_CACHE,
    npm_config_fund: 'false',
    npm_config_ignore_scripts: 'true',
    npm_config_logs_max: '0',
    npm_config_update_notifier: 'false',
    npm_config_userconfig: '/dev/null',
    GIT_CONFIG_GLOBAL: '/dev/null',
    GIT_CONFIG_NOSYSTEM: '1',
  });
}

async function ensurePrivateDirectory(path) {
  const absolutePath = resolve(path);
  const root = parse(absolutePath).root;
  const relativePath = relative(root, absolutePath);
  if (!relativePath || relativePath.startsWith('..')) throw new Error('Unsafe directory.');
  let current = root;
  for (const segment of relativePath.split('/')) {
    if (!segment || segment === '.' || segment === '..') throw new Error('Unsafe directory.');
    current = join(current, segment);
    let metadata;
    try {
      metadata = await lstat(current);
    } catch (error) {
      if (error?.code !== 'ENOENT') throw new Error('Unsafe directory.');
      try {
        await mkdir(current, { mode: 0o700 });
        metadata = await lstat(current);
      } catch {
        throw new Error('Unsafe directory.');
      }
    }
    if (!metadata.isDirectory() || metadata.isSymbolicLink()) {
      throw new Error('Unsafe directory.');
    }
  }
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

export function qaNetworkSandboxContract(check, options = {}) {
  if (
    check === null
    || typeof check !== 'object'
    || typeof check.executable !== 'string'
    || !check.executable.startsWith('/')
    || !Array.isArray(check.args)
    || check.args.some((argument) => typeof argument !== 'string')
    || ![undefined, 'self-contained-browser'].includes(check.networkBoundary)
  ) throw new TypeError('Invalid QA check command.');
  if (check.networkBoundary === 'self-contained-browser') {
    if (
      check.id !== 'rendered-webgl-browser'
      || check.executable !== process.execPath
      || check.args.length !== 1
      || check.args[0] !== RENDERED_WEBGL_BROWSER_PROBE
    ) throw new TypeError('Invalid self-contained browser boundary.');
    return Object.freeze({
      executable: check.executable,
      args: Object.freeze([...check.args]),
    });
  }
  const platform = options.platform ?? process.platform;
  if (platform !== 'darwin') {
    return Object.freeze({
      executable: check.executable,
      args: Object.freeze([...check.args]),
    });
  }
  const observatoryRoot = options.observatoryRoot ?? OBSERVATORY_ROOT;
  const repositoryRoot = options.repositoryRoot ?? REPOSITORY_ROOT;
  const userHome = options.userHome ?? homedir();
  const spacetimeCliRoot = options.spacetimeCliRoot ?? SPACETIME_CLI_ROOT;
  const runtimeHome = options.runtimeHome ?? RUNTIME_HOME;
  const runtimeTmp = options.runtimeTmp ?? RUNTIME_TMP;
  const npmCache = options.npmCache ?? NPM_CACHE;
  const socketTmpRoot = options.socketTmpRoot ?? SOCKET_TMP_ROOT;
  const buildOutputRoot = options.buildOutputRoot ?? BUILD_OUTPUT_ROOT;
  const rootTscCacheRoot = options.rootTscCacheRoot ?? ROOT_TSC_CACHE_ROOT;
  const rootViteCacheRoot = options.rootViteCacheRoot ?? ROOT_VITE_CACHE_ROOT;
  const rootViteConfigRoot = options.rootViteConfigRoot ?? ROOT_VITE_CONFIG_ROOT;
  const authViteCacheRoot = options.authViteCacheRoot ?? AUTH_VITE_CACHE_ROOT;
  const authViteConfigRoot = options.authViteConfigRoot ?? AUTH_VITE_CONFIG_ROOT;
  const spacetimeDistRoot = options.spacetimeDistRoot ?? SPACETIME_DIST_ROOT;
  const spacetimeV1DistRoot = options.spacetimeV1DistRoot ?? SPACETIME_V1_DIST_ROOT;
  const spacetimeV2DistRoot = options.spacetimeV2DistRoot ?? SPACETIME_V2_DIST_ROOT;
  const spacetimeV3DistRoot = options.spacetimeV3DistRoot ?? SPACETIME_V3_DIST_ROOT;
  for (const path of [
    observatoryRoot,
    repositoryRoot,
    userHome,
    spacetimeCliRoot,
    runtimeHome,
    runtimeTmp,
    npmCache,
    socketTmpRoot,
    buildOutputRoot,
    rootTscCacheRoot,
    rootViteCacheRoot,
    rootViteConfigRoot,
    authViteCacheRoot,
    authViteConfigRoot,
    spacetimeDistRoot,
    spacetimeV1DistRoot,
    spacetimeV2DistRoot,
    spacetimeV3DistRoot,
  ]) {
    if (typeof path !== 'string' || !path.startsWith('/') || path.includes('\0')) {
      throw new TypeError('Invalid QA sandbox path.');
    }
  }
  return Object.freeze({
    executable: SANDBOX_EXECUTABLE,
    args: Object.freeze([
      '-D',
      `OBSERVATORY_ROOT=${observatoryRoot}`,
      '-D',
      `REPOSITORY_ROOT=${repositoryRoot}`,
      '-D',
      `USER_HOME=${userHome}`,
      '-D',
      `SPACETIME_CLI_ROOT=${spacetimeCliRoot}`,
      '-D',
      `RUNTIME_HOME=${runtimeHome}`,
      '-D',
      `RUNTIME_TMP=${runtimeTmp}`,
      '-D',
      `NPM_CACHE=${npmCache}`,
      '-D',
      `SOCKET_TMP_ROOT=${socketTmpRoot}`,
      '-D',
      `BUILD_OUTPUT_ROOT=${buildOutputRoot}`,
      '-D',
      `ROOT_TSC_CACHE_ROOT=${rootTscCacheRoot}`,
      '-D',
      `ROOT_VITE_CACHE_ROOT=${rootViteCacheRoot}`,
      '-D',
      `ROOT_VITE_CONFIG_ROOT=${rootViteConfigRoot}`,
      '-D',
      `AUTH_VITE_CACHE_ROOT=${authViteCacheRoot}`,
      '-D',
      `AUTH_VITE_CONFIG_ROOT=${authViteConfigRoot}`,
      '-D',
      `SPACETIME_DIST_ROOT=${spacetimeDistRoot}`,
      '-D',
      `SPACETIME_V1_DIST_ROOT=${spacetimeV1DistRoot}`,
      '-D',
      `SPACETIME_V2_DIST_ROOT=${spacetimeV2DistRoot}`,
      '-D',
      `SPACETIME_V3_DIST_ROOT=${spacetimeV3DistRoot}`,
      '-f',
      options.profilePath ?? NETWORK_SANDBOX_PROFILE,
      check.executable,
      ...check.args,
    ]),
  });
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
      // A check is complete only when its whole detached process group is
      // gone. Successful commands are not allowed to leave background servers
      // or other descendants carrying the sandbox authority into later checks.
      terminateProcessGroup(child, 'SIGTERM');
      terminateProcessGroup(child, 'SIGKILL');
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
      const command = options.commandContract
        ? options.commandContract(check)
        : qaNetworkSandboxContract(check);
      child = spawn(command.executable, [...command.args], {
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

async function listenBoundarySocket(socketPath) {
  const server = createNetServer((socket) => socket.end());
  await new Promise((resolveListen, rejectListen) => {
    const reject = (error) => {
      server.off('error', reject);
      rejectListen(error);
    };
    server.once('error', reject);
    server.listen(socketPath, () => {
      server.off('error', reject);
      resolveListen();
    });
  });
  await chmod(socketPath, 0o600);
  return server;
}

async function closeBoundarySocket(server) {
  if (!server) return;
  await new Promise((resolveClose) => server.close(() => resolveClose()));
}

async function runSandboxBoundaryCheck(check, timeoutMs) {
  if (check !== CHECKS.sandboxBoundary || process.platform !== 'darwin') {
    throw new Error('Unsupported QA sandbox boundary preflight.');
  }
  const unrelatedRoot = await mkdtemp('/private/tmp/wkqd-');
  const unrelatedSocketPath = join(unrelatedRoot, 'denied.sock');
  let allowedServer;
  let unrelatedServer;
  const privateSentinels = [
    SANDBOX_BOUNDARY_PATHS.auditSentinel,
    SANDBOX_BOUNDARY_PATHS.helperSentinel,
    SANDBOX_BOUNDARY_PATHS.reportSentinel,
  ];
  try {
    await Promise.all([
      ensurePrivateDirectory(AUDIT_DIRECTORY),
      ensurePrivateDirectory(HELPER_DIRECTORY),
      ensurePrivateDirectory(REPORTS_DIRECTORY),
      ensurePrivateDirectory(SOCKET_TMP_ROOT),
    ]);
    await Promise.all(privateSentinels.map((path) => writeFile(
      path,
      'sandbox-boundary\n',
      { encoding: 'utf8', flag: 'wx', mode: 0o600 },
    )));
    allowedServer = await listenBoundarySocket(SANDBOX_BOUNDARY_PATHS.allowedSocket);
    unrelatedServer = await listenBoundarySocket(unrelatedSocketPath);
    return await runCommandCheck(Object.freeze({
      ...check,
      args: Object.freeze(['-e', sandboxBoundaryProgram(unrelatedSocketPath)]),
    }), { timeoutMs });
  } finally {
    await Promise.allSettled([
      closeBoundarySocket(allowedServer),
      closeBoundarySocket(unrelatedServer),
    ]);
    await Promise.all([
      ...privateSentinels.map((path) => rm(path, { force: true })),
      rm(SANDBOX_BOUNDARY_PATHS.allowedFile, { force: true }),
      rm(SANDBOX_BOUNDARY_PATHS.allowedSocket, { force: true }),
      rm(SANDBOX_BOUNDARY_PATHS.sourceProbe, { force: true }),
      rm(unrelatedRoot, { recursive: true, force: true }),
    ]);
  }
}

async function requireOwnerPrivateSocket(socketPath) {
  if (Buffer.byteLength(socketPath, 'utf8') > MAX_UNIX_SOCKET_PATH_BYTES) {
    throw new Error('Unsafe local QA broker socket.');
  }
  const parentPath = dirname(socketPath);
  const expectedUid = typeof process.getuid === 'function' ? process.getuid() : undefined;
  const [parent, socket] = await Promise.all([lstat(parentPath), lstat(socketPath)]);
  if (
    !parent.isDirectory()
    || parent.isSymbolicLink()
    || (expectedUid !== undefined && parent.uid !== expectedUid)
    || (parent.mode & 0o077) !== 0
    || resolve(await realpath(parentPath)) !== resolve(parentPath)
    || !socket.isSocket()
    || socket.isSymbolicLink()
    || (expectedUid !== undefined && socket.uid !== expectedUid)
    || (socket.mode & 0o077) !== 0
  ) throw new Error('Unsafe local QA broker socket.');
}

function headerValue(headers, name) {
  const value = headers[name];
  return Array.isArray(value) ? value.join(',') : value;
}

async function readBrokerJson(path, maximumBytes, options = {}) {
  const socketPath = options.socketPath ?? BROKER_SOCKET_PATH;
  const timeoutMs = options.timeoutMs ?? 5_000;
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 60_000) {
    throw new TypeError('Invalid broker timeout.');
  }
  await requireOwnerPrivateSocket(socketPath);
  return new Promise((resolveJson, rejectJson) => {
    let settled = false;
    let response;
    let timeout;
    let total = 0;
    const chunks = [];
    const finish = (callback) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      callback();
    };
    const request = httpRequest({
      socketPath,
      path,
      method: 'GET',
      headers: { Accept: 'application/json' },
      agent: false,
    }, (incoming) => {
      response = incoming;
      const advertised = headerValue(incoming.headers, 'content-length');
      const contentType = headerValue(incoming.headers, 'content-type');
      if (
        incoming.statusCode !== 200
        || typeof contentType !== 'string'
        || !/^application\/json(?:\s*;\s*charset=utf-8)?$/i.test(contentType)
        || (advertised !== undefined && (
          typeof advertised !== 'string'
          || !/^\d+$/.test(advertised)
          || Number(advertised) > maximumBytes
        ))
      ) {
        incoming.destroy();
        finish(() => rejectJson(new Error('Invalid local QA broker response.')));
        return;
      }
      incoming.on('data', (chunk) => {
        const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
        total += bytes.byteLength;
        if (total > maximumBytes) {
          incoming.destroy();
          finish(() => rejectJson(new Error('Local QA broker response exceeded its bound.')));
          return;
        }
        chunks.push(bytes);
      });
      incoming.once('error', () => finish(() => rejectJson(new Error('Local QA broker response failed.'))));
      incoming.once('end', () => {
        finish(() => {
          try {
            resolveJson(JSON.parse(Buffer.concat(chunks, total).toString('utf8')));
          } catch {
            rejectJson(new Error('Invalid local QA broker response.'));
          }
        });
      });
    });
    timeout = setTimeout(() => {
      request.destroy(new Error('Local QA broker timed out.'));
      response?.destroy();
      finish(() => rejectJson(new Error('Local QA broker timed out.')));
    }, timeoutMs);
    request.once('error', () => finish(() => rejectJson(new Error('Local QA broker is unavailable.'))));
    request.end();
  });
}

export async function probeLocalBrokerHealth(options = {}) {
  const body = await readBrokerJson(BROKER_HEALTH_PATH, 1_024, {
    socketPath: options.socketPath,
    timeoutMs: options.timeoutMs ?? 5_000,
  });
  if (
    body === null
    || typeof body !== 'object'
    || Array.isArray(body)
    || Object.keys(body).sort().join(',') !== 'mode,ok'
    || body.ok !== true
    || body.mode !== 'read-only'
  ) throw new Error('Invalid health response.');
}

export async function probeLocalBrokerSnapshot(options = {}) {
  const body = await readBrokerJson(BROKER_SNAPSHOT_PATH, 256 * 1_024, {
    socketPath: options.socketPath,
    timeoutMs: options.timeoutMs ?? 30_000,
  });
  if (!parseQaObserverSnapshot(body)) throw new Error('Invalid snapshot response.');
}

export async function runQaCycle(options = {}) {
  const startedAt = options.startedAt ?? new Date();
  const requestedTier = options.tier ?? 'auto';
  const tier = requestedTier === 'auto'
    ? tierForLocalHour(startedAt.getHours())
    : requestedTier;
  const checks = checksForTier(tier);
  const usesDefaultExecutor = options.executeCheck === undefined;
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
      const timeoutMs = Math.min(check.timeoutMs, remaining);
      const result = usesDefaultExecutor && check === CHECKS.sandboxBoundary
        ? await runSandboxBoundaryCheck(check, timeoutMs)
        : await execute(check, {
            cwd: REPOSITORY_ROOT,
            timeoutMs,
          });
      results.push(result);
      if (check === CHECKS.sandboxBoundary && result.status !== 'pass') break;
    } catch {
      results.push(Object.freeze({ id: check.id, status: 'fail', durationMs: 0 }));
      if (check === CHECKS.sandboxBoundary) break;
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
  const productionBridgeConfigPath = repositoryRoot === REPOSITORY_ROOT
    ? PRODUCTION_BRIDGE_CONFIG
    : join(repositoryRoot, 'services', 'auth-bridge', 'wrangler.toml');
  const productionBridgeMetadata = await lstat(productionBridgeConfigPath);
  if (
    !productionBridgeMetadata.isFile()
    || productionBridgeMetadata.isSymbolicLink()
    || productionBridgeMetadata.size < 1
    || productionBridgeMetadata.size > PRODUCTION_GATE_MAXIMUM_BYTES
  ) throw new Error('Repository production gate contract mismatch.');
  const productionBridgeConfig = await readFile(productionBridgeConfigPath, 'utf8');
  const activeLines = productionBridgeConfig
    .split('\n')
    .map((line) => line.trimStart())
    .filter((line) => line.length > 0 && !line.startsWith('#'));
  let currentTable = '';
  const occurrences = new Map(EXPECTED_DISABLED_PRODUCTION_GATES.map(({ key }) => [key, []]));
  for (const line of activeLines) {
    if (line.startsWith('[')) currentTable = line.trimEnd();
    for (const { key } of EXPECTED_DISABLED_PRODUCTION_GATES) {
      if (line.includes(key)) occurrences.get(key).push({ line, table: currentTable });
    }
    if (FORBIDDEN_QA_REGISTRATION_KEYS.some((key) => line.includes(key))) {
      throw new Error('Repository production gate contract mismatch.');
    }
  }
  for (const { key, line } of EXPECTED_DISABLED_PRODUCTION_GATES) {
    const matches = occurrences.get(key);
    if (
      matches.length !== 1
      || matches[0].line !== line
      || matches[0].table !== '[vars]'
    ) throw new Error('Repository production gate contract mismatch.');
  }
  const profilePath = join(
    repositoryRoot,
    'scripts',
    'qa-observer',
    'qa-cycle-network.sb',
  );
  const profileMetadata = await lstat(profilePath);
  if (
    !profileMetadata.isFile()
    || profileMetadata.isSymbolicLink()
    || profileMetadata.size !== Buffer.byteLength(EXPECTED_NETWORK_SANDBOX_PROFILE)
    || await readFile(profilePath, 'utf8') !== EXPECTED_NETWORK_SANDBOX_PROFILE
  ) throw new Error('Repository network sandbox contract mismatch.');

  if (process.platform === 'darwin') {
    const sandboxMetadata = await lstat(SANDBOX_EXECUTABLE);
    if (
      !sandboxMetadata.isFile()
      || sandboxMetadata.isSymbolicLink()
      || sandboxMetadata.uid !== 0
      || (sandboxMetadata.mode & 0o022) !== 0
    ) throw new Error('System network sandbox is unavailable.');
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
      ensurePrivateDirectory(SOCKET_TMP_ROOT),
      ensurePrivateDirectory(BUILD_OUTPUT_ROOT),
      ensurePrivateDirectory(ROOT_TSC_CACHE_ROOT),
      ensurePrivateDirectory(ROOT_VITE_CACHE_ROOT),
      ensurePrivateDirectory(ROOT_VITE_CONFIG_ROOT),
      ensurePrivateDirectory(AUTH_VITE_CACHE_ROOT),
      ensurePrivateDirectory(AUTH_VITE_CONFIG_ROOT),
      ensurePrivateDirectory(SPACETIME_DIST_ROOT),
      ensurePrivateDirectory(SPACETIME_V1_DIST_ROOT),
      ensurePrivateDirectory(SPACETIME_V2_DIST_ROOT),
      ensurePrivateDirectory(SPACETIME_V3_DIST_ROOT),
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
