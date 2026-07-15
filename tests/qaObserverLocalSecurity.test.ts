import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

import { parseQaObserverSnapshot } from '../scripts/qa-observer/observer-snapshot.mjs';

function snapshot() {
  return {
    version: 2,
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
    aggregates: {
      castleCount: 2,
      profileCount: 2,
      foundedCount: 1,
      activeCount: 1
    }
  };
}

describe('local QA Observatory security boundary', () => {
  it('accepts only the exact canonical aggregate attestation', () => {
    const parsed = parseQaObserverSnapshot(snapshot());
    expect(parsed).toEqual(snapshot());
    expect(Object.isFrozen(parsed)).toBe(true);
    expect(Object.isFrozen(parsed?.realm)).toBe(true);
    expect(Object.isFrozen(parsed?.aggregates)).toBe(true);

    for (const candidate of [
      { ...snapshot(), fid: 1 },
      { ...snapshot(), token: 'never' },
      { ...snapshot(), castles: [] },
      { ...snapshot(), worldTileCount: 1_260 },
      { ...snapshot(), realm: { ...snapshot().realm, identity: 'opaque' } },
      { ...snapshot(), aggregates: { ...snapshot().aggregates, fid: 1 } },
      { ...snapshot(), aggregates: { ...snapshot().aggregates, castleId: 1 } },
      { ...snapshot(), aggregates: { ...snapshot().aggregates, castleCount: 0, profileCount: 0 } },
      { ...snapshot(), aggregates: { ...snapshot().aggregates, castleCount: 101, profileCount: 101 } },
      { ...snapshot(), aggregates: { ...snapshot().aggregates, profileCount: 1 } },
      { ...snapshot(), aggregates: { ...snapshot().aggregates, foundedCount: 0 } },
      { ...snapshot(), aggregates: { ...snapshot().aggregates, activeCount: -1 } },
      { ...snapshot(), aggregates: { ...snapshot().aggregates, activeCount: 1.5 } },
      { ...snapshot(), version: 1 },
    ]) {
      expect(parseQaObserverSnapshot(candidate)).toBeUndefined();
    }

    const serialized = JSON.stringify(parsed);
    for (const forbidden of [
      'castleId', 'ownerFid', 'tileKey', 'username', 'displayName', 'publicBio',
      'portrait', 'coordinates',
    ]) expect(serialized.toLowerCase()).not.toContain(forbidden.toLowerCase());
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
    expect(profile).not.toContain('(remote unix-socket (subpath observatory-root))');
    expect(profile).toContain('(remote unix-socket (subpath socket-tmp-root))');
    expect(profile).not.toContain('(remote unix-socket (subpath "/private/tmp"))');
    expect(profile).not.toMatch(/\(allow network\*\)\s*$/m);
    expect(profile).not.toMatch(/remote ip "\*:\*"/);
    expect(profile).toContain('(deny file-write*)');
    expect(profile).not.toContain('(allow file-write* (subpath repository-root))');
    expect(profile).not.toContain('(allow file-write* (subpath observatory-root))');
    expect(profile).not.toContain('(allow file-write* (subpath "/private/tmp"))');
    expect(profile).toContain('(allow file-write* (subpath build-output-root))');
    expect(profile).toContain('(allow file-write* (subpath root-vite-cache-root))');
    expect(profile).toContain('(allow file-write* (subpath root-vite-config-root))');
    expect(profile).toContain('(allow file-write* (subpath spacetime-dist-root))');
    expect(profile).toContain('(deny file-read* (subpath user-home))');
    expect(profile).toContain('(deny file-read* (subpath "/private/tmp"))');
    expect(profile).toContain('(allow file-read-metadata (subpath user-home))');
    expect(profile).not.toContain('(allow file-read* (subpath observatory-root))');
    expect(profile).toContain('(allow file-read* (subpath runtime-home))');
    expect(profile).toContain('(allow file-read* (subpath spacetime-cli-root))');
    expect(profile).toContain('(deny process-exec (subpath observatory-root))');
    expect(profile).toContain('(deny process-exec (literal "/usr/bin/security"))');
    expect(profile).toContain('(deny process-exec (literal "/bin/launchctl"))');
    expect(profile).toContain('(deny mach-lookup (global-name "com.apple.securityd"))');
  });
});
