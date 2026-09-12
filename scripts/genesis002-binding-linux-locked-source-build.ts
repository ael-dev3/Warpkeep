// This named alias intentionally preserves the shared error constructor,
// name, codes, causes, and aggregate semantics used by both fixed PTR wrappers.
export {
  PtrBindingLockedSourceBuildError as Genesis002BindingLockedSourceBuildError,
  type Genesis002SourceBuildInput,
  type Genesis002SourceBuildResult,
  withGenesis002LinuxLockedSourceBuild,
} from './ptr-binding-locked-source-build-core';
