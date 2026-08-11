import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

import {
  DISPOSABLE_ACTIVATION_GATE_DECLARATION,
  DISPOSABLE_IMPORT_GATE_DECLARATION,
  DISPOSABLE_RELOCATION_REDUCER_MODULE,
  GREATER_REALM_CONNECTED_CANARY_TIMEOUT_MILLISECONDS,
  GREATER_REALM_CONNECTED_FOUNDER_COUNT,
  GREATER_REALM_CONNECTED_RELOCATION_DATABASES,
  GREATER_REALM_CONNECTED_RELOCATION_TIMEOUT_MILLISECONDS,
  GREATER_REALM_CONNECTED_STATIC_FLIP_COUNT,
  GREATER_REALM_CONNECTED_WORKER_COUNT,
  PRODUCTION_ACTIVATION_GATE_DECLARATION,
  PRODUCTION_IMPORT_GATE_DECLARATION,
  disposableGreaterRealmRelocationReducerSource,
  enableDisposableGreaterRealmRelocationGates,
} from '../scripts/verify-greater-realm-connected-relocation';

const root = resolve(import.meta.dirname, '..');
const runner = readFileSync(
  resolve(root, 'scripts/verify-greater-realm-connected-relocation.ts'),
  'utf8',
);
const policy = readFileSync(
  resolve(root, 'spacetimedb/src/greaterRealmV17Policy.ts'),
  'utf8',
);
const index = readFileSync(resolve(root, 'spacetimedb/src/index.ts'), 'utf8');
const schema = readFileSync(resolve(root, 'spacetimedb/src/schema.ts'), 'utf8');
const packageJson = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8'));
const workflow = readFileSync(resolve(root, '.github/workflows/verify.yml'), 'utf8');

function occurrences(value: string, needle: string): number {
  return value.split(needle).length - 1;
}

