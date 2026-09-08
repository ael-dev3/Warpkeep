// Separate-process race oracle. Only synthetic inputs from the native test own this file.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createSealedRealmsProductionPrivateState } from '../../scripts/sealed-realms-production-private-state.mjs';
import { authenticateSealedRealmsProductionSourceAuthority } from '../../scripts/sealed-realms-production-source-authority.mjs';
import { createSyntheticExistingUpdateAdapter } from '../../scripts/sealed-realms-production-existing-update.mjs';

// Import-only mode exercises all real static dependencies without native operations.
if (process.argv[2] === '--import-only') {
  process.stdout.write('inspector-imported\n');
} else {
const [configuration, label] = process.argv.slice(2);
if (!['first', 'second'].includes(label)) throw new Error('Invalid test process label');
const input = JSON.parse(readFileSync(configuration, 'utf8'));
const privateState = createSealedRealmsProductionPrivateState({
  reportedHome: join(input.root, 'home'), testOnlyOwnerUid: process.getuid(), testOnlyAllowPlatformMode: true,
  testOnlyRace(phase, path) {
    if (phase !== 'write-before-open' || !path.endsWith('.inspection.json')) return;
    writeFileSync(join(input.root, `${label}.ready`), '', { flag: 'wx', mode: 0o600 });
    const deadline = Date.now() + 10_000;
    while (!existsSync(join(input.root, 'release-inspectors'))) {
      if (Date.now() >= deadline) throw new Error('Inspection race barrier timed out');
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 10);
    }
  },
});
const authority = authenticateSealedRealmsProductionSourceAuthority({
  operation: `${input.lane}-update-inspect`, workflowInputSha: input.sourceCommit,
  readGit: args => { if (args[0] !== 'rev-parse') throw new Error('Unexpected Git query'); return input.sourceCommit + '\n'; },
  readBinding: () => ({ schemaVersion: 1, profile: 'warpkeep-0.4.0-sealed-launch-v1', pagesDeploymentApproved: false, preparationSourceCommit: null }),
  verifyEvidence: verifiedSha => ({ verifiedSha }),
});
const adapter = createSyntheticExistingUpdateAdapter({
  lane: input.lane, origin: input.origin, databaseIdentity: input.databaseIdentity, sourceCommit: input.sourceCommit,
  candidateBytes: Buffer.from(input.candidateBase64, 'base64'), candidateSchemaBytes: Buffer.from(JSON.stringify(input.schema)),
  readAdminToken: () => input.credential, privateState, runtimeRoot: input.root,
});
try {
  await adapter.inspectForContinuation({ authority });
  process.stdout.write('inspected\n');
} catch (error) {
  process.stdout.write(`${error.code ?? 'inspection-refused'}\n`);
} finally { adapter.dispose(); }

}
