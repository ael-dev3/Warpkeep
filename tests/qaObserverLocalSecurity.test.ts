import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

import { parseQaObserverSnapshot } from '../scripts/qa-observer/observer-snapshot.mjs';

function snapshot() {
  return {
    version: 1,
    protocolVersion: 3,
    worldSeed: 3_445_214_658,
    worldSeedName: 'HEGEMONY_GENESIS_001',
    worldTileCount: 1_261,
    worldTileMetaCount: 1_261,
    realm: {
      realmId: 'GENESIS_001',
      numericSeed: 3_445_214_658,
      generationVersion: 2,
      authoritativeRadius: 20,
      renderRadius: 22,
      playerCapacity: 100
    },
    castles: [{
      castleId: 1,
      tileKey: '0,1',
      q: 0,
      r: 1,
      level: 2,
      name: 'Observed Keep',
      canonicalUsername: 'public-name',
      displayName: 'Public Name',
      portraitAvailable: true,
      publicBio: 'Public profile text.',
      publicStatus: 'active'
    }]
  };
}

describe('local QA Observatory security boundary', () => {
  it('accepts only the exact canonical, FID-free Realm projection', () => {
    const parsed = parseQaObserverSnapshot(snapshot());
    expect(parsed).toEqual(snapshot());
    expect(Object.isFrozen(parsed)).toBe(true);
    expect(Object.isFrozen(parsed?.realm)).toBe(true);
    expect(Object.isFrozen(parsed?.castles[0])).toBe(true);

    for (const candidate of [
      { ...snapshot(), fid: 1 },
      { ...snapshot(), token: 'never' },
      { ...snapshot(), castles: [] },
      { ...snapshot(), worldTileCount: 1_260 },
      { ...snapshot(), realm: { ...snapshot().realm, identity: 'opaque' } },
      { ...snapshot(), castles: [{ ...snapshot().castles[0], ownerFid: 1 }] },
      { ...snapshot(), castles: [{ ...snapshot().castles[0], pfpUrl: 'https://example.test/pfp' }] },
      { ...snapshot(), castles: [{ ...snapshot().castles[0], tileKey: '1,0' }] },
      { ...snapshot(), castles: [{ ...snapshot().castles[0], canonicalUsername: 'Not Canonical' }] },
      { ...snapshot(), castles: [{ ...snapshot().castles[0], displayName: 'Trusted\u202eexe' }] },
      { ...snapshot(), castles: [{ ...snapshot().castles[0], name: ` ${snapshot().castles[0].name}` }] },
      { ...snapshot(), castles: [{ ...snapshot().castles[0], name: 'Observed  Keep' }] },
      { ...snapshot(), castles: [{ ...snapshot().castles[0], name: 'n'.repeat(81) }] },
      { ...snapshot(), castles: [{ ...snapshot().castles[0], publicBio: null }] },
      { ...snapshot(), castles: [{ ...snapshot().castles[0], publicStatus: 'pending' }] },
      { ...snapshot(), castles: [{ ...snapshot().castles[0], q: 20, r: 20, tileKey: '20,20' }] },
      { ...snapshot(), castles: [snapshot().castles[0], snapshot().castles[0]] },
      { ...snapshot(), castles: [
        { ...snapshot().castles[0], castleId: 2 },
        { ...snapshot().castles[0], castleId: 1, q: 1, r: 0, tileKey: '1,0' }
      ] },
      { ...snapshot(), castles: [
        snapshot().castles[0],
        { ...snapshot().castles[0], castleId: 2 }
      ] },
    ]) {
      expect(parseQaObserverSnapshot(candidate)).toBeUndefined();
    }
  });

  it('keeps the native credential non-exportable and fixed-purpose', () => {
    const source = readFileSync(
      resolve(process.cwd(), 'scripts/qa-observer/WarpkeepQaDevice.swift'),
      'utf8'
    );
    expect(source).toContain('kSecAttrTokenIDSecureEnclave');
    expect(source).toContain('kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly');
    expect(source).toContain('.privateKeyUsage');
    expect(source).toContain('https://auth.warpkeep.com');
    expect(source).toContain('/v1/qa/challenge');
    expect(source).toContain('/v1/qa/realm-snapshot');
    expect(source).toContain('case "snapshot"');
    expect(source).toContain('case "implementation-self-test"');
    expect(source).toContain('case "self-test-if-present"');
    expect(source).toContain('kSecMatchLimitAll');
    expect(source).toContain('kSecAttrSynchronizableAny');
    expect(source).toContain('kSecReturnAttributes');
    expect(source).toContain('kSecValueRef');
    expect(source).toContain('kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly as String');
    expect(source).toContain('SecKeyCopyAttributes');
    expect(source).toContain('SecKeyCopyExternalRepresentation(key');
    expect(source).toContain('URLSessionDataDelegate');
    expect(source).toContain('Content-Length');
    expect(source).toContain('timeoutIntervalForResource');
    expect(source).not.toContain('.data(for:');
    expect(source).not.toContain('case "sign"');
    expect(source).not.toContain('case "delete"');
    expect(source).not.toContain('ADMIN_TOKEN_SECRET');

    const buildSource = readFileSync(
      resolve(process.cwd(), 'scripts/qa-observer/build-macos-helper.zsh'),
      'utf8'
    );
    expect(buildSource).toContain('/bin/realpath');
    expect(buildSource).toContain('/usr/bin/mktemp -d');
    expect(buildSource).toContain('previous-warpkeep-qa-device');
    expect(buildSource).toContain('install_replaced=true');
    expect(buildSource).toContain('restores the prior helper');
    expect(buildSource).toContain("'%HT'");
    expect(buildSource).toContain("'%u'");
    expect(buildSource).toContain("'%l'");
    expect(buildSource).not.toContain('/bin/mkdir -p');
  });

  it('binds the broker to an owner-private Unix socket and passes no credential through argv or environment', () => {
    const source = readFileSync(
      resolve(process.cwd(), 'scripts/qa-observer/qa-observer-broker.mjs'),
      'utf8'
    );
    expect(source).toContain("const SOCKET_PATH = join(OBSERVATORY_DIRECTORY, 'broker.sock')");
    expect(source).toContain('const MAX_UNIX_SOCKET_PATH_BYTES = 90');
    expect(source).toContain('server.listen(SOCKET_PATH');
    expect(source).toContain('process.umask(0o077)');
    expect(source).toContain('metadata.isSocket()');
    expect(source).toContain('chmodSync(SOCKET_PATH, 0o600)');
    expect(source).toContain("spawn(helperPath, ['snapshot']");
    expect(source).toContain('metadata.isSymbolicLink()');
    expect(source).toContain('(metadata.mode & 0o077) !== 0');
    expect(source).toContain('metadata.nlink !== 1');
    expect(source).toContain('metadata.uid !== expectedUid');
    expect(source).toContain("PATH: '/usr/bin:/bin'");
    expect(source).not.toMatch(/ADMIN_TOKEN_SECRET|SIGNING_KEY_JWK|SESSION_COOKIE_KEY/);
    expect(source).not.toMatch(/localStorage|sessionStorage|document\.cookie/);
    expect(source).toContain("'cache-control': 'no-store'");
    expect(source).toContain('setTimeout(clearSnapshotCache, CACHE_TTL_MILLISECONDS)');
    expect(source).toContain('cachedSnapshot = undefined');
    expect(source).toContain("request.method !== 'GET'");
    expect(source).toContain("url.search !== ''");
    expect(source).not.toMatch(/127\.0\.0\.1|localhost|access-control|ALLOWED_ORIGINS|validOrigin|Origin/);
  });

  it('ships an inert non-root LaunchAgent template without secrets or network coordinates', () => {
    const source = readFileSync(
      resolve(
        process.cwd(),
        'scripts/qa-observer/launchd/com.warpkeep.qa-observatory.plist.template'
      ),
      'utf8'
    );
    expect(source).toContain('<string>com.warpkeep.qa-observatory</string>');
    expect(source).toContain('<key>RunAtLoad</key>');
    expect(source).toContain('<integer>63</integer>');
    expect(source).not.toMatch(/EnvironmentVariables|https:\/\/|token|secret|credential/i);
  });

  it('denies non-loopback network authority to every autonomous macOS check process', () => {
    const profile = readFileSync(
      resolve(process.cwd(), 'scripts/qa-observer/qa-cycle-network.sb'),
      'utf8'
    );
    expect(profile).toContain('(deny network*)');
    expect(profile).toContain('(local ip "localhost:*")');
    expect(profile).toContain('(remote ip "localhost:*")');
    expect(profile).toContain('(subpath observatory-root)');
    expect(profile).not.toMatch(/\(allow network\*\)\s*$/m);
    expect(profile).not.toMatch(/remote ip "\*:\*"/);
  });
});
