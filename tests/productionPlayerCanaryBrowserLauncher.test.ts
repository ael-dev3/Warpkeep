import {
  chmodSync,
  lstatSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

import { afterEach, describe, expect, it } from 'vitest';

import {
  encodeProductionPlayerCanaryBrowserLaunchPacket,
  inspectProductionPlayerCanaryBrowserLaunchPacket,
  writeProductionPlayerCanaryBrowserLaunchPacket,
} from '../scripts/production-player-canary-browser-launcher.mjs';

const PACKET = Object.freeze({
  evidenceNonce: 'a'.repeat(64),
  reviewedAdmissionPlanDigest: 'b'.repeat(64),
  routeSetCommitment: 'c'.repeat(64),
});
const temporaryDirectories: string[] = [];

function ownerPrivateTemporaryDirectory() {
  const directory = realpathSync(mkdtempSync(join(tmpdir(), 'warpkeep-canary-packet-')));
  chmodSync(directory, 0o700);
  temporaryDirectories.push(directory);
  return directory;
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe('owner-private production player canary browser packet', () => {
  it('writes and inspects only the fixed three canonical values at mode 0600', () => {
    const directory = ownerPrivateTemporaryDirectory();
    const destination = join(directory, 'launch.json');

    expect(writeProductionPlayerCanaryBrowserLaunchPacket({
      destination,
      packet: PACKET,
    })).toEqual(PACKET);
    expect(inspectProductionPlayerCanaryBrowserLaunchPacket({ path: destination }))
      .toEqual(PACKET);

    const metadata = lstatSync(destination);
    expect(metadata.isFile()).toBe(true);
    expect(metadata.nlink).toBe(1);
    expect(metadata.mode & 0o777).toBe(0o600);
    const parsed = JSON.parse(readFileSync(destination, 'utf8')) as Record<string, unknown>;
    expect(Object.keys(parsed)).toEqual([
      'evidenceNonce',
      'reviewedAdmissionPlanDigest',
      'routeSetCommitment',
    ]);
    expect(readFileSync(destination)).toEqual(encodeProductionPlayerCanaryBrowserLaunchPacket(PACKET));
  });

  it('provides one bounded CLI write command without printing packet values or its path', () => {
    const directory = ownerPrivateTemporaryDirectory();
    const destination = join(directory, 'launch.json');
    const script = resolve(
      process.cwd(),
      'scripts/production-player-canary-browser-launcher.mjs',
    );
    const result = spawnSync(process.execPath, [script, 'write', destination], {
      cwd: process.cwd(),
      input: JSON.stringify(PACKET),
      encoding: 'utf8',
    });
    expect(result.status).toBe(0);
    expect(result.stdout).toBe('PRODUCTION_PLAYER_CANARY_BROWSER_PACKET_WRITTEN\n');
    expect(result.stderr).toBe('');
    expect(`${result.stdout}${result.stderr}`).not.toContain(PACKET.evidenceNonce);
    expect(`${result.stdout}${result.stderr}`).not.toContain(destination);
    expect(inspectProductionPlayerCanaryBrowserLaunchPacket({ path: destination }))
      .toEqual(PACKET);
  });

  it('never overwrites an existing path and rejects symlinks or non-owner-only directories', () => {
    const directory = ownerPrivateTemporaryDirectory();
    const destination = join(directory, 'launch.json');
    writeProductionPlayerCanaryBrowserLaunchPacket({ destination, packet: PACKET });
    const before = readFileSync(destination);
    expect(() => writeProductionPlayerCanaryBrowserLaunchPacket({
      destination,
      packet: { ...PACKET, evidenceNonce: 'd'.repeat(64) },
    })).toThrow('PRODUCTION_PLAYER_CANARY_BROWSER_PACKET_WRITE_INVALID');
    expect(readFileSync(destination)).toEqual(before);

    const symlink = join(directory, 'launch-link.json');
    symlinkSync(destination, symlink);
    expect(() => inspectProductionPlayerCanaryBrowserLaunchPacket({ path: symlink }))
      .toThrow('PRODUCTION_PLAYER_CANARY_BROWSER_PACKET_METADATA_INVALID');

    const exposed = ownerPrivateTemporaryDirectory();
    chmodSync(exposed, 0o755);
    expect(() => writeProductionPlayerCanaryBrowserLaunchPacket({
      destination: join(exposed, 'launch.json'),
      packet: PACKET,
    })).toThrow('PRODUCTION_PLAYER_CANARY_BROWSER_PACKET_DIRECTORY_INVALID');
  });

  it('rejects wrong mode, duplicate/noncanonical bytes, extra keys, accessors and uppercase values', () => {
    const directory = ownerPrivateTemporaryDirectory();
    const wrongMode = join(directory, 'wrong-mode.json');
    writeFileSync(wrongMode, encodeProductionPlayerCanaryBrowserLaunchPacket(PACKET), { mode: 0o600 });
    chmodSync(wrongMode, 0o640);
    expect(() => inspectProductionPlayerCanaryBrowserLaunchPacket({ path: wrongMode }))
      .toThrow('PRODUCTION_PLAYER_CANARY_BROWSER_PACKET_METADATA_INVALID');

    const duplicate = join(directory, 'duplicate.json');
    writeFileSync(
      duplicate,
      `{"evidenceNonce":"${PACKET.evidenceNonce}","evidenceNonce":"${PACKET.evidenceNonce}","reviewedAdmissionPlanDigest":"${PACKET.reviewedAdmissionPlanDigest}","routeSetCommitment":"${PACKET.routeSetCommitment}"}\n`,
      { mode: 0o600 },
    );
    expect(() => inspectProductionPlayerCanaryBrowserLaunchPacket({ path: duplicate }))
      .toThrow('PRODUCTION_PLAYER_CANARY_BROWSER_PACKET_INVALID');

    expect(() => encodeProductionPlayerCanaryBrowserLaunchPacket({
      ...PACKET,
      unexpected: true,
    } as never)).toThrow('PRODUCTION_PLAYER_CANARY_BROWSER_PACKET_INVALID');
    expect(() => encodeProductionPlayerCanaryBrowserLaunchPacket({
      ...PACKET,
      routeSetCommitment: PACKET.routeSetCommitment.toUpperCase(),
    })).toThrow('PRODUCTION_PLAYER_CANARY_BROWSER_PACKET_INVALID');
    const accessor = { ...PACKET };
    Object.defineProperty(accessor, 'evidenceNonce', {
      enumerable: true,
      get: () => PACKET.evidenceNonce,
    });
    expect(() => encodeProductionPlayerCanaryBrowserLaunchPacket(accessor))
      .toThrow('PRODUCTION_PLAYER_CANARY_BROWSER_PACKET_INVALID');

    const hidden = { ...PACKET };
    Object.defineProperty(hidden, 'hiddenAuthority', {
      enumerable: false,
      value: true,
    });
    expect(() => encodeProductionPlayerCanaryBrowserLaunchPacket(hidden))
      .toThrow('PRODUCTION_PLAYER_CANARY_BROWSER_PACKET_INVALID');

    if (process.platform !== 'win32') {
      chmodSync(wrongMode, 0o4600);
      expect(() => inspectProductionPlayerCanaryBrowserLaunchPacket({ path: wrongMode }))
        .toThrow('PRODUCTION_PLAYER_CANARY_BROWSER_PACKET_METADATA_INVALID');
    }
  });

  it('contains no browser automation, transfer, persistence, journal, receipt or network medium', () => {
    const source = readFileSync(
      resolve(process.cwd(), 'scripts/production-player-canary-browser-launcher.mjs'),
      'utf8',
    );
    expect(source).not.toMatch(/node:(?:http|https|net|tls)|\bfetch\s*\(|XMLHttpRequest|WebSocket|navigator\.clipboard|localStorage|sessionStorage|indexedDB|\.postMessage\s*\(|\bPOST\b|download|journal|receipt|playwright|puppeteer/u);
    expect(source).not.toContain('child_process');
  });
});
