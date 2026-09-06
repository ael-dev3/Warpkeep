import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';

export const CURRENT_SNAPSHOT_WSL_PATH = 'C:/Windows/System32/wsl.exe';
const PREPARED_NODE_PATH = [
  '/home/snapmeter/.warpkeep/release-preparation-v1/toolchain',
  'node-v22.22.3-linux-x64/bin/node',
].join('/');
const WSL_PREFIX = Object.freeze([
  '--distribution', 'Ubuntu-24.04', '--user', 'snapmeter', '--',
]);
const CLEAN_PREFIX = Object.freeze([
  '/usr/bin/env', '-i', 'LANG=C.UTF-8', 'LC_ALL=C.UTF-8',
]);

export class CurrentSnapshotHarnessError extends Error {
  constructor(code) {
    super(code);
    this.name = 'CurrentSnapshotHarnessError';
    this.code = code;
  }
}

export function runBoundedNativeProcess(executable, args, options) {
  const timeoutMs = options?.timeoutMs;
  if (typeof executable !== 'string' || executable.length === 0
      || !Array.isArray(args) || args.some(argument => typeof argument !== 'string')
      || !Number.isSafeInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 60_000) {
    throw new CurrentSnapshotHarnessError('CURRENT_SNAPSHOT_HARNESS_ARGUMENTS_INVALID');
  }
  const result = spawnSync(executable, args, {
    cwd: options.cwd,
    env: options.env,
    encoding: 'utf8',
    killSignal: 'SIGKILL',
    maxBuffer: 1024 * 1024,
    shell: false,
    stdio: ['ignore', 'pipe', 'pipe'],
    timeout: timeoutMs,
    windowsHide: true,
  });
  if (result.error?.code === 'ETIMEDOUT') {
    throw new CurrentSnapshotHarnessError('CURRENT_SNAPSHOT_HARNESS_TIMEOUT');
  }
  if (result.error !== undefined) {
    throw new CurrentSnapshotHarnessError('CURRENT_SNAPSHOT_HARNESS_LAUNCH_FAILED');
  }
  if (result.status !== 0 || result.signal !== null) {
    throw new CurrentSnapshotHarnessError('CURRENT_SNAPSHOT_HARNESS_PROCESS_FAILED');
  }
  return Object.freeze({ stdout: result.stdout, stderr: result.stderr });
}

export function selectCurrentSnapshotSecurityEligibility(input = {}) {
  const platform = input.platform ?? process.platform;
  if (platform !== 'win32') return Object.freeze({ eligible: false, reason: 'WINDOWS_WSL_REQUIRED' });
  const launcherExists = input.launcherExists ?? existsSync(CURRENT_SNAPSHOT_WSL_PATH);
  if (!launcherExists) {
    return Object.freeze({ eligible: false, reason: 'FIXED_WSL_LAUNCHER_MISSING' });
  }
  const probe = input.probe ?? (() => runBoundedNativeProcess(CURRENT_SNAPSHOT_WSL_PATH, [
    ...WSL_PREFIX,
    '/usr/bin/timeout', '--signal=KILL', '5s',
    ...CLEAN_PREFIX, PREPARED_NODE_PATH, '--version',
  ], { timeoutMs: 10_000 }));
  let result;
  try { result = probe(); }
  catch (error) {
    return Object.freeze({
      eligible: false,
      reason: error?.code === 'CURRENT_SNAPSHOT_HARNESS_TIMEOUT'
        ? 'PREPARED_WSL_RUNTIME_PROBE_TIMEOUT'
        : 'PREPARED_WSL_RUNTIME_UNAVAILABLE',
    });
  }
  if (result.stdout !== 'v22.22.3\n' || result.stderr !== '') {
    return Object.freeze({ eligible: false, reason: 'PREPARED_WSL_NODE_VERSION_INVALID' });
  }
  return Object.freeze({ eligible: true });
}

export function runCurrentSnapshotSecurityFixture(fixturePath) {
  return runBoundedNativeProcess(CURRENT_SNAPSHOT_WSL_PATH, [
    ...WSL_PREFIX,
    '/usr/bin/timeout', '--signal=KILL', '25s',
    ...CLEAN_PREFIX, PREPARED_NODE_PATH, fixturePath,
  ], { timeoutMs: 30_000 });
}
