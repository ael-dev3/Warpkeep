// Manual credential-free installation probe, not a final release freeze.
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { capturePreparedLinuxReleaseWorkspace } from '../../scripts/local-release-workspace.mjs';
import { derivePreparedLinuxRecoveryBundle } from '../../scripts/local-recovery-bundle-runtime.mjs';
import { recoverPreparedReleaseTransaction } from '../../scripts/local-release-transaction-recovery.mjs';
import { readLocalBindingBoundedFile } from '../../scripts/local-binding-bounded-file.mjs';

let candidate, result;
try {
  assert.equal(process.argv.length, 2);
  result = await derivePreparedLinuxRecoveryBundle();
  candidate = capturePreparedLinuxReleaseWorkspace();
  assert.equal(candidate.sourceCommit, result.sourceCommit); assert.equal(candidate.sourceTree, result.sourceTree);
  candidate.assertCandidateClean();
  const transaction = candidate.installOutputs(result.files);
  for (const file of result.files) {
    const actual = readLocalBindingBoundedFile(join(candidate.candidateRoot, file.path), {
      maximumBytes: 3 * 1024 * 1024, expectedUid: 1000,
    }).body;
    assert.deepEqual(actual, Buffer.from(file.bytes)); actual.fill(0);
  }
  const module = await import(pathToFileURL(join(candidate.candidateRoot, result.path)).href);
  assert.deepEqual(Object.keys(module), ['prepareRecoveryWorkflowClaim']);
  // The override must fail before any artifact or authority request.
  globalThis.fetch = () => { throw new Error('NETWORK_MUST_NOT_RUN'); };
  await assert.rejects(module.prepareRecoveryWorkflowClaim({override: true}),
    {message: 'RECOVERY_WORKFLOW_CLAIM_PREPARATION_INVALID'});
  candidate.assertActive(); candidate.release();
  recoverPreparedReleaseTransaction(candidate.candidateRoot, transaction.transactionId);
  process.stdout.write(`${JSON.stringify({sourceCommit: result.sourceCommit, sourceTree: result.sourceTree,
    installedFiles: result.files.length, sha256: result.sha256, nativeImport: true,
    rolledBack: true, finalReleasePrepared: false})}\n`);
} catch {
  process.stderr.write('LOCAL_RECOVERY_INSTALL_PROBE_FAILED\n'); process.exitCode = 1;
} finally {
  for (const file of result?.files ?? []) file.bytes.fill(0);
  candidate?.release();
}
