// Explicit credential-free native integration probe, never a release command.
// Reinstalls one existing public binding with identical bytes in a newly
// captured private candidate, then rolls that transaction back. No final freeze.
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { capturePreparedLinuxReleaseWorkspace } from '../../scripts/local-release-workspace.mjs';
import { readLocalBindingBoundedFile } from '../../scripts/local-binding-bounded-file.mjs';
import { acquirePreparedReleaseCandidateLock } from '../../scripts/local-release-candidate-lock.mjs';
import { recoverPreparedReleaseTransaction } from '../../scripts/local-release-transaction-recovery.mjs';

let workspace;
let bytes;
try {
  if (process.argv.length !== 2) throw new Error('LOCAL_RELEASE_NATIVE_PROBE_ARGUMENTS_INVALID');
  workspace = capturePreparedLinuxReleaseWorkspace();
  const path = 'scripts/genesis002_module_bindings/index.ts';
  bytes = readLocalBindingBoundedFile(join(workspace.sourceRoot, path), { maximumBytes: 8 * 1024 * 1024, expectedUid: 1000 }).body;
  const sha256 = createHash('sha256').update(bytes).digest('hex');
  const result = workspace.installOutputs([{ path, bytes }]);
  if (result.status !== 'installed-unverified') throw new Error('LOCAL_RELEASE_NATIVE_PROBE_STATUS_INVALID');
  workspace.assertActive();
  let competing;
  try { competing = acquirePreparedReleaseCandidateLock(workspace.candidateRoot); }
  catch (error) { if (error.code !== 'LOCAL_RELEASE_LOCK_BUSY') throw error; }
  if (competing !== undefined) { competing.release(); throw new Error('LOCAL_RELEASE_NATIVE_PROBE_LOCK_LOST'); }
  const verifyTarget = () => readLocalBindingBoundedFile(join(workspace.candidateRoot, path), {
    maximumBytes: 8 * 1024 * 1024, expectedUid: 1000, expectedSha256: sha256, discardBody: true,
  });
  verifyTarget(); workspace.release();
  recoverPreparedReleaseTransaction(workspace.candidateRoot, result.transactionId);
  verifyTarget();
  process.stdout.write(`${JSON.stringify({ profile: 'warpkeep-local-release-workspace-install-probe-v1',
    sourceCommit: workspace.sourceCommit, sourceTree: workspace.sourceTree,
    installedIdenticalBytes: true, retainedExclusiveLock: true, rolledBack: true, targetSha256: sha256 })}\n`);
} catch (error) {
  const code = typeof error?.code === 'string' && /^LOCAL_[A-Z0-9_]+$/u.test(error.code)
    ? error.code : 'LOCAL_RELEASE_NATIVE_PROBE_FAILED';
  process.stderr.write(`${code}\n`); process.exitCode = 1;
} finally { bytes?.fill(0); workspace?.release(); }
