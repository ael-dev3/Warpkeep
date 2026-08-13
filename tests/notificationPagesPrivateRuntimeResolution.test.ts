// @vitest-environment node

import { execFileSync } from 'node:child_process';
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  realpathSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

const repositoryRoot = resolve(import.meta.dirname, '..');

describe('notification Pages private runtime resolution', () => {
  it('imports the receipt from a clean archive with only service-local packages', () => {
    const temporary = mkdtempSync(join(
      realpathSync(tmpdir()),
      'warpkeep-pages-private-runtime-',
    ));
    const archive = join(temporary, 'source.tar');
    const extracted = join(temporary, 'source');
    mkdirSync(extracted, { mode: 0o700 });
    writeFileSync(archive, execFileSync(
      '/usr/bin/git',
      ['archive', '--format=tar', 'HEAD', 'package.json', 'scripts'],
      { cwd: repositoryRoot, maxBuffer: 32 * 1_024 * 1_024 },
    ), { mode: 0o600 });
    execFileSync('/usr/bin/tar', ['-xf', archive, '-C', extracted]);

    for (const packageName of ['typescript', 'yaml']) {
      const source = realpathSync(resolve(
        repositoryRoot,
        'services/auth-bridge/node_modules',
        packageName,
      ));
      const destination = resolve(
        extracted,
        'services/auth-bridge/node_modules',
        packageName,
      );
      mkdirSync(dirname(destination), { recursive: true, mode: 0o700 });
      cpSync(source, destination, {
        dereference: true,
        recursive: true,
      });
    }

    expect(existsSync(resolve(extracted, 'node_modules'))).toBe(false);
    expect(() => execFileSync(
      process.execPath,
      [
        '--input-type=module',
        '--eval',
        "await import('./scripts/notification-pages-live-receipt.mjs')",
      ],
      {
        cwd: extracted,
        encoding: 'utf8',
        env: {},
        stdio: 'pipe',
      },
    )).not.toThrow();
  });
});
