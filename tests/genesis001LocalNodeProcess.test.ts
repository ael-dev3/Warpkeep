// @vitest-environment node

import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const NATIVE_LANE_ENV = 'WARPKEEP_GENESIS001_NODE_NATIVE_TESTS';
const NATIVE_LANE_VALUE = process.env[NATIVE_LANE_ENV];
const NATIVE_LANE_REQUESTED = NATIVE_LANE_VALUE === '1';
const DISTRIBUTION = 'Ubuntu-24.04';
const USER = 'snapmeter';
const BOOTSTRAP_NODE = '/home/snapmeter/.warpkeep/release-preparation-v1/toolchain/node-v22.22.3-linux-x64/bin/node';

if (NATIVE_LANE_VALUE !== undefined && !NATIVE_LANE_REQUESTED) {
  throw new Error(`${NATIVE_LANE_ENV}_INVALID`);
}

function nativeFixturePath(wsl: string): string {
  const windowsPath = fileURLToPath(new URL('./fixtures/genesis001LocalNodeProcessFixture.mjs', import.meta.url))
    .replaceAll('\\', '/');
  const translated = spawnSync(wsl, [
    '--distribution', DISTRIBUTION, '--user', USER, '--',
    '/usr/bin/env', '-i', 'LANG=C.UTF-8', 'LC_ALL=C.UTF-8',
    '/usr/bin/wslpath', '-a', windowsPath,
  ], { encoding: 'utf8', timeout: 10_000, windowsHide: true });
  expect(translated.error, 'native lane requires working WSL path translation').toBeUndefined();
  expect(translated.status, translated.stderr).toBe(0);
  expect(translated.stderr).toBe('');
  return translated.stdout.trim();
}

describe('Genesis 001 Node binary process supervision', () => {
  it.runIf(NATIVE_LANE_REQUESTED)(
    `native-only (${NATIVE_LANE_ENV}=1; Windows, ${DISTRIBUTION}/${USER}, and fixed Node22 required): preserves binary bytes, enforces independent live caps, and terminates descendants`,
    () => {
      expect(process.platform, 'native lane is supported by the Windows WSL driver').toBe('win32');
      expect(process.env.SystemRoot, 'native lane requires SystemRoot').toMatch(/^[A-Za-z]:\\/u);
      const wsl = join(process.env.SystemRoot!, 'System32', 'wsl.exe');
      expect(existsSync(wsl), `native lane requires ${wsl}`).toBe(true);
      const fixture = nativeFixturePath(wsl);
      const prerequisite = spawnSync(wsl, [
        '--distribution', DISTRIBUTION, '--user', USER, '--',
        '/usr/bin/env', '-i', 'LANG=C.UTF-8', 'LC_ALL=C.UTF-8',
        '/usr/bin/test', '-x', BOOTSTRAP_NODE,
      ], { encoding: 'utf8', timeout: 10_000, windowsHide: true });
      expect(prerequisite.error, 'native lane requires the fixed preparation Node22').toBeUndefined();
      expect(prerequisite.status, prerequisite.stderr).toBe(0);
      const result = spawnSync(
        wsl,
        [
          '--distribution', DISTRIBUTION, '--user', USER, '--',
          '/usr/bin/env', '-i', 'LANG=C.UTF-8', 'LC_ALL=C.UTF-8',
          BOOTSTRAP_NODE, fixture, 'orchestrate',
        ],
        { encoding: 'utf8', timeout: 30_000, windowsHide: true },
      );
      expect(result.error).toBeUndefined();
      expect(result.status).toBe(0);
      expect(result.stderr).toBe('');
      expect(JSON.parse(result.stdout)).toEqual({
        binaryHex: '00ff800a', stdoutOverflow: true, stderrOverflow: true,
        timeout: true, descendantTerminated: true, fixturePath: fixture,
        helperPath: fixture.replace('/tests/fixtures/genesis001LocalNodeProcessFixture.mjs',
          '/scripts/bootstrap-genesis001-local-node-process.mjs'),
      });
    },
  );
});
