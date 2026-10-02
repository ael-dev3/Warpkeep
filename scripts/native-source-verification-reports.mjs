// Pure bounded report decoders; no filesystem, process, Git, network or execution authority.
// A matching actual child terminal/exit, stderr and source receipt remain caller prerequisites.
import { createHash } from 'node:crypto';
import { posix, win32 } from 'node:path';
import { NODE_EVENT_SCHEMA, MAX_EVENT_BYTES } from './native-source-verification-node-reporter.mjs';

const MAX_BYTES = 64 * 1024 * 1024, MAX_ITEMS = 200000;
const STATUSES = new Set(['passed', 'failed', 'skipped', 'todo', 'pending']);
function requireValue(ok, message) { if (!ok) throw Error(message); }
function record(value) { requireValue(value !== null && typeof value === 'object' && !Array.isArray(value), 'Expected report object'); return value; }
function integer(value, name) { requireValue(Number.isSafeInteger(value) && value >= 0 && value <= MAX_ITEMS, `Invalid ${name} count`); return value; }
function text(value, name) { requireValue(typeof value === 'string' && value.length > 0 && value.length <= 16384 && !value.includes('\0'), `Invalid ${name}`); return value; }
function decode(bytes) {
  requireValue(typeof bytes === 'string' || bytes instanceof Uint8Array, 'Report bytes required');
  const body = typeof bytes === 'string' ? Buffer.from(bytes, 'utf8') : Buffer.from(bytes);
  requireValue(body.length > 0 && body.length <= MAX_BYTES, 'Report byte bound exceeded');
  return new TextDecoder('utf-8', { fatal: true }).decode(body);
}
function options(value) {
  record(value);
  const root = text(value.repositoryRoot, 'repository root').replaceAll('\\', '/').replace(/\/$/, '');
  const platform = /^[A-Za-z]:\//u.test(root) ? win32 : posix;
  requireValue(platform.isAbsolute(root) && platform.normalize(root).replaceAll('\\', '/') === root, 'Canonical absolute repository root required');
  requireValue(Array.isArray(value.expectedFiles) && value.expectedFiles.length > 0 && value.expectedFiles.length <= 4096, 'Expected file inventory required');
  const files = value.expectedFiles.map(file => {
    text(file, 'expected relative file');
    requireValue(!file.includes('\\') && !file.includes(':') && !file.startsWith('/') && file.split('/').every(part => part !== '' && part !== '.' && part !== '..'), 'Noncanonical expected file');
    return file;
  });
  requireValue(new Set(files).size === files.length, 'Duplicate expected file');
  const expected = new Set(files);
  const normalizeFile = absolute => {
    text(absolute, 'reported file');
    const name = absolute.replaceAll('\\', '/');
    requireValue(name.startsWith(root + '/') && platform.normalize(name).replaceAll('\\', '/') === name, 'Reported file outside exact repository');
    const relative = name.slice(root.length + 1);
    requireValue(expected.has(relative), 'Unexpected reported file');
    return relative;
  };
  return { root, files, expected, normalizeFile };
}
function exactInventory(actual, expected) {
  requireValue(actual.length === expected.length && new Set(actual).size === actual.length && expected.every(file => actual.includes(file)), 'Report file inventory mismatch');
}
function counters(assertions) {
  return Object.fromEntries([...STATUSES].map(status => [status, assertions.filter(assertion => assertion.status === status).length]));
}

