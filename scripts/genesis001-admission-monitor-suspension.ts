import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  closeSync,
  constants,
  fchmodSync,
  fstatSync,
  fsyncSync,
  lstatSync,
  openSync,
  readFileSync,
  realpathSync,
  writeFileSync,
} from 'node:fs';
import { userInfo } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const GENESIS001_ADMISSION_MONITOR_SUSPENSION_PROFILE =
  'warpkeep-genesis001-admission-monitor-suspension-v1';
export const GENESIS001_ADMISSION_MONITOR_LABEL =
  'com.warpkeep.hermes-admission-monitor';
export const EXPECTED_MONITOR_PLIST_SHA256 =
  'a85b1eb4810ed798185f762044d3dac9d29ebee15a09b95bfb2ddbb6de71acaf';
export const EXPECTED_MONITOR_PROGRAM_SHA256 =
  '1479a2b5fff85d15f8c04175962dfb898023d14cf418e27b7c1332202cb56de6';

const SOURCE_COMMIT_PATTERN = /^[0-9a-f]{40}$/u;
const RECEIPT_SHA256_PATTERN = /^[0-9a-f]{64}$/u;
const RECEIPT_BASENAME_PATTERN =
  /^genesis001-admission-monitor-suspended-[0-9]{8}T[0-9]{9}Z-[0-9a-f]{12}\.json$/u;
const SYSTEM_LAUNCHCTL = '/bin/launchctl';
const SYSTEM_GIT = '/usr/bin/git';
const SYSTEM_PLUTIL = '/usr/bin/plutil';
const CHILD_ENV = Object.freeze({
  LANG: 'C',
  LC_ALL: 'C',
  PATH: '/usr/bin:/bin',
});

export class Genesis001AdmissionMonitorSuspensionError extends Error {
  constructor(readonly code: string, options?: ErrorOptions) {
    super(code, options);
    this.name = 'Genesis001AdmissionMonitorSuspensionError';
  }
}

function fail(code: string, cause?: unknown): never {
  throw new Genesis001AdmissionMonitorSuspensionError(
    code,
    cause === undefined ? undefined : { cause },
  );
}

export type Genesis001AdmissionMonitorSnapshot = Readonly<{
  label: string;
  domain: string;
  disabled: boolean;
  loaded: boolean;
  plistSha256: string;
  programSha256: string;
}>;

type SuspensionReceipt = Readonly<{
  profile: typeof GENESIS001_ADMISSION_MONITOR_SUSPENSION_PROFILE;
  realmId: 'GENESIS_001';
  release: '0.3.43';
  sourceCommit: string;
  label: typeof GENESIS001_ADMISSION_MONITOR_LABEL;
  disabled: true;
  loaded: false;
  monitorPlistSha256: typeof EXPECTED_MONITOR_PLIST_SHA256;
  monitorProgramSha256: typeof EXPECTED_MONITOR_PROGRAM_SHA256;
  suspendedAt: string;
}>;

type SuspensionDependencies = Readonly<{
  sourceCommit: string;
  now?: Date;
  inspect: () => Genesis001AdmissionMonitorSnapshot | Promise<Genesis001AdmissionMonitorSnapshot>;
  disable: () => void | Promise<void>;
  bootout: () => void | Promise<void>;
  writeReceipt: (
    body: string,
  ) => Readonly<{ basename: string; sha256: string }> | Promise<Readonly<{
    basename: string;
    sha256: string;
  }>>;
}>;

function assertExactTarget(snapshot: Genesis001AdmissionMonitorSnapshot): void {
  if (
    snapshot.label !== GENESIS001_ADMISSION_MONITOR_LABEL
    || !/^gui\/[1-9][0-9]*$/u.test(snapshot.domain)
    || typeof snapshot.disabled !== 'boolean'
    || typeof snapshot.loaded !== 'boolean'
    || snapshot.plistSha256 !== EXPECTED_MONITOR_PLIST_SHA256
    || snapshot.programSha256 !== EXPECTED_MONITOR_PROGRAM_SHA256
  ) fail('GENESIS_001_ADMISSION_MONITOR_TARGET_INVALID');
}

function assertSameTarget(
  expected: Genesis001AdmissionMonitorSnapshot,
  actual: Genesis001AdmissionMonitorSnapshot,
): void {
  if (
    actual.label !== expected.label
    || actual.domain !== expected.domain
    || actual.plistSha256 !== expected.plistSha256
    || actual.programSha256 !== expected.programSha256
  ) fail('GENESIS_001_ADMISSION_MONITOR_TARGET_CHANGED');
  assertExactTarget(actual);
}

