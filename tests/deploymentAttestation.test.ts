// @vitest-environment node
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import * as fs from 'node:fs';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, linkSync, symlinkSync, openSync, ftruncateSync, closeSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { deriveWarpkeepDeploymentAttestation, verifyWarpkeepDeploymentAttestation, installWarpkeepDeploymentAttestation } from '../scripts/generate-warpkeep-deployment-attestation.mjs';

vi.mock('node:fs', async importOriginal => {
  const actual = await importOriginal<typeof import('node:fs')>();
  return { ...actual, readdirSync: vi.fn(actual.readdirSync), writeFileSync: vi.fn(actual.writeFileSync), openSync: vi.fn(actual.openSync) };
});

const identity = Object.freeze({ candidateCommit: 'a'.repeat(40), candidateTree: 'b'.repeat(40),
  recoveryAuthorizationCoreSha256: 'c'.repeat(64),
  sourceClosureProfile: 'warpkeep-0.4.0-recovery-source-closure-v1', sourceClosureSha256: 'd'.repeat(64) });
let root: string;

it('does not report successful CLI verification before source-bound command integration exists', () => {
  const script = fileURLToPath(new URL('../scripts/generate-warpkeep-deployment-attestation.mjs', import.meta.url));
  const result = spawnSync(process.execPath, [script, '--check'], { encoding: 'utf8', timeout: 10000 });
  expect(result.error).toBeUndefined();
  expect(result.status).toBe(1);
  expect(result.stderr).toBe('WARPKEEP_DEPLOYMENT_ATTESTATION_CLI_NOT_IMPLEMENTED\n');
  expect(result.stdout).toBe('');
});

it('can be imported by a host with a non-file argv entry', () => {
  const moduleUrl = new URL('../scripts/generate-warpkeep-deployment-attestation.mjs', import.meta.url).href;
  const result = spawnSync(process.execPath, ['--input-type=module', '-e',
    `process.argv[1] = '[embedded-host]'; await import(${JSON.stringify(moduleUrl)});`],
  { encoding: 'utf8', timeout: 10000 });
  expect(result.error).toBeUndefined();
  expect(result.status).toBe(0);
  expect(result.stderr).toBe('');
  expect(result.stdout).toBe('');
});
beforeEach(() => {
  vi.resetAllMocks();
  root = mkdtempSync(join(tmpdir(), 'warpkeep-attestation-'));
  writeFileSync(join(root, 'index.html'), 'hello');
});
afterEach(() => { vi.restoreAllMocks(); rmSync(root, { recursive: true }); });

it('derives canonical attestation bytes from the actual content manifest', () => {
  const result = deriveWarpkeepDeploymentAttestation({ distRoot: root, identity });
  const manifest = '[{"path":"index.html","byteLength":5,"sha256":"2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824"}]';
  const expected = { schemaVersion: 1, profile: 'warpkeep-deployment-attestation-v1', ...identity,
    releaseVersion: '0.4.0', canonicalOrigin: 'https://warpkeep.com',
    contentManifestSha256: createHash('sha256').update(manifest).digest('hex') };
  expect(Buffer.from(result.bytes).toString()).toBe(JSON.stringify(expected));
});

it('verifies installed attestation and rejects a changed content byte', () => {
  const result = deriveWarpkeepDeploymentAttestation({ distRoot: root, identity });
  mkdirSync(join(root, '.well-known'));
  writeFileSync(join(root, '.well-known', 'warpkeep-deployment-v1.json'), result.bytes);
  expect(() => verifyWarpkeepDeploymentAttestation({ distRoot: root, identity })).not.toThrow();
  writeFileSync(join(root, 'index.html'), 'jello');
  expect(() => verifyWarpkeepDeploymentAttestation({ distRoot: root, identity })).toThrow();
});

it.skipIf(process.platform !== 'linux')('installs the canonical attestation and independently verifies the output', () => {
  const expected = deriveWarpkeepDeploymentAttestation({ distRoot: root, identity });
  const result = installWarpkeepDeploymentAttestation({ distRoot: root, identity });
  expect(fs.readFileSync(join(root, expected.path))).toEqual(Buffer.from(expected.bytes));
  expect(result).toEqual(verifyWarpkeepDeploymentAttestation({ distRoot: root, identity }));
  expect(result.deploymentAttestationSha256).toBe(createHash('sha256').update(expected.bytes).digest('hex'));
});

it.skipIf(process.platform !== 'linux')('does not overwrite an existing attestation, even when its bytes match', () => {
  installWarpkeepDeploymentAttestation({ distRoot: root, identity });
  const path = join(root, '.well-known/warpkeep-deployment-v1.json');
  const before = fs.readFileSync(path);
  expect(() => installWarpkeepDeploymentAttestation({ distRoot: root, identity })).toThrow();
  expect(fs.readFileSync(path)).toEqual(before);
});

