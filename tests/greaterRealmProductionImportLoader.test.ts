// @vitest-environment node

import { expect, it } from 'vitest';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

it('imports the production import core while an isolated fixture owns the cwd', async () => {
  const originalCwd = process.cwd();
  const fixtureCwd = mkdtempSync(join(tmpdir(), 'warpkeep-import-loader-'));
  process.chdir(fixtureCwd);
  try {
    const imported = await import(
      `${new URL('../scripts/greater-realm-production-import-core.ts', import.meta.url).href}?isolated-cwd`,
    );
    expect(imported.verifyGreaterRealmProductionImportAuthority).toBeTypeOf('function');
  } finally {
    process.chdir(originalCwd);
    rmSync(fixtureCwd, { recursive: true, force: true });
  }
});

it('marks the native operation-bundle import as runtime-resolved for Vite', () => {
  const source = readFileSync(
    new URL('../scripts/local-binding-runtime-core.mjs', import.meta.url),
    'utf8',
  );
  expect(source).toContain(
    "const operationBundlePackagesSpecifier = 'warpkeep:operation-bundle-packages';",
  );
  expect(source).toContain('import(/* @vite-ignore */ operationBundlePackagesSpecifier)');
});
