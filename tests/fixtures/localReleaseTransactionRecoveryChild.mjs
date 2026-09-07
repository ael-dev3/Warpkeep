import fs from 'node:fs';
import { syncBuiltinESMExports } from 'node:module';
import { join } from 'node:path';
const [root, transactionId, operation, occurrence] = process.argv.slice(2);
if (operation === 'kill-pending') {
  const original = fs.fsyncSync;
  fs.fsyncSync = fd => {
    const result = original(fd);
    if (fs.readlinkSync(`/proc/self/fd/${fd}`) === join(root, '.git', 'warpkeep-release-assembly-v1', transactionId, 'rolled-back.pending')) {
      process.kill(process.pid, 'SIGKILL');
    }
    return result;
  };
  syncBuiltinESMExports();
}
if (operation === 'audit-sync') {
  const transaction = join(root, '.git', 'warpkeep-release-assembly-v1', transactionId);
  const originalSync = fs.fsyncSync;
  const originalUnlink = fs.unlinkSync;
  fs.fsyncSync = fd => {
    const result = originalSync(fd);
    if (fs.readlinkSync(`/proc/self/fd/${fd}`) === transaction) process.stdout.write('TX_SYNC\n');
    return result;
  };
  fs.unlinkSync = path => {
    process.stdout.write('UNLINK\n');
    return originalUnlink(path);
  };
  syncBuiltinESMExports();
}
if (operation === 'replace-terminal') {
  const original = fs.unlinkSync;
  let replaced = false;
  fs.unlinkSync = (...args) => {
    const result = original(...args);
    if (!replaced) {
      replaced = true;
      const terminal = join(root, '.git', 'warpkeep-release-assembly-v1', transactionId, 'rolled-back.json');
      fs.copyFileSync(terminal, `${terminal}.replacement`);
      fs.renameSync(`${terminal}.replacement`, terminal);
    }
    return result;
  };
  syncBuiltinESMExports();
}
if (['renameSync', 'unlinkSync'].includes(operation)) {
  const original = fs[operation];
  let calls = 0;
  fs[operation] = (...args) => {
    const result = original(...args);
    if (++calls === Number(occurrence)) process.kill(process.pid, 'SIGKILL');
    return result;
  };
  syncBuiltinESMExports();
}
const { recoverPreparedReleaseTransaction } = await import('../../scripts/local-release-transaction-recovery.mjs');
try { process.stdout.write(`${JSON.stringify(recoverPreparedReleaseTransaction(root, transactionId))}\n`); }
catch (error) { process.stdout.write(`${error.code}\n`); process.exitCode = 1; }
