import { execFileSync } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { compareSpacetimeBindingTrees } from './spacetime-binding-tree.mjs';

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const modulePath = join(repositoryRoot, 'spacetimedb');
const committedDirectory = join(repositoryRoot, 'src', 'spacetime', 'module_bindings');
const command = process.env.SPACETIME_BIN || 'spacetime';
const PINNED_CLI_VERSION = '2.6.1';

function generate(output) {
  execFileSync(command, [
    'generate',
    '--lang', 'typescript',
    '--module-path', modulePath,
    '--out-dir', output,
    '--yes'
  ], {
    cwd: repositoryRoot,
    stdio: 'inherit'
  });
}

async function main() {
  const committedIndex = await readFile(join(committedDirectory, 'index.ts'), 'utf8');
  if (!committedIndex.includes(`spacetimedb cli version ${PINNED_CLI_VERSION}`)) {
    throw new Error('Committed bindings do not declare the pinned SpacetimeDB CLI version.');
  }

  const stagingDirectory = await mkdtemp(join(tmpdir(), 'warpkeep-verify-bindings-'));
  try {
    generate(stagingDirectory);
    const differences = await compareSpacetimeBindingTrees(committedDirectory, stagingDirectory);
    if (differences.length > 0) {
      throw new Error(`Generated bindings differ: ${differences.join(', ')}`);
    }
    console.log(`Verified committed bindings against SpacetimeDB CLI ${PINNED_CLI_VERSION}.`);
  } finally {
    await rm(stagingDirectory, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : 'Could not verify generated bindings.');
  process.exitCode = 1;
});
