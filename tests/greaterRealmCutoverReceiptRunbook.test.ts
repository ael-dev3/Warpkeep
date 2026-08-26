// @vitest-environment node

import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import { defaultGreaterRealmCutoverReceiptDirectory } from '../scripts/greater-realm-cutover-receipts';

describe('Greater Realm cutover receipt runbook contract', () => {
  it('documents the exact production-admin-v1 receipt default used by operators', () => {
    const expectedSuffix = join(
      '.warpkeep',
      'private',
      'production-admin-v1',
      'greater-realm-cutover-receipts',
    );
    expect(defaultGreaterRealmCutoverReceiptDirectory().endsWith(expectedSuffix)).toBe(true);

    const runbook = readFileSync(resolve(
      process.cwd(),
      'docs/operations/greater-realm-production-cutover.md',
    ), 'utf8');
    expect(runbook).toContain(
      '`~/.warpkeep/private/production-admin-v1/greater-realm-cutover-receipts`',
    );
    expect(runbook).not.toContain(
      '`~/.warpkeep/private/greater-realm-cutover-receipts`',
    );
  });
});
