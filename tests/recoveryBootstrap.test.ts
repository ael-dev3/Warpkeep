import { execFileSync, spawnSync } from 'node:child_process';
import { createHash, createPrivateKey, createPublicKey } from 'node:crypto';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { isExactCurrentOwnerOnlyAcl } from '../scripts/recovery-bootstrap-acl.mjs';

const repositoryRoot = resolve(__dirname, '..');
const scriptPath = join(repositoryRoot, 'scripts', 'prepare-0.4.0-recovery-bootstrap.mjs');
const fixtures: string[] = [];

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

afterEach(() => {
  fixtures.splice(0).forEach((root) => rmSync(root, { recursive: true, force: true }));
});

describe('0.4.0 recovery bootstrap', () => {
  it('is disabled by default and does not create a recovery key', () => {
    const root = fixtureRoot();
    const result = run([], { USERPROFILE: root });

    expect(result.status).not.toBe(0);
    expect(result.stdout).toBe('');
    expect(result.stderr).toContain('RECOVERY_BOOTSTRAP_GENERATION_REQUIRED');
  });

  it('requires --private-root before it will generate or validate key material', () => {
    const root = fixtureRoot();
    const result = run(['--generate'], { USERPROFILE: root });

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('RECOVERY_BOOTSTRAP_ARGUMENTS_INVALID');
    expect(existsSync(join(root, '.warpkeep'))).toBe(false);
  });

  it('creates a mode-0600 P-256 private JWK and derives the pinned public values', () => {
    const root = fixtureRoot();
    const privateRoot = join(root, 'private', 'release-recovery-v1');
    const result = run(['--generate', '--private-root', privateRoot], { USERPROFILE: root });

    expect(result.status).toBe(0);
    const output = JSON.parse(result.stdout) as {
      enabled: boolean;
      keyId: string;
      privateJwkPath: string;
      publicJwkPath: string;
      thumbprintPath: string;
      publicJwk: JsonWebKey;
      thumbprint: string;
    };
    expect(output.enabled).toBe(false);
    expect(output.keyId).toBe('warpkeep-0.4.0-recovery-2026-09-03-1');
    expect(output.privateJwkPath).toBe(join(privateRoot, 'recovery-signing-private.jwk.json'));
    expect(output.publicJwkPath).toBe(join(privateRoot, 'recovery-signing-public.jwk.json'));
    expect(output.thumbprintPath).toBe(join(privateRoot, 'recovery-signing-thumbprint.txt'));
    expect(output.publicJwk).toMatchObject({ kty: 'EC', crv: 'P-256' });
    expect(output.publicJwk).not.toHaveProperty('d');
    expect(output.thumbprint).toMatch(/^[A-Za-z0-9_-]{43}$/u);
    const privateJwk = JSON.parse(readFileSync(output.privateJwkPath, 'utf8')) as JsonWebKey;
    expect(privateJwk).toMatchObject({
      kty: 'EC', crv: 'P-256', d: expect.any(String)
    });
    const independentlyDerived = createPublicKey(createPrivateKey({ key: privateJwk, format: 'jwk' }))
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
    expect(output.publicJwk).toEqual(independentlyDerivedPublic);
    expect(output.thumbprint).toBe(independentlyDerivedThumbprint);
    expect(JSON.parse(readFileSync(output.publicJwkPath, 'utf8'))).toEqual(output.publicJwk);
    expect(readFileSync(output.thumbprintPath, 'utf8')).toBe(`${output.thumbprint}\n`);
    if (process.platform !== 'win32') {
      [output.privateJwkPath, output.publicJwkPath, output.thumbprintPath].forEach((path) => {
        expect(statSync(path).mode & 0o777).toBe(0o600);
      });
    }
    if (process.platform === 'win32') {
      const acl = spawnSync('icacls', [output.privateJwkPath], { encoding: 'utf8', windowsHide: true });
      expect(acl.status).toBe(0);
      expect(isExactCurrentOwnerOnlyAcl(acl.stdout, process.env.USERNAME!)).toBe(true);
    }
  });

  it('never overwrites existing bootstrap files and never writes private JWK bytes to stdout or errors', () => {
    const root = fixtureRoot();
    const privateRoot = join(root, 'private', 'release-recovery-v1');
    const first = run(['--generate', '--private-root', privateRoot], { USERPROFILE: root });
    expect(first.status).toBe(0);
    const firstOutput = JSON.parse(first.stdout) as { privateJwkPath: string; publicJwkPath: string };
    const privateBytes = readFileSync(firstOutput.privateJwkPath, 'utf8');
    const replay = run(['--generate', '--private-root', privateRoot], { USERPROFILE: root });

    expect(replay.status).toBe(0);
    expect(readFileSync(firstOutput.privateJwkPath, 'utf8')).toBe(privateBytes);
    expect(replay.stdout).not.toContain(privateBytes);
    expect(replay.stderr).not.toContain(privateBytes);

    chmodSync(firstOutput.privateJwkPath, 0o600);
    const malformedRoot = join(root, 'malformed');
    const malformedPrivate = join(malformedRoot, 'recovery-signing-private.jwk.json');
    mkdirSync(malformedRoot, { recursive: true, mode: 0o700 });
    writeFileSync(malformedPrivate, '{"d":"private-material-must-not-escape"}', { mode: 0o600 });
    const rejected = run(['--generate', '--private-root', malformedRoot], { USERPROFILE: root });
    expect(rejected.status).not.toBe(0);
    expect(`${rejected.stdout}${rejected.stderr}`).not.toContain('private-material-must-not-escape');
  });

  it('rejects repository, Desktop, and worktree output roots without leaking supplied private material', () => {
    const root = fixtureRoot();
    const desktop = join(root, 'Desktop', 'recovery');
    const privateArgument = '{"d":"caller-private-material"}';

    [repositoryRoot, join(repositoryRoot, 'tmp-recovery-output'), desktop].forEach((privateRoot) => {
      const result = run(['--generate', '--private-root', privateRoot, privateArgument], { USERPROFILE: root });
      expect(result.status).not.toBe(0);
      expect(result.stderr).toContain('RECOVERY_BOOTSTRAP_PRIVATE_ROOT_REJECTED');
      expect(`${result.stdout}${result.stderr}`).not.toContain('caller-private-material');
    });
  });

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
