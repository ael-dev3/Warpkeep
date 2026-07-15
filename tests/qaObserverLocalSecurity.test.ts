import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { chmod, mkdir, mkdtemp, realpath, rm, writeFile } from 'node:fs/promises';
import { request as httpRequest } from 'node:http';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

import { parseQaObserverSnapshot } from '../scripts/qa-observer/observer-snapshot.mjs';
import {
  probeLocalBrokerHealth,
  probeLocalBrokerSnapshot
} from '../scripts/qa-observer/qa-cycle-runner.mjs';

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
    expect(source).toContain('maximumChallengeResponseBytes = 16 * 1024');
    expect(source).toContain('maximumSnapshotResponseBytes = 16 * 1024');
    expect(source).toContain('http.statusCode == 200');
    expect(source).toContain('isExactJsonContentType');
    expect(source).toContain('hasExactNoStoreDirective');
    expect(source).not.toContain('.hasPrefix("application/json")');
    expect(source).not.toContain('.contains("no-store") == true');
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
    expect(source).toContain('const MAX_HELPER_BYTES = 16 * 1024');
    expect(source).toContain('metadata.mtimeNs');
    expect(source).toContain('metadata.ctimeNs');
    expect(source).toContain('requireHelperBoundary() !== expectedHelperIdentity');
    expect(source).toContain('server.maxConnections = MAX_CONNECTIONS');
    expect(source).toContain('server.maxRequestsPerSocket = 1');
    expect(source).toContain("request.headers['transfer-encoding'] !== undefined");
    expect(source).toContain("connection: 'close'");
    expect(source).not.toMatch(/ADMIN_TOKEN_SECRET|SIGNING_KEY_JWK|SESSION_COOKIE_KEY/);
    expect(source).not.toMatch(/localStorage|sessionStorage|document\.cookie/);
    expect(source).toContain("'cache-control': 'no-store'");
    expect(source).toContain('setTimeout(clearSnapshotCache, CACHE_TTL_MILLISECONDS)');
    expect(source).toContain('cachedSnapshot = undefined');
    expect(source).toContain("request.method !== 'GET'");
    expect(source).toContain("requestPath !== '/healthz'");
    expect(source).toContain("request.httpVersion !== '1.1'");
    expect(source).not.toMatch(/127\.0\.0\.1|localhost|access-control|ALLOWED_ORIGINS|validOrigin|Origin/);
  });

  it('runs the real broker against a synthetic helper and rejects a request body', async () => {
    const sandboxTemporaryHome = process.env.WARPKEEP_QA_SOCKET_TMP;
    const temporaryHome = await realpath(
      sandboxTemporaryHome ?? await mkdtemp('/tmp/wkqb-')
    );
    const cleanupRoot = sandboxTemporaryHome
      ? join(temporaryHome, 'Library')
      : temporaryHome;
    const observatory = join(
      temporaryHome,
      'Library',
      'Application Support',
      'Warpkeep',
      'qa-observatory'
    );
    const helperDirectory = join(observatory, 'bin');
    const helperPath = join(helperDirectory, 'warpkeep-qa-device');
    const socketPath = join(observatory, 'broker.sock');
    const brokerPath = resolve(
      process.cwd(),
      'scripts/qa-observer/qa-observer-broker.mjs'
    );
    await mkdir(helperDirectory, { recursive: true, mode: 0o700 });
    await chmod(observatory, 0o700);
    await chmod(helperDirectory, 0o700);
    await writeFile(
      helperPath,
      `#!${process.execPath}\nprocess.stdout.write(${JSON.stringify(`${JSON.stringify(snapshot())}\n`)})\n`,
      { mode: 0o700 }
    );
    await chmod(helperPath, 0o700);

    const broker = spawn(process.execPath, [brokerPath], {
      cwd: '/',
      env: { HOME: temporaryHome, PATH: '/usr/bin:/bin' },
      stdio: ['ignore', 'pipe', 'ignore']
    });
    try {
      await new Promise<void>((resolveReady, rejectReady) => {
        const timeout = setTimeout(() => rejectReady(new Error('Broker startup timed out.')), 5_000);
        broker.once('error', rejectReady);
        broker.once('exit', () => rejectReady(new Error('Broker exited before readiness.')));
        broker.stdout.on('data', (chunk) => {
          if (!chunk.toString('utf8').includes('owner-private local socket')) return;
          clearTimeout(timeout);
          resolveReady();
        });
      });

      await expect(probeLocalBrokerHealth({ socketPath })).resolves.toBeUndefined();
      await expect(probeLocalBrokerSnapshot({ socketPath })).resolves.toBeUndefined();
      const status = await new Promise<number | undefined>((resolveStatus, rejectStatus) => {
        const request = httpRequest({
          socketPath,
          path: '/healthz',
          method: 'GET',
          headers: { 'content-length': '1' },
          agent: false
        }, (response) => {
          response.resume();
          response.once('end', () => resolveStatus(response.statusCode));
        });
        request.once('error', rejectStatus);
        request.end('x');
      });
      expect(status).toBe(404);
    } finally {
      broker.kill('SIGTERM');
      await new Promise<void>((resolveExit) => {
        if (broker.exitCode !== null) {
          resolveExit();
          return;
        }
        const timeout = setTimeout(() => {
          broker.kill('SIGKILL');
          resolveExit();
        }, 2_000);
        broker.once('exit', () => {
          clearTimeout(timeout);
          resolveExit();
        });
      });
      await rm(cleanupRoot, { recursive: true, force: true });
    }
  }, 15_000);

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
