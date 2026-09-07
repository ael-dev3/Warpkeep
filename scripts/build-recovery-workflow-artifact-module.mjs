import { build } from 'esbuild';
import { createHash } from 'node:crypto';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const EXTERNAL = [
  '../../../scripts/recovery-workflow-run-context.mjs',
  '../../../scripts/recovery-attestation-source.mjs',
  '../../../scripts/generate-warpkeep-deployment-attestation.mjs',
  '../../../scripts/local-binding-bounded-file.mjs',
];
const fail = () => { throw new Error('RECOVERY_WORKFLOW_ARTIFACT_BUILD_INVALID'); };

/** In-memory module build, not an attested compiler or release installation.
 * Output belongs beside its TS entrypoint; root MJS modules retain their URLs.
 */
async function buildModule(args, name, exportName, additionalExternal = []) {
  try {
    if (args.length !== 0) fail();
    const external = [...EXTERNAL, ...additionalExternal];
    const result = await build({ absWorkingDir: ROOT,
      entryPoints: [`services/release-recovery/scripts/${name}.ts`],
      outfile: `services/release-recovery/scripts/${name}.bundle.mjs`,
      bundle: true, platform: 'node', target: 'node22', format: 'esm', write: false,
      // Remove esbuild's source-path comments: pnpm/junction locations differ
      // between Windows and WSL even when dependency bytes are identical.
      minifyWhitespace: true,
      metafile: true, sourcemap: false, legalComments: 'none', logLevel: 'silent', external });
    if (result.outputFiles.length !== 1 || result.errors.length !== 0 || result.warnings.length !== 0) fail();
    const outputs = Object.values(result.metafile.outputs);
    if (outputs.length !== 1 || JSON.stringify(outputs[0].exports) !== JSON.stringify([exportName])
        || outputs[0].imports.some(item => !item.external || ![...external, 'node:path', 'module'].includes(item.path))) fail();
    const bytes = Buffer.from(result.outputFiles[0].contents);
    if (bytes.length === 0 || bytes.length > 2 * 1024 * 1024) fail();
    return Object.freeze({ bytes, sha256: createHash('sha256').update(bytes).digest('hex'),
      inputPaths: Object.freeze(Object.keys(result.metafile.inputs).sort()) });
  } catch { fail(); }
}
export async function buildRecoveryWorkflowArtifactModule(...args) {
  return buildModule(args, 'read-recovery-workflow-artifact', 'readRecoveryWorkflowArtifact');
}
export async function buildRecoveryWorkflowClaimModule(...args) {
  return buildModule(args, 'prepare-recovery-workflow-claim', 'prepareRecoveryWorkflowClaim', [
    '../../../scripts/recovery-workflow-private-directory.mjs', '../../../scripts/recovery-workflow-session.mjs',
  ]);
}
