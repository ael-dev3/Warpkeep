import { execFileSync, spawnSync } from 'node:child_process';
import {
  createHash,
  createHmac,
  createPublicKey,
  generateKeyPairSync,
} from 'node:crypto';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, parse, resolve } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { isExactCurrentOwnerOnlyAcl } from '../scripts/recovery-bootstrap-acl.mjs';

const repositoryRoot = resolve(__dirname, '..');
const scriptPath = join(repositoryRoot, 'scripts', 'prepare-0.4.0-recovery-bootstrap.mjs');
const fixtures: string[] = [];
const KEY_ID = 'warpkeep-0.4.0-recovery-2026-09-03-1';
const PRIVATE_FILE = 'recovery-signing-private.jwk.json';
const PUBLIC_FILE = 'recovery-signing-public.jwk.json';
const THUMBPRINT_FILE = 'recovery-signing-thumbprint.txt';
const RPC_SECRET_FILE = 'recovery-rpc-secret.txt';
const CENSUS_PEPPER_FILE = 'recovery-census-pepper.txt';
const CANARY_FID_FILE = 'player-canary-owner-fid.txt';
const AUTH_BRIDGE_PUBLIC_JWK_FILE = 'auth-bridge-signing-public.jwk.json';
const MARKER_FILE = 'recovery-bootstrap-marker.json';
const GENESIS_001_DATABASE = 'c2001f161d44e50c0a75356d79a4d10fa4a9d77ea4eddd56cda7ac6af50b570e';
const GENESIS_002_DATABASE = 'b'.repeat(64);
const PTR_DATABASE = 'd'.repeat(64);
const BRIDGE_SOURCE_COMMIT = 'e'.repeat(40);
const BRIDGE_CONFIG_EPOCH = '7';
const CANARY_FID = '12345';
const AUTH_BRIDGE_PUBLIC_JWK = Object.freeze({
  kty: 'EC',
  crv: 'P-256',
  x: 'WH7HKo4O4eNz7FE1vrGVNDAOMZ4y15Hz5UhLwBZQMUE',
  y: 'nqmP_QGGfKiOK99bEqu6_r9cKtcn4pYdmiDiKsBD2AA',
});
const currentWindowsUsername = process.platform === 'win32'
  ? execFileSync('whoami', { encoding: 'utf8' }).trim().split(/[\\/]/u).at(-1)!
  : '';

function fixtureRoot() {
  const root = mkdtempSync(join(tmpdir(), 'warpkeep-recovery-bootstrap-test-'));
  fixtures.push(root);
  return root;
}

function run(args: readonly string[], environment: NodeJS.ProcessEnv = {}) {
  return spawnSync(process.execPath, [scriptPath, ...args], {
    cwd: repositoryRoot,
    encoding: 'utf8',
    env: { ...process.env, ...environment }
  });
}

function generate(privateRoot: string, environment: NodeJS.ProcessEnv = {}) {
  return run(['--generate', '--private-root', privateRoot], environment);
}

function verifyArguments(
  privateRoot: string,
  overrides: Partial<Record<'bridgeSourceCommit' | 'bridgeConfigEpoch' | 'genesis002Database' | 'ptrDatabase', string>> = {},
) {
  return [
    '--verify',
    '--private-root', privateRoot,
    '--bridge-source-commit', overrides.bridgeSourceCommit ?? BRIDGE_SOURCE_COMMIT,
    '--bridge-config-epoch', overrides.bridgeConfigEpoch ?? BRIDGE_CONFIG_EPOCH,
    '--genesis-002-database', overrides.genesis002Database ?? GENESIS_002_DATABASE,
    '--ptr-database', overrides.ptrDatabase ?? PTR_DATABASE,
  ] as const;
}

function configureOwnerOnly(path: string) {
  chmodSync(path, 0o600);
  if (process.platform !== 'win32') return;
  const configured = spawnSync(
    'icacls',
    [path, '/inheritance:r', '/grant:r', `${currentWindowsUsername}:(F)`],
    { encoding: 'utf8', windowsHide: true },
  );
  expect(configured.status).toBe(0);
}

function writePrivateFixture(path: string, value: string) {
  writeFileSync(path, value, { encoding: 'utf8', mode: 0o600 });
  configureOwnerOnly(path);
}

