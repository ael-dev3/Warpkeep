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
});