function stableSuspendedState(
  expected: Genesis001AdmissionMonitorSnapshot,
  actual: Genesis001AdmissionMonitorSnapshot,
): void {
  assertSameTarget(expected, actual);
  if (!actual.disabled || actual.loaded) {
    fail('GENESIS_001_ADMISSION_MONITOR_NOT_SUSPENDED');
  }
}

function canonicalReceiptBody(receipt: SuspensionReceipt): string {
  return `${JSON.stringify(receipt)}\n`;
}

export async function runGenesis001AdmissionMonitorSuspension(
  dependencies: SuspensionDependencies,
): Promise<Readonly<{
  profile: typeof GENESIS001_ADMISSION_MONITOR_SUSPENSION_PROFILE;
  receiptBasename: string;
  receiptSha256: string;
}>> {
  if (!SOURCE_COMMIT_PATTERN.test(dependencies.sourceCommit)) {
    fail('GENESIS_001_ADMISSION_MONITOR_SOURCE_COMMIT_INVALID');
  }
  const before = await dependencies.inspect();
  assertExactTarget(before);
  let current = before;

  if (!current.disabled) {
    let disableError: unknown;
    try {
      await dependencies.disable();
    } catch (error) {
      disableError = error;
    }
    current = await dependencies.inspect();
    assertSameTarget(before, current);
    if (!current.disabled) {
      fail('GENESIS_001_ADMISSION_MONITOR_DISABLE_FAILED', disableError);
    }
  }

  if (current.loaded) {
    let bootoutError: unknown;
    try {
      await dependencies.bootout();
    } catch (error) {
      bootoutError = error;
    }
    current = await dependencies.inspect();
    assertSameTarget(before, current);
    if (current.loaded) {
      fail('GENESIS_001_ADMISSION_MONITOR_BOOTOUT_FAILED', bootoutError);
    }
  }

  stableSuspendedState(before, current);
  const final = await dependencies.inspect();
  stableSuspendedState(before, final);
  if (final.disabled !== current.disabled || final.loaded !== current.loaded) {
    fail('GENESIS_001_ADMISSION_MONITOR_STATE_UNSTABLE');
  }

  const now = dependencies.now ?? new Date();
  if (!Number.isFinite(now.getTime())) {
    fail('GENESIS_001_ADMISSION_MONITOR_TIMESTAMP_INVALID');
  }
  const receipt: SuspensionReceipt = Object.freeze({
    disabled: true,
    label: GENESIS001_ADMISSION_MONITOR_LABEL,
    loaded: false,
    monitorPlistSha256: EXPECTED_MONITOR_PLIST_SHA256,
    monitorProgramSha256: EXPECTED_MONITOR_PROGRAM_SHA256,
    profile: GENESIS001_ADMISSION_MONITOR_SUSPENSION_PROFILE,
    realmId: 'GENESIS_001',
    release: '0.3.43',
    sourceCommit: dependencies.sourceCommit,
    suspendedAt: now.toISOString(),
  });
  const body = canonicalReceiptBody(receipt);
  const expectedSha256 = createHash('sha256').update(body).digest('hex');
  const written = await dependencies.writeReceipt(body);
  if (
    !RECEIPT_SHA256_PATTERN.test(written.sha256)
    || written.sha256 !== expectedSha256
    || !/^[A-Za-z0-9._-]{1,255}$/u.test(written.basename)
    || basename(written.basename) !== written.basename
  ) fail('GENESIS_001_ADMISSION_MONITOR_RECEIPT_INVALID');
  return Object.freeze({
    profile: GENESIS001_ADMISSION_MONITOR_SUSPENSION_PROFILE,
    receiptBasename: written.basename,
    receiptSha256: written.sha256,
  });
}

export function parseLaunchctlDisabledOutput(output: string, label: string): boolean {
  const escaped = label.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
  const pattern = new RegExp(`^\\s*"${escaped}"\\s*=>\\s*(enabled|disabled)\\s*$`, 'u');
  const matches = output.split(/\r?\n/u)
    .map(line => pattern.exec(line))
    .filter((match): match is RegExpExecArray => match !== null);
  if (matches.length === 0) {
    fail('GENESIS_001_ADMISSION_MONITOR_DISABLED_STATE_UNAVAILABLE');
  }
  if (matches.length !== 1) {
    fail('GENESIS_001_ADMISSION_MONITOR_DISABLED_STATE_AMBIGUOUS');
  }
  return matches[0]![1] === 'disabled';
}

type ExactFile = Readonly<{ sha256: string; body: Buffer }>;