function provisionVerificationInputs(privateRoot: string) {
  writePrivateFixture(
    join(privateRoot, AUTH_BRIDGE_PUBLIC_JWK_FILE),
    `${JSON.stringify(AUTH_BRIDGE_PUBLIC_JWK)}\n`,
  );
  writePrivateFixture(join(privateRoot, CANARY_FID_FILE), `${CANARY_FID}\n`);
}

function framedInput(domain: string, payload: Buffer): Buffer {
  const domainBytes = Buffer.from(`warpkeep-recovery-v1:${domain}:`, 'utf8');
  const framed = Buffer.alloc(4 + domainBytes.length + 8 + payload.length);
  framed.writeUInt32BE(domainBytes.length, 0);
  domainBytes.copy(framed, 4);
  framed.writeBigUInt64BE(BigInt(payload.length), 4 + domainBytes.length);
  payload.copy(framed, 12 + domainBytes.length);
  return framed;
}

function independentBridgeIdentity(
  privateRoot: string,
  signingPublicJwk = JSON.parse(
    readFileSync(join(privateRoot, AUTH_BRIDGE_PUBLIC_JWK_FILE), 'utf8'),
  ) as JsonWebKey,
) {
  const rpcBytes = Buffer.from(readFileSync(join(privateRoot, RPC_SECRET_FILE), 'utf8').trimEnd(), 'base64url');
  const censusBytes = Buffer.from(readFileSync(join(privateRoot, CENSUS_PEPPER_FILE), 'utf8').trimEnd(), 'base64url');
  const canaryFid = readFileSync(join(privateRoot, CANARY_FID_FILE), 'utf8').trimEnd();
  const signingPublicJwkThumbprint = createHash('sha256').update(JSON.stringify({
    crv: signingPublicJwk.crv,
    kty: signingPublicJwk.kty,
    x: signingPublicJwk.x,
    y: signingPublicJwk.y,
  }), 'utf8').digest('base64url');
  const rpcCredentialSha256 = createHash('sha256').update(rpcBytes).digest('hex');
  const censusPepperSha256 = createHash('sha256').update(censusBytes).digest('hex');
  const canaryFidHmacSha256 = createHmac('sha256', censusBytes).update(framedInput(
    'warpkeep.release-recovery.bridge-config.canary-fid.v1\n',
    Buffer.from(canaryFid, 'utf8'),
  )).digest('hex');
  const projection = {
    schemaVersion: 1,
    profile: 'warpkeep-release-recovery-bridge-config-v1',
    bridgeWorkerVersion: 'warpkeep-auth-bridge-release-recovery-v1',
    bridgeSourceCommit: BRIDGE_SOURCE_COMMIT,
    bridgeConfigEpoch: Number(BRIDGE_CONFIG_EPOCH),
    spacetimeOrigin: 'https://maincloud.spacetimedb.com',
    genesis001Database: GENESIS_001_DATABASE,
    genesis002Database: GENESIS_002_DATABASE,
    ptrDatabase: PTR_DATABASE,
    genesis001Audience: 'warpkeep-spacetimedb',
    genesis002Audience: 'warpkeep-genesis-002-spacetimedb',
    ptrAudience: 'warpkeep-ptr-spacetimedb',
    ptrEnabled: true,
    signingPublicJwkThumbprint,
    rpcCredentialSha256,
    censusPepperSha256,
    canaryFidHmacSha256,
  };
  const identity = createHash('sha256').update(framedInput(
    'warpkeep.release-recovery.bridge-config.v1\n',
    Buffer.from(JSON.stringify(projection), 'utf8'),
  )).digest('hex');
  return {
    identity,
    componentCommitments: [
      signingPublicJwkThumbprint,
      rpcCredentialSha256,
      censusPepperSha256,
      canaryFidHmacSha256,
    ],
  };
}

afterEach(() => {
  fixtures.splice(0).forEach((root) => rmSync(root, { recursive: true, force: true }));
});

