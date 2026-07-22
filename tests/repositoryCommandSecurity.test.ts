import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

describe('repository command security policy', () => {
  it('does not expose a direct production SpacetimeDB log shortcut', () => {
    const manifest = JSON.parse(readFileSync(resolve(import.meta.dirname, '../package.json'), 'utf8')) as {
      scripts?: Record<string, string>;
    };
    const commands = Object.entries(manifest.scripts ?? {});

    expect(commands.some(([, command]) => /\bspacetime\s+logs\b/u.test(command))).toBe(false);
    expect(commands.some(([, command]) => (
      command.includes('maincloud') || command.includes('warpkeep-89e4u')
    ))).toBe(false);
  });

  it('does not expose a bare Worker deployment shortcut', () => {
    const manifest = JSON.parse(readFileSync(resolve(
      import.meta.dirname,
      '../services/auth-bridge/package.json'
    ), 'utf8')) as { scripts?: Record<string, string> };
    const commands = Object.values(manifest.scripts ?? {});

    expect(manifest.scripts?.deploy).toBeUndefined();
    expect(commands.some((command) => /\bwrangler\s+deploy\b/u.test(command))).toBe(false);
  });

  it('defensively ignores common local credential and recovery artifacts', () => {
    const ignore = readFileSync(resolve(import.meta.dirname, '../.gitignore'), 'utf8');

    for (const pattern of [
      'credentials.json',
      '.envrc',
      '.npmrc',
      '*.pem',
      '*.key',
      '*.log',
      '*.har',
      '*.trace',
      '*.backup',
      '*.sqlite',
      '*.dump',
      '*.zip',
      '*.tar.gz',
    ]) {
      expect(ignore.split('\n')).toContain(pattern);
    }
  });
});