export function parseVitestReport(bytes, suppliedOptions) {
  const scope = options(suppliedOptions), report = record(JSON.parse(decode(bytes)));
  const suiteCount = integer(report.numTotalTestSuites, 'Vitest suites');
  for (const key of ['numPassedTestSuites', 'numFailedTestSuites', 'numPendingTestSuites', 'numTotalTests', 'numPassedTests', 'numFailedTests', 'numPendingTests', 'numTodoTests']) integer(report[key], key);
  requireValue(report.numPassedTestSuites + report.numFailedTestSuites + report.numPendingTestSuites === suiteCount, 'Vitest suite total mismatch');
  requireValue(typeof report.success === 'boolean' && Array.isArray(report.testResults) && report.testResults.length <= 4096, 'Invalid Vitest terminal schema');
  const assertions = [], files = [], runtimeFailures = [];
  for (const raw of report.testResults) {
    const fileResult = record(raw), file = scope.normalizeFile(fileResult.name); files.push(file);
    requireValue(['passed', 'failed'].includes(fileResult.status) && typeof fileResult.message === 'string' && Array.isArray(fileResult.assertionResults), 'Invalid Vitest file result');
    requireValue(fileResult.assertionResults.length > 0 && assertions.length + fileResult.assertionResults.length <= MAX_ITEMS, 'Empty or oversized Vitest assertion inventory');
    const first = assertions.length;
    for (const value of fileResult.assertionResults) {
      const assertion = record(value), status = assertion.status;
      requireValue(STATUSES.has(status) && Array.isArray(assertion.ancestorTitles) && assertion.ancestorTitles.every(title => typeof title === 'string') && Array.isArray(assertion.failureMessages) && assertion.failureMessages.every(message => typeof message === 'string'), 'Invalid Vitest assertion schema');
      text(assertion.title, 'Vitest title'); text(assertion.fullName, 'Vitest full title');
      assertions.push({ file, title: assertion.fullName, status });
      if (status !== 'failed' && assertion.failureMessages.length) runtimeFailures.push({ file, message: 'Nonfailed assertion contains failure messages' });
    }
    if (fileResult.message || fileResult.status === 'failed' && !assertions.slice(first).some(assertion => assertion.status === 'failed')) runtimeFailures.push({ file, message: fileResult.message || 'File failed outside leaf assertion results' });
    if (fileResult.status === 'passed' && assertions.slice(first).some(assertion => assertion.status === 'failed')) throw Error('Vitest file/assertion status mismatch');
  }
  exactInventory(files, scope.files);
  const counts = counters(assertions);
  // Installed Vitest4.1.11 JsonReporter counts skipped and still-running assertions together as numPendingTests.
  requireValue(report.numTotalTests === assertions.length && report.numPassedTests === counts.passed && report.numFailedTests === counts.failed && report.numPendingTests === counts.skipped + counts.pending && report.numTodoTests === counts.todo, 'Vitest leaf totals mismatch');
  record(report.snapshot); requireValue(typeof report.snapshot.failure === 'boolean', 'Vitest snapshot terminal missing');
  if (report.snapshot.failure) runtimeFailures.push({ file: null, message: 'Snapshot report failed' });
  for (const key of ['unhandledErrors', 'errors']) if (Object.hasOwn(report, key)) {
    requireValue(Array.isArray(report[key]), 'Unsupported Vitest error field');
    if (report[key].length) runtimeFailures.push({ file: null, message: `Reported ${key}` });
  }
  if (Object.hasOwn(report, 'numUnhandledErrors') && integer(report.numUnhandledErrors, 'unhandled errors')) runtimeFailures.push({ file: null, message: 'Reported unhandled errors' });
  const complete = counts.pending === 0 && report.numPendingTestSuites === 0;
  return { kind: 'vitest-json', files, assertions, suiteCount, ...counts, complete,
    reportSuccess: report.success, failedSuiteCount: report.numFailedTestSuites, pendingSuiteCount: report.numPendingTestSuites,
    success: complete && report.success && counts.failed === 0 && counts.skipped === 0 && counts.todo === 0 && report.numFailedTestSuites === 0 && runtimeFailures.length === 0,
    runtimeFailures, childTerminalRequired: true, runtimeErrorScope: 'JSON contains file/snapshot errors; installed JsonReporter omits global unhandled-error inventory. Actual child exit/stderr are separately required.' };
}

