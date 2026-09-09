// @vitest-environment node

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

import { GREATER_REALM_PRIVATE_MARKER_TEXT } from '../scripts/atlas/greater-realm-private-markers.mjs';

const REPOSITORY_ROOT = resolve(import.meta.dirname, '..');

describe('sealed publication bundle public boundary', () => {
  it('keeps the tracked G002 and PTR bundles free of Greater Realm private markers', () => {
    for (const lane of ['g002', 'ptr'] as const) {
      const bundle = readFileSync(resolve(
        REPOSITORY_ROOT, `scripts/sealed-realms-production-${lane}-lane.bundle.mjs`,
      ), 'utf8');
      expect(GREATER_REALM_PRIVATE_MARKER_TEXT.some(marker => bundle.includes(marker))).toBe(false);
    }
  });
});
