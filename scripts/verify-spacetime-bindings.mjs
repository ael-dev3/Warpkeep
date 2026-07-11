import { execFileSync } from 'node:child_process';
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

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

async function filesUnder(root, current = root) {
  const entries = await readdir(current, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const absolute = join(current, entry.name);
    if (entry.isDirectory()) {
      files.push(...await filesUnder(root, absolute));
    } else if (entry.isFile()) {
      files.push(relative(root, absolute));
    }
  }
  return files.sort();
}

async function compareTrees(expectedRoot, actualRoot) {
  const [expectedFiles, actualFiles] = await Promise.all([
    filesUnder(expectedRoot),
    filesUnder(actualRoot)
  ]);
  const allFiles = [...new Set([...expectedFiles, ...actualFiles])].sort();
  const differences = [];
  for (const file of allFiles) {
    if (!expectedFiles.includes(file) || !actualFiles.includes(file)) {
      differences.push(file);
      continue;
    }
    const [expected, actual] = await Promise.all([
      readFile(join(expectedRoot, file)),
      readFile(join(actualRoot, file))
    ]);
    if (!expected.equals(actual)) differences.push(file);
  }
  return differences;
}

async function main() {
  const committedIndex = await readFile(join(committedDirectory, 'index.ts'), 'utf8');
  if (!committedIndex.includes(`spacetimedb cli version ${PINNED_CLI_VERSION}`)) {
    throw new Error('Committed bindings do not declare the pinned SpacetimeDB CLI version.');
  }

  const stagingDirectory = await mkdtemp(join(dirname(committedDirectory), '.verify-bindings-'));
  try {
    generate(stagingDirectory);
    const differences = await compareTrees(committedDirectory, stagingDirectory);
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
