import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  closeSync,
  constants,
  fstatSync,
  lstatSync,
  openSync,
  readFileSync,
  realpathSync,
} from 'node:fs';
import { userInfo } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const GENESIS001_ADMISSION_MONITOR_CURRENT_STATE_PROFILE =
  'warpkeep-genesis001-admission-monitor-current-state-v1';
export const GENESIS001_ADMISSION_MONITOR_LABEL =
  'com.warpkeep.hermes-admission-monitor';
export const EXPECTED_MONITOR_PLIST_SHA256 =
  'a85b1eb4810ed798185f762044d3dac9d29ebee15a09b95bfb2ddbb6de71acaf';
export const EXPECTED_MONITOR_PROGRAM_SHA256 =
  '1479a2b5fff85d15f8c04175962dfb898023d14cf418e27b7c1332202cb56de6';

const COMMIT = /^[0-9a-f]{40}$/u;
const SYSTEM_GIT = '/usr/bin/git';
const CANONICAL_ORIGIN_URL = 'https://github.com/ael-dev3/Warpkeep.git';
const SYSTEM_LAUNCHCTL = '/bin/launchctl';
const SYSTEM_PLUTIL = '/usr/bin/plutil';
const CHILD_ENVIRONMENT = Object.freeze({
  GIT_CONFIG_GLOBAL: '/dev/null',
  GIT_CONFIG_NOSYSTEM: '1',
  GIT_CONFIG_SYSTEM: '/dev/null',
  GIT_ASKPASS: '/usr/bin/false',
  GIT_NO_REPLACE_OBJECTS: '1',
  GIT_TERMINAL_PROMPT: '0',
  LANG: 'C',
  LC_ALL: 'C',
  PATH: '/usr/bin:/bin',
});

export class Genesis001AdmissionMonitorCurrentStateError extends Error {
  constructor(code, options) {
    super(code, options);
    this.name = 'Genesis001AdmissionMonitorCurrentStateError';
    this.code = code;
  }
}

function fail(code, cause) {
  throw new Genesis001AdmissionMonitorCurrentStateError(
    code,
    cause === undefined ? undefined : { cause },
  );
}

function assertExactSnapshot(snapshot) {
  if (
    snapshot === null
    || typeof snapshot !== 'object'
    || Array.isArray(snapshot)
    || Object.getPrototypeOf(snapshot) !== Object.prototype
    || JSON.stringify(Reflect.ownKeys(snapshot)) !== JSON.stringify([
      'label',
      'domain',
      'disabled',
      'loaded',
      'plistSha256',
      'programSha256',
    ])
    || Object.values(Object.getOwnPropertyDescriptors(snapshot)).some(
      descriptor => !('value' in descriptor) || descriptor.enumerable !== true,
    )
    || snapshot.label !== GENESIS001_ADMISSION_MONITOR_LABEL
    || !/^gui\/[1-9][0-9]*$/u.test(snapshot.domain ?? '')
    || typeof snapshot.disabled !== 'boolean'
    || typeof snapshot.loaded !== 'boolean'
    || snapshot.plistSha256 !== EXPECTED_MONITOR_PLIST_SHA256
    || snapshot.programSha256 !== EXPECTED_MONITOR_PROGRAM_SHA256
  ) fail('GENESIS_001_ADMISSION_MONITOR_CURRENT_STATE_TARGET_INVALID');
  return snapshot;
}

function createCurrentStateReceipt(snapshot, sourceCommit, observedAt) {
  const exact = assertExactSnapshot(snapshot);
  if (!COMMIT.test(sourceCommit ?? '')) {
    fail('GENESIS_001_ADMISSION_MONITOR_CURRENT_STATE_SOURCE_INVALID');
  }
  if (!(observedAt instanceof Date) || !Number.isFinite(observedAt.getTime())) {
    fail('GENESIS_001_ADMISSION_MONITOR_CURRENT_STATE_TIMESTAMP_INVALID');
  }
  return Object.freeze({
    schemaVersion: 1,
    profile: GENESIS001_ADMISSION_MONITOR_CURRENT_STATE_PROFILE,
    realmId: 'GENESIS_001',
    release: '0.3.43',
    sourceCommit,
    observedAt: observedAt.toISOString(),
    label: GENESIS001_ADMISSION_MONITOR_LABEL,
    disabled: exact.disabled,
    loaded: exact.loaded,
    monitorPlistSha256: EXPECTED_MONITOR_PLIST_SHA256,
    monitorProgramSha256: EXPECTED_MONITOR_PROGRAM_SHA256,
  });
}

