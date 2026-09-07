import { derivePreparedAllRealmLinuxBindings } from './local-binding-runtime.mjs';
import { derivePreparedLinuxOperationBundleFiles } from './local-operation-bundle-runtime.mjs';

const PROFILE = 'warpkeep-spacetime-binding-final-preparation-linux-x64-v1';

export class LocalReleaseArtifactInputsError extends Error {
  constructor(code) {
    super(code);
    this.name = 'LocalReleaseArtifactInputsError';
    this.code = code;
  }
}

function fail(code) { throw new LocalReleaseArtifactInputsError(code); }

function sourceIdentity(result) {
  if (result === null || typeof result !== 'object' || result.profile !== PROFILE
      || typeof result.sourceCommit !== 'string' || !/^[0-9a-f]{40}$/u.test(result.sourceCommit)
      || typeof result.sourceTree !== 'string' || !/^[0-9a-f]{40}$/u.test(result.sourceTree)) {
    fail('LOCAL_RELEASE_ARTIFACT_SOURCE_INVALID');
  }
  return Object.freeze({ profile: PROFILE, sourceCommit: result.sourceCommit, sourceTree: result.sourceTree });
}

// Fixed producer coordination only: no candidate capture or repository writes,
// deployment authority, or caller-provided evidence is supported here.
export async function derivePreparedLinuxArtifactInputs(...arguments_) {
  if (arguments_.length !== 0) fail('LOCAL_RELEASE_ARTIFACT_ARGUMENTS_INVALID');
  if (process.platform !== 'linux') fail('LOCAL_RELEASE_ARTIFACT_HOST_INVALID');
  const bindings = await derivePreparedAllRealmLinuxBindings();
  const source = sourceIdentity(bindings);
  const bundles = await derivePreparedLinuxOperationBundleFiles();
  if (bundles?.profile !== source.profile || bundles?.sourceCommit !== source.sourceCommit
      || bundles?.sourceTree !== source.sourceTree) {
    fail('LOCAL_RELEASE_ARTIFACT_SOURCE_MISMATCH');
  }
  return Object.freeze({ ...source, bindings, bundles });
}