it('validates identity before creating output directories', () => {
  expect(() => installWarpkeepDeploymentAttestation({ distRoot: root,
    identity: { ...identity, candidateCommit: 'invalid' } })).toThrow();
  expect(fs.existsSync(join(root, '.well-known'))).toBe(false);
});

it.skipIf(process.platform === 'linux')('requires the WSL/Linux installer instead of weaker native writes', () => {
  expect(() => installWarpkeepDeploymentAttestation({ distRoot: root, identity }))
    .toThrow('WARPKEEP_DEPLOYMENT_ATTESTATION_INSTALL_REQUIRES_LINUX');
  expect(fs.existsSync(join(root, '.well-known'))).toBe(false);
});

it.skipIf(process.platform !== 'linux')('does not redirect writes through a replaced well-known parent', async () => {
  const actual = await vi.importActual<typeof import('node:fs')>('node:fs');
  const outside = mkdtempSync(join(tmpdir(), 'warpkeep-attestation-outside-'));
  let replaced = false;
  try {
    vi.mocked(fs.openSync).mockImplementation(((...args: Parameters<typeof fs.openSync>) => {
      if (String(args[0]).startsWith('/proc/self/fd/') && String(args[0]).endsWith('/warpkeep-deployment-v1.json')) {
        actual.renameSync(join(root, '.well-known'), join(root, 'held-directory'));
        actual.symlinkSync(outside, join(root, '.well-known'), 'dir');
        replaced = true;
      }
      return actual.openSync(...args);
    }) as typeof fs.openSync);
    expect(() => installWarpkeepDeploymentAttestation({ distRoot: root, identity })).toThrow();
    expect(replaced).toBe(true);
    expect(actual.readdirSync(outside)).toEqual([]);
    expect(actual.existsSync(join(root, 'held-directory/warpkeep-deployment-v1.json'))).toBe(true);
  } finally { rmSync(outside, { recursive: true }); }
});

it.skipIf(process.platform !== 'linux')('preserves existing well-known metadata while installing', () => {
  mkdirSync(join(root, '.well-known'));
  writeFileSync(join(root, '.well-known/farcaster.json'), '{}');
  installWarpkeepDeploymentAttestation({ distRoot: root, identity });
  expect(fs.readFileSync(join(root, '.well-known/farcaster.json'), 'utf8')).toBe('{}');
});

it.skipIf(process.platform !== 'linux')('rejects content mutation during installation instead of reporting a valid artifact', async () => {
  const actual = await vi.importActual<typeof import('node:fs')>('node:fs');
  vi.mocked(fs.writeFileSync).mockImplementation(((...args: Parameters<typeof fs.writeFileSync>) => {
    actual.writeFileSync(...args);
    if (typeof args[0] === 'number') actual.writeFileSync(join(root, 'index.html'), 'mutated during install');
  }) as typeof fs.writeFileSync);
  expect(() => installWarpkeepDeploymentAttestation({ distRoot: root, identity })).toThrow();
  expect(fs.readFileSync(join(root, 'index.html'), 'utf8')).toBe('mutated during install');
});

it('rejects an unlisted extra file after attestation', () => {
  const result = deriveWarpkeepDeploymentAttestation({ distRoot: root, identity });
  mkdirSync(join(root, '.well-known'));
  writeFileSync(join(root, '.well-known', 'warpkeep-deployment-v1.json'), result.bytes);
  writeFileSync(join(root, 'extra.js'), 'unexpected');
  expect(() => verifyWarpkeepDeploymentAttestation({ distRoot: root, identity })).toThrow();
});

it('rejects hidden credential files instead of silently excluding them', () => {
  writeFileSync(join(root, '.env'), 'TEST_ONLY_NOT_A_SECRET=1');
  expect(() => deriveWarpkeepDeploymentAttestation({ distRoot: root, identity })).toThrow();
});

it('rejects bundled dependency directories at any depth', () => {
  mkdirSync(join(root, 'assets', 'node_modules'), { recursive: true });
  writeFileSync(join(root, 'assets', 'node_modules', 'package.js'), 'dependency');
  expect(() => deriveWarpkeepDeploymentAttestation({ distRoot: root, identity })).toThrow();
});

it('rejects non-ASCII paths that the recovery archive cannot accept', () => {
  mkdirSync(join(root, 'assets'));
  writeFileSync(join(root, 'assets', '\u00e9.png'), 'image');
  expect(() => deriveWarpkeepDeploymentAttestation({ distRoot: root, identity }))
    .toThrow('WARPKEEP_DEPLOYMENT_ATTESTATION_INVALID');
});

it('rejects an attestation path occupied by a directory', () => {
  mkdirSync(join(root, '.well-known', 'warpkeep-deployment-v1.json'), { recursive: true });
  expect(() => deriveWarpkeepDeploymentAttestation({ distRoot: root, identity })).toThrow();
});