export function createGenesis001AdmissionMonitorCurrentStateReceiptForTesting(
  snapshot,
  sourceCommit,
  observedAt,
) {
  if (process.env.NODE_ENV !== 'test') {
    fail('GENESIS_001_ADMISSION_MONITOR_CURRENT_STATE_TEST_TIME_FORBIDDEN');
  }
  return createCurrentStateReceipt(snapshot, sourceCommit, observedAt);
}

export function parseGenesis001AdmissionMonitorDisabledState(output) {
  if (typeof output !== 'string') {
    fail('GENESIS_001_ADMISSION_MONITOR_CURRENT_STATE_DISABLED_UNAVAILABLE');
  }
  const escaped = GENESIS001_ADMISSION_MONITOR_LABEL
    .replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
  const pattern = new RegExp(
    `^\\s*"${escaped}"\\s*=>\\s*(enabled|disabled)\\s*$`,
    'u',
  );
  const matches = output.split(/\r?\n/u)
    .map(line => pattern.exec(line))
    .filter(match => match !== null);
  if (matches.length !== 1) {
    fail(matches.length === 0
      ? 'GENESIS_001_ADMISSION_MONITOR_CURRENT_STATE_DISABLED_UNAVAILABLE'
      : 'GENESIS_001_ADMISSION_MONITOR_CURRENT_STATE_DISABLED_AMBIGUOUS');
  }
  return matches[0][1] === 'disabled';
}