describe('disposable Greater Realm connected relocation boundary', () => {
  it('keeps both checked-in gates literally false and flips each exactly once in a copy', () => {
    expect(occurrences(policy, PRODUCTION_IMPORT_GATE_DECLARATION)).toBe(1);
    expect(occurrences(policy, PRODUCTION_ACTIVATION_GATE_DECLARATION)).toBe(1);
    expect(occurrences(policy, DISPOSABLE_IMPORT_GATE_DECLARATION)).toBe(0);
    expect(occurrences(policy, DISPOSABLE_ACTIVATION_GATE_DECLARATION)).toBe(0);

    const enabled = enableDisposableGreaterRealmRelocationGates(policy);
    expect(occurrences(enabled, PRODUCTION_IMPORT_GATE_DECLARATION)).toBe(0);
    expect(occurrences(enabled, PRODUCTION_ACTIVATION_GATE_DECLARATION)).toBe(0);
    expect(occurrences(enabled, DISPOSABLE_IMPORT_GATE_DECLARATION)).toBe(1);
    expect(occurrences(enabled, DISPOSABLE_ACTIVATION_GATE_DECLARATION)).toBe(1);
    expect(policy).toContain(PRODUCTION_IMPORT_GATE_DECLARATION);
    expect(policy).toContain(PRODUCTION_ACTIVATION_GATE_DECLARATION);
    expect(() => enableDisposableGreaterRealmRelocationGates(enabled))
      .toThrow(/exact and closed/i);
    expect(() => enableDisposableGreaterRealmRelocationGates(
      policy.replace(PRODUCTION_IMPORT_GATE_DECLARATION, ''),
    )).toThrow(/exact and closed/i);
  });

  it('leaves every relocation reducer unregistered in production', () => {
    const reducerSource = disposableGreaterRealmRelocationReducerSource();
    expect(DISPOSABLE_RELOCATION_REDUCER_MODULE)
      .toBe('./reducers/greaterRealmRelocationConnectedRehearsal');
    expect(index).not.toContain(DISPOSABLE_RELOCATION_REDUCER_MODULE);
    expect(index).not.toContain('rehearsalPrepareGreaterRealmActivationV1');
    expect(index).not.toContain('rehearsal_prepare_greater_realm_activation_v1');
    expect(index).toContain(
      "import { GREATER_REALM_RELOCATION_DORMANT_COMPILE_ANCHOR_V1 } from './greaterRealmRelocationDormant';",
    );
    expect(index).toContain('void GREATER_REALM_RELOCATION_DORMANT_COMPILE_ANCHOR_V1;');
    expect(index).not.toContain(
      'export { GREATER_REALM_RELOCATION_DORMANT_COMPILE_ANCHOR_V1 }',
    );
    expect(schema).not.toContain('rehearsal_prepare_greater_realm_activation_v1');
    expect(schema).not.toContain('rehearsal_relocate_greater_realm_canary_v1');
    expect(reducerSource).toContain('requireGreaterRealmV17ActivationGate();');
    expect(reducerSource).toContain('const admin = requireAdmin(ctx);');
    expect(reducerSource).toContain('prepareGreaterRealmActivationAuthorizedTransactionV1');
    expect(reducerSource).toContain('relocateGreaterRealmCanaryAuthorizedTransactionV1');
    expect(reducerSource).toContain('rollbackGreaterRealmBeforeCommitAuthorizedTransactionV1');
    expect(reducerSource).toContain('resumeGreaterRealmActiveAuthorizedTransactionV1');
    expect(reducerSource).toContain('GREATER_REALM_REHEARSAL_DRIFT_TARGET_INVALID');
  });

  it('uses only a private copied entrypoint with a unique exact export', () => {
    expect(runner).toContain("await mkdtemp(join(tmpdir(), 'warpkeep-greater-realm-relocation-'))");
    expect(runner).toContain('await chmod(runtimeDirectory, 0o700)');
    expect(runner).toContain('countOccurrences(copiedIndex, DISPOSABLE_RELOCATION_REDUCER_MODULE) !== 0');
    expect(runner).toContain('`${copiedIndex}${reducerExportAppend}`');
    expect(runner).toContain('countOccurrences(await readFile(copiedIndexPath, \'utf8\'), DISPOSABLE_RELOCATION_REDUCER_MODULE) !== 1');
    expect(runner).toContain("writeFile(copiedPolicyPath, enabledPolicy");
    expect(runner).toContain('writeFile(reducerPath, disposableGreaterRealmRelocationReducerSource()');
    expect(runner).not.toContain('writeFile(productionPolicyPath');
    expect(runner).not.toContain('writeFile(productionIndexPath');
  });

  it('is argument-free, numeric-loopback-only, in-memory, bounded, and cleanup ordered', () => {
    expect(GREATER_REALM_CONNECTED_RELOCATION_DATABASES).toEqual({
      rollback: 'warpkeep-greater-realm-relocation-rollback',
      resume: 'warpkeep-greater-realm-relocation-resume',
    });
    expect(GREATER_REALM_CONNECTED_RELOCATION_TIMEOUT_MILLISECONDS).toBe(1_200_000);
    expect(GREATER_REALM_CONNECTED_CANARY_TIMEOUT_MILLISECONDS).toBe(120_000);
    expect(runner).toContain('process.argv.length !== 2');
    expect(runner).toContain("'--listen-addr', `127.0.0.1:${port}`");
    expect(runner).toContain("'--in-memory'");
    expect(runner).toContain("'--delete-data=never'");
    expect(runner).toContain('installMigrationProofSignalCleanup(forceCleanup)');
    expect(runner).not.toMatch(/maincloud|spacetimedb\.com/i);
    const finalCleanup = runner.indexOf('// Active CLI processes are always killed before server/temp cleanup.');
    expect(finalCleanup).toBeGreaterThan(0);
    expect(runner.indexOf('terminateProcess(control.activeCliProcess);', finalCleanup))
      .toBeLessThan(runner.indexOf('await cleanupMigrationProofResources(', finalCleanup));
  });

  it('pins the exact maximum-shape seed/import and real lifecycle assertions', () => {
    expect(GREATER_REALM_CONNECTED_FOUNDER_COUNT).toBe(100);
    expect(GREATER_REALM_CONNECTED_WORKER_COUNT).toBe(400);
    expect(GREATER_REALM_CONNECTED_STATIC_FLIP_COUNT).toBe(12_600);
    expect(runner).toContain('createGreaterRealmRuntimeReleaseFixtureSource()');
    expect(runner).toContain('greaterRealmRuntimeReleaseFixtureSeed()');
    expect(runner).toContain("await callAdmin('admin_seed_world', [], 200, 120_000)");
    expect(runner).toContain("await callAdmin('admin_admit_founder_v1'");
    expect(runner).toContain("await callAdmin('admin_backfill_worker_roster_v1'");
    expect(runner).toContain("await callAdmin('admin_activate_inner_keep_v1'");
    expect(runner).toContain('await runRollbackScenario');
    expect(runner).toContain('await runActiveResumeScenario');
    expect(runner).toContain('Rollback did not restore byte-exact v16 topology for');
    expect(runner).toContain('Resume rewrote immutable activation history.');
    expect(runner).not.toMatch(
      /generateGreaterRealmCandidate|createGreaterRealmPrivateCandidate|selectCandidate|export-runtime-release/,
    );
  });

  it('exposes one bounded root command and runs it under a second CI deadline', () => {
    expect(packageJson.scripts['stdb:verify-greater-realm-connected-relocation'])
      .toBe('tsx scripts/verify-greater-realm-connected-relocation.ts');
    expect(workflow).toContain('timeout-minutes: 22');
    expect(workflow).toContain(
      'timeout --signal=TERM --kill-after=15s 21m npm run stdb:verify-greater-realm-connected-relocation',
    );
  });
});
