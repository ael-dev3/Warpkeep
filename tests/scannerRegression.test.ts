// @vitest-environment node
import { spawnSync, type SpawnSyncOptionsWithStringEncoding } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, expect, it } from 'vitest';
import { parse } from 'yaml';
import { runScannerRegression, type CommandResult } from '../scripts/verify-scanner-regression';
import { preparationPrivateJwk } from '../services/release-recovery/test/preparationFixture';
import { RECOVERY_PUBLIC_JWK, RECOVERY_KEY_THUMBPRINT } from '../services/release-recovery/src/recoveryPublicKey';

const parents: string[] = [];
it('proves PTR and G002 observation exceptions identify only the existing synthetic public key thumbprint', () => {
  const thumbprint = (key: JsonWebKey) => createHash('sha256').update(JSON.stringify({
    crv: key.crv, kty: key.kty, x: key.x, y: key.y,
  })).digest('base64url');
  const fixtureThumbprint = thumbprint(preparationPrivateJwk);
  expect(thumbprint(RECOVERY_PUBLIC_JWK)).toBe(RECOVERY_KEY_THUMBPRINT);
  expect(fixtureThumbprint).not.toBe(RECOVERY_KEY_THUMBPRINT);
  for (const path of ['services/release-recovery/test/ptrObservation.test.ts',
    'services/release-recovery/test/signerPtrObservation.test.ts', 'tests/ptrProductionStateObservation.test.ts',
    'tests/ptrProductionExistingUpdate.test.ts', 'tests/ptrProductionExistingUpdateContinuation.test.ts',
    'services/release-recovery/test/g002UpdateObservation.test.ts',
    'services/release-recovery/test/signerG002UpdateObservation.test.ts',
    'services/release-recovery/test-workerd/g002UpdateObservation.test.ts']) {
    const source = readFileSync(path, 'utf8');
    expect(source.match(/RECOVERY_KEY_THUMBPRINT:\s*'([^']+)'/u)?.[1]).toBe(fixtureThumbprint);
    expect(source).toContain(`x: '${preparationPrivateJwk.x}'`);
    expect(source).toContain(`y: '${preparationPrivateJwk.y}'`);
    expect(source).not.toContain(preparationPrivateJwk.d);
  }
});
it('runs the real regression with the verified scanner before preserving the full-history scan', () => {
  const workflow = parse(readFileSync('.github/workflows/verify.yml', 'utf8'));
  const step = workflow.jobs.linux.steps.find((value: { name?: string }) => value.name === 'Scan repository history for secrets');
  expect(step.env).toEqual({ GITLEAKS_VERSION: '8.30.1', GITLEAKS_SHA256: '551f6fc83ea457d62a0d98237cbad105af8d557003051f41f3e7ca7b3f2470eb' });
  const commands = (step.run as string).replace(/\\\r?\n\s*/gu, '').trim().split(/\r?\n/gu);
  const verify = commands.indexOf('echo "${GITLEAKS_SHA256}  ${archive}" | sha256sum --check --strict -');
  const extract = commands.indexOf('tar -xzf "$archive" -C "$bin_dir" gitleaks');
  const regression = commands.indexOf('node --experimental-strip-types scripts/verify-scanner-regression.ts "$bin_dir/gitleaks"');
  const history = commands.indexOf('"$bin_dir/gitleaks" git --config .gitleaks.toml --redact --no-banner --log-opts=HEAD .');
  expect(verify).toBeGreaterThan(-1); expect(extract).toBeGreaterThan(verify);
  expect(regression).toBeGreaterThan(extract); expect(history).toBeGreaterThan(regression);
  expect(commands[0]).toBe('set -euo pipefail'); expect(step).not.toHaveProperty('continue-on-error');
});
afterEach(() => { for (const parent of parents.splice(0)) rmSync(parent, { recursive: true, force: true }); });
function run(scan: (options: SpawnSyncOptionsWithStringEncoding) => CommandResult, timeoutMs = 100) {
  const parent = mkdtempSync(join(tmpdir(), 'warpkeep-scanner-test-')); parents.push(parent);
  const result = runScannerRegression({ scanner: process.execPath, config: resolve('.gitleaks.toml'), tempParent: parent,
    timeoutMs, execute: (file: string, args: string[], options: SpawnSyncOptionsWithStringEncoding) => {
      if (file !== process.execPath) return spawnSync(file, args, options);
      if (args[0] === 'version') return { status: 0, stdout: '8.30.1\n', stderr: '' };
      return scan(options);
    } });
  expect(readdirSync(parent)).toEqual([]);
  return result;
}
it('rejects scanner output missing the mandatory negative findings and cleans its fixture', () => {
  const result = run(() => ({ status: 0, stdout: '[]', stderr: '' }));
  expect(result).toMatchObject({ ok: false, reason: 'finding-mismatch', missing: expect.any(Array), unexpected: [] });
  expect(result.missing).toEqual(expect.arrayContaining([
    'generic-api-key:scripts/sealed-realms-production-g001-lane.bundle.mjs:2',
    'generic-api-key:scripts/sealed-realms-production-g001-lane.bundle.mjs:4',
    'generic-api-key:scripts/sealed-realms-production-g001-lane.bundle.mjs.copy:1',
    'generic-api-key:scripts/sealed-realms-production-g001-lane.bundle.mjs.copy:2',
    'sourcegraph-access-token:scripts/sealed-realms-production-activation-lane.bundle.mjs:6',
    'sourcegraph-access-token:scripts/sealed-realms-production-activation-lane.bundle.mjs:26',
    'sourcegraph-access-token:scripts/sealed-realms-production-activation-lane.bundle.mjs.copy:1',
    'sourcegraph-access-token:scripts/sealed-realms-production-activation-lane.bundle.mjs.copy:11',
    'sourcegraph-access-token:scripts/sealed-realms-production-g001-lane.bundle.mjs:5',
    'sourcegraph-access-token:scripts/sealed-realms-production-g001-lane.bundle.mjs:15',
    'sourcegraph-access-token:docs/agent-notes/0.4.0/execution-handoff.md:2',
    'sourcegraph-access-token:docs/agent-notes/0.4.0/execution-handoff.md:4',
    'sourcegraph-access-token:docs/evidence/0.4.0/release-engineering.md:2',
    'sourcegraph-access-token:docs/evidence/0.4.0/release-engineering.md:4',
    'sourcegraph-access-token:docs/evidence/0.4.0/unrelated-source.md:1',
    'sourcegraph-access-token:docs/evidence/0.4.0/unrelated-source.md:2',
    'generic-api-key:services/release-recovery/test/ptrObservation.test.ts:2',
    'generic-api-key:services/release-recovery/test/signerPtrObservation.test.ts:2',
    'generic-api-key:tests/ptrProductionStateObservation.test.ts:2',
    'generic-api-key:services/release-recovery/test/ptrObservation.test.ts.copy:1',
    'generic-api-key:services/release-recovery/test/signerPtrObservation.test.ts.copy:1',
    'generic-api-key:tests/ptrProductionStateObservation.test.ts.copy:1',
    'generic-api-key:tests/ptrProductionExistingUpdate.test.ts:2',
    'generic-api-key:tests/ptrProductionExistingUpdateContinuation.test.ts:2',
    'generic-api-key:tests/ptrProductionExistingUpdate.test.ts.copy:1',
    'generic-api-key:tests/ptrProductionExistingUpdateContinuation.test.ts.copy:1',
    'generic-api-key:services/release-recovery/test/g002UpdateObservation.test.ts:2',
    'generic-api-key:services/release-recovery/test/signerG002UpdateObservation.test.ts:2',
    'generic-api-key:services/release-recovery/test-workerd/g002UpdateObservation.test.ts:2',
    'generic-api-key:services/release-recovery/test/g002UpdateObservation.test.ts.copy:1',
    'generic-api-key:services/release-recovery/test/signerG002UpdateObservation.test.ts.copy:1',
    'generic-api-key:services/release-recovery/test-workerd/g002UpdateObservation.test.ts.copy:1',
    'generic-api-key:scripts/recovery-binding-projection.mjs:2',
    'generic-api-key:services/release-recovery/src/githubEvidence.ts:4',
    'generic-api-key:tests/fixtures/recoveryG002PtrAdoptionCandidate.ts:2',
    'generic-api-key:scripts/recovery-binding-projection.mjs.copy:1',
    'generic-api-key:services/release-recovery/src/githubEvidence.ts.copy:1',
    'generic-api-key:tests/fixtures/recoveryG002PtrAdoptionCandidate.ts.copy:1',
    'generic-api-key:wrong-public-values.ts:7',
  ]));
  expect(result.missing).toHaveLength(95);
});
it('reports unexpected finding identities without exposing scanner payloads', () => {
  const result = run(() => ({ status: 1, stdout: JSON.stringify([{ RuleID: 'jwt', File: 'unexpected.ts', StartLine: 7, Secret: 'DO-NOT-PRINT', Match: 'DO-NOT-PRINT' }]), stderr: '' }));
  expect(result.unexpected).toEqual(['jwt:unexpected.ts:7']); expect(result.missing).toHaveLength(95);
  expect(JSON.stringify(result)).not.toContain('DO-NOT-PRINT');
});
it('fails closed on scanner failure or malformed output', () => {
  expect(run(() => ({ status: 2, stdout: '', stderr: 'DO-NOT-PRINT' }))).toMatchObject({ ok: false, reason: 'scanner-failed' });
  expect(run(() => ({ status: 1, stdout: '{not json}', stderr: '' }))).toMatchObject({ ok: false, reason: 'invalid-report' });
});
it('bounds a genuinely stalled scanner process and cleans its fixture', () => {
  const started = Date.now();
  const result = run(options => spawnSync(process.execPath, ['-e', 'setTimeout(() => {}, 10000)'], options));
  expect(result).toMatchObject({ ok: false, reason: 'scanner-timeout' }); expect(Date.now() - started).toBeLessThan(5000);
});
it('bounds actual excessive process output without publishing that output', () => {
  const result = run(options => spawnSync(process.execPath, ['-e', "process.stdout.write('X'.repeat(2097152))"], options), 2000);
  expect(result).toMatchObject({ ok: false, reason: 'scanner-failed' }); expect(JSON.stringify(result).length).toBeLessThan(200);
});
