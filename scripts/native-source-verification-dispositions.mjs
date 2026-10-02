// Pure namespace outcome policy. This does not authenticate reports or grant source authority.
// Ordinary platform skips remain unsupported until their complete source-owned inventory exists.
export const NATIVE_NAMESPACE_DISPOSITION_PROFILE = 'warpkeep-native-namespace-dispositions-linux-x64-v1';
export const NATIVE_NAMESPACE_DISPOSITION_SOURCES = Object.freeze([
  Object.freeze({ path: 'tests/sealedRealmsExistingUpdate.test.ts',
    sha256: '92b1588d9d1bce3e9ed6a0c1a070dfc1aa4faa17932f0e55ae9d8b799864a0d6' }),
  Object.freeze({ path: 'scripts/test-sealed-realms-existing-update-linux.sh',
    sha256: 'fc4732448c702c37826df6cdf9451ac8edd8a7127d50b03ac4da4599e788d1f2' }),
  Object.freeze({ path: 'scripts/sealed-realms-synthetic-network.mjs',
    sha256: 'df370fa9919e5c381ad4352f7dc2f4f9f9a85c4f0d4245e46c813405c85238e1' }),
]);
const FILES = Object.freeze([
  'tests/ptrProductionExistingUpdateContinuation.test.ts',
  'tests/sealedRealmsExistingUpdate.test.ts',
  'tests/sealedRealmsProductionContinuation.test.ts',
  'tests/sealedRealmsProductionDispatcher.test.ts',
]);
const NEGATIVE_CONTROL = Object.freeze({ file: 'tests/sealedRealmsExistingUpdate.test.ts',
  title: 'existing-update native protocol refuses unsupported runtime before reading credentials or any response' });
const STATUSES = Object.freeze(['passed', 'failed', 'skipped', 'todo', 'pending']);
const MAX_ASSERTIONS = 200000;
const fail = code => { throw Error(`NATIVE_SOURCE_DISPOSITION_${code}`); };
const record = value => {
  if (value === null || typeof value !== 'object' || Array.isArray(value)
    || Object.getPrototypeOf(value) !== Object.prototype) fail('INPUT_INVALID');
  return value;
};
const equalFiles = (actual, expected) => Array.isArray(actual) && actual.length === expected.length
  && new Set(actual).size === actual.length && expected.every(file => actual.includes(file));
const canonicalPath = path => typeof path === 'string' && path.length > 1 && path.length <= 4096
  && path.startsWith('/') && !/[\\\x00-\x1f\x7f]/u.test(path)
  && path.slice(1).split('/').every(part => part !== '' && part !== '.' && part !== '..');

function sourceIdentities(sourceFiles) {
  if (!Array.isArray(sourceFiles) || sourceFiles.length < NATIVE_NAMESPACE_DISPOSITION_SOURCES.length
    || sourceFiles.length > 8192) fail('SOURCE_INVALID');
  const facts = new Map();
  for (const value of sourceFiles) {
    const fact = record(value);
    if (typeof fact.path !== 'string' || facts.has(fact.path)
      || typeof fact.sha256 !== 'string' || !/^[a-f0-9]{64}$/u.test(fact.sha256)) fail('SOURCE_INVALID');
    facts.set(fact.path, fact.sha256);
  }
  for (const expected of NATIVE_NAMESPACE_DISPOSITION_SOURCES) {
    if (facts.get(expected.path) !== expected.sha256) fail('SOURCE_CHANGED');
  }
  return NATIVE_NAMESPACE_DISPOSITION_SOURCES;
}

