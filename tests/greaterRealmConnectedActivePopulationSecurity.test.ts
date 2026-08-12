import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

import {
  GREATER_REALM_CONNECTED_ACTIVE_POPULATION_CONCURRENCY,
  GREATER_REALM_CONNECTED_ACTIVE_POPULATION_DATABASE,
  GREATER_REALM_CONNECTED_ACTIVE_POPULATION_TIMEOUT_MILLISECONDS,
  GREATER_REALM_CONNECTED_BOOTSTRAP_SLO_MILLISECONDS,
  GREATER_REALM_CONNECTED_CASTLE_CAPACITY,
  GREATER_REALM_CONNECTED_CHUNK_SLO_MILLISECONDS,
  GREATER_REALM_CONNECTED_EXPECTED_CLI_COMMIT,
  GREATER_REALM_CONNECTED_EXPECTED_CLI_VERSION,
  GREATER_REALM_CONNECTED_EXPECTED_GATHER_QUANTA,
  GREATER_REALM_CONNECTED_FINAL_WORKER_COUNT,
  GREATER_REALM_CONNECTED_POST_CANARY_FOUNDERS,
  GREATER_REALM_CONNECTED_PRIVATE_SQL_CREDENTIAL_SECONDS,
  GREATER_REALM_CONNECTED_READ_TOTAL_SLO_MILLISECONDS,
  GREATER_REALM_CONNECTED_RESOURCE_LOCATIONS_SLO_MILLISECONDS,
  GREATER_REALM_CONNECTED_TIMING_SUBSTITUTIONS,
  GREATER_REALM_CONNECTED_WINDOW_SLO_MILLISECONDS,
  applyExactGreaterRealmConnectedTimingSubstitution,
  parseGreaterRealmConnectedSqlTimestampNanoseconds,
} from '../scripts/verify-greater-realm-connected-active-population';
import {
  DISPOSABLE_RELOCATION_REDUCER_MODULE,
} from '../scripts/verify-greater-realm-connected-relocation';
import {
  GREATER_REALM_CONNECTED_PRODUCTION_GATE_MODES,
  parseGreaterRealmConnectedProductionGateMode,
} from '../scripts/greater-realm-connected-gate-mode';

const root = resolve(import.meta.dirname, '..');
const runner = readFileSync(
  resolve(root, 'scripts/verify-greater-realm-connected-active-population.ts'),
  'utf8',
);
const policy = readFileSync(
  resolve(root, 'spacetimedb/src/greaterRealmV17Policy.ts'),
  'utf8',
);
const index = readFileSync(resolve(root, 'spacetimedb/src/index.ts'), 'utf8');
const relocationRunner = readFileSync(
  resolve(root, 'scripts/verify-greater-realm-connected-relocation.ts'),
  'utf8',
);
const resourceLocationAuthorityTest = readFileSync(
  resolve(root, 'spacetimedb/tests/greaterRealmResourceLocationAuthority.test.ts'),
  'utf8',
);
const packageJson = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8'));
const workflow = readFileSync(resolve(root, '.github/workflows/verify.yml'), 'utf8');

function occurrences(value: string, needle: string): number {
  return value.split(needle).length - 1;
}