function inspectExactFile(
  path: string,
  expectedMode: number,
  expectedSha256: string,
  maximumBytes: number,
): ExactFile {
  let descriptor: number | undefined;
  try {
    if (realpathSync(path) !== resolve(path)) {
      fail('GENESIS_001_ADMISSION_MONITOR_FILE_INVALID');
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
    ) fail('GENESIS_001_ADMISSION_MONITOR_FILE_INVALID');
    const body = readFileSync(descriptor);
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
    ) {
      body.fill(0);
      fail('GENESIS_001_ADMISSION_MONITOR_FILE_CHANGED');
    }
    return Object.freeze({ sha256, body });
  } catch (error) {
    if (error instanceof Genesis001AdmissionMonitorSuspensionError) throw error;
    fail('GENESIS_001_ADMISSION_MONITOR_FILE_INVALID', error);
  } finally {
    if (descriptor !== undefined) closeSync(descriptor);
  }
  fail('GENESIS_001_ADMISSION_MONITOR_FILE_INVALID');
}

function exactChild(
  executable: string,
  arguments_: readonly string[],
  options: Readonly<{ allowMissingLaunchService?: boolean }> = {},
): string {
  const result = spawnSync(executable, [...arguments_], {
    encoding: 'utf8',
    env: CHILD_ENV,
    maxBuffer: 1_000_000,
    timeout: 15_000,
  });
  if (
    result.error === undefined
    && result.signal === null
    && result.status === 0
    && typeof result.stdout === 'string'
    && typeof result.stderr === 'string'
  ) return result.stdout;
  if (
    options.allowMissingLaunchService === true
    && result.error === undefined
    && result.signal === null
    && typeof result.status === 'number'
    && result.status !== 0
    && result.stdout === ''
    && typeof result.stderr === 'string'
    && /Could not find service/u.test(result.stderr)
  ) return '__WARPKEEP_SERVICE_NOT_LOADED__';
  fail('GENESIS_001_ADMISSION_MONITOR_CHILD_FAILED', result.error);
}

function exactMonitorPaths(): Readonly<{
  home: string;
  plist: string;
  program: string;
  receiptDirectory: string;
}> {
  if (process.platform !== 'darwin' || process.getuid === undefined) {
    fail('GENESIS_001_ADMISSION_MONITOR_PLATFORM_INVALID');
  }
  const home = resolve(userInfo().homedir);
  if (realpathSync(home) !== home) {
    fail('GENESIS_001_ADMISSION_MONITOR_HOME_INVALID');
  }
  return Object.freeze({
    home,
    plist: join(home, 'Library', 'LaunchAgents', `${GENESIS001_ADMISSION_MONITOR_LABEL}.plist`),
    program: join(home, '.hermes', 'scripts', 'warpkeep_admission_monitor.py'),
    receiptDirectory: join(
      home,
      'Library',
      'Application Support',
      'Warpkeep',
      'operations',
      'audit',
      'private',
    ),
  });
}

function inspectLiveMonitor(): Genesis001AdmissionMonitorSnapshot {
  const paths = exactMonitorPaths();
  const plist = inspectExactFile(paths.plist, 0o600, EXPECTED_MONITOR_PLIST_SHA256, 64 * 1024);
  const program = inspectExactFile(
    paths.program,
    0o700,
    EXPECTED_MONITOR_PROGRAM_SHA256,
    256 * 1024,
  );
  try {
    const parsed = JSON.parse(exactChild(SYSTEM_PLUTIL, [
      '-convert', 'json', '-o', '-', paths.plist,
    ])) as Record<string, unknown>;
    if (
      parsed.Label !== GENESIS001_ADMISSION_MONITOR_LABEL
      || JSON.stringify(parsed.ProgramArguments) !== JSON.stringify([
        paths.program,
        'loop',
        '--interval',
        '60',
      ])
    ) fail('GENESIS_001_ADMISSION_MONITOR_PLIST_INVALID');
  } catch (error) {
    if (error instanceof Genesis001AdmissionMonitorSuspensionError) throw error;
    fail('GENESIS_001_ADMISSION_MONITOR_PLIST_INVALID', error);
  } finally {
    plist.body.fill(0);
    program.body.fill(0);
  }
  const uid = process.getuid?.();
  if (uid === undefined) fail('GENESIS_001_ADMISSION_MONITOR_PLATFORM_INVALID');
  const domain = `gui/${uid}`;
  const disabled = parseLaunchctlDisabledOutput(
    exactChild(SYSTEM_LAUNCHCTL, ['print-disabled', domain]),
    GENESIS001_ADMISSION_MONITOR_LABEL,
  );
  const print = exactChild(
    SYSTEM_LAUNCHCTL,
    ['print', `${domain}/${GENESIS001_ADMISSION_MONITOR_LABEL}`],
    { allowMissingLaunchService: true },
  );
  return Object.freeze({
    label: GENESIS001_ADMISSION_MONITOR_LABEL,
    domain,
    disabled,
    loaded: print !== '__WARPKEEP_SERVICE_NOT_LOADED__',
    plistSha256: plist.sha256,
    programSha256: program.sha256,
  });
}

