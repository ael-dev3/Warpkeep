// This fixed current-root wrapper intentionally shares only the common
// installer implementation. Callers cannot select or substitute its profile.
export {
  PtrBindingLockedSourceBuildError as Genesis001CurrentBindingLockedSourceBuildError,
  type Genesis001CurrentSourceBuildInput,
  type Genesis001CurrentSourceBuildResult,
  withGenesis001CurrentLinuxLockedSourceBuild,
} from './ptr-binding-locked-source-build-core';
