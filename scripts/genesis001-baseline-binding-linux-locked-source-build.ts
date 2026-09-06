// The compatibility proof uses this fixed historical-baseline wrapper beside
// the separately named frozen wrapper; callers cannot select a profile.
export {
  PtrBindingLockedSourceBuildError as Genesis001BaselineBindingLockedSourceBuildError,
  type Genesis001SourceBuildInput as Genesis001BaselineSourceBuildInput,
  type Genesis001SourceBuildResult as Genesis001BaselineSourceBuildResult,
  withGenesis001BaselineLinuxLockedSourceBuild,
  withGenesis001LinuxLockedSourceBuild,
} from './ptr-binding-locked-source-build-core';

export { runGenesis001LocalUpgradeProof } from './genesis001-local-upgrade-proof.mjs';
