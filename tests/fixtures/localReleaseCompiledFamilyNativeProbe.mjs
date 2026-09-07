// Manual credential-free integration probe, not a final release assembler.
// Uses real native producers and private journaled candidates. The caller's
// ordinary test dependencies are not production toolchain attestation.
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { capturePreparedLinuxReleaseWorkspace } from '../../scripts/local-release-workspace.mjs';
import { derivePreparedLinuxArtifactInputs } from '../../scripts/local-release-artifact-inputs.mjs';
import { derivePreparedClosureFamily } from '../../scripts/local-prepared-closure-family.mjs';
import { readLocalBindingBoundedFile } from '../../scripts/local-binding-bounded-file.mjs';
import { recoverPreparedReleaseTransaction } from '../../scripts/local-release-transaction-recovery.mjs';

const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const workspaces = [];
const owned = [];
const phase = name => process.stdout.write(`${JSON.stringify({ phase: name })}\n`);
function sameSource(left, right) {
  if (['profile', 'sourceCommit', 'sourceTree'].some(key => left[key] !== right[key])) {
    throw new Error('LOCAL_RELEASE_COMPILED_PROBE_SOURCE_MISMATCH');
  }
}
try {
  if (process.argv.length !== 2) throw new Error('LOCAL_RELEASE_COMPILED_PROBE_ARGUMENTS_INVALID');
  const draft = capturePreparedLinuxReleaseWorkspace(); workspaces.push(draft);
  phase('compiling-bindings-and-bundles');
  const inputs = await derivePreparedLinuxArtifactInputs();
  const artifacts = [...inputs.bindings.genesis002.bindings, ...inputs.bindings.ptr.bindings,
    ...inputs.bundles.files];
  owned.push(...artifacts.map(file => file.bytes));
  sameSource(draft, inputs); draft.assertCandidateClean();
  const draftTransaction = draft.installOutputs(artifacts);
  phase('deriving-closure-family');
  const closure = await derivePreparedClosureFamily({ repositoryRoot: draft.candidateRoot });
  owned.push(...closure.files.map(file => file.bytes));
  draft.assertActive();
  const candidate = capturePreparedLinuxReleaseWorkspace(); workspaces.push(candidate);
  sameSource(candidate, inputs);
  const files = [...artifacts, ...closure.files];
  const transaction = candidate.installOutputs(files);
  phase('verifying-installed-family');
  for (const file of files) {
    readLocalBindingBoundedFile(join(candidate.candidateRoot, file.path), {
      maximumBytes: 8 * 1024 * 1024, expectedUid: 1000,
      expectedSha256: sha(file.bytes), discardBody: true,
    }).body.fill(0);
  }
  const verifier = await import(pathToFileURL(join(candidate.candidateRoot,
    'scripts/auth-bridge-notification-prepared-deploy-closure.mjs')).href);
  const verified = verifier.verifyAuthBridgeNotificationPreparedDeployClosure({ repositoryRoot: candidate.candidateRoot });
  if (verified.memberCount !== closure.memberCount) throw new Error('LOCAL_RELEASE_COMPILED_PROBE_CLOSURE_MISMATCH');
  const repeated = await derivePreparedClosureFamily({ repositoryRoot: candidate.candidateRoot });
  owned.push(...repeated.files.map(file => file.bytes));
  if (repeated.manifestSha256 !== closure.manifestSha256 || repeated.files.length !== closure.files.length
    || repeated.files.some((file, index) => file.path !== closure.files[index].path
      || !Buffer.from(file.bytes).equals(Buffer.from(closure.files[index].bytes)))) {
    throw new Error('LOCAL_RELEASE_COMPILED_PROBE_NONCONVERGENCE');
  }
  candidate.assertActive(); draft.assertActive();
  candidate.release(); draft.release();
  recoverPreparedReleaseTransaction(candidate.candidateRoot, transaction.transactionId);
  recoverPreparedReleaseTransaction(draft.candidateRoot, draftTransaction.transactionId);
  process.stdout.write(`${JSON.stringify({ profile: 'warpkeep-local-compiled-family-probe-v1',
    sourceCommit: inputs.sourceCommit, sourceTree: inputs.sourceTree,
    artifactFiles: artifacts.length, closureFiles: closure.files.length,
    installedFiles: files.length, closureMembers: closure.memberCount,
    manifestSha256: closure.manifestSha256, closureConverged: true,
    bothCandidatesRolledBack: true, finalReleasePrepared: false })}\n`);
} catch (error) {
  const code = error?.code ?? error?.message;
  process.stderr.write(`${typeof code === 'string' && /^[A-Z][A-Z0-9_]+$/u.test(code)
    ? code : 'LOCAL_RELEASE_COMPILED_PROBE_FAILED'}\n`);
  process.exitCode = 1;
} finally {
  for (const bytes of owned) bytes.fill(0);
  for (const workspace of workspaces) workspace.release();
}
