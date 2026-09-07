// Manual Linux integration probe. Test-only key substitution; no production key override.
import assert from 'node:assert/strict';
import { createHash, generateKeyPairSync, sign } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createContext, SourceTextModule, SyntheticModule } from 'node:vm';

const kid = 'warpkeep-0.4.0-recovery-2026-09-03-1';
if (process.platform !== 'linux') throw new Error('LINUX_REQUIRED');
if (process.argv[2] === '--child') {
  const input = JSON.parse(readFileSync(0, 'utf8'));
  const context = createContext({ Buffer, TextDecoder, URL, process, setTimeout, clearTimeout,
    Date: class extends Date { static now() { return input.now * 1000; } } });
  const cache = new Map();
  const allowed = new Set(['recovery-claim-handoff.mjs', 'verify-recovery-claim-receipt.mjs', 'recovery-authorization-protocol.mjs']);
  async function load(specifier) {
    if (cache.has(specifier)) return cache.get(specifier);
    let module;
    if (specifier === './recovery-public-key.mjs' || ['node:fs', 'node:path', 'node:crypto', 'node:url', 'node:stream'].includes(specifier)) {
      const values = specifier === './recovery-public-key.mjs' ? {
        RECOVERY_KEY_ID: kid, RECOVERY_PUBLIC_JWK: input.jwk, RECOVERY_KEY_THUMBPRINT: input.thumbprint,
      } : await import(specifier);
      module = new SyntheticModule(Object.keys(values), function () {
        for (const [key, value] of Object.entries(values)) this.setExport(key, value);
      }, { context });
    } else {
      assert.ok(specifier.startsWith('./') && allowed.has(specifier.slice(2)));
      const url = new URL(`../../scripts/${specifier.slice(2)}`, import.meta.url);
      module = new SourceTextModule(readFileSync(url, 'utf8'), { context, identifier: url.href,
        initializeImportMeta(meta) { meta.url = url.href; } });
    }
    cache.set(specifier, module);
    return module;
  }
  const module = await load('./recovery-claim-handoff.mjs');
  await module.link(load); await module.evaluate();
  try {
    const api = module.namespace;
    if (input.operation === 'preflight') api.preflightRecoveryClaimHandoff(input.root);
    else if (input.operation === 'write') api.writeRecoveryClaimHandoff(input.root, input.receipt, input.expected);
    else if (input.operation === 'deploy') api.readRecoveryClaimHandoffForDeployment(input.root, input.context);
    else if (input.operation === 'reconcile') api.readRecoveryClaimHandoffForReconciliation(input.root, input.context);
    else if (input.operation === 'history') {
      const history = api.readRecoveryClaimHandoffHistory(input.root);
      assert.equal(Object.keys(history).join(','), 'purpose,contextSource');
      assert.equal(history.purpose, 'signed-history-only');
      assert.equal(history.contextSource, input.context);
    }
    else throw new Error('UNKNOWN_OPERATION');
    process.stdout.write('{"accepted":true}');
  } catch { process.stdout.write('{"accepted":false}'); }
} else {
  assert.equal(process.argv.length, 2);
  const pair = generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
  const jwk = pair.publicKey.export({ format: 'jwk' });
  const thumbprint = createHash('sha256').update(JSON.stringify({ crv: jwk.crv, kty: jwk.kty, x: jwk.x, y: jwk.y })).digest('base64url');
  const expected = { requestId: '123e4567-e89b-42d3-a456-426614174000',
    authorizationJti: '123e4567-e89b-42d3-a456-426614174001', authorizationJwsSha256: '1'.repeat(64),
    pagesRunId: '123', pagesRunAttempt: '1', sourceVerifyRunId: '456', sourceVerifyRunAttempt: '2',
    candidateCommit: 'a'.repeat(40), candidateTree: 'b'.repeat(40), artifactId: '789', artifactName: 'github-pages-recovery-123-1',
    githubArtifactArchiveSha256: '2'.repeat(64), innerArtifactTarSha256: '3'.repeat(64),
    contentManifestSha256: '4'.repeat(64), deploymentAttestationSha256: '5'.repeat(64),
    operation: 'github-pages-production-deploy', canonicalOrigin: 'https://warpkeep.com', authorizationEpoch: 7 };
  const context = Object.fromEntries(['pagesRunId', 'pagesRunAttempt', 'sourceVerifyRunId', 'sourceVerifyRunAttempt',
    'candidateCommit', 'candidateTree', 'artifactId', 'githubArtifactArchiveSha256', 'innerArtifactTarSha256',
    'contentManifestSha256', 'deploymentAttestationSha256'].map(key => [key, expected[key]]));
  const payload = { schemaVersion: 1, profile: 'warpkeep-0.4.0-recovery-claim-v1', iss: 'https://release-auth.warpkeep.com',
    aud: 'warpkeep-0.4.0-sealed-launch', sub: 'warpkeep-0.4.0-recovery-deployment-claim', kid, ...expected,
    claimSequence: 1, claimedAt: 1001, claimDeadline: 2201, iat: 1001, nbf: 1001, exp: 1121 };
  const signingInput = [ { alg: 'ES256', typ: 'warpkeep-0.4.0-recovery-claim+jwt', kid }, payload ]
    .map(value => Buffer.from(JSON.stringify(value)).toString('base64url')).join('.');
  const signature = sign('sha256', Buffer.from(signingInput), { key: pair.privateKey, dsaEncoding: 'ieee-p1363' });
  const order = 0xffffffff00000000ffffffffffffffffbce6faada7179e84f3b9cac2fc632551n;
  const s = BigInt(`0x${signature.subarray(32).toString('hex')}`);
  Buffer.from((s > order / 2n ? order - s : s).toString(16).padStart(64, '0'), 'hex').copy(signature, 32);
  const receipt = `${signingInput}.${signature.toString('base64url')}`;
  const root = mkdtempSync(join(tmpdir(), 'warpkeep-claim-probe-'));
  function run(operation, now, overrides = {}) {
    const result = spawnSync(process.execPath, ['--experimental-vm-modules', fileURLToPath(import.meta.url), '--child'], {
      input: JSON.stringify({ root, jwk, thumbprint, receipt, expected: JSON.stringify(expected), context: JSON.stringify(context), operation, now, ...overrides }),
      encoding: 'utf8', timeout: 10000, maxBuffer: 32768 });
    assert.equal(result.status, 0, 'child must terminate successfully');
    assert.match(result.stdout, /^\{"accepted":(?:true|false)\}$/u);
    return JSON.parse(result.stdout).accepted;
  }
  try {
    assert.equal(run('preflight', 1001), true);
    assert.equal(run('write', 1001), true);
    assert.equal(run('preflight', 1002), false);
    assert.equal(statSync(join(root, 'recovery-claim-v1.json')).mode & 0o777, 0o600);
    assert.equal(run('deploy', 1002), true);
    assert.equal(run('write', 1002), false);
    assert.equal(run('deploy', 1121), false);
    assert.equal(run('reconcile', 1121), true);
    assert.equal(run('history', 1002), true);
    assert.equal(run('history', 1121), true);
    assert.equal(run('history', 2201), false);
    assert.equal(run('reconcile', 2201), false);
    assert.equal(run('reconcile', 1002, { context: JSON.stringify({ ...context, artifactId: '999' }) }), false);
    const wrong = generateKeyPairSync('ec', { namedCurve: 'prime256v1' }).publicKey.export({ format: 'jwk' });
    const wrongThumbprint = createHash('sha256').update(JSON.stringify({ crv: wrong.crv, kty: wrong.kty, x: wrong.x, y: wrong.y })).digest('base64url');
    assert.equal(run('reconcile', 1002, { jwk: wrong, thumbprint: wrongThumbprint }), false);
    assert.equal(run('history', 1002, { jwk: wrong, thumbprint: wrongThumbprint }), false);
    process.stdout.write('{"crossProcessSignatureAndPersistence":true,"checks":14,"productionCredentialsUsed":false}\n');
  } finally { rmSync(root, { recursive: true }); }
}