export function parseNodeEvents(bytes, suppliedOptions) {
  const scope = options(suppliedOptions);
  requireValue(scope.files.length === 1, 'Node event adapter supports exactly one actual source file per child');
  const input = decode(bytes); requireValue(input.endsWith('\n') && !input.includes('\r'), 'Truncated or noncanonical Node NDJSON');
  const lines = input.slice(0, -1).split('\n'); requireValue(lines.length >= 3 && lines.length <= MAX_ITEMS, 'Node event line bound');
  const header = record(JSON.parse(lines[0])), end = record(JSON.parse(lines.at(-1)));
  requireValue(header.schema === NODE_EVENT_SCHEMA && header.boundary === 'start' && /^22\./u.test(header.nodeVersion), 'Unsupported actual Node reporter version/header');
  requireValue(end.schema === NODE_EVENT_SCHEMA && end.boundary === 'end' && end.events === lines.length - 2 && /^[a-f0-9]{64}$/u.test(end.sha256), 'Node reporter did not reach terminal boundary');
  const hash = createHash('sha256'), assertions = [], suites = [], wrappers = [], outcomes = [], summaries = [], rootPlans = [], runtimeFailures = [], diagnostics = [], completedIds = new Set(), nestedCounts = new Map(), nestedPlans = new Map();
  const known = new Set(['test:enqueue', 'test:dequeue', 'test:start', 'test:complete', 'test:pass', 'test:fail', 'test:plan', 'test:diagnostic', 'test:stdout', 'test:stderr', 'test:summary']);
  for (let index = 1; index < lines.length - 1; index++) {
    const line = lines[index]; requireValue(Buffer.byteLength(line) + 1 <= MAX_EVENT_BYTES, 'Node event exceeds bound'); hash.update(line + '\n');
    const event = record(JSON.parse(line)); requireValue(event.sequence === index - 1 && known.has(event.type), 'Unknown, duplicate or reordered Node event');
    const data = record(event.data);
    if (event.type === 'test:summary') { summaries.push(data); continue; }
    if (event.type === 'test:diagnostic') {
      text(data.message, 'Node diagnostic'); diagnostics.push(data.message);
      if (!/^(?:tests|suites|pass|fail|cancelled|skipped|todo) \d+$/u.test(data.message) && !/^duration_ms \d+(?:\.\d+)?$/u.test(data.message)) runtimeFailures.push({ file: data.file ? scope.normalizeFile(data.file) : null, message: data.message });
      continue;
    }
    if (event.type === 'test:stdout' || event.type === 'test:stderr') { scope.normalizeFile(data.file); requireValue(typeof data.message === 'string', 'Invalid Node child output'); continue; }
    if (event.type === 'test:plan') {
      const nesting = integer(data.nesting, 'Node plan nesting'), count = integer(data.count, 'Node plan');
      if (data.file) scope.normalizeFile(data.file);
      if (nesting === 0) rootPlans.push(count);
      else { requireValue((nestedCounts.get(nesting) || 0) === count, 'Node nested plan/outcome mismatch'); nestedCounts.set(nesting, 0); nestedPlans.set(nesting - 1, count); }
      continue;
    }
    if (!['test:pass', 'test:fail'].includes(event.type)) { if (data.file) scope.normalizeFile(data.file); continue; }
    const details = record(data.details), name = text(data.name, 'Node test title'), nesting = integer(data.nesting, 'Node outcome nesting');
    requireValue(details.type === undefined || details.type === 'suite' || details.type === 'test', 'Unsupported Node declared test type');
    requireValue(details.attempt === undefined && details.passed_on_attempt === undefined, 'Node rerun event unsupported');
    integer(data.testNumber, 'Node test ordinal'); requireValue(data.testNumber > 0, 'Node test ordinal missing');
    if (data.testId !== undefined) { integer(data.testId, 'Node test identity'); const key = `${data.file}:${data.testId}`; requireValue(!completedIds.has(key), 'Duplicate Node terminal test identity'); completedIds.add(key); }
    const wrapper = name.replaceAll('\\', '/') === scope.root + '/' + scope.files[0];
    const file = data.file ? scope.normalizeFile(data.file) : wrapper ? scope.files[0] : null;
    requireValue(file !== null, 'Node declared source file unavailable; no file/title coverage inferred');
    const suite = details.type === 'suite';
    if ((nestedPlans.get(nesting) || 0) > 0 && !suite) throw Error('Nested test() containers require a separate leaf protocol; no parent assertion coverage inferred');
    nestedPlans.delete(nesting);
    const skip = data.skip === true || typeof data.skip === 'string', todo = data.todo === true || typeof data.todo === 'string';
    requireValue(!(skip && todo), 'Conflicting Node skip/todo outcome');
    const status = skip ? 'skipped' : todo ? 'todo' : event.type === 'test:fail' ? 'failed' : 'passed';
    const row = { file, title: name, status }; outcomes.push({ ...row, nesting, suite, wrapper });
    nestedCounts.set(nesting, (nestedCounts.get(nesting) || 0) + 1);
    if (wrapper) { requireValue(event.type === 'test:fail' && !suite, 'Unsupported Node file wrapper'); wrappers.push(row); runtimeFailures.push({ file, message: 'Node file/process wrapper failed', error: details.error ?? null }); }
    else if (suite) { suites.push(row); if (event.type === 'test:fail') runtimeFailures.push({ file, message: 'Declared Node suite failed', error: details.error ?? null }); }
    else assertions.push(row);
  }
  requireValue(hash.digest('hex') === end.sha256, 'Node event digest mismatch');
  requireValue(summaries.length > 0 && rootPlans.length > 0, 'Node final summary/root plan absent');
  const summary = record(summaries.at(-1)), counts = record(summary.counts);
  for (const key of ['tests', 'suites', 'passed', 'cancelled', 'skipped', 'todo', 'topLevel']) integer(counts[key], `Node summary ${key}`);
  requireValue(typeof summary.success === 'boolean', 'Node terminal success field missing');
  if (summary.file) scope.normalizeFile(summary.file);
  requireValue(counts.cancelled === 0, 'Node cancellation requires an explicit supported leaf classifier; pending coverage is not inferred');
  const leaf = counters(assertions), wrapperFailed = wrappers.filter(row => row.status === 'failed').length;
  const failed = counts.tests - counts.passed - counts.skipped - counts.todo - counts.cancelled;
  requireValue(failed >= 0 && counts.tests === assertions.length + wrappers.length && counts.suites === suites.length && counts.passed === leaf.passed && counts.skipped === leaf.skipped && counts.todo === leaf.todo && failed === leaf.failed + wrapperFailed, 'Node final summary/leaf inventory mismatch');
  if (Object.hasOwn(counts, 'failed')) requireValue(counts.failed === failed, 'Node failed summary mismatch');
  const topLevel = outcomes.filter(row => row.nesting === 0).length;
  requireValue(counts.topLevel === topLevel && rootPlans.every(count => count === topLevel), 'Node root plan/top-level inventory mismatch');
  requireValue([...nestedCounts].every(([level, count]) => level === 0 || count === 0), 'Node nested plan missing');
  const files = [...new Set(outcomes.map(row => row.file))]; exactInventory(files, scope.files);
  const complete = wrappers.length === 0 && assertions.length > 0 && leaf.pending === 0;
  return { kind: 'node-test-events', files, assertions, suiteCount: suites.length, passed: leaf.passed, failed, skipped: leaf.skipped, todo: leaf.todo, pending: counts.cancelled, complete,
    success: complete && summary.success && failed === 0 && leaf.skipped === 0 && leaf.todo === 0 && runtimeFailures.length === 0,
    runtimeFailures, diagnostics, fileFailureCount: wrappers.length, runnerTestCount: counts.tests, nodeVersion: header.nodeVersion, childTerminalRequired: true };
}
