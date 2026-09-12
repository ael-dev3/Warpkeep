import fs from 'node:fs';
import { syncBuiltinESMExports } from 'node:module';
import { join } from 'node:path';
const [candidateRoot, sourceCommit, sourceTree, point] = process.argv.slice(2);
const originalSync = fs.fsyncSync;
const originalRename = fs.renameSync;
let renames = 0;
fs.fsyncSync = fd => {
  const result = originalSync(fd);
  const path = fs.readlinkSync(`/proc/self/fd/${fd}`);
  if (point === 'journal' && path.endsWith('/journal.json')) process.kill(process.pid, 'SIGKILL');
  if (point === 'tamper-stage' && path.endsWith('/new-0')) fs.writeFileSync(path, 'tampered');
  if (point === 'replace-stage' && path.endsWith('/new-0')) {
    fs.copyFileSync(path, `${path}.replacement`);
    originalRename(`${path}.replacement`, path);
  }
  return result;
};
fs.renameSync = (...args) => {
  const result = originalRename(...args);
  ++renames;
  if (point === 'edit-late' && renames === 1) fs.writeFileSync(join(candidateRoot, 'spacetimedb/ptr/generated-bindings/b.ts'), 'user-edit');
  if (point === `rename-${renames}`) process.kill(process.pid, 'SIGKILL');
  return result;
};
syncBuiltinESMExports();
const { installPreparedReleaseTransaction } = await import('../../scripts/local-release-transaction-install.mjs');
const paths = ['scripts/genesis002_module_bindings/a.ts', 'spacetimedb/ptr/generated-bindings/b.ts'];
try {
  process.stdout.write(JSON.stringify(installPreparedReleaseTransaction({ candidateRoot, sourceCommit, sourceTree,
    files: paths.map(path => ({ path, bytes: Buffer.from(`new:${path}`) })) })));
} catch (error) { process.stderr.write(error.code ?? error.message); process.exitCode = 1; }
