import { execFileSync } from 'node:child_process';
import { access, mkdtemp, rename, rm } from 'node:fs/promises';
import { constants as fsConstants } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const modulePath = join(repositoryRoot, 'spacetimedb');
const outputDirectory = join(repositoryRoot, 'src', 'spacetime', 'module_bindings');
const command = process.env.SPACETIME_BIN || 'spacetime';

function runGenerator(output) {
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

async function exists(path) {
  try {
    await access(path, fsConstants.F_OK);
    return true;
  } catch {
    return false;
  }
}

async function main() {
  const stagingDirectory = await mkdtemp(join(dirname(outputDirectory), '.module-bindings-'));
  const generatedDirectory = join(stagingDirectory, 'generated');
  const backupDirectory = `${outputDirectory}.previous`;

  try {
    runGenerator(generatedDirectory);
    await rm(backupDirectory, { recursive: true, force: true });
    const hadExistingBindings = await exists(outputDirectory);
    if (hadExistingBindings) {
      await rename(outputDirectory, backupDirectory);
    }
    try {
      await rename(generatedDirectory, outputDirectory);
    } catch (error) {
      if (hadExistingBindings) {
        await rename(backupDirectory, outputDirectory);
      }
      throw error;
    }
    await rm(backupDirectory, { recursive: true, force: true });
    console.log('Generated committed Warpkeep TypeScript bindings from the local module.');
  } finally {
    await rm(stagingDirectory, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error('Could not generate Warpkeep SpacetimeDB bindings.');
  process.exitCode = typeof error === 'object' && error !== null && 'status' in error
    ? Number(error.status) || 1
    : 1;
});