it('rejects substituted release identity during verification', () => {
  const result = deriveWarpkeepDeploymentAttestation({ distRoot: root, identity });
  mkdirSync(join(root, '.well-known'));
  writeFileSync(join(root, '.well-known', 'warpkeep-deployment-v1.json'), result.bytes);
  expect(() => verifyWarpkeepDeploymentAttestation({ distRoot: root,
    identity: { ...identity, candidateCommit: 'e'.repeat(40) } })).toThrow();
});

it('rejects hard-linked content', () => {
  linkSync(join(root, 'index.html'), join(root, 'copy.html'));
  expect(() => deriveWarpkeepDeploymentAttestation({ distRoot: root, identity })).toThrow();
});

it('rejects content whose TAR headers and padding exceed the archive budget', () => {
  for (const [name, size] of [['a.bin', 64 * 1024 * 1024], ['b.bin', 64 * 1024 * 1024],
    ['c.bin', 22 * 1024 * 1024 - 5]] as const) {
    const descriptor = openSync(join(root, name), 'wx');
    try { ftruncateSync(descriptor, size); } finally { closeSync(descriptor); }
  }
  expect(() => deriveWarpkeepDeploymentAttestation({ distRoot: root, identity })).toThrow();
});

it('reserves an archive entry for the generated attestation', () => {
  for (let index = 0; index < 19999; index += 1) writeFileSync(join(root, `entry-${index}.txt`), '');
  expect(() => deriveWarpkeepDeploymentAttestation({ distRoot: root, identity })).toThrow();
}, 60000);

it('rejects aggregate path metadata above the recovery reader limit', () => {
  const directory = join(root, ...Array.from({ length: 4 }, (_, index) => `${index}${'p'.repeat(199)}`));
  mkdirSync(directory, { recursive: true });
  for (let index = 0; index < 4900; index += 1) {
    writeFileSync(join(directory, `${String(index).padStart(4, '0')}${'x'.repeat(56)}`), '');
  }
  expect(() => deriveWarpkeepDeploymentAttestation({ distRoot: root, identity }))
    .toThrow('WARPKEEP_DEPLOYMENT_ATTESTATION_INVALID');
}, 60000);

it('rejects directory links without traversing them', () => {
  mkdirSync(join(root, 'assets'));
  symlinkSync(join(root, 'assets'), join(root, 'linked'), process.platform === 'win32' ? 'junction' : 'dir');
  expect(() => deriveWarpkeepDeploymentAttestation({ distRoot: root, identity })).toThrow();
});

it.each([
  ['missing field', { ...identity, candidateCommit: undefined }],
  ['extra field', { ...identity, authority: true }],
  ['wrong profile', { ...identity, sourceClosureProfile: 'unrecognized' }],
  ['uppercase digest', { ...identity, sourceClosureSha256: 'A'.repeat(64) }],
  ['array', []],
  ['null', null],
])('rejects malformed identity: %s', (_name, invalid) => {
  expect(() => deriveWarpkeepDeploymentAttestation({ distRoot: root,
    identity: invalid as unknown as typeof identity })).toThrow('WARPKEEP_DEPLOYMENT_ATTESTATION_INVALID');
});

it('rejects accessor identity without executing it', () => {
  let executed = false;
  const invalid = { ...identity };
  Object.defineProperty(invalid, 'candidateCommit', { enumerable: true, get() { executed = true; return identity.candidateCommit; } });
  expect(() => deriveWarpkeepDeploymentAttestation({ distRoot: root, identity: invalid })).toThrow();
  expect(executed).toBe(false);
});

it('rejects proxy identity without executing its traps', () => {
  let executed = false;
  const invalid = new Proxy(identity, { getPrototypeOf() { executed = true; return Object.prototype; } });
  expect(() => deriveWarpkeepDeploymentAttestation({ distRoot: root, identity: invalid })).toThrow();
  expect(executed).toBe(false);
});

it('rejects noncanonical installed attestation bytes', () => {
  const result = deriveWarpkeepDeploymentAttestation({ distRoot: root, identity });
  mkdirSync(join(root, '.well-known'));
  writeFileSync(join(root, result.path), Buffer.concat([Buffer.from(result.bytes), Buffer.from('\n')]));
  expect(() => verifyWarpkeepDeploymentAttestation({ distRoot: root, identity })).toThrow();
});

it('rejects a previously hashed file changed while a later directory is scanned', async () => {
  const later = join(root, 'zzz');
  mkdirSync(later);
  const original = (await vi.importActual<typeof import('node:fs')>('node:fs')).readdirSync;
  let changed = false;
  vi.mocked(fs.readdirSync).mockImplementation(((...args: Parameters<typeof fs.readdirSync>) => {
    if (args[0] === root) return ['index.html', 'zzz'];
    if (args[0] === later) {
      writeFileSync(join(root, 'index.html'), 'changed after hashing');
      changed = true;
    }
    return original(...args);
  }) as typeof fs.readdirSync);
  expect(() => deriveWarpkeepDeploymentAttestation({ distRoot: root, identity })).toThrow();
  expect(changed).toBe(true);
});
