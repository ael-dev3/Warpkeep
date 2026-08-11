import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

import {
  GREATER_REALM_CONNECTED_ACTIVE_POPULATION_CONCURRENCY,
  GREATER_REALM_CONNECTED_ACTIVE_POPULATION_DATABASE,
  GREATER_REALM_CONNECTED_ACTIVE_POPULATION_TIMEOUT_MILLISECONDS,
  GREATER_REALM_CONNECTED_CASTLE_CAPACITY,
  GREATER_REALM_CONNECTED_EXPECTED_CLI_COMMIT,
  GREATER_REALM_CONNECTED_EXPECTED_CLI_VERSION,
  GREATER_REALM_CONNECTED_FINAL_WORKER_COUNT,
  GREATER_REALM_CONNECTED_POST_CANARY_FOUNDERS,
  GREATER_REALM_CONNECTED_TIMING_SUBSTITUTIONS,
  applyExactGreaterRealmConnectedTimingSubstitution,
} from '../scripts/verify-greater-realm-connected-active-population';
import {
  DISPOSABLE_ACTIVATION_GATE_DECLARATION,
  DISPOSABLE_IMPORT_GATE_DECLARATION,
  DISPOSABLE_RELOCATION_REDUCER_MODULE,
  PRODUCTION_ACTIVATION_GATE_DECLARATION,
  PRODUCTION_IMPORT_GATE_DECLARATION,
} from '../scripts/verify-greater-realm-connected-relocation';

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
const packageJson = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8'));
const workflow = readFileSync(resolve(root, '.github/workflows/verify.yml'), 'utf8');

function occurrences(value: string, needle: string): number {
  return value.split(needle).length - 1;
}

describe('connected active Greater Realm population proof boundary', () => {
  it('keeps checked-in gates literal false and all rehearsal reducers unregistered', () => {
    expect(occurrences(policy, PRODUCTION_IMPORT_GATE_DECLARATION)).toBe(1);
    expect(occurrences(policy, PRODUCTION_ACTIVATION_GATE_DECLARATION)).toBe(1);
    expect(occurrences(policy, DISPOSABLE_IMPORT_GATE_DECLARATION)).toBe(0);
    expect(occurrences(policy, DISPOSABLE_ACTIVATION_GATE_DECLARATION)).toBe(0);
    expect(index).not.toContain(DISPOSABLE_RELOCATION_REDUCER_MODULE);
    expect(index).not.toContain('rehearsal_halt_greater_realm_activation_v1');
    expect(runner).toContain('createDisposableGreaterRealmRelocationModule(runtimeDirectory)');
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
    expect(runner).toContain('await chmod(runtimeDirectory, 0o700)');
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
    expect(runner).toContain("const preflightArgument = '--preflight-101'");
    expect(runner).not.toMatch(/maincloud|spacetimedb\.com/i);
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
    expect(runner).toContain('const second = sequence[1]');
    expect(runner).toContain('selected.firstNodeOrdinal <= 0');
    expect(runner).toContain('selected.nodeCount < 2');
    expect(runner).toContain("receipt.leaseId !== `${target.locationId}:1`");
    expect(runner).toContain("row!.leaseId === `${target.locationId}:2`");
    expect(runner).toContain("['outbound', 'gathering', 'returning']");
    expect(runner).toContain("'get_realm_atlas_bootstrap_v1'");
    expect(runner).toContain("'get_realm_atlas_window_v1'");
    expect(runner).toContain("'get_realm_atlas_chunk_v1'");
    expect(runner).toContain('Connected active population public reads at 600:');
    expect(runner).toContain('window[5].length !== 1');
    expect(runner).toContain("'rehearsal_halt_greater_realm_activation_v1'");
    expect(runner).toContain("'recall_worker_v1'");
    expect(runner).toContain("'recall_all_workers_v1'");
    expect(runner).toContain('GREATER_REALM_CURRENT_WORLD_UNAVAILABLE');
    expect(runner).toContain('target.privateNodeIds.has(value)');
    expect(runner).toContain('target.privateComponentKeys.has(value)');
    expect(runner).toContain('[...capacityDigests].some(value => combined.includes(value))');
    expect(runner).toContain('private_output=false');
    expect(runner).not.toMatch(/console\.log\([^)]*(?:nodeId|componentKey|capacityDigest|target\.)/s);
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
