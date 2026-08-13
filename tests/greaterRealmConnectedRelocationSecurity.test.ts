import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

import {
  DISPOSABLE_RELOCATION_REDUCER_MODULE,
  GREATER_REALM_CONNECTED_CANARY_TIMEOUT_MILLISECONDS,
  GREATER_REALM_CONNECTED_CUTOVER_STATUS_FIELDS,
  GREATER_REALM_CONNECTED_CUTOVER_STATUS_PROCEDURE,
  GREATER_REALM_CONNECTED_FOUNDER_COUNT,
  GREATER_REALM_CONNECTED_HOSTILE_CANARY_REDUCER,
  GREATER_REALM_CONNECTED_PRODUCTION_REDUCERS,
  GREATER_REALM_CONNECTED_RELOCATION_DATABASES,
  GREATER_REALM_CONNECTED_RELOCATION_TIMEOUT_MILLISECONDS,
  GREATER_REALM_CONNECTED_STATIC_FLIP_COUNT,
  GREATER_REALM_CONNECTED_WORKER_COUNT,
  disposableGreaterRealmRelocationReducerSource,
  enableDisposableGreaterRealmRelocationGates,
  parseConnectedCutoverStatus,
} from '../scripts/verify-greater-realm-connected-relocation';
import {
  GREATER_REALM_CONNECTED_PRODUCTION_GATE_MODES,
  GREATER_REALM_IMPORT_GATE_FALSE_DECLARATION,
  GREATER_REALM_IMPORT_GATE_TRUE_DECLARATION,
  assertGreaterRealmConnectedDisposableGateMode,
  parseGreaterRealmConnectedProductionGateMode,
} from '../scripts/greater-realm-connected-gate-mode';

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
const cutoverReducers = readFileSync(
  resolve(root, 'spacetimedb/src/reducers/greaterRealmCutover.ts'),
  'utf8',
);
const generatedTypes = readFileSync(
  resolve(root, 'src/spacetime/module_bindings/types.ts'),
  'utf8',
);
const generatedBindingsIndex = readFileSync(
  resolve(root, 'src/spacetime/module_bindings/index.ts'),
  'utf8',
);
const packageJson = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8'));
const workflow = readFileSync(resolve(root, '.github/workflows/verify.yml'), 'utf8');

function occurrences(value: string, needle: string): number {
  return value.split(needle).length - 1;
}

