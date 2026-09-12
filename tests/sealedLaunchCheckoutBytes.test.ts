// @vitest-environment node

import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

import { SEALED_LAUNCH_SOURCE_PATHS } from '../scripts/verify-0.4.0-sealed-launch.mjs';

const repositoryRoot = resolve(import.meta.dirname, '..');

describe('sealed launch checkout bytes', () => {
  it('keeps every verifier input at LF even when the operator enables autocrlf', () => {
    const paths = [...new Set(Object.values(SEALED_LAUNCH_SOURCE_PATHS))];
    const output = execFileSync('git', ['check-attr', '-z', '--stdin', 'eol'], {
      cwd: repositoryRoot,
      input: paths.join('\0') + '\0',
      encoding: 'utf8',
    }).split('\0');
    output.pop();
    expect(output.length).toBe(paths.length * 3);
    for (let index = 0; index < output.length; index += 3) {
      expect(output[index + 2], output[index]).toBe('lf');
    }
  });

  it.each([
    'scripts/sealed-realms-production-source-authority.mjs',
    'scripts/sealed-realms-production-source-authority.d.mts',
  ])('does not change the pinned authority bytes during checkout: %s', path => {
    const committed = execFileSync('git', ['show', `HEAD:${path}`], {
      cwd: repositoryRoot,
    });
    const checkedOut = execFileSync('git', [
      '-c', 'core.autocrlf=true', 'cat-file', '--filters', `HEAD:${path}`,
    ], { cwd: repositoryRoot });
    expect(checkedOut.equals(committed), `${path}: checkout changed protected bytes`).toBe(true);
  });
});
