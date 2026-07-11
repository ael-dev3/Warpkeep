import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');

describe('license policy guard', () => {
  it('accepts the documented pre-v0.3.0 transition state', () => {
    expect(() => execFileSync(process.execPath, ['scripts/verify-license-policy.mjs'], {
      cwd: repositoryRoot,
      encoding: 'utf8'
    })).not.toThrow();
  });
});