function exactPrivateReceiptDirectory(path: string): void {
  const status = lstatSync(path, { bigint: true });
  if (
    realpathSync(path) !== resolve(path)
    || status.isSymbolicLink()
    || !status.isDirectory()
    || status.uid !== BigInt(process.getuid?.() ?? -1)
    || (status.mode & 0o7777n) !== 0o700n
  ) fail('GENESIS_001_ADMISSION_MONITOR_RECEIPT_DIRECTORY_INVALID');
}

function writePrivateReceipt(body: string): Readonly<{ basename: string; sha256: string }> {
  const paths = exactMonitorPaths();
  exactPrivateReceiptDirectory(paths.receiptDirectory);
  const sha256 = createHash('sha256').update(body).digest('hex');
  const parsed = JSON.parse(body) as { suspendedAt?: unknown };
  if (typeof parsed.suspendedAt !== 'string') {
    fail('GENESIS_001_ADMISSION_MONITOR_RECEIPT_INVALID');
  }
  const stamp = parsed.suspendedAt.replace(/[-:.]/gu, '');
  const filename = `genesis001-admission-monitor-suspended-${stamp}-${sha256.slice(0, 12)}.json`;
  if (!RECEIPT_BASENAME_PATTERN.test(filename)) {
    fail('GENESIS_001_ADMISSION_MONITOR_RECEIPT_INVALID');
  }
  const destination = join(paths.receiptDirectory, filename);
  let descriptor: number | undefined;
  try {
    descriptor = openSync(
      destination,
      constants.O_CREAT
        | constants.O_EXCL
        | constants.O_WRONLY
        | (constants.O_NOFOLLOW ?? 0),
      0o600,
    );
    writeFileSync(descriptor, body, { encoding: 'utf8' });
    fchmodSync(descriptor, 0o600);
    fsyncSync(descriptor);
    const byDescriptor = fstatSync(descriptor, { bigint: true });
    const byPath = lstatSync(destination, { bigint: true });
    if (
      !byDescriptor.isFile()
      || byDescriptor.uid !== BigInt(process.getuid?.() ?? -1)
      || byDescriptor.nlink !== 1n
      || (byDescriptor.mode & 0o7777n) !== 0o600n
      || byDescriptor.size !== BigInt(Buffer.byteLength(body))
      || byPath.isSymbolicLink()
      || byPath.dev !== byDescriptor.dev
      || byPath.ino !== byDescriptor.ino
      || byPath.mode !== byDescriptor.mode
      || byPath.uid !== byDescriptor.uid
      || byPath.nlink !== byDescriptor.nlink
      || byPath.size !== byDescriptor.size
    ) fail('GENESIS_001_ADMISSION_MONITOR_RECEIPT_WRITE_FAILED');
  } catch (error) {
    if (error instanceof Genesis001AdmissionMonitorSuspensionError) throw error;
    fail('GENESIS_001_ADMISSION_MONITOR_RECEIPT_WRITE_FAILED', error);
  } finally {
    if (descriptor !== undefined) closeSync(descriptor);
  }
  const directoryDescriptor = openSync(
    paths.receiptDirectory,
    constants.O_RDONLY | (constants.O_DIRECTORY ?? 0) | (constants.O_NOFOLLOW ?? 0),
  );
  try {
    fsyncSync(directoryDescriptor);
  } finally {
    closeSync(directoryDescriptor);
  }
  exactPrivateReceiptDirectory(paths.receiptDirectory);
  return Object.freeze({ basename: filename, sha256 });
}

function exactGit(arguments_: readonly string[], allowFailure = false): Readonly<{
  status: number;
  stdout: string;
}> {
  const result = spawnSync(SYSTEM_GIT, [...arguments_], {
    encoding: 'utf8',
    env: CHILD_ENV,
    maxBuffer: 1_000_000,
    timeout: 30_000,
  });
  if (
    result.error !== undefined
    || result.signal !== null
    || typeof result.status !== 'number'
    || typeof result.stdout !== 'string'
    || typeof result.stderr !== 'string'
    || (!allowFailure && result.status !== 0)
  ) fail('GENESIS_001_ADMISSION_MONITOR_SOURCE_PROVENANCE_INVALID', result.error);
  return Object.freeze({ status: result.status, stdout: result.stdout.trim() });
}