function exactChild(
  executable,
  arguments_,
  allowMissingLaunchService = false,
  input,
) {
  const result = spawnSync(executable, [...arguments_], {
    encoding: 'utf8',
    env: CHILD_ENVIRONMENT,
    maxBuffer: 1_000_000,
    timeout: 15_000,
    input,
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  if (
    result.error === undefined
    && result.signal === null
    && result.status === 0
    && typeof result.stdout === 'string'
    && typeof result.stderr === 'string'
    && result.stderr === ''
  ) return result.stdout;
  if (
    allowMissingLaunchService
    && result.error === undefined
    && result.signal === null
    && typeof result.status === 'number'
    && result.status !== 0
    && result.stdout === ''
    && typeof result.stderr === 'string'
    && /^Could not find service[^\r\n]*(?:\r?\n)?$/u.test(result.stderr)
  ) return '__WARPKEEP_SERVICE_NOT_LOADED__';
  fail('GENESIS_001_ADMISSION_MONITOR_CURRENT_STATE_CHILD_FAILED', result.error);
}

function inspectExactFile(path, expectedMode, expectedSha256, maximumBytes) {
  let descriptor;
  let body;
  try {
    if (realpathSync(path) !== resolve(path)) {
      fail('GENESIS_001_ADMISSION_MONITOR_CURRENT_STATE_FILE_INVALID');
    }
    const byPathBefore = lstatSync(path, { bigint: true });
    descriptor = openSync(path, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
    const before = fstatSync(descriptor, { bigint: true });
    if (
      byPathBefore.isSymbolicLink()
      || !before.isFile()
      || before.uid !== BigInt(process.getuid?.() ?? -1)
      || before.nlink !== 1n
      || (before.mode & 0o7777n) !== BigInt(expectedMode)
      || before.size < 1n
      || before.size > BigInt(maximumBytes)
      || byPathBefore.dev !== before.dev
      || byPathBefore.ino !== before.ino
    ) fail('GENESIS_001_ADMISSION_MONITOR_CURRENT_STATE_FILE_INVALID');
    body = readFileSync(descriptor);
    const after = fstatSync(descriptor, { bigint: true });
    const byPathAfter = lstatSync(path, { bigint: true });
    const sha256 = createHash('sha256').update(body).digest('hex');
    if (
      after.dev !== before.dev
      || after.ino !== before.ino
      || after.mode !== before.mode
      || after.uid !== before.uid
      || after.nlink !== before.nlink
      || after.size !== before.size
      || after.mtimeNs !== before.mtimeNs
      || after.ctimeNs !== before.ctimeNs
      || byPathAfter.isSymbolicLink()
      || byPathAfter.dev !== before.dev
      || byPathAfter.ino !== before.ino
      || byPathAfter.mode !== before.mode
      || byPathAfter.uid !== before.uid
      || byPathAfter.nlink !== before.nlink
      || byPathAfter.size !== before.size
      || byPathAfter.mtimeNs !== before.mtimeNs
      || byPathAfter.ctimeNs !== before.ctimeNs
      || sha256 !== expectedSha256
    ) fail('GENESIS_001_ADMISSION_MONITOR_CURRENT_STATE_FILE_CHANGED');
    return Object.freeze({
      body,
      sha256,
      identity: Object.freeze({
        dev: before.dev,
        ino: before.ino,
        mode: before.mode,
        uid: before.uid,
        nlink: before.nlink,
        size: before.size,
        mtimeNs: before.mtimeNs,
        ctimeNs: before.ctimeNs,
      }),
    });
  } catch (error) {
    body?.fill(0);
    if (error instanceof Genesis001AdmissionMonitorCurrentStateError) throw error;
    fail('GENESIS_001_ADMISSION_MONITOR_CURRENT_STATE_FILE_INVALID', error);
  } finally {
    if (descriptor !== undefined) closeSync(descriptor);
  }
}

function sameFileIdentity(left, right) {
  return [
    'dev',
    'ino',
    'mode',
    'uid',
    'nlink',
    'size',
    'mtimeNs',
    'ctimeNs',
  ].every(key => left[key] === right[key]);
}

function exactMonitorPaths() {
  if (process.platform !== 'darwin' || process.getuid === undefined) {
    fail('GENESIS_001_ADMISSION_MONITOR_CURRENT_STATE_PLATFORM_INVALID');
  }
  const home = resolve(userInfo().homedir);
  if (realpathSync(home) !== home) {
    fail('GENESIS_001_ADMISSION_MONITOR_CURRENT_STATE_HOME_INVALID');
  }
  return Object.freeze({
    plist: join(home, 'Library', 'LaunchAgents', `${GENESIS001_ADMISSION_MONITOR_LABEL}.plist`),
    program: join(home, '.hermes', 'scripts', 'warpkeep_admission_monitor.py'),
  });
}

function inspectLiveMonitor() {
  const paths = exactMonitorPaths();
  const plist = inspectExactFile(
    paths.plist,
    0o600,
    EXPECTED_MONITOR_PLIST_SHA256,
    64 * 1024,
  );
  const program = inspectExactFile(
    paths.program,
    0o700,
    EXPECTED_MONITOR_PROGRAM_SHA256,
    256 * 1024,
  );
  let postQueryPlist;
  let postQueryProgram;
  try {
    const parsed = JSON.parse(exactChild(SYSTEM_PLUTIL, [
      '-convert',
      'json',
      '-o',
      '-',
      '--',
      '-',
    ], false, plist.body));
    if (
      parsed.Label !== GENESIS001_ADMISSION_MONITOR_LABEL
      || JSON.stringify(parsed.ProgramArguments) !== JSON.stringify([
        paths.program,
        'loop',
        '--interval',
        '60',
      ])
    ) fail('GENESIS_001_ADMISSION_MONITOR_CURRENT_STATE_PLIST_INVALID');
    const uid = process.getuid();
    const domain = `gui/${uid}`;
    const disabled = parseGenesis001AdmissionMonitorDisabledState(
      exactChild(SYSTEM_LAUNCHCTL, ['print-disabled', domain]),
    );
    const loaded = exactChild(
      SYSTEM_LAUNCHCTL,
      ['print', `${domain}/${GENESIS001_ADMISSION_MONITOR_LABEL}`],
      true,
    ) !== '__WARPKEEP_SERVICE_NOT_LOADED__';
    postQueryPlist = inspectExactFile(
      paths.plist,
      0o600,
      EXPECTED_MONITOR_PLIST_SHA256,
      64 * 1024,
    );
    postQueryProgram = inspectExactFile(
      paths.program,
      0o700,
      EXPECTED_MONITOR_PROGRAM_SHA256,
      256 * 1024,
    );
    if (
      !sameFileIdentity(plist.identity, postQueryPlist.identity)
      || !sameFileIdentity(program.identity, postQueryProgram.identity)
    ) fail('GENESIS_001_ADMISSION_MONITOR_CURRENT_STATE_TARGET_CHANGED');
    return Object.freeze({
      label: GENESIS001_ADMISSION_MONITOR_LABEL,
      domain,
      disabled,
      loaded,
      plistSha256: postQueryPlist.sha256,
      programSha256: postQueryProgram.sha256,
    });
  } catch (error) {
    if (error instanceof Genesis001AdmissionMonitorCurrentStateError) throw error;
    fail('GENESIS_001_ADMISSION_MONITOR_CURRENT_STATE_PLIST_INVALID', error);
  } finally {
    plist.body.fill(0);
    program.body.fill(0);
    postQueryPlist?.body.fill(0);
    postQueryProgram?.body.fill(0);
  }
}

function exactGit(arguments_, allowFailure = false) {
  const repository = resolve(dirname(fileURLToPath(import.meta.url)), '..');
  const result = spawnSync(SYSTEM_GIT, [
    '--no-optional-locks',
    '-c',
    'core.fsmonitor=false',
    '-c',
    'core.untrackedCache=false',
    '-c',
    'http.proxy=',
    '-c',
    'http.sslVerify=true',
    '-c',
    'credential.helper=',
    '-C',
    repository,
    ...arguments_,
  ], {
    encoding: 'utf8',
    env: CHILD_ENVIRONMENT,
    maxBuffer: 1_000_000,
    timeout: 30_000,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  if (
    result.error !== undefined
    || result.signal !== null
    || typeof result.status !== 'number'
    || typeof result.stdout !== 'string'
    || typeof result.stderr !== 'string'
    || (!allowFailure && (result.status !== 0 || result.stderr !== ''))
  ) fail('GENESIS_001_ADMISSION_MONITOR_CURRENT_STATE_SOURCE_INVALID', result.error);
  return Object.freeze({
    status: result.status,
    stdout: result.stdout.trim(),
    stderr: result.stderr.trim(),
    repository,
  });
}

function exactLocalGitConfiguration() {
  const source = exactGit(['config', '--local', '--null', '--list']).stdout;
  const records = source.split('\0');
  if (records.at(-1) !== '') {
    fail('GENESIS_001_ADMISSION_MONITOR_CURRENT_STATE_SOURCE_INVALID');
  }
  records.pop();
  const seen = new Set();
  const required = new Map([
    ['core.repositoryformatversion', '0'],
    ['core.filemode', 'true'],
    ['core.bare', 'false'],
    ['core.logallrefupdates', 'true'],
    ['core.ignorecase', 'true'],
    ['core.precomposeunicode', 'true'],
    ['remote.origin.url', CANONICAL_ORIGIN_URL],
    ['remote.origin.fetch', '+refs/heads/*:refs/remotes/origin/*'],
  ]);
  for (const record of records) {
    const separator = record.indexOf('\n');
    if (separator < 1 || separator !== record.lastIndexOf('\n')) {
      fail('GENESIS_001_ADMISSION_MONITOR_CURRENT_STATE_SOURCE_INVALID');
    }
    const key = record.slice(0, separator);
    const value = record.slice(separator + 1);
    if (seen.has(key)) {
      fail('GENESIS_001_ADMISSION_MONITOR_CURRENT_STATE_SOURCE_INVALID');
    }
    seen.add(key);
    if (required.has(key)) {
      if (required.get(key) !== value) {
        fail('GENESIS_001_ADMISSION_MONITOR_CURRENT_STATE_SOURCE_INVALID');
      }
      continue;
    }
    const branch = /^branch\.([A-Za-z0-9][A-Za-z0-9._/-]{0,199})\.(remote|merge)$/u
      .exec(key);
    if (
      branch === null
      || (branch[2] === 'remote' && value !== 'origin')
      || (branch[2] === 'merge'
        && !/^refs\/heads\/[A-Za-z0-9][A-Za-z0-9._/-]{0,199}$/u.test(value))
    ) fail('GENESIS_001_ADMISSION_MONITOR_CURRENT_STATE_SOURCE_INVALID');
  }
  if ([...required.keys()].some(key => !seen.has(key))) {
    fail('GENESIS_001_ADMISSION_MONITOR_CURRENT_STATE_SOURCE_INVALID');
  }
  return source;
}

function attestProtectedPreparationSource(sourceCommit) {
  if (!COMMIT.test(sourceCommit ?? '')) {
    fail('GENESIS_001_ADMISSION_MONITOR_CURRENT_STATE_SOURCE_INVALID');
  }
  const localConfiguration = exactLocalGitConfiguration();
  const root = exactGit(['rev-parse', '--show-toplevel']);
  const head = exactGit(['rev-parse', '--verify', 'HEAD^{commit}']);
  const remote = exactGit([
    'rev-parse',
    '--verify',
    'refs/remotes/origin/main',
  ]);
  const dirty = exactGit([
    'status',
    '--porcelain=v1',
    '--untracked-files=all',
  ]);
  const origin = exactGit(['remote', 'get-url', 'origin']);
  const remoteHead = exactGit([
    'ls-remote',
    '--refs',
    CANONICAL_ORIGIN_URL,
    'refs/heads/main',
  ]);
  const tracked = exactGit(['ls-files', '-v', '-z']);
  const trackedEntries = tracked.stdout.split('\0');
  if (trackedEntries.at(-1) !== '') {
    fail('GENESIS_001_ADMISSION_MONITOR_CURRENT_STATE_SOURCE_INVALID');
  }
  trackedEntries.pop();
  const symbolic = exactGit(['symbolic-ref', '-q', 'HEAD'], true);
  if (
    realpathSync(root.stdout) !== realpathSync(root.repository)
    || head.stdout !== sourceCommit
    || remote.stdout !== sourceCommit
    || origin.stdout !== CANONICAL_ORIGIN_URL
    || remoteHead.stdout !== `${sourceCommit}\trefs/heads/main`
    || dirty.stdout !== ''
    || trackedEntries.length < 1
    || trackedEntries.some(entry => !entry.startsWith('H '))
    || symbolic.status === 0
    || symbolic.stdout !== ''
    || symbolic.stderr !== ''
    || exactLocalGitConfiguration() !== localConfiguration
  ) fail('GENESIS_001_ADMISSION_MONITOR_CURRENT_STATE_SOURCE_INVALID');
}

function parseArguments(arguments_) {
  const [command, sourceFlag, sourceCommit] = arguments_;
  if (
    arguments_.length !== 3
    || command !== 'inspect'
    || sourceFlag !== '--source-commit'
    || !COMMIT.test(sourceCommit ?? '')
  ) fail('GENESIS_001_ADMISSION_MONITOR_CURRENT_STATE_ARGUMENTS_INVALID');
  return sourceCommit;
}

async function main() {
  const sourceCommit = parseArguments(process.argv.slice(2));
  attestProtectedPreparationSource(sourceCommit);
  const snapshot = inspectLiveMonitor();
  const receipt = createCurrentStateReceipt(snapshot, sourceCommit, new Date());
  process.stdout.write(`${JSON.stringify(receipt)}\n`);
}

const invoked = process.argv[1] === undefined
  ? undefined
  : pathToFileURL(resolve(process.argv[1])).href;
if (invoked === import.meta.url) {
  main().catch(error => {
    process.stderr.write(`${
      error instanceof Genesis001AdmissionMonitorCurrentStateError
        ? error.code
        : 'GENESIS_001_ADMISSION_MONITOR_CURRENT_STATE_FAILED'
    }\n`);
    process.exitCode = 1;
  });
}
