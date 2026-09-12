// @vitest-environment node
import { createHash } from 'node:crypto';
import { realpathSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { spawnSync } from 'node:child_process';
import { readRecoveryActivationBootstrapAuthority } from '../scripts/generate-0.4.0-recovery-launch-activation.mjs';
import { createSealedRealmsProductionAuthBridgeStateTestCapability } from '../scripts/sealed-realms-production-auth-bridge-state.mjs';
import { recoveryOperationAuthority } from './fixtures/recoveryActivationBridge';

vi.mock('node:child_process', () => ({ spawnSync: vi.fn() }));
const SOURCE = 'a'.repeat(40);
const TREE = 'b'.repeat(40);
const BLOB = 'c'.repeat(40);
const BOOTSTRAP = Buffer.from('immutable bootstrap source\n');

function gitFixture(origin: string, mismatch = '') {
  vi.mocked(spawnSync).mockImplementation((file, args, options) => {
    expect(file).toBe('/usr/bin/git');
    expect(options).toMatchObject({ env: { GIT_NO_REPLACE_OBJECTS: '1', GIT_CONFIG_NOSYSTEM: '1' } });
    const command = args as string[];
    let output: string | Buffer;
    if (command.includes('config')) output = `core.repositoryformatversion\n0\0core.filemode\ntrue\0core.bare\nfalse\0core.logallrefupdates\ntrue\0remote.origin.url\n${origin}\0remote.origin.fetch\n+refs/heads/*:refs/remotes/origin/*\0${mismatch === 'config' ? 'core.hooksPath\n/tmp/hooks\0' : ''}`;
    else if (command.includes('ls-files')) output = mismatch === 'tracked' ? 'h hidden\0' : 'H source.mjs\0';
    else if (command.includes('--show-toplevel')) output = realpathSync(process.cwd());
    else if (command.includes('HEAD^{commit}')) output = mismatch === 'head' ? 'd'.repeat(40) : SOURCE;
    else if (command.includes('refs/remotes/origin/main')) output = mismatch === 'remote-main' ? 'd'.repeat(40) : SOURCE;
    else if (command.includes('remote')) output = origin;
    else if (command.includes('status')) output = mismatch === 'dirty' ? ' M source.mjs' : '';
    else if (command.includes('ls-remote')) output = `${mismatch === 'remote-head' ? 'd'.repeat(40) : SOURCE}\trefs/heads/main`;
    else if (command.includes(`${SOURCE}^{tree}`)) output = TREE;
    else if (command.includes('ls-tree')) output = `${mismatch === 'symlink' ? '120000' : '100644'} blob ${BLOB}\tscripts/greater-realm-production-bootstrap.mjs\0`;
    else if (command.includes('cat-file')) output = BOOTSTRAP;
    else throw new Error(`Unexpected fixed command: ${JSON.stringify(command)}`);
    const binary = options?.encoding === null;
    return { status: 0, signal: null, pid: 1, output: [],
      stdout: binary ? Buffer.from(output) : String(output), stderr: binary ? Buffer.alloc(0) : '' } as never;
  });
}

afterEach(() => { vi.clearAllMocks(); vi.unstubAllEnvs(); });

describe('fixed recovery activation source reader', () => {
  it.each(['https://github.com/ael-dev3/Warpkeep', 'https://github.com/ael-dev3/Warpkeep.git'])(
    'derives immutable bootstrap facts for the supported canonical origin %s', origin => {
      gitFixture(origin);
      expect(readRecoveryActivationBootstrapAuthority(recoveryOperationAuthority('activation-evidence-generate')))
        .toEqual({ preparationSourceCommit: SOURCE, moduleTreeId: TREE, bootstrapBlob: BLOB,
          bootstrapSha256: createHash('sha256').update(BOOTSTRAP).digest('hex') });
    });
  it.each(['https://github.com/other/Warpkeep', 'http://github.com/ael-dev3/Warpkeep',
    'https://github.com/ael-dev3/Warpkeep.git/other', 'git@github.com:ael-dev3/Warpkeep.git'])(
    'rejects alternate origin %s', origin => {
      gitFixture(origin);
      expect(() => readRecoveryActivationBootstrapAuthority(recoveryOperationAuthority('activation-evidence-generate'))).toThrow();
    });
  it.each(['head', 'remote-main', 'dirty', 'remote-head', 'tracked', 'symlink', 'config'])(
    'rejects changed %s facts', mismatch => {
      gitFixture('https://github.com/ael-dev3/Warpkeep', mismatch);
      expect(() => readRecoveryActivationBootstrapAuthority(recoveryOperationAuthority('activation-evidence-generate'))).toThrow();
    });
  it('rejects test facts without the opaque capability and rejects that capability outside tests', () => {
    const authority = recoveryOperationAuthority('activation-evidence-generate');
    const facts = { preparationSourceCommit: SOURCE, moduleTreeId: TREE, bootstrapBlob: BLOB,
      bootstrapSha256: createHash('sha256').update(BOOTSTRAP).digest('hex') };
    expect(() => readRecoveryActivationBootstrapAuthority(authority, facts as never)).toThrow();
    expect(() => readRecoveryActivationBootstrapAuthority(authority, { capability: {} as never, facts })).toThrow();
    const capability = createSealedRealmsProductionAuthBridgeStateTestCapability();
    expect(readRecoveryActivationBootstrapAuthority(authority, { capability, facts })).toEqual(facts);
    vi.stubEnv('NODE_ENV', 'production');
    expect(() => readRecoveryActivationBootstrapAuthority(authority, { capability, facts })).toThrow();
    expect(spawnSync).not.toHaveBeenCalled();
  });
});
