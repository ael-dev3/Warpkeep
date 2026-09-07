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
import { validateLocalBindingYamlManifest } from '../../scripts/local-binding-runtime-core.mjs';

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
  const artifacts = inputs.files;
  owned.push(...artifacts.map(file => file.bytes));
  sameSource(draft, inputs); draft.assertCandidateClean();
  const draftTransaction = draft.installOutputs(artifacts);
  phase('deriving-closure-family');
  const closure = await derivePreparedClosureFamily({ repositoryRoot: draft.candidateRoot });
  owned.push(...closure.files.map(file => file.bytes));
  draft.assertActive();
  const candidate = capturePreparedLinuxReleaseWorkspace(); workspaces.push(candidate);
  sameSource(candidate, inputs);
  const files = [...artifacts, ...closure.files]
    .sort((left, right) => left.path < right.path ? -1 : left.path > right.path ? 1 : 0);
  const transaction = candidate.installOutputs(files);
  phase('verifying-installed-family');
  for (const file of files) {
    readLocalBindingBoundedFile(join(candidate.candidateRoot, file.path), {
      maximumBytes: 8 * 1024 * 1024, expectedUid: 1000,
      expectedSha256: sha(file.bytes), discardBody: true,
    }).body.fill(0);
  }
  // The closure can faithfully hash a stale bundle. Separately require every
  // compiler-recorded input to still match the installed prospective source.
  // This manifest is the fixed native producer's own output, not caller input.
  const bundleManifest = JSON.parse(Buffer.from(inputs.bundles.files.find(file =>
    file.path === 'scripts/sealed-realms-production-bundle-manifest-v1.json').bytes).toString('utf8'));
  const yamlBytes = readLocalBindingBoundedFile(join(candidate.candidateRoot,
    'scripts/local-binding-runtime-yaml-v1.json'), { maximumBytes: 1024 * 1024, expectedUid: 1000 }).body;
  let yaml;
  try { yaml = validateLocalBindingYamlManifest(yamlBytes.toString('utf8')); }
  finally { yamlBytes.fill(0); }
  let checkedBundleInputs = 0;
  for (const bundle of bundleManifest.bundles) {
    for (const member of bundle.graphManifest) {
      let path = join(candidate.candidateRoot, member.path);
      if (member.path.startsWith('node_modules/')) {
        const prefix = 'node_modules/yaml/';
        const pinned = member.path.startsWith(prefix)
          ? yaml.files.find(file => file.path === member.path.slice(prefix.length)) : undefined;
        if (pinned === undefined || pinned.bytes !== member.byteLength || pinned.sha256 !== member.sha256) {
          throw new Error('LOCAL_RELEASE_COMPILED_PROBE_DEPENDENCY_INVALID');
        }
        path = join('/home/snapmeter/.warpkeep/release-preparation-v1/toolchain/yaml-2.9.0/package', pinned.path);
      }
      readLocalBindingBoundedFile(path, {
        maximumBytes: 8 * 1024 * 1024, expectedUid: 1000,
        expectedBytes: member.byteLength, expectedSha256: member.sha256, discardBody: true,
      }).body.fill(0);
      checkedBundleInputs += 1;
    }
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
    installedFiles: files.length, checkedBundleInputs, closureMembers: closure.memberCount,
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
