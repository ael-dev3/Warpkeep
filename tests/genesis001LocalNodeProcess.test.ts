// @vitest-environment node

import { spawnSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';

describe('Genesis 001 Node binary process supervision', () => {
  it('preserves binary bytes, enforces independent live caps, and terminates descendants', () => {
    const result = spawnSync(
      'C:\\Windows\\System32\\wsl.exe',
      [
        '--distribution', 'Ubuntu-24.04', '--user', 'snapmeter', '--',
        '/usr/bin/env', '-i', 'LANG=C.UTF-8', 'LC_ALL=C.UTF-8',
        '/home/snapmeter/.warpkeep/release-preparation-v1/toolchain/node-v22.22.3-linux-x64/bin/node',
        '/mnt/c/Users/heyas/Documents/Codex/2026-08-11/pl/Warpkeep-0.4.0-worktree/tests/fixtures/genesis001LocalNodeProcessFixture.mjs',
        'orchestrate',
      ],
      { encoding: 'utf8', timeout: 30_000, windowsHide: true },
    );
    expect(result.error).toBeUndefined();
    expect(result.status).toBe(0);
    expect(result.stderr).toBe('');
    expect(JSON.parse(result.stdout)).toEqual({
      binaryHex: '00ff800a', stdoutOverflow: true, stderrOverflow: true,
      timeout: true, descendantTerminated: true,
    });
  });
});
