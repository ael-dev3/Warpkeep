import { randomUUID } from 'node:crypto';
import {
  chmodSync,
  closeSync,
  constants,
  existsSync,
  fstatSync,
  fsyncSync,
  linkSync,
  lstatSync,
  mkdirSync,
  openSync,
  readdirSync,
  statSync,
  unlinkSync,
  writeSync,
} from 'node:fs';
import { join } from 'node:path';

const REPORT_NAME_PATTERN =
  /^(profiles-plan|profiles-refresh|profiles-apply)-([0-9]{8}T[0-9]{9}Z)-[0-9a-f]{12}\.json$/;
const FORBIDDEN_KEY_PATTERN =
  /(?:address|authorization|credential|cookie|endpoint|fid|identity|proof|qr|raw|rpc|secret|token|transaction|txhash)/i;
const ADDRESS_VALUE_PATTERN = /(?:^|[^0-9a-f])0x[0-9a-f]{40}(?:$|[^0-9a-f])/i;
const URL_VALUE_PATTERN = /https?:\/\//i;

export class PrivateOperatorReportError extends Error {
  constructor(readonly code: string) {
    super(code);
    this.name = 'PrivateOperatorReportError';
  }
}

export type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonValue[]
  | { [key: string]: JsonValue };

export type PrivateOperatorReportCommand =
  | 'profiles-plan'
  | 'profiles-refresh'
  | 'profiles-apply';

function fail(code: string): never {
  throw new PrivateOperatorReportError(code);
}

function assertPrivateDirectory(path: string): void {
  if (!existsSync(path)) mkdirSync(path, { recursive: true, mode: 0o700 });
  const status = lstatSync(path);
  if (!status.isDirectory() || status.isSymbolicLink()) {
    fail('PRIVATE_OPERATOR_REPORT_DIRECTORY_INVALID');
  }
  chmodSync(path, 0o700);
  if ((statSync(path).mode & 0o077) !== 0) {
    fail('PRIVATE_OPERATOR_REPORT_DIRECTORY_PERMISSIONS');
  }
}

function assertPrivacySafe(value: JsonValue, key = ''): void {
  if (FORBIDDEN_KEY_PATTERN.test(key)) {
    fail('PRIVATE_OPERATOR_REPORT_SENSITIVE_FIELD');
  }
  if (typeof value === 'string') {
    if (
      ADDRESS_VALUE_PATTERN.test(value)
      || URL_VALUE_PATTERN.test(value)
      || /^0x[0-9a-f]{64}$/i.test(value)
    ) {
      fail('PRIVATE_OPERATOR_REPORT_SENSITIVE_VALUE');
    }
    return;
  }
  if (Array.isArray(value)) {
    for (const entry of value) assertPrivacySafe(entry, key);
    return;
  }
  if (value !== null && typeof value === 'object') {
    for (const [childKey, childValue] of Object.entries(value)) {
      assertPrivacySafe(childValue, childKey);
    }
  }
}

function timestampForFilename(now: Date): string {
  return now.toISOString().replace(/[-:.]/g, '');
}

export function writePrivateOperatorReport(input: Readonly<{
  reportDirectory: string;
  command: PrivateOperatorReportCommand;
  report: JsonValue;
  now?: Date;
}>): Readonly<{ written: true }> {
  assertPrivateDirectory(input.reportDirectory);
  assertPrivacySafe(input.report);
  const timestamp = timestampForFilename(input.now ?? new Date());
  const suffix = randomUUID().replace(/-/g, '').slice(0, 12);
  const filename = `${input.command}-${timestamp}-${suffix}.json`;
  const destination = join(input.reportDirectory, filename);
  const temporary = join(input.reportDirectory, `.${filename}.tmp`);
  const descriptor = openSync(
    temporary,
    constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY,
    0o600,
  );
  try {
    writeSync(descriptor, `${JSON.stringify(input.report, null, 2)}\n`, undefined, 'utf8');
    fsyncSync(descriptor);
  } finally {
    closeSync(descriptor);
  }
  try {
    chmodSync(temporary, 0o600);
    linkSync(temporary, destination);
  } finally {
    try {
      unlinkSync(temporary);
    } catch {
      // Preserve the publication failure without touching a destination that
      // may have been created by another local process.
    }
  }
  chmodSync(destination, 0o600);
  if ((statSync(destination).mode & 0o077) !== 0) {
    fail('PRIVATE_OPERATOR_REPORT_FILE_PERMISSIONS');
  }
  return Object.freeze({ written: true });
}

export async function withExclusiveOperatorLock<T>(
  reportDirectory: string,
  operation: () => Promise<T>,
): Promise<T> {
  assertPrivateDirectory(reportDirectory);
  const lockPath = join(reportDirectory, '.operator.lock');
  let descriptor: number;
  try {
    descriptor = openSync(
      lockPath,
      constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY,
      0o600,
    );
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'EEXIST') {
      fail('PRIVATE_OPERATOR_ALREADY_RUNNING');
    }
    fail('PRIVATE_OPERATOR_LOCK_FAILED');
  }
  try {
    writeSync(
      descriptor,
      `${JSON.stringify({ pid: process.pid, startedAt: new Date().toISOString() })}\n`,
    );
    fsyncSync(descriptor);
    chmodSync(lockPath, 0o600);
    return await operation();
  } finally {
    const opened = fstatSync(descriptor);
    closeSync(descriptor);
    try {
      const current = lstatSync(lockPath);
      if (current.ino === opened.ino && current.dev === opened.dev) unlinkSync(lockPath);
    } catch {
      // A missing lock is safe; a replacement lock belongs to another process.
    }
  }
}

export function inspectPrivateOperatorReports(reportDirectory: string): Readonly<{
  reportCount: number;
  lockPresent: boolean;
  latestCreatedAt?: string;
  byCommand: Readonly<Record<string, number>>;
}> {
  assertPrivateDirectory(reportDirectory);
  const byCommand: Record<string, number> = Object.create(null) as Record<string, number>;
  let reportCount = 0;
  let latestCreatedAt: string | undefined;
  for (const entry of readdirSync(reportDirectory, { withFileTypes: true })) {
    const match = REPORT_NAME_PATTERN.exec(entry.name);
    if (!match) continue;
    if (!entry.isFile()) fail('PRIVATE_OPERATOR_REPORT_FILE_INVALID');
    const status = lstatSync(join(reportDirectory, entry.name));
    if (status.isSymbolicLink() || (status.mode & 0o077) !== 0) {
      fail('PRIVATE_OPERATOR_REPORT_FILE_PERMISSIONS');
    }
    reportCount += 1;
    byCommand[match[1]] = (byCommand[match[1]] ?? 0) + 1;
    const timestamp = match[2];
    if (!latestCreatedAt || timestamp > latestCreatedAt) latestCreatedAt = timestamp;
  }
  return Object.freeze({
    reportCount,
    lockPresent: existsSync(join(reportDirectory, '.operator.lock')),
    ...(latestCreatedAt ? { latestCreatedAt } : {}),
    byCommand: Object.freeze({ ...byCommand }),
  });
}