// Windows cases launch real PowerShell/ACL checks for every fixture file.
// Keep a finite integration budget without timing out valid OS verification.
describe('0.4.0 recovery bootstrap', { timeout: process.platform === 'win32' ? 30_000 : 10_000 }, () => {
  it('is disabled by default and does not create a recovery key', () => {
    const root = fixtureRoot();
    const result = run([], { USERPROFILE: root });

    expect(result.status).not.toBe(0);
    expect(result.stdout).toBe('');
    expect(result.stderr).toBe('RECOVERY_BOOTSTRAP_GENERATION_REQUIRED\n');
  });

  it('requires --private-root before it will generate or validate key material', () => {
    const root = fixtureRoot();
    const result = run(['--generate'], { USERPROFILE: root });

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('RECOVERY_BOOTSTRAP_ARGUMENTS_INVALID');
    expect(existsSync(join(root, '.warpkeep'))).toBe(false);
  });

  it('requires exactly one explicit mode and an absolute private root', () => {
    const root = fixtureRoot();
    for (const args of [
      ['--generate', '--verify', '--private-root', root],
      ['--generate', '--private-root', 'relative-private-root'],
      ['--verify', '--private-root', 'relative-private-root'],
    ]) {
      const result = run(args, { USERPROFILE: root });
      expect(result.status).not.toBe(0);
      expect(result.stdout).toBe('');
      expect(result.stderr).toBe('RECOVERY_BOOTSTRAP_ARGUMENTS_INVALID\n');
    }
  });

  it('creates one disabled marked bootstrap with distinct mode-0600 key, RPC and census material', () => {
    const root = fixtureRoot();
    const privateRoot = join(root, 'private', 'release-recovery-v1');
    const result = generate(privateRoot, {
      USERPROFILE: root,
      ...(process.platform === 'win32' ? { USERNAME: 'untrusted-environment-name' } : {}),
    });

    expect(result.status).toBe(0);
    expect(result.stderr).toBe('');
    const readiness = result.stdout.match(
      /^RECOVERY_BOOTSTRAP_READY generated ([A-Za-z0-9_-]{43})\n$/u,
    );
    expect(readiness).not.toBeNull();
    const thumbprint = readiness![1];
    const privatePath = join(privateRoot, PRIVATE_FILE);
    const publicPath = join(privateRoot, PUBLIC_FILE);
    const thumbprintPath = join(privateRoot, THUMBPRINT_FILE);
    const rpcPath = join(privateRoot, RPC_SECRET_FILE);
    const censusPath = join(privateRoot, CENSUS_PEPPER_FILE);
    const markerPath = join(privateRoot, MARKER_FILE);
    const privateJwk = JSON.parse(readFileSync(privatePath, 'utf8')) as JsonWebKey;
    const publicJwk = JSON.parse(readFileSync(publicPath, 'utf8')) as JsonWebKey;
    const rpcWire = readFileSync(rpcPath, 'utf8');
    const censusWire = readFileSync(censusPath, 'utf8');
    expect(privateJwk).toMatchObject({
      kty: 'EC', crv: 'P-256', d: expect.any(String)
    });
    const independentlyDerived = createPublicKey({ key: privateJwk, format: 'jwk' })
      .export({ format: 'jwk' });
    const independentlyDerivedPublic = {
      kty: independentlyDerived.kty,
      crv: independentlyDerived.crv,
      x: independentlyDerived.x,
      y: independentlyDerived.y
    };
    const independentlyDerivedThumbprint = createHash('sha256')
      .update(JSON.stringify({
        crv: independentlyDerivedPublic.crv,
        kty: independentlyDerivedPublic.kty,
        x: independentlyDerivedPublic.x,
        y: independentlyDerivedPublic.y
      }), 'utf8')
      .digest('base64url');
    expect(publicJwk).toEqual(independentlyDerivedPublic);
    expect(thumbprint).toBe(independentlyDerivedThumbprint);
    expect(readFileSync(thumbprintPath, 'utf8')).toBe(`${thumbprint}\n`);
    expect(rpcWire).toMatch(/^[A-Za-z0-9_-]{43}\n$/u);
    expect(censusWire).toMatch(/^[A-Za-z0-9_-]{43}\n$/u);
    const signingScalar = Buffer.from(privateJwk.d!, 'base64url');
    const rpcBytes = Buffer.from(rpcWire.trimEnd(), 'base64url');
    const censusBytes = Buffer.from(censusWire.trimEnd(), 'base64url');
    expect(signingScalar).toHaveLength(32);
    expect(rpcBytes).toHaveLength(32);
    expect(censusBytes).toHaveLength(32);
    expect(rpcBytes.equals(signingScalar)).toBe(false);
    expect(censusBytes.equals(signingScalar)).toBe(false);
    expect(censusBytes.equals(rpcBytes)).toBe(false);
    expect(readFileSync(markerPath, 'utf8')).toBe(`${JSON.stringify({
      schemaVersion: 1,
      profile: 'warpkeep-0.4.0-recovery-bootstrap-v1',
      keyId: KEY_ID,
      enabled: false,
    })}\n`);
    expect(existsSync(join(privateRoot, CANARY_FID_FILE))).toBe(false);
    expect(existsSync(join(privateRoot, AUTH_BRIDGE_PUBLIC_JWK_FILE))).toBe(false);
    expect(result.stdout).not.toContain(JSON.stringify(publicJwk));
    expect(result.stdout).not.toContain(privateJwk.d!);
    expect(result.stdout).not.toContain(rpcWire.trimEnd());
    expect(result.stdout).not.toContain(censusWire.trimEnd());
    if (process.platform !== 'win32') {
      [privatePath, publicPath, thumbprintPath, rpcPath, censusPath, markerPath].forEach((path) => {
        expect(statSync(path).mode & 0o777).toBe(0o600);
      });
      expect(statSync(privateRoot).mode & 0o777).toBe(0o700);
    }
    if (process.platform === 'win32') {
      for (const path of [privatePath, publicPath, thumbprintPath, rpcPath, censusPath, markerPath]) {
        const acl = spawnSync('icacls', [path], { encoding: 'utf8', windowsHide: true });
        expect(acl.status).toBe(0);
        expect(isExactCurrentOwnerOnlyAcl(acl.stdout, currentWindowsUsername)).toBe(true);
      }
    }
  });

  it('never overwrites existing bootstrap files and regenerates only an absent target', () => {
    const root = fixtureRoot();
    const privateRoot = join(root, 'private', 'release-recovery-v1');
    const first = generate(privateRoot, { USERPROFILE: root });
    expect(first.status).toBe(0);
    const paths = [PRIVATE_FILE, PUBLIC_FILE, THUMBPRINT_FILE, RPC_SECRET_FILE, CENSUS_PEPPER_FILE, MARKER_FILE]
      .map(file => join(privateRoot, file));
    const original = new Map(paths.map(path => [path, readFileSync(path)]));
    const replay = generate(privateRoot, { USERPROFILE: root });

    expect(replay.status).toBe(0);
    expect(replay.stdout).toMatch(/^RECOVERY_BOOTSTRAP_READY existing [A-Za-z0-9_-]{43}\n$/u);
    for (const path of paths) expect(readFileSync(path)).toEqual(original.get(path));

    const retainedRpc = readFileSync(join(privateRoot, RPC_SECRET_FILE), 'utf8');
    rmSync(join(privateRoot, CENSUS_PEPPER_FILE));
    const repaired = generate(privateRoot, { USERPROFILE: root });
    expect(repaired.status).toBe(0);
    expect(repaired.stdout).toMatch(/^RECOVERY_BOOTSTRAP_READY updated [A-Za-z0-9_-]{43}\n$/u);
    expect(readFileSync(join(privateRoot, RPC_SECRET_FILE), 'utf8')).toBe(retainedRpc);
    expect(readFileSync(join(privateRoot, CENSUS_PEPPER_FILE), 'utf8'))
      .toMatch(/^[A-Za-z0-9_-]{43}\n$/u);
    for (const path of paths.filter(path => !path.endsWith(CENSUS_PEPPER_FILE))) {
      expect(readFileSync(path)).toEqual(original.get(path));
    }

    const malformedRoot = join(root, 'malformed');
    const malformedPrivate = join(malformedRoot, PRIVATE_FILE);
    mkdirSync(malformedRoot, { recursive: true, mode: 0o700 });
    writeFileSync(malformedPrivate, '{"d":"private-material-must-not-escape"}', { mode: 0o600 });
    configureOwnerOnly(malformedPrivate);
    const rejected = generate(malformedRoot, { USERPROFILE: root });
    expect(rejected.status).not.toBe(0);
    expect(`${rejected.stdout}${rejected.stderr}`).not.toContain('private-material-must-not-escape');
  }, 60_000);

  it('rejects a private JWK whose public coordinates do not match its private scalar', () => {
    const root = fixtureRoot();
    const privateRoot = join(root, 'private', 'release-recovery-v1');
    expect(generate(privateRoot, { USERPROFILE: root }).status).toBe(0);
    const privatePath = join(privateRoot, PRIVATE_FILE);
    const original = JSON.parse(readFileSync(privatePath, 'utf8')) as JsonWebKey;
    const other = generateKeyPairSync('ec', {
      namedCurve: 'prime256v1',
      privateKeyEncoding: { format: 'jwk' },
    }).privateKey;
    const mixed = {
      ...original,
      x: other.x,
      y: other.y,
    };
    writePrivateFixture(privatePath, `${JSON.stringify(mixed)}\n`);
    const otherPublic = { kty: 'EC', crv: 'P-256', x: other.x, y: other.y };
    writePrivateFixture(
      join(privateRoot, PUBLIC_FILE),
      `${JSON.stringify(otherPublic)}\n`,
    );
    const otherThumbprint = createHash('sha256').update(JSON.stringify({
      crv: otherPublic.crv,
      kty: otherPublic.kty,
      x: otherPublic.x,
      y: otherPublic.y,
    }), 'utf8').digest('base64url');
    writePrivateFixture(join(privateRoot, THUMBPRINT_FILE), `${otherThumbprint}\n`);

    const rejected = generate(privateRoot, { USERPROFILE: root });

    expect(rejected.status).not.toBe(0);
    expect(rejected.stdout).toBe('');
    expect(rejected.stderr).toBe('RECOVERY_BOOTSTRAP_PRIVATE_FILE_REJECTED\n');
    expect(readFileSync(privatePath, 'utf8')).toBe(`${JSON.stringify(mixed)}\n`);
    expect(`${rejected.stdout}${rejected.stderr}`).not.toContain(original.d!);
  });

  it('rejects a mismatched bootstrap marker without replacing it', () => {
    const root = fixtureRoot();
    const privateRoot = join(root, 'private', 'release-recovery-v1');
    expect(generate(privateRoot, { USERPROFILE: root }).status).toBe(0);
    const markerPath = join(privateRoot, MARKER_FILE);
    const hostileMarker = '{"schemaVersion":1,"profile":"wrong","keyId":"secret-marker","enabled":true}\n';
    writePrivateFixture(markerPath, hostileMarker);

    const rejected = generate(privateRoot, { USERPROFILE: root });

    expect(rejected.status).not.toBe(0);
    expect(rejected.stdout).toBe('');
    expect(rejected.stderr).toBe('RECOVERY_BOOTSTRAP_MARKER_REJECTED\n');
    expect(readFileSync(markerPath, 'utf8')).toBe(hostileMarker);
    expect(`${rejected.stdout}${rejected.stderr}`).not.toContain('secret-marker');
  });

  it('descriptor-verifies private inputs and emits only pass plus the exact bridge identity', () => {
    const root = fixtureRoot();
    const privateRoot = join(root, 'private', 'release-recovery-v1');
    expect(generate(privateRoot, { USERPROFILE: root }).status).toBe(0);
    provisionVerificationInputs(privateRoot);
    const expected = independentBridgeIdentity(privateRoot);
    const recoveryPublicJwk = JSON.parse(
      readFileSync(join(privateRoot, PUBLIC_FILE), 'utf8'),
    ) as JsonWebKey;
    const wrongRecoveryKeyProjection = independentBridgeIdentity(privateRoot, recoveryPublicJwk);
    const privateJwkBytes = readFileSync(join(privateRoot, PRIVATE_FILE), 'utf8');
    const rpcWire = readFileSync(join(privateRoot, RPC_SECRET_FILE), 'utf8').trimEnd();
    const censusWire = readFileSync(join(privateRoot, CENSUS_PEPPER_FILE), 'utf8').trimEnd();

    const result = run(verifyArguments(privateRoot), { USERPROFILE: root });

    expect(result.status).toBe(0);
    expect(result.stderr).toBe('');
    expect(wrongRecoveryKeyProjection.identity).not.toBe(expected.identity);
    expect(result.stdout).not.toBe(
      `RECOVERY_BOOTSTRAP_VERIFIED ${wrongRecoveryKeyProjection.identity}\n`,
    );
    expect(result.stdout).toBe(`RECOVERY_BOOTSTRAP_VERIFIED ${expected.identity}\n`);
    for (const forbidden of [
      privateJwkBytes,
      rpcWire,
      censusWire,
      CANARY_FID,
      ...expected.componentCommitments,
    ]) {
      expect(result.stdout).not.toContain(forbidden);
      expect(result.stderr).not.toContain(forbidden);
    }
  });

  it('matches the literal Task 3 bridge-config identity vector', () => {
    const root = fixtureRoot();
    const privateRoot = join(root, 'private', 'release-recovery-v1');
    expect(generate(privateRoot, { USERPROFILE: root }).status).toBe(0);
    provisionVerificationInputs(privateRoot);
    writePrivateFixture(
      join(privateRoot, RPC_SECRET_FILE),
      'AAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8\n',
    );
    writePrivateFixture(
      join(privateRoot, CENSUS_PEPPER_FILE),
      'ICEiIyQlJicoKSorLC0uLzAxMjM0NTY3ODk6Ozw9Pj8\n',
    );

    const result = run(verifyArguments(privateRoot), { USERPROFILE: root });

    expect(result.status).toBe(0);
    expect(result.stderr).toBe('');
    expect(result.stdout).toBe(
      'RECOVERY_BOOTSTRAP_VERIFIED 8b1826d4ef72a083c7c97c8b7de965d8a2e75eb9a2966ac0cb29b2563b12b490\n',
    );
  });

  it('requires the fixed pre-existing auth-bridge public JWK without creating it', () => {
    const root = fixtureRoot();
    const privateRoot = join(root, 'private', 'release-recovery-v1');
    expect(generate(privateRoot, { USERPROFILE: root }).status).toBe(0);
    writePrivateFixture(join(privateRoot, CANARY_FID_FILE), `${CANARY_FID}\n`);
    const bridgePublicPath = join(privateRoot, AUTH_BRIDGE_PUBLIC_JWK_FILE);

    const result = run(verifyArguments(privateRoot), { USERPROFILE: root });

    expect(result.status).not.toBe(0);
    expect(result.stdout).toBe('');
    expect(result.stderr).toBe('RECOVERY_BOOTSTRAP_BRIDGE_PUBLIC_KEY_REJECTED\n');
    expect(existsSync(bridgePublicPath)).toBe(false);
  });

  it.each([
    ['wrong key order', JSON.stringify({
      crv: AUTH_BRIDGE_PUBLIC_JWK.crv,
      kty: AUTH_BRIDGE_PUBLIC_JWK.kty,
      x: AUTH_BRIDGE_PUBLIC_JWK.x,
      y: AUTH_BRIDGE_PUBLIC_JWK.y,
    }) + '\n'],
    ['extra key', JSON.stringify({ ...AUTH_BRIDGE_PUBLIC_JWK, use: 'sig' }) + '\n'],
    ['private scalar', JSON.stringify({ ...AUTH_BRIDGE_PUBLIC_JWK, d: 'A'.repeat(43) }) + '\n'],
    ['invalid P-256 point', JSON.stringify({
      ...AUTH_BRIDGE_PUBLIC_JWK,
      x: 'A'.repeat(43),
      y: 'B'.repeat(43),
    }) + '\n'],
    ['noncanonical newline', `${JSON.stringify(AUTH_BRIDGE_PUBLIC_JWK)}\r\n`],
  ])('rejects a %s auth-bridge public JWK', (_label, bytes) => {
    const root = fixtureRoot();
    const privateRoot = join(root, 'private', 'release-recovery-v1');
    expect(generate(privateRoot, { USERPROFILE: root }).status).toBe(0);
    writePrivateFixture(join(privateRoot, CANARY_FID_FILE), `${CANARY_FID}\n`);
    writePrivateFixture(join(privateRoot, AUTH_BRIDGE_PUBLIC_JWK_FILE), bytes);

    const result = run(verifyArguments(privateRoot), { USERPROFILE: root });

    expect(result.status).not.toBe(0);
    expect(result.stdout).toBe('');
    expect(result.stderr).toBe('RECOVERY_BOOTSTRAP_BRIDGE_PUBLIC_KEY_REJECTED\n');
  });

  it('rejects reuse of the recovery signing public key as the auth-bridge signing key', () => {
    const root = fixtureRoot();
    const privateRoot = join(root, 'private', 'release-recovery-v1');
    expect(generate(privateRoot, { USERPROFILE: root }).status).toBe(0);
    writePrivateFixture(join(privateRoot, CANARY_FID_FILE), `${CANARY_FID}\n`);
    const recoveryPublicBytes = readFileSync(join(privateRoot, PUBLIC_FILE), 'utf8');
    writePrivateFixture(join(privateRoot, AUTH_BRIDGE_PUBLIC_JWK_FILE), recoveryPublicBytes);

    const result = run(verifyArguments(privateRoot), { USERPROFILE: root });

    expect(result.status).not.toBe(0);
    expect(result.stdout).toBe('');
    expect(result.stderr).toBe('RECOVERY_BOOTSTRAP_SECRET_SEPARATION_REJECTED\n');
    expect(`${result.stdout}${result.stderr}`).not.toContain(recoveryPublicBytes);
  });

  it.each([
    ['signing scalar and RPC', RPC_SECRET_FILE, (privateRoot: string) => {
      const privateJwk = JSON.parse(readFileSync(join(privateRoot, PRIVATE_FILE), 'utf8')) as JsonWebKey;
      return privateJwk.d!;
    }],
    ['signing scalar and census pepper', CENSUS_PEPPER_FILE, (privateRoot: string) => {
      const privateJwk = JSON.parse(readFileSync(join(privateRoot, PRIVATE_FILE), 'utf8')) as JsonWebKey;
      return privateJwk.d!;
    }],
    ['RPC and census pepper', CENSUS_PEPPER_FILE, (privateRoot: string) =>
      readFileSync(join(privateRoot, RPC_SECRET_FILE), 'utf8').trimEnd()],
  ])('rejects representation-aware byte reuse between %s without leaking it', (_label, file, collision) => {
    const root = fixtureRoot();
    const privateRoot = join(root, 'private', 'release-recovery-v1');
    expect(generate(privateRoot, { USERPROFILE: root }).status).toBe(0);
    provisionVerificationInputs(privateRoot);
    const reused = collision(privateRoot);
    writePrivateFixture(join(privateRoot, file), `${reused}\n`);

    const result = run(verifyArguments(privateRoot), { USERPROFILE: root });

    expect(result.status).not.toBe(0);
    expect(result.stdout).toBe('');
    expect(result.stderr).toBe('RECOVERY_BOOTSTRAP_SECRET_SEPARATION_REJECTED\n');
    expect(`${result.stdout}${result.stderr}`).not.toContain(reused);
    expect(`${result.stdout}${result.stderr}`).not.toContain(CANARY_FID);
  }, 60_000);

  it('requires one pre-existing secure canonical canary FID and never generates or rewrites it', () => {
    const root = fixtureRoot();
    const privateRoot = join(root, 'private', 'release-recovery-v1');
    expect(generate(privateRoot, { USERPROFILE: root }).status).toBe(0);
    writePrivateFixture(
      join(privateRoot, AUTH_BRIDGE_PUBLIC_JWK_FILE),
      `${JSON.stringify(AUTH_BRIDGE_PUBLIC_JWK)}\n`,
    );
    const canaryPath = join(privateRoot, CANARY_FID_FILE);

    const missing = run(verifyArguments(privateRoot), { USERPROFILE: root });
    expect(missing.status).not.toBe(0);
    expect(missing.stdout).toBe('');
    expect(existsSync(canaryPath)).toBe(false);

    for (const invalid of ['0\n', '01\n', '9007199254740992\n', `${CANARY_FID}`, `${CANARY_FID}\r\n`]) {
      writePrivateFixture(canaryPath, invalid);
      const rejected = run(verifyArguments(privateRoot), { USERPROFILE: root });
      expect(rejected.status, JSON.stringify(invalid)).not.toBe(0);
      expect(rejected.stdout).toBe('');
      expect(readFileSync(canaryPath, 'utf8')).toBe(invalid);
      expect(`${rejected.stdout}${rejected.stderr}`).not.toContain(invalid.trim());
    }
  }, 60_000);

  it.each([
    ['uppercase source commit', { bridgeSourceCommit: BRIDGE_SOURCE_COMMIT.toUpperCase() }],
    ['zero config epoch', { bridgeConfigEpoch: '0' }],
    ['noncanonical config epoch', { bridgeConfigEpoch: '07' }],
    ['unsafe config epoch', { bridgeConfigEpoch: '9007199254740992' }],
    ['noncanonical G002 database', { genesis002Database: 'B'.repeat(64) }],
    ['G002 equals G001', { genesis002Database: GENESIS_001_DATABASE }],
    ['PTR equals G001', { ptrDatabase: GENESIS_001_DATABASE }],
    ['PTR equals G002', { ptrDatabase: GENESIS_002_DATABASE }],
  ])('rejects %s without exposing the rejected coordinate', (_label, overrides) => {
    const root = fixtureRoot();
    const privateRoot = join(root, 'private', 'release-recovery-v1');
    expect(generate(privateRoot, { USERPROFILE: root }).status).toBe(0);
    provisionVerificationInputs(privateRoot);

    const result = run(verifyArguments(privateRoot, overrides), { USERPROFILE: root });

    expect(result.status).not.toBe(0);
    expect(result.stdout).toBe('');
    expect(result.stderr).toBe('RECOVERY_BOOTSTRAP_BRIDGE_CONFIG_REJECTED\n');
    for (const value of Object.values(overrides)) {
      expect(`${result.stdout}${result.stderr}`).not.toContain(value);
    }
  });

  it('rejects repository, Desktop, and worktree output roots without leaking supplied private material', () => {
    const root = fixtureRoot();
    const desktop = join(root, 'Desktop', 'recovery');
    const privateArgument = '{"d":"caller-private-material"}';

    [repositoryRoot, join(repositoryRoot, 'tmp-recovery-output'), root, desktop].forEach((privateRoot) => {
      const result = generate(privateRoot, { USERPROFILE: root });
      expect(result.status).not.toBe(0);
      expect(result.stderr).toContain('RECOVERY_BOOTSTRAP_PRIVATE_ROOT_REJECTED');
    });

    const rejectedArgument = run([
      '--generate', '--private-root', join(root, 'private'), privateArgument,
    ], { USERPROFILE: root });
    expect(rejectedArgument.status).not.toBe(0);
    expect(`${rejectedArgument.stdout}${rejectedArgument.stderr}`).not.toContain('caller-private-material');
  });

  it('rejects a filesystem root before verify mode inspects or changes it', () => {
    const filesystemRoot = parse(tmpdir()).root;

    const result = run(verifyArguments(filesystemRoot), { USERPROFILE: repositoryRoot });

    expect(result.status).not.toBe(0);
    expect(result.stdout).toBe('');
    expect(result.stderr).toBe('RECOVERY_BOOTSTRAP_PRIVATE_ROOT_REJECTED\n');
  });

  it.runIf(process.platform === 'win32' && typeof process.env.OneDrive === 'string')(
    'rejects the OS-configured OneDrive tree despite a caller-controlled USERPROFILE override',
    () => {
      const syntheticProfile = fixtureRoot();
      const oneDriveRoot = process.env.OneDrive!;
      const localizedDesktop = join(oneDriveRoot, 'Рабочий стол');
      const privateRoot = existsSync(localizedDesktop) ? localizedDesktop : oneDriveRoot;

      const result = run(verifyArguments(privateRoot), { USERPROFILE: syntheticProfile });

      expect(result.status).not.toBe(0);
      expect(result.stdout).toBe('');
      expect(result.stderr).toBe('RECOVERY_BOOTSTRAP_PRIVATE_ROOT_REJECTED\n');
    },
  );

  it('rejects a root inside a separately linked Git worktree', () => {
    const root = fixtureRoot();
    const linkedWorktree = join(root, 'linked-worktree');
    execFileSync('git', ['worktree', 'add', '--detach', linkedWorktree, 'HEAD'], {
      cwd: repositoryRoot,
      stdio: 'ignore'
    });
    try {
      const result = run(['--generate', '--private-root', join(linkedWorktree, 'private-output')]);
      expect(result.status).not.toBe(0);
      expect(result.stderr).toContain('RECOVERY_BOOTSTRAP_PRIVATE_ROOT_REJECTED');
    } finally {
      execFileSync('git', ['worktree', 'remove', '--force', linkedWorktree], {
        cwd: repositoryRoot,
        stdio: 'ignore'
      });
    }
  });

  it('rejects a symlink or Windows junction in the private-root path chain', () => {
    const root = fixtureRoot();
    const target = join(root, 'target');
    const link = join(root, 'linked');
    mkdirSync(target);
    symlinkSync(target, link, process.platform === 'win32' ? 'junction' : 'dir');

    const result = run(['--generate', '--private-root', join(link, 'private-output')], {
      USERPROFILE: root
    });
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('RECOVERY_BOOTSTRAP_PRIVATE_ROOT_REJECTED');
  });

  it('accepts only a deterministic exact current-owner full-control Windows ACL shape', () => {
    expect(isExactCurrentOwnerOnlyAcl('C:\\key AEL\\heyas:(F)\r\n', 'heyas')).toBe(true);
    expect(isExactCurrentOwnerOnlyAcl('C:\\key AEL\\heyas:(R,W)\r\n', 'heyas')).toBe(false);
    expect(isExactCurrentOwnerOnlyAcl(
      'C:\\key AEL\\heyas:(F)\r\n       BUILTIN\\Administrators:(F)\r\n',
      'heyas'
    )).toBe(false);
  });
});
