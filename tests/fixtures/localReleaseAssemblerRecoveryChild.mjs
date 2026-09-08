import fs from 'node:fs';
import { syncBuiltinESMExports } from 'node:module';
import { join } from 'node:path';

const [handle, mode] = process.argv.slice(2);
if (!/^release-workspace-[a-f0-9]{32}$/u.test(handle)
  || !['audit-sync', 'kill-history-rename'].includes(mode)) throw new Error('FIXTURE_ARGUMENTS_INVALID');
const operationRoot = join('/home/snapmeter/.warpkeep/release-preparation-v1/runs', handle);
const history = join(operationRoot, 'prepared-source.history.json');
const { acquirePreparedReleaseCandidateLock } = await import('../../scripts/local-release-candidate-lock.mjs');
const originalRename = fs.renameSync;
const originalSync = fs.fsyncSync;
fs.renameSync = (...args) => {
  const result = originalRename(...args);
  if (args[1] === history) {
    if (mode === 'kill-history-rename') process.kill(process.pid, 'SIGKILL');
    let acquired;
    let blocked = false;
    try { acquired = acquirePreparedReleaseCandidateLock(join(operationRoot, 'candidate')); }
    catch (error) {
      if (error.code !== 'LOCAL_RELEASE_LOCK_BUSY') throw error;
      blocked = true;
    }
    finally { acquired?.release(); }
    if (!blocked) throw new Error('FIXTURE_ARCHIVAL_LEASE_NOT_HELD');
    process.stdout.write('LEASE_HELD\n');
  }
  return result;
};
fs.fsyncSync = descriptor => {
  const result = originalSync(descriptor);
  if (mode === 'audit-sync') {
    const path = fs.readlinkSync(`/proc/self/fd/${descriptor}`);
    if (path === history) process.stdout.write('HISTORY_FILE_SYNC\n');
    if (path === operationRoot) process.stdout.write('OPERATION_SYNC\n');
  }
  return result;
};
syncBuiltinESMExports();
const { runLocalReleaseAssembler } = await import('../../scripts/local-release-assembler.mjs');
try { process.stdout.write(`${JSON.stringify(await runLocalReleaseAssembler(['recover', handle]))}\n`); }
catch (error) {
  process.stderr.write(`${error.code ?? error.message}\n`);
  process.exitCode = 1;
}
