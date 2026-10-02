// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { assessNativeNamespaceDispositions, NATIVE_NAMESPACE_DISPOSITION_SOURCES,
  NATIVE_NAMESPACE_DISPOSITION_PROFILE, type NativeNamespaceDispositionContext } from '../scripts/native-source-verification-dispositions.mjs';
import { parseVitestReport } from '../scripts/native-source-verification-reports.mjs';
import type { NativeParsedReport } from '../scripts/native-source-verification-reports.mjs';

const root = '/repo', reportPath = `${root}/artifacts/qa/run-namespace-tests.report.json`;
const files = ['tests/ptrProductionExistingUpdateContinuation.test.ts', 'tests/sealedRealmsExistingUpdate.test.ts',
  'tests/sealedRealmsProductionContinuation.test.ts', 'tests/sealedRealmsProductionDispatcher.test.ts'];
const skippedTitle = 'existing-update native protocol refuses unsupported runtime before reading credentials or any response';
const target = { platform: 'linux', arch: 'x64', uid: 1000, gid: 1000 };
const context = (): NativeNamespaceDispositionContext => ({ target: { ...target },
  sourceFiles: NATIVE_NAMESPACE_DISPOSITION_SOURCES.map(source => ({ ...source })),
  command: { id: 'namespace-tests', kind: 'vitest-json', files: [...files], cwd: root,
    executable: '/usr/bin/sudo', deadlineMs: 900000, reportPath,
    args: ['-n', '/bin/bash', `${root}/scripts/test-sealed-realms-existing-update-linux.sh`, '--as',
      '1000', '1000', '/private/node', root, '--report-json', reportPath] } });
function fixture() {
  const assertion = (fullName: string, status: string) => ({ title: fullName, fullName, status,
    ancestorTitles: [], failureMessages: [] as string[] });
  return { numTotalTestSuites: 8, numPassedTestSuites: 8, numFailedTestSuites: 0, numPendingTestSuites: 0,
    numTotalTests: 5, numPassedTests: 4, numFailedTests: 0, numPendingTests: 1, numTodoTests: 0,
    success: true, snapshot: { failure: false }, testResults: files.map(file => ({ name: `${root}/${file}`,
      status: 'passed', message: '', assertionResults: [assertion('native operation rejects an invalid candidate', 'passed'),
        ...(file === files[1] ? [assertion(skippedTitle, 'skipped')] : [])] })) };
}
function parsed(report = fixture()): NativeParsedReport & { reportSuccess: boolean; failedSuiteCount: number; pendingSuiteCount: number } {
  const bytes = JSON.stringify(report);
  // Preserve the reporter terminal independently of raw all-tests-passed; the maintained
  // producer's parser integration retains this same field before applying dispositions.
  return { ...parseVitestReport(bytes, { repositoryRoot: root, expectedFiles: files }), reportSuccess: report.success,
    failedSuiteCount: report.numFailedTestSuites, pendingSuiteCount: report.numPendingTestSuites };
}

