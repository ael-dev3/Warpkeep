// Only run inside a task-owned, credential-free runner test container.
import assert from 'node:assert/strict';
import { chmodSync, statSync, symlinkSync, writeFileSync, readFileSync } from 'node:fs';
import { createRecoveryWorkflowPrivateDirectory as create, resolveRecoveryWorkflowPrivateDirectory as resolve } from '/tmp/recovery-workflow-private-directory.mjs';
const error = { message: 'RECOVERY_WORKFLOW_PRIVATE_DIRECTORY_INVALID' };
if (process.argv[2] === '--deny-uid') {
  assert.notEqual(process.getuid(), 1001); assert.throws(() => create('123', '1'), error);
  process.stdout.write('{"wrongUidDenied":true}\n');
} else {
  assert.equal(process.argv.length, 2); assert.equal(process.getuid(), 1001);
  assert.throws(() => resolve('123', '1'), error);
  const path = create('123', '1');
  assert.equal(path, '/home/runner/.warpkeep-recovery-v1/pages-123-1');
  assert.equal(statSync(path).mode & 0o7777, 0o700);
  writeFileSync(`${path}/sentinel`, 'preserve', { mode: 0o600 });
  assert.equal(resolve('123', '1'), path);
  assert.throws(() => create('123', '1'), error);
  assert.equal(readFileSync(`${path}/sentinel`, 'utf8'), 'preserve');
  for (const pair of [['../123', '1'], ['123', '01'], ['123', '0'], ['123', '/tmp/elsewhere']]) assert.throws(() => create(...pair), error);
  assert.throws(() => create('123', '1', '/tmp/override'), error);
  symlinkSync(path, '/home/runner/.warpkeep-recovery-v1/pages-456-1');
  assert.throws(() => resolve('456', '1'), error);
  chmodSync(path, 0o755); assert.throws(() => resolve('123', '1'), error); chmodSync(path, 0o700);
  chmodSync('/home/runner/.warpkeep-recovery-v1', 0o755);
  assert.throws(() => create('789', '1'), error);
  chmodSync('/home/runner/.warpkeep-recovery-v1', 0o700);
  assert.equal(resolve('123', '1'), path);
  process.stdout.write('{"privateDirectoryChecks":true,"priorStatePreserved":true}\n');
}
