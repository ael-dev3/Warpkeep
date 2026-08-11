import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

import {
  DISPOSABLE_IMPORT_GATE_DECLARATION,
  FORBIDDEN_ACTIVATION_GATE_DECLARATION,
  GREATER_REALM_CONNECTED_DATABASE,
  GREATER_REALM_CONNECTED_AUDITED_EXPORTER_COMMIT,
  GREATER_REALM_CONNECTED_IMPORT_TIMEOUT_MILLISECONDS,
  GREATER_REALM_CONNECTED_AUDITED_SERVER_COMMITS,
  PRODUCTION_ACTIVATION_GATE_DECLARATION,
  PRODUCTION_IMPORT_GATE_DECLARATION,
  createGreaterRealmChildBindingTamper,
  enableDisposableGreaterRealmImportGate,
  exactGreaterRealmReleaseHeader,
  parseGreaterRealmConnectedStatus,
} from '../scripts/verify-greater-realm-connected-import';

const root = resolve(import.meta.dirname, '..');
const runner = readFileSync(
  resolve(root, 'scripts/verify-greater-realm-connected-import.ts'),
  'utf8',
);
const policy = readFileSync(
  resolve(root, 'spacetimedb/src/greaterRealmV17Policy.ts'),
  'utf8',
);
const reducer = readFileSync(
  resolve(root, 'spacetimedb/src/reducers/greaterRealm.ts'),
  'utf8',
);
const packageJson = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8'));
const workflow = readFileSync(resolve(root, '.github/workflows/verify.yml'), 'utf8');

function occurrences(value: string, needle: string) {
  return value.split(needle).length - 1;
}