describe('disposable Greater Realm connected relocation boundary', () => {
  it('accepts only a reviewed production mode and fully enables the private copy', () => {
    const initial = parseGreaterRealmConnectedProductionGateMode(policy);
    expect(GREATER_REALM_CONNECTED_PRODUCTION_GATE_MODES).toContain(initial.mode);
    const enabled = enableDisposableGreaterRealmRelocationGates(policy);
    expect(() => assertGreaterRealmConnectedDisposableGateMode(enabled, 'TT'))
      .not.toThrow();
    expect(parseGreaterRealmConnectedProductionGateMode(policy)).toEqual(initial);
    expect(() => enableDisposableGreaterRealmRelocationGates(enabled))
      .toThrow(/both open/i);
    expect(() => enableDisposableGreaterRealmRelocationGates(
      policy.replace(
        initial.importMutationsAllowed
          ? GREATER_REALM_IMPORT_GATE_TRUE_DECLARATION
          : GREATER_REALM_IMPORT_GATE_FALSE_DECLARATION,
        '',
      ),
    )).toThrow(/missing, duplicated, or malformed/i);
    expect(runner).toContain('parseGreaterRealmConnectedProductionGateMode(');
    expect(runner).toContain("assertGreaterRealmConnectedDisposableGateMode(enabledPolicy, 'TT')");
  });

  it('uses the nine registered production reducers and leaves zero rehearsal exports', () => {
    const reducerSource = disposableGreaterRealmRelocationReducerSource();
    expect(DISPOSABLE_RELOCATION_REDUCER_MODULE)
      .toBe('./reducers/greaterRealmRelocationConnectedRehearsal');
    expect(index).not.toContain(DISPOSABLE_RELOCATION_REDUCER_MODULE);
    expect(index).not.toContain('rehearsalPrepareGreaterRealmActivationV1');
    expect(index).not.toContain('rehearsal_prepare_greater_realm_activation_v1');
    expect(index).not.toMatch(/\brehearsal(?:_|[A-Z])/u);
    expect(index).toContain("from './reducers/greaterRealmCutover';");
    expect(Object.keys(GREATER_REALM_CONNECTED_PRODUCTION_REDUCERS)).toHaveLength(9);
    for (const name of Object.values(GREATER_REALM_CONNECTED_PRODUCTION_REDUCERS)) {
      expect(cutoverReducers).toContain(`name: '${name}'`);
      expect(runner).toContain(`'${name}'`);
      expect(reducerSource).not.toContain(`name: '${name}'`);
    }
    expect(cutoverReducers).toContain(
      "name: 'admin_get_greater_realm_cutover_status_v1'",
    );
    expect(GREATER_REALM_CONNECTED_CUTOVER_STATUS_PROCEDURE)
      .toBe('admin_get_greater_realm_cutover_status_v_1');
    expect(generatedBindingsIndex).toContain(
      `__procedureSchema("${GREATER_REALM_CONNECTED_CUTOVER_STATUS_PROCEDURE}"`,
    );
    expect(generatedBindingsIndex).not.toContain(
      '__procedureSchema("admin_get_greater_realm_cutover_status_v1"',
    );
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
    expect(reducerSource).toContain('relocateGreaterRealmCanaryAuthorizedTransactionV1');
    expect(reducerSource).toContain('runGreaterRealmCutoverTransitionWithAuditV1');
    expect(occurrences(reducerSource, 'warpkeep.reducer(')).toBe(1);
    expect(reducerSource).toContain(`name: '${GREATER_REALM_CONNECTED_HOSTILE_CANARY_REDUCER}'`);
    expect(reducerSource).toContain('GREATER_REALM_REHEARSAL_DRIFT_TARGET_INVALID');
  });

  it('pins the exact generated 137-field status wire and audit ordinal', () => {
    const start = generatedTypes.indexOf(
      'export const AdminGreaterRealmCutoverStatusV1 =',
    );
    const end = generatedTypes.indexOf(
      'export type AdminGreaterRealmCutoverStatusV1 =',
      start,
    );
    expect(start).toBeGreaterThan(-1);
    expect(end).toBeGreaterThan(start);
    const generatedFields = [...generatedTypes.slice(start, end)
      .matchAll(/^  ([A-Za-z][A-Za-z0-9]*): __t\./gmu)]
      .map(match => match[1]);
    expect(generatedFields).toEqual(GREATER_REALM_CONNECTED_CUTOVER_STATUS_FIELDS);
    expect(generatedFields).toHaveLength(137);
    expect(generatedFields[95]).toBe('auditRows');

    const wire = Array<unknown>(137).fill(null);
    const set = (field: typeof GREATER_REALM_CONNECTED_CUTOVER_STATUS_FIELDS[number], value: unknown) => {
      wire[GREATER_REALM_CONNECTED_CUTOVER_STATUS_FIELDS.indexOf(field)] = value;
    };
    for (const [field, value] of Object.entries({
      importMutationsCompiled: true,
      activationMutationsCompiled: true,
      releaseRows: 1,
      releasePresent: true,
      releaseState: 'ready',
      releaseImportsExact: true,
      releaseVerificationExact: true,
      releaseReady: true,
      activationRows: 0,
      activationPresent: false,
      activationMode: 'absent',
      rollbackEligible: false,
      resumeEligible: false,
      legacyFoundingOpen: true,
      legacyJourneyDispatchOpen: true,
      currentFounderCount: 100,
      greaterRealmClaimRows: 0,
      greaterRealmOccupancyRows: 0,
      activeClaimRows: 0,
      legacyClaimRows: 100,
      auditRows: 321,
      legacyRealmActive: true,
      atlasRows: 0,
      atlasMode: 'absent',
      activeVisibleRegionRows: 0,
      workerSystemV2Rows: 0,
      workerSystemV2Mode: 'absent',
      currentWorldGraphApplicable: false,
      currentWorldGraphExact: false,
      currentWorldIntegrityViolationCount: 0,
      activeAdmissionEligible: false,
    })) set(field as typeof GREATER_REALM_CONNECTED_CUTOVER_STATUS_FIELDS[number], value);
    expect(parseConnectedCutoverStatus(JSON.stringify(wire)).auditRows).toBe(321n);
    expect(() => parseConnectedCutoverStatus(JSON.stringify(wire.slice(1))))
      .toThrow(/wire shape changed/i);
  });

  it('uses only a private copied entrypoint with a unique exact export', () => {
    expect(runner).toContain("tmpdir(), 'warpkeep-greater-realm-relocation-',");
    expect(runner).toContain('runtimeDirectory = mkdtempSync(join(');
    expect(runner).toContain('await chmod(runtimeRoot, 0o700)');
    expect(runner).toContain('countOccurrences(copiedIndex, DISPOSABLE_RELOCATION_REDUCER_MODULE) !== 0');
    expect(runner).toContain('`${copiedIndex}${reducerExportAppend}`');
    expect(runner).toContain('countOccurrences(await readFile(copiedIndexPath, \'utf8\'), DISPOSABLE_RELOCATION_REDUCER_MODULE) !== 1');
    expect(runner).toContain("writeFile(copiedPolicyPath, enabledPolicy");
    expect(runner).toContain('const hostileReducerSource = disposableGreaterRealmRelocationReducerSource()');
    expect(runner).toContain('writeFile(reducerPath, hostileReducerSource');
    expect(runner).toContain('(moduleMetadata.mode & 0o777) !== 0o700');
    expect(runner).toContain('disposable.disposableSourceDigest');
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
    expect(runner.indexOf('installMigrationProofSignalCleanup(forceCleanup)'))
      .toBeLessThan(runner.indexOf('runtimeDirectory = mkdtempSync(join('));
    const finalCleanup = runner.lastIndexOf('terminateProcess(control.activeCliProcess);');
    const awaitedCleanup = runner.indexOf('await cleanupMigrationProofResources(', finalCleanup);
    expect(finalCleanup).toBeGreaterThan(0);
    expect(runner.indexOf('terminateProcess(serverProcess);', finalCleanup))
      .toBeLessThan(awaitedCleanup);
    expect(awaitedCleanup).toBeLessThan(runner.indexOf('removeSignalCleanup();', awaitedCleanup));
    expect(runner).toContain('Connected relocation cleanup failed safely.');
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
    expect(runner).toContain('callProductionCutoverTransition(callAdmin, \'prepare\')');
    expect(runner).toMatch(
      /callProductionCutoverTransition\(\s*callAdmin,\s*'rollback'/u,
    );
    expect(runner).toMatch(
      /callProductionCutoverTransition\(\s*callAdmin,\s*'resume'/u,
    );
    expect(runner).toContain('after.status.auditRows !== before.status.auditRows + 1n');
    expect(runner).toContain('retry.status.auditRows !== after.status.auditRows');
    expect(runner).toContain('retry.canonicalWire !== after.canonicalWire');
    expect(runner).toContain('hostileStatusAfter.status.auditRows !== hostileStatusBefore.status.auditRows');
    expect(runner).toContain('status.atlasMode !== currentMode');
    expect(runner).toContain('status.workerSystemV2Mode !== currentMode');
    expect(runner).toContain("name === 'admin_get_greater_realm_cutover_status_v1'");
    expect(runner).toContain('rehearsalReducers.length !== 1');
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