function assertProtectedMainCheckout(sourceCommit: string): void {
  if (!SOURCE_COMMIT_PATTERN.test(sourceCommit)) {
    fail('GENESIS_001_ADMISSION_MONITOR_SOURCE_COMMIT_INVALID');
  }
  const repository = resolve(dirname(fileURLToPath(import.meta.url)), '..');
  const prefix = ['--no-optional-locks', '-C', repository] as const;
  const root = exactGit([...prefix, 'rev-parse', '--show-toplevel']).stdout;
  const head = exactGit([...prefix, 'rev-parse', '--verify', 'HEAD']).stdout;
  const remoteMain = exactGit([
    ...prefix,
    'rev-parse',
    '--verify',
    'refs/remotes/origin/main',
  ]).stdout;
  const dirty = exactGit([
    ...prefix,
    'status',
    '--porcelain=v1',
    '--untracked-files=no',
  ]).stdout;
  const symbolic = exactGit([...prefix, 'symbolic-ref', '-q', 'HEAD'], true);
  if (
    realpathSync(root) !== realpathSync(repository)
    || head !== sourceCommit
    || remoteMain !== sourceCommit
    || dirty !== ''
    || symbolic.status === 0
    || symbolic.stdout !== ''
  ) fail('GENESIS_001_ADMISSION_MONITOR_SOURCE_PROVENANCE_INVALID');
}

function parseCli(arguments_: readonly string[]): Readonly<{
  command: 'inspect' | 'suspend';
  sourceCommit: string;
}> {
  const [command, sourceFlag, sourceCommit, confirmFlag, confirmValue] = arguments_;
  if (
    (command !== 'inspect' && command !== 'suspend')
    || sourceFlag !== '--source-commit'
    || !SOURCE_COMMIT_PATTERN.test(sourceCommit ?? '')
  ) fail('GENESIS_001_ADMISSION_MONITOR_ARGUMENTS_INVALID');
  if (command === 'inspect' && arguments_.length !== 3) {
    fail('GENESIS_001_ADMISSION_MONITOR_ARGUMENTS_INVALID');
  }
  if (
    command === 'suspend'
    && (
      arguments_.length !== 5
      || confirmFlag !== '--confirm'
      || confirmValue !== 'GENESIS_001_ADMISSION_MONITOR_SUSPEND'
    )
  ) fail('GENESIS_001_ADMISSION_MONITOR_CONFIRMATION_REQUIRED');
  return Object.freeze({ command, sourceCommit: sourceCommit! });
}

async function main(): Promise<void> {
  const parsed = parseCli(process.argv.slice(2));
  assertProtectedMainCheckout(parsed.sourceCommit);
  if (parsed.command === 'inspect') {
    const state = inspectLiveMonitor();
    process.stdout.write(`${JSON.stringify({
      profile: GENESIS001_ADMISSION_MONITOR_SUSPENSION_PROFILE,
      disabled: state.disabled,
      loaded: state.loaded,
      monitorPlistSha256: state.plistSha256,
      monitorProgramSha256: state.programSha256,
    })}\n`);
    return;
  }
  const paths = exactMonitorPaths();
  const result = await runGenesis001AdmissionMonitorSuspension({
    sourceCommit: parsed.sourceCommit,
    inspect: inspectLiveMonitor,
    disable: () => {
      exactChild(SYSTEM_LAUNCHCTL, [
        'disable',
        `gui/${process.getuid!()}/${GENESIS001_ADMISSION_MONITOR_LABEL}`,
      ]);
    },
    bootout: () => {
      exactChild(SYSTEM_LAUNCHCTL, [
        'bootout',
        `gui/${process.getuid!()}`,
        paths.plist,
      ]);
    },
    writeReceipt: writePrivateReceipt,
  });
  process.stdout.write(`${JSON.stringify(result)}\n`);
}

const invokedPath = process.argv[1] === undefined
  ? undefined
  : pathToFileURL(resolve(process.argv[1])).href;
if (invokedPath === import.meta.url) {
  main().catch(error => {
    const code = error instanceof Genesis001AdmissionMonitorSuspensionError
      ? error.code
      : 'GENESIS_001_ADMISSION_MONITOR_SUSPENSION_FAILED';
    process.stderr.write(`${code}\n`);
    process.exitCode = 1;
  });
}