function isolatedCommand(command, target) {
  record(command); record(target);
  if (target.platform !== 'linux' || target.arch !== 'x64'
    || target.uid !== 1000 || target.gid !== 1000) fail('TARGET_UNSUPPORTED');
  if (command.id !== 'namespace-tests' || command.kind !== 'vitest-json'
    || command.executable !== '/usr/bin/sudo' || command.cwd !== '/home/warpkeep/Warpkeep-0.4'
    || !equalFiles(command.files, FILES) || !Array.isArray(command.args)
    || command.args.length !== 9 || command.args[5] !== '/home/warpkeep/.warpkeep/release-preparation-v1/toolchain/node-v22.22.3-linux-x64/bin/node'
    || !canonicalPath(command.reportPath)
    || !command.reportPath.startsWith(`${command.cwd}/artifacts/qa/`)
    || !/^[A-Za-z0-9._-]+\.report\.json$/u.test(command.reportPath.slice(`${command.cwd}/artifacts/qa/`.length))) {
    fail('ISOLATION_REQUIRED');
  }
  const expected = ['-n', '/usr/local/libexec/warpkeep-native-source-verification/namespace.sh',
    '--as', String(target.uid), String(target.gid), command.args[5], command.cwd,
    '--report-json', command.reportPath];
  if (command.args.some((argument, index) => argument !== expected[index])) fail('ISOLATION_REQUIRED');
  // The pinned launcher requires Linux x64, distinct mount/net namespaces and
  // WARPKEEP_REQUIRE_SYNTHETIC_NETWORK=1, then drops capabilities and runs exactly FILES.
  // The pinned test throws at file setup if that required network identity is unavailable.
  return Object.freeze({ platform: target.platform, arch: target.arch, uid: target.uid, gid: target.gid,
    launcherPath: expected[1], requiredSyntheticNetwork: '1' });
}

/** Assess an already-authenticated parsed namespace report; this is never an evidence loader.
 * Actual zero-exit/null-signal terminal, source/tool preservation and independent actor absence
 * remain producer prerequisites. No ordinary skip, caller waiver list or coverage switch exists.
 */
export function assessNativeNamespaceDispositions(parsed, context) {
  if (arguments.length !== 2) fail('INPUT_INVALID');
  record(parsed); record(context);
  const declaredSources = sourceIdentities(context.sourceFiles);
  const isolation = isolatedCommand(context.command, context.target);
  if (parsed.kind !== 'vitest-json' || !equalFiles(parsed.files, FILES)
    || !Array.isArray(parsed.assertions) || parsed.assertions.length < FILES.length
    || parsed.assertions.length > MAX_ASSERTIONS || !Array.isArray(parsed.runtimeFailures)
    || parsed.childTerminalRequired !== true || typeof parsed.success !== 'boolean') fail('REPORT_INVALID');
  if (parsed.reportSuccess !== true || parsed.failedSuiteCount !== 0 || parsed.pendingSuiteCount !== 0
    || !Number.isSafeInteger(parsed.suiteCount) || parsed.suiteCount < 1
    || parsed.suiteCount > MAX_ASSERTIONS) fail('REPORT_TERMINAL_INVALID');
  const counts = Object.fromEntries(STATUSES.map(status => [status, 0])), seenFiles = new Set();
  const skipped = [], negativeControl = [];
  for (const value of parsed.assertions) {
    const row = record(value);
    if (!FILES.includes(row.file) || typeof row.title !== 'string' || row.title.length < 1
      || row.title.length > 16384 || row.title.includes('\0') || !STATUSES.includes(row.status)) fail('REPORT_INVALID');
    counts[row.status]++; seenFiles.add(row.file);
    if (row.status === 'skipped') skipped.push(row);
    if (row.file === NEGATIVE_CONTROL.file && row.title === NEGATIVE_CONTROL.title) negativeControl.push(row);
  }
  if (seenFiles.size !== FILES.length || STATUSES.some(status => parsed[status] !== counts[status])) fail('REPORT_INVALID');
  if (parsed.complete !== true || counts.failed || counts.todo || counts.pending
    || parsed.runtimeFailures.length) fail('OUTCOME_REJECTED');
  if (negativeControl.length !== 1 || negativeControl[0].status !== 'skipped') fail('EXPECTED_SKIP_MISSING');
  if (skipped.length !== 1 || skipped[0] !== negativeControl[0]) fail('UNKNOWN_SKIP');
  if (parsed.success !== false) fail('RAW_OUTCOME_INVALID');
  const acceptedSkipped = Object.freeze([Object.freeze({ ...NEGATIVE_CONTROL, status: 'skipped',
    reason: 'Source-declared unsupported-runtime negative control is inapplicable inside the required synthetic network.' })]);
  return Object.freeze({ profile: NATIVE_NAMESPACE_DISPOSITION_PROFILE, profileSatisfied: true,
    rawAllTestsPassed: parsed.success, rawCounts: Object.freeze(counts), acceptedSkipped,
    rawSuiteCounts: Object.freeze({ total: parsed.suiteCount, failed: parsed.failedSuiteCount, pending: parsed.pendingSuiteCount }),
    declaredSources, isolation, childTerminalRequired: true,
    scope: 'Fixed namespace skip disposition only; ordinary platform skips, complete coverage and source authority remain unsupported.' });
}
