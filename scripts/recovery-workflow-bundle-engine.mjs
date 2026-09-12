import { createHash } from 'node:crypto';
import { isAbsolute } from 'node:path';
const EXTERNAL = [
  '../../../scripts/recovery-workflow-run-context.mjs',
  '../../../scripts/recovery-attestation-source.mjs',
  '../../../scripts/generate-warpkeep-deployment-attestation.mjs',
  '../../../scripts/local-binding-bounded-file.mjs',
];
const fail = () => { throw new Error('RECOVERY_WORKFLOW_ARTIFACT_BUILD_INVALID'); };

/** Build engine only. The worker must attest sourceRoot and the compiler
 * namespace before and after use. This function provides no source authority.
 */
export async function buildRecoveryWorkflowModule(...args) {
  try {
    if (args.length !== 3) fail();
    const [sourceRoot, build, kind] = args;
    if (typeof sourceRoot !== 'string' || !isAbsolute(sourceRoot) || typeof build !== 'function'
      || !['artifact', 'claim'].includes(kind)) fail();
    const name = kind === 'claim' ? 'prepare-recovery-workflow-claim' : 'read-recovery-workflow-artifact';
    const exportName = kind === 'claim' ? 'prepareRecoveryWorkflowClaim' : 'readRecoveryWorkflowArtifact';
    const external = kind === 'claim' ? [...EXTERNAL,
      '../../../scripts/recovery-workflow-private-directory.mjs', '../../../scripts/recovery-workflow-session.mjs'] : [...EXTERNAL];
    const result = await build({ absWorkingDir: sourceRoot,
      entryPoints: [`services/release-recovery/scripts/${name}.ts`],
      outfile: `services/release-recovery/scripts/${name}.bundle.mjs`,
      bundle: true, platform: 'node', target: 'node22', format: 'esm', write: false,
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