describe('fixed Linux namespace skip disposition', () => {
  it('satisfies the isolated profile while retaining the exact skipped raw leaf and false raw success', () => {
    const raw = parsed(), before = structuredClone(raw), result = assessNativeNamespaceDispositions(raw, context());
    expect(result.profile).toBe(NATIVE_NAMESPACE_DISPOSITION_PROFILE);
    expect(result.profileSatisfied).toBe(true);
    expect(result.rawAllTestsPassed).toBe(false);
    expect(result.rawCounts).toEqual({ passed: 4, failed: 0, skipped: 1, todo: 0, pending: 0 });
    expect(result.rawSuiteCounts).toEqual({ total: 8, failed: 0, pending: 0 });
    expect(result.acceptedSkipped).toEqual([{ file: files[1], title: skippedTitle, status: 'skipped',
      reason: expect.any(String) }]);
    expect(result.declaredSources).toEqual(NATIVE_NAMESPACE_DISPOSITION_SOURCES);
    expect(result.isolation.requiredSyntheticNetwork).toBe('1');
    expect(result.childTerminalRequired).toBe(true);
    expect(raw).toEqual(before);
    expect(result).not.toHaveProperty('completeCoverage');
    expect(result).not.toHaveProperty('productionAuthorized');
  });

  it.each(['renamed negative control', 'unknown native skip'])('rejects a %s instead of waiving it', title => {
    const report = fixture(); report.testResults[1].assertionResults[1].fullName = title;
    expect(() => assessNativeNamespaceDispositions(parsed(report), context())).toThrow('EXPECTED_SKIP_MISSING');
  });
  it('rejects an additional unknown skip while retaining the known negative control', () => {
    const report = fixture(); report.testResults[0].assertionResults[0].status = 'skipped';
    report.numPassedTests--; report.numPendingTests++;
    expect(() => assessNativeNamespaceDispositions(parsed(report), context())).toThrow('UNKNOWN_SKIP');
  });
  it('rejects a duplicate known leaf even when raw totals are internally consistent', () => {
    const report = fixture(); report.testResults[1].assertionResults.push({ ...report.testResults[1].assertionResults[1] });
    report.numTotalTests++; report.numPendingTests++;
    expect(() => assessNativeNamespaceDispositions(parsed(report), context())).toThrow('EXPECTED_SKIP_MISSING');
  });
  it.each(['missing', 'passed'])('rejects the required negative control when it is %s', mode => {
    const report = fixture();
    if (mode === 'missing') { report.testResults[1].assertionResults.pop(); report.numTotalTests--; }
    else { report.testResults[1].assertionResults[1].status = 'passed'; report.numPassedTests++; }
    report.numPendingTests--;
    expect(() => assessNativeNamespaceDispositions(parsed(report), context())).toThrow('EXPECTED_SKIP_MISSING');
  });
  it('rejects ordinary Darwin-only skips at this namespace boundary', () => {
    const raw = parsed(); raw.assertions[0] = { file: 'tests/genesis001HistoricalDependencyClosure.test.ts',
      title: 'historical dependencies rejects a structurally valid noncanonical historical lock before the operation', status: 'skipped' };
    expect(() => assessNativeNamespaceDispositions(raw, context())).toThrow('REPORT_INVALID');
  });
  it.each(['failed', 'todo', 'pending'] as const)('rejects an actual %s leaf', status => {
    const report = fixture(); report.testResults[0].assertionResults[0].status = status; report.numPassedTests--;
    if (status === 'failed') { report.numFailedTests++; report.success = false; report.testResults[0].status = 'failed'; }
    else if (status === 'todo') report.numTodoTests++;
    else report.numPendingTests++;
    expect(() => assessNativeNamespaceDispositions(parsed(report), context())).toThrow();
  });
  it.each(['snapshot', 'file setup', 'unhandled', 'false terminal'])('rejects %s failure despite the permitted skipped leaf', kind => {
    const report = fixture();
    if (kind === 'snapshot') report.snapshot.failure = true;
    else if (kind === 'file setup') report.testResults[0].message = 'beforeAll failed';
    else if (kind === 'false terminal') report.success = false;
    const bytes = kind === 'unhandled' ? { ...report, unhandledErrors: ['unhandled failure'] } : report;
    expect(() => assessNativeNamespaceDispositions(parsed(bytes), context())).toThrow();
  });
  it('rejects missing reporter terminal and cannot rewrite raw all-tests-passed', () => {
    const raw = parsed();
    expect(() => assessNativeNamespaceDispositions({ ...raw, reportSuccess: undefined } as never, context())).toThrow('REPORT_TERMINAL_INVALID');
    expect(() => assessNativeNamespaceDispositions({ ...raw, success: true }, context())).toThrow('RAW_OUTCOME_INVALID');
  });
  it.each(['failed', 'pending'])('rejects a %s suite independently of leaf outcomes and raw success', kind => {
    const report = fixture(); report.numPassedTestSuites--;
    if (kind === 'failed') report.numFailedTestSuites++;
    else report.numPendingTestSuites++;
    expect(() => assessNativeNamespaceDispositions(parsed(report), context())).toThrow('REPORT_TERMINAL_INVALID');
  });
  it('rejects inconsistent raw counts and missing or duplicate file inventories', () => {
    const raw = parsed();
    for (const value of [{ ...raw, passed: raw.passed + 1 }, { ...raw, files: raw.files.slice(1) },
      { ...raw, files: [raw.files[0], raw.files[0], ...raw.files.slice(2)] }]) {
      expect(() => assessNativeNamespaceDispositions(value, context())).toThrow('REPORT_INVALID');
    }
  });

  it.each([{ platform: 'darwin' }, { arch: 'arm64' }, { uid: 0 }, { gid: 0 }, { uid: -1 }])
    ('refuses an unsupported execution target %j', mutation => {
      const value = context();
      expect(() => assessNativeNamespaceDispositions(parsed(), { ...value, target: { ...value.target, ...mutation } }))
        .toThrow('TARGET_UNSUPPORTED');
    });
  it.each(['ambient command', 'interactive sudo', 'different helper', 'direct root', 'filter', 'nested report', 'different owner'])
    ('refuses %s instead of inferring isolation from a skip', mutation => {
      const value = context(), command = { ...value.command, args: [...value.command.args] };
      if (mutation === 'ambient command') { command.executable = '/private/node'; command.args = ['vitest', 'run']; }
      else if (mutation === 'interactive sudo') command.args[0] = '--';
      else if (mutation === 'different helper') command.args[2] = `${root}/scripts/another.sh`;
      else if (mutation === 'direct root') command.args[3] = '--inside';
      else if (mutation === 'filter') command.args.push('--testNamePattern=negative');
      else if (mutation === 'nested report') { command.reportPath = `${root}/artifacts/qa/nested/run.report.json`; command.args[9] = command.reportPath; }
      else command.args[4] = '1001';
      expect(() => assessNativeNamespaceDispositions(parsed(), { ...value, command })).toThrow('ISOLATION_REQUIRED');
    });
  it.each(NATIVE_NAMESPACE_DISPOSITION_SOURCES)('rejects changed source bytes for $path', source => {
    const value = context();
    expect(() => assessNativeNamespaceDispositions(parsed(), { ...value,
      sourceFiles: value.sourceFiles.map(fact => fact.path === source.path ? { ...fact, sha256: 'a'.repeat(64) } : fact) }))
      .toThrow('SOURCE_CHANGED');
  });
  it('rejects missing or duplicated source identities', () => {
    const value = context();
    expect(() => assessNativeNamespaceDispositions(parsed(), { ...value, sourceFiles: value.sourceFiles.slice(1) })).toThrow('SOURCE_INVALID');
    expect(() => assessNativeNamespaceDispositions(parsed(), { ...value, sourceFiles: [...value.sourceFiles, value.sourceFiles[0]] })).toThrow('SOURCE_INVALID');
  });
});