describe('disposable Greater Realm connected import security boundary', () => {
  it('keeps both production mutation gates literally closed and changes only one copied import gate', () => {
    expect(occurrences(policy, PRODUCTION_IMPORT_GATE_DECLARATION)).toBe(1);
    expect(occurrences(policy, DISPOSABLE_IMPORT_GATE_DECLARATION)).toBe(0);
    expect(occurrences(policy, PRODUCTION_ACTIVATION_GATE_DECLARATION)).toBe(1);
    expect(occurrences(policy, FORBIDDEN_ACTIVATION_GATE_DECLARATION)).toBe(0);

    const enabled = enableDisposableGreaterRealmImportGate(policy);
    expect(occurrences(enabled, PRODUCTION_IMPORT_GATE_DECLARATION)).toBe(0);
    expect(occurrences(enabled, DISPOSABLE_IMPORT_GATE_DECLARATION)).toBe(1);
    expect(occurrences(enabled, PRODUCTION_ACTIVATION_GATE_DECLARATION)).toBe(1);
    expect(occurrences(enabled, FORBIDDEN_ACTIVATION_GATE_DECLARATION)).toBe(0);
    expect(policy).toContain(PRODUCTION_IMPORT_GATE_DECLARATION);
    expect(() => enableDisposableGreaterRealmImportGate(enabled)).toThrow(/exact and closed/i);
    expect(() => enableDisposableGreaterRealmImportGate(
      policy.replace(PRODUCTION_ACTIVATION_GATE_DECLARATION, FORBIDDEN_ACTIVATION_GATE_DECLARATION),
    )).toThrow(/exact and closed/i);
  });

  it('pins the requested exporter/server provenance and only constructs the tracked synthetic fixture', () => {
    expect(GREATER_REALM_CONNECTED_AUDITED_EXPORTER_COMMIT)
      .toBe('c4da78d1895f61faf56d5c7ceb21229d5e28ff26');
    expect(GREATER_REALM_CONNECTED_AUDITED_SERVER_COMMITS).toEqual([
      '055e08e719275a29ed9cb35c7e2abfc6db4db36b',
      'a9fcee9378f3a4360e8ff22290840686fb02508b',
    ]);
    expect(runner).toContain('createGreaterRealmRuntimeReleaseFixtureSource()');
    expect(runner).toContain('greaterRealmRuntimeReleaseFixtureSeed()');
    expect(runner).toContain('GREATER_REALM_RUNTIME_RELEASE_FIXTURE_SOURCE_COMMIT');
    expect(runner).not.toMatch(
      /generateGreaterRealmCandidate|createGreaterRealmPrivateCandidate|selectCandidate|export-runtime-release/,
    );
    expect(runner).not.toContain('admin_activate_greater_realm');
  });

  it('is numeric-loopback, in-memory, argument-free, private-copy-only, and cleanup bounded', () => {
    expect(GREATER_REALM_CONNECTED_DATABASE).toBe('warpkeep-greater-realm-connected-import');
    expect(GREATER_REALM_CONNECTED_IMPORT_TIMEOUT_MILLISECONDS).toBe(480_000);
    expect(runner).toContain("await mkdtemp(join(tmpdir(), 'warpkeep-greater-realm-import-'))");
    expect(runner).toContain('await chmod(runtimeDirectory, 0o700)');
    expect(runner).toContain("'--listen-addr', `127.0.0.1:${port}`");
    expect(runner).toContain("'--in-memory'");
    expect(runner).toContain("'--delete-data=never'");
    expect(runner).toContain('process.argv.length !== 2');
    expect(runner).toContain('installMigrationProofSignalCleanup(forceCleanup)');
    expect(runner.indexOf('const boundedTimeout = remainingTimeout(')).toBeLessThan(
      runner.indexOf('const child = spawn(command, arguments_'),
    );
    expect(occurrences(runner, 'terminateProcess(control.activeCliProcess);'))
      .toBeGreaterThanOrEqual(2);
    expect(runner).toContain('await cleanupMigrationProofResources(serverProcess, runtimeDirectory)');
    expect(runner).toContain('clearTimeout(totalDeadline)');
    expect(runner).toContain("writeFile(copiedPolicyPath, enabledPolicy");
    expect(runner).not.toContain('writeFile(productionPolicyPath');
    expect(runner).not.toMatch(/maincloud|spacetimedb\.com/i);
  });

  it('stages the exact ordered release header ABI', () => {
    const header = {
      schema: 'schema',
      classification: 'classification',
      atlasId: 'atlas',
      publicReleaseId: 'release',
      publicApprovalReceiptId: 'approval',
      sourceCommit: 'a'.repeat(40),
      generatorVersion: 'generator',
      sourceFormatVersion: 'format',
      livingWorldVersion: 'living',
      runtimePartitionVersion: 'partition',
      rendererContractVersion: 'renderer',
      visibleTierMax: 1,
      totals: {},
      legacyLowlandsBridge: {},
      regions: [],
      components: [],
      chunks: [],
      releaseSha256: 'b'.repeat(64),
    };
    expect(Object.keys(exactGreaterRealmReleaseHeader(header))).toEqual(
      Object.keys(header).slice(0, 14),
    );
    expect(() => exactGreaterRealmReleaseHeader({
      ...header,
      unexpected: true,
    })).toThrow(/manifest order/i);
  });

  it('rehashes a late resource-binding tamper without changing its canonical source chunk', () => {
    const payload = {
      schema: 'fixture',
      resourceNodes: [
        { releaseOrdinal: 7, componentKey: `GRC-${'B'.repeat(26)}` },
        { releaseOrdinal: 8, componentKey: `GRC-${'C'.repeat(26)}` },
      ],
      importBatches: { resourceNodes: [] },
      sectionDigests: { resourceNodesSha256: '0'.repeat(64) },
    };
    const original = `${JSON.stringify(payload)}\n`;
    const tampered = createGreaterRealmChildBindingTamper({
      path: 'chunks/fixture.json',
      bytes: Buffer.from(original),
      payload,
    } as never);
    const parsed = JSON.parse(tampered.payloadJson);
    expect(payload.resourceNodes[1]!.componentKey).toBe(`GRC-${'C'.repeat(26)}`);
    expect(parsed.resourceNodes[1].componentKey).toBe(`GRC-${'A'.repeat(26)}`);
    expect(parsed.importBatches.resourceNodes).toEqual([{
      batchOrdinal: 0,
      firstRowOrdinal: 7,
      rowCount: 2,
      rowsSha256: createHash('sha256')
        .update(`${JSON.stringify(parsed.resourceNodes)}\n`)
        .digest('hex'),
    }]);
    expect(parsed.sectionDigests.resourceNodesSha256)
      .toBe(parsed.importBatches.resourceNodes[0].rowsSha256);
    expect(tampered.payloadSha256)
      .toBe(createHash('sha256').update(tampered.payloadJson).digest('hex'));
  });

  it('parses the exact 29-field status ABI and keeps activation false', () => {
    const status = parseGreaterRealmConnectedStatus(JSON.stringify([
      true,
      [0, 'atlas'],
      { some: 'release' },
      'ready',
      [0, '1'],
      'complete',
      '0',
      'a'.repeat(64),
      8, 208, 16_475, 600, 12_000,
      6, '8', '208', '16475', '600', '12000',
      '0', '0', '0', '0', '0', '0',
      true, true, true, false,
    ]));
    expect(status).toMatchObject({
      present: true,
      atlasId: 'atlas',
      publicReleaseId: 'release',
      importEpoch: 1n,
      state: 'ready',
      verificationPhase: 'complete',
      importsExact: true,
      ready: true,
      importMutationsCompiled: true,
      activationMutationsCompiled: false,
      activationRows: 0n,
      publicAtlasRows: 0n,
      publicRegionRows: 0n,
    });
  });

  it('keeps the real finalizer on server randomness and runs the proof under a second CI deadline', () => {
    expect(reducer).toContain('finalizeGreaterRealmReleaseV1(ctx, input, ctx.random)');
    expect(packageJson.scripts['stdb:verify-greater-realm-connected-import'])
      .toBe('tsx scripts/verify-greater-realm-connected-import.ts');
    expect(workflow).toContain('timeout-minutes: 10');
    expect(workflow).toContain(
      'timeout --signal=TERM --kill-after=15s 9m npm run stdb:verify-greater-realm-connected-import',
    );
  });
});