describe('connected active Greater Realm population proof boundary', () => {
  it('accepts only a reviewed production mode and leaves all rehearsal reducers unregistered', () => {
    const initial = parseGreaterRealmConnectedProductionGateMode(policy);
    expect(GREATER_REALM_CONNECTED_PRODUCTION_GATE_MODES).toContain(initial.mode);
    expect(index).not.toContain(DISPOSABLE_RELOCATION_REDUCER_MODULE);
    expect(index).not.toContain('rehearsal_halt_greater_realm_activation_v1');
    expect(runner).toContain('createDisposableGreaterRealmRelocationModule(runtimeRoot)');
    expect(runner).toContain('parseGreaterRealmConnectedProductionGateMode(productionPolicy).mode');
    expect(relocationRunner).toContain("normalizeGreaterRealmConnectedDisposableGateMode(source, 'TT')");
    expect(runner).not.toContain('writeFile(productionPolicyPath');
    expect(runner).not.toContain('writeFile(productionIndexPath');
  });

  it('changes only ten exact timing declarations in the mode-0700 private copy', () => {
    expect(GREATER_REALM_CONNECTED_TIMING_SUBSTITUTIONS).toHaveLength(10);
    const grouped = new Map<string, typeof GREATER_REALM_CONNECTED_TIMING_SUBSTITUTIONS[number][]>();
    for (const substitution of GREATER_REALM_CONNECTED_TIMING_SUBSTITUTIONS) {
      const source = readFileSync(
        resolve(root, 'spacetimedb', substitution.relativePath),
        'utf8',
      );
      expect(occurrences(source, substitution.production)).toBe(1);
      expect(occurrences(source, substitution.rehearsal)).toBe(0);
      const changed = applyExactGreaterRealmConnectedTimingSubstitution(
        source,
        substitution,
      );
      expect(occurrences(changed, substitution.production)).toBe(0);
      expect(occurrences(changed, substitution.rehearsal)).toBe(1);
      expect(() => applyExactGreaterRealmConnectedTimingSubstitution(
        changed,
        substitution,
      )).toThrow(/drifted/i);
      grouped.set(substitution.relativePath, [
        ...(grouped.get(substitution.relativePath) ?? []),
        substitution,
      ]);
    }
    expect(grouped.size).toBe(5);
    expect(runner).toContain('await chmod(runtimeRoot, 0o700)');
    expect(runner).toContain("mode: 0o600, flag: 'w'");
    expect(runner).toContain("await directoryDigest(join(sourceModule, 'src'))");
  });

  it('is pinned, numeric-loopback-only, in-memory, signal-safe, and hard bounded', () => {
    expect(GREATER_REALM_CONNECTED_ACTIVE_POPULATION_DATABASE)
      .toBe('warpkeep-greater-realm-active-population');
    expect(GREATER_REALM_CONNECTED_ACTIVE_POPULATION_TIMEOUT_MILLISECONDS)
      .toBe(1_500_000);
    expect(GREATER_REALM_CONNECTED_EXPECTED_CLI_VERSION).toBe('2.6.1');
    expect(GREATER_REALM_CONNECTED_EXPECTED_CLI_COMMIT)
      .toBe('052c83fe984a4c4eb7bb4f9afa5c6b1903891d87');
    expect(runner).toContain("tmpdir(), 'warpkeep-greater-realm-active-population-',");
    expect(runner).toContain("'--listen-addr', `127.0.0.1:${port}`");
    expect(runner).toContain("'--in-memory'");
    expect(runner).toContain('installMigrationProofSignalCleanup(forceCleanup)');
    expect(runner).toContain('terminateProcess(control.activeCliProcess)');
    expect(runner).toContain('await cleanupMigrationProofResources(serverProcess, runtimeDirectory)');
    expect(runner.indexOf('installMigrationProofSignalCleanup(forceCleanup)'))
      .toBeLessThan(runner.indexOf('runtimeDirectory = mkdtempSync(join('));
    expect(runner).toContain('rmSync(runtimeDirectory, { recursive: true, force: true });');
    expect(runner).not.toContain('The awaited final cleanup remains authoritative.');
    expect(runner.indexOf('terminateProcess(serverProcess);'))
      .toBeLessThan(runner.indexOf('await cleanupMigrationProofResources(serverProcess, runtimeDirectory)'));
    expect(runner.indexOf('await cleanupMigrationProofResources(serverProcess, runtimeDirectory)'))
      .toBeLessThan(runner.indexOf('removeSignalCleanup();'));
    expect(runner).toContain('Connected active-population cleanup failed safely.');
    expect(runner).toContain("const preflightArgument = '--preflight-101'");
    expect(runner).not.toMatch(/maincloud|spacetimedb\.com/i);
  });

  it('rotates a fresh exact 240-second owner-private CLI credential for every SQL read', () => {
    expect(GREATER_REALM_CONNECTED_PRIVATE_SQL_CREDENTIAL_SECONDS).toBe(240);
    expect(runner).toContain('claims.exp - claims.iat !== GREATER_REALM_CONNECTED_PRIVATE_SQL_CREDENTIAL_SECONDS');
    expect(runner).toContain("{ encoding: 'utf8', mode: 0o600, flag: 'wx' }");
    expect(runner).toContain('await rename(temporaryPath, cliConfigPath)');
    expect(runner).toContain('control.refreshPrivateSqlCredential = () => rotatePrivateSqlCredential(');
    expect(relocationRunner).toContain('refreshPrivateSqlCredential?: () => Promise<string>');
    expect(relocationRunner).toContain('privateSqlOperationTail?: Promise<void>');
    expect(relocationRunner).toContain('const prior = control.privateSqlOperationTail ?? Promise.resolve()');
    expect(relocationRunner).toContain('await control.refreshPrivateSqlCredential()');
    expect(relocationRunner).toContain('[ownerToken, sqlCredential]');
    expect(relocationRunner).toContain('releaseCurrent();');
    expect(runner).not.toMatch(/console\.(?:log|error)\([^)]*(?:credential|Token)/s);
  });

  it('parses only the pinned CLI timestamp forms at exact microsecond bounds', () => {
    const parse = (value: string) => parseGreaterRealmConnectedSqlTimestampNanoseconds(
      value,
      'Test timestamp',
    );
    expect(parse(
      '(__timestamp_micros_since_unix_epoch__ = 1970-01-01T00:00:00.000000+00:00)',
    )).toBe(0n);
    expect(parse(
      '(some = (__timestamp_micros_since_unix_epoch__ = 1970-01-01T00:00:00.000001+00:00))',
    )).toBe(1_000n);
    expect(parse('1970-01-01T00:00:00.000001+00:00')).toBe(1_000n);
    expect(parse('1970-01-01T00:00:00.001+00:00')).toBe(1_000_000n);
    expect(parse(
      '(__timestamp_micros_since_unix_epoch__ = 9999-12-31T23:59:59.999999+00:00)',
    )).toBe(253_402_300_799_999_999_000n);
    expect(parseGreaterRealmConnectedSqlTimestampNanoseconds('(none)', 'Test timestamp'))
      .toBeUndefined();
    for (const invalid of [
      '1969-12-31T23:59:59.999999Z',
      '(__timestamp_micros_since_unix_epoch__ = 1969-12-31T23:59:59.999999+00:00)',
      '(__timestamp_micros_since_unix_epoch__ = 2026-02-29T00:00:00.000000+00:00)',
      '(__timestamp_micros_since_unix_epoch__ = 2026-01-01T00:00:00+00:00)',
      '(__timestamp_micros_since_unix_epoch__ = 2026-01-01T00:00:00.0+00:00)',
      '(__timestamp_micros_since_unix_epoch__ = 2026-01-01T00:00:00.00+00:00)',
      '(__timestamp_micros_since_unix_epoch__ = 2026-01-01T00:00:00.0000+00:00)',
      '(__timestamp_micros_since_unix_epoch__ = 2026-01-01T00:00:00.00000+00:00)',
      '(__timestamp_micros_since_unix_epoch__ = 2026-01-01T00:00:00.0000000+00:00)',
      '(__timestamp_micros_since_unix_epoch__ = 2026-01-01T00:00:00.00000000+00:00)',
      '(__timestamp_micros_since_unix_epoch__ = 2026-01-01T00:00:00.000000000+00:00)',
      '(__timestamp_micros_since_unix_epoch__ = 2026-01-01T00:00:00.000000+01:00)',
      '(__timestamp_micros_since_unix_epoch__ = 2026-01-01T00:00:00.000000-00:00)',
      '(__timestamp_micros_since_unix_epoch__ = 2026-13-01T00:00:00.000000+00:00)',
      '(__timestamp_micros_since_unix_epoch__ = 2026-01-01T24:00:00.000000+00:00)',
      '(__timestamp_micros_since_unix_epoch_ = 2026-01-01T00:00:00.000000+00:00)',
    ]) expect(() => parse(invalid)).toThrow(/encoding was invalid/);
    expect(runner).not.toContain('Date.parse(');
  });

  it('uses the production request-CAS admission path with bounded serialization and retry proof', () => {
    expect(GREATER_REALM_CONNECTED_ACTIVE_POPULATION_CONCURRENCY).toBe(8);
    expect(GREATER_REALM_CONNECTED_CASTLE_CAPACITY).toBe(600);
    expect(GREATER_REALM_CONNECTED_FINAL_WORKER_COUNT).toBe(2_400);
    expect(GREATER_REALM_CONNECTED_POST_CANARY_FOUNDERS).toBe(500);
    expect(runner).toContain("'access_request_submit_v1'");
    expect(runner).toContain("'admin_admit_founder_for_access_request_v2'");
    expect(runner).not.toContain("'admin_admit_founder_v1'");
    expect(runner).toContain('firstOrdinal += GREATER_REALM_CONNECTED_ACTIVE_POPULATION_CONCURRENCY');
    expect(runner).toContain('const tuples = await Promise.all(fids.map(fid => callers.submitRequest(fid)))');
    expect(runner).toContain('ACCESS_REQUEST_ADMISSION_CAS_MISMATCH');
    expect(runner).toContain('founderAtomicityQueries');
    expect(runner).toContain('GREATER_REALM_CASTLE_CAPACITY_EXHAUSTED');
    expect(runner).toContain('regions=6x100');
  });

  it('proves real nonzero-ordinal capacity and active/halted Worker lifecycle privacy', () => {
    const haltedProof = runner.slice(
      runner.indexOf('async function runHaltedCapacityAndReturnProof('),
      runner.indexOf('async function main()'),
    );
    expect(runner).toContain('const second = sequence[1]');
    expect(runner).toContain('selected.firstNodeOrdinal <= 0');
    expect(runner).toContain('selected.nodeCount < 2');
    expect(runner).toContain("receipt.leaseId !== `${target.locationId}:1`");
    expect(runner).toContain("row!.leaseId === `${target.locationId}:2`");
    expect(runner).toContain("['outbound', 'gathering', 'returning']");
    expect(runner).toContain('startObservation(cancelled => pollWorkerJourney(');
    expect(runner).toContain('startObservation(cancelled => observeWorkersGathering(');
    expect(runner).toContain('startObservation(cancelled => observeWorkersReturn(');
    expect(runner).toContain('routeObservationBudgetMilliseconds(');
    expect(runner).toContain('void promise.catch(() => {');
    expect(runner).not.toContain('waitForWorkersIdle');
    expect(runner.indexOf('startObservation(cancelled => observeWorkersReturn('))
      .toBeLessThan(runner.indexOf('await callers.callAdmin(GREATER_REALM_CONNECTED_PRODUCTION_REDUCERS.halt)'));
    expect(haltedProof.indexOf('startObservation(cancelled => observeWorkersReturn('))
      .toBeLessThan(haltedProof.indexOf('const halted = await readActivationCounters('));
    expect(haltedProof.indexOf('outputs.push(...await returnObservation.promise);'))
      .toBeLessThan(haltedProof.indexOf('const founderBefore = await tableDigest('));
    expect(runner).toContain("'get_realm_atlas_bootstrap_v1'");
    expect(runner).toContain("'get_realm_atlas_window_v1'");
    expect(runner).toContain("'get_realm_atlas_chunk_v1'");
    expect(occurrences(runner, "'get_realm_atlas_resource_locations_v1'")).toBeGreaterThanOrEqual(2);
    expect(runner).toContain('Connected active population public reads at 600:');
    expect(runner).toContain('bootstrap.length !== 22');
    expect(runner).toContain('window.length !== 7');
    expect(runner).toContain('window[6].length !== expected.castles.length');
    expect(runner).toContain('callerProjectionCount !== 1');
    expect(runner).toContain("readUnsigned(bootstrap[17], 'Capacity caller castle id')");
    expect(runner).toContain('bootstrap[18] !== expectedWindow.callerCellKey');
    expect(runner).toContain('bootstrap[19] !== expectedWindow.callerAtlasQ');
    expect(runner).toContain('bootstrap[20] !== expectedWindow.callerAtlasR');
    expect(runner).toContain('bootstrap[21] !== expectedWindow.callerElevation');
    expect(runner).toContain('bootstrap_fields=22');
    expect(runner).toContain('window_castles=${availability.windowCastleCount}');
    expect(runner).toContain('chunk[7].length !== 0');
    expect(runner).toContain('batch[0] !== target.atlasId');
    expect(runner).toContain('batch[3] !== false');
    expect(runner).toContain('batch[4].length !== target.resourceReadAccessibleCount');
    expect(runner).toContain('Halted resource-location read was not stable/readable.');
    expect(runner).toContain('resource_locations_truncated=false');
    expect(resourceLocationAuthorityTest).toContain(
      "test('skewed truncation reserves the nearest six of every available kind'",
    );
    expect(resourceLocationAuthorityTest).toContain('assert.equal(batch.truncated, true)');
    expect(runner).toContain('GREATER_REALM_CONNECTED_PRODUCTION_REDUCERS.halt');
    expect(runner).not.toContain("'rehearsal_halt_greater_realm_activation_v1'");
    expect(runner).toContain("'recall_worker_v1'");
    expect(runner).toContain("'recall_all_workers_v1'");
    expect(runner).toContain('GREATER_REALM_CURRENT_WORLD_UNAVAILABLE');
    expect(runner).toContain('target.privateNodeIds.has(value)');
    expect(runner).toContain('target.privateComponentKeys.has(value)');
    expect(runner).toContain('[...capacityDigests].some(value => combined.includes(value))');
    expect(runner).toContain('private_output=false');
    expect(runner).not.toMatch(/console\.log\([^)]*(?:nodeId|componentKey|capacityDigest|target\.)/s);
  });

  it('enforces read SLOs, exact gathering, and complete final allocation relationships', () => {
    expect(GREATER_REALM_CONNECTED_BOOTSTRAP_SLO_MILLISECONDS).toBe(5_000);
    expect(GREATER_REALM_CONNECTED_WINDOW_SLO_MILLISECONDS).toBe(5_000);
    expect(GREATER_REALM_CONNECTED_RESOURCE_LOCATIONS_SLO_MILLISECONDS).toBe(8_000);
    expect(GREATER_REALM_CONNECTED_CHUNK_SLO_MILLISECONDS).toBe(5_000);
    expect(GREATER_REALM_CONNECTED_READ_TOTAL_SLO_MILLISECONDS).toBe(18_000);
    expect(GREATER_REALM_CONNECTED_EXPECTED_GATHER_QUANTA).toBe(20n);
    expect(runner).toContain('process.hrtime.bigint()');
    expect(runner).toContain('assertReadSlo(');
    expect(runner).toContain('worker101.balances[resourceKind] + expectedDelta');
    expect(runner).toContain("claim.state !== 'active'");
    expect(runner).toContain('claim.owner_fid !== castle.owner_fid');
    expect(runner).toContain('castle.tile_key !== slot.cell_key');
    expect(runner).toContain('slot.cell_key !== occupied.cell_key');
    expect(runner).toContain('claim.atlas_id !== occupied.atlas_id');
    expect(runner).toContain('claim.activation_id !== activation.activation_id');
    expect(runner).toContain('occupiedAt !== claimActivatedAt');
    expect(runner).toContain("claimPlannedAt !== activationPlannedAt");
    expect(runner).toContain("claimActivatedAt !== activationCanaryAt");
    expect(runner).toContain('claimActivatedAt < activationActivatedAt');
    expect(runner).toContain('async function assertPopulationSqlShapeAt101(');
    expect(runner).toContain("stage = 'population-sql-preflight'");
    expect(occurrences(
      runner,
      'parseGreaterRealmConnectedSqlTimestampNanoseconds(',
    )).toBeGreaterThanOrEqual(8);
    expect(runner).toContain('slot.component_key !== sqlOptionalString(cell.component_key');
    expect(runner).toContain("readUnsigned(slot.tier, 'Final slot tier') !== 1n");
    expect(runner).toContain("readBoolean(cell.passable, 'Final cell passability')");
    expect(runner).toContain("safeInteger(castle.q, 'Final castle Q')");
    expect(runner).toContain("safeInteger(cell.elevation, 'Final cell elevation')");
    expect(runner).toContain("readUnsigned(occupied.atlas_revision, 'Final occupancy revision') !== 1n");
    expect(runner).toContain('allocationRanks.size !== 600');
    expect(runner).toContain('regionRanks.size !== 6');
    expect(runner).toContain('const expectedSlot = orderedSlots.find(slot => (');
    expect(runner).toContain("fail('Final frozen balanced selector replay was invalid.')");
    expect(runner).toContain('claim.owner_fid !== builder.fid');
    expect(runner).toContain('windowCastles.filter(row => row.castleId === callerCastleId).length !== 1');
    expect(runner).toContain("SELECT chunk_handle, atlas_id, bin_q, bin_r, core_cell_count");
    expect(runner).toContain(
      'lod_0_cell_count, lod_1_cell_count, lod_2_cell_count, lod_3_cell_count',
    );
    expect(runner).not.toContain('lod0_cell_count');
  });

  it('exposes one bounded root command and a second CI timeout envelope', () => {
    expect(packageJson.scripts['stdb:verify-greater-realm-connected-active-population'])
      .toBe('tsx scripts/verify-greater-realm-connected-active-population.ts');
    expect(workflow).toContain('timeout-minutes: 27');
    expect(workflow).toContain(
      'timeout --signal=TERM --kill-after=15s 26m npm run stdb:verify-greater-realm-connected-active-population',
    );
  });
});
