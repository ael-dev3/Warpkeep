import { pathToFileURL } from 'node:url';

export class LocalBindingRuntimeError extends Error {
  constructor(code, options) {
    super(code, options);
    this.name = 'LocalBindingRuntimeError';
    this.code = code;
  }
}

export async function derivePreparedPtrLinuxBindings(...arguments_) {
  if (arguments_.length !== 0) throw new LocalBindingRuntimeError('LOCAL_BINDING_RUNTIME_ARGUMENTS_INVALID');
  try {
    const { deriveFixedLocalBindingRuntime } = await import('./local-binding-runtime-core.mjs');
    const result = await deriveFixedLocalBindingRuntime();
    return Object.freeze({
      profile: result.profile,
      sourceCommit: result.sourceCommit,
      sourceTree: result.sourceTree,
      bundleSha256: result.bundleSha256,
      dependencyClosureDigest: result.dependencyClosureDigest,
      bindings: Object.freeze(result.bindings.map(entry => Object.freeze({
        path: entry.path,
        bytes: new Uint8Array(entry.bytes),
      }))),
    });
  } catch (error) {
    if (error instanceof LocalBindingRuntimeError) throw error;
    const code = typeof error?.code === 'string' && /^LOCAL_BINDING_[A-Z0-9_]+$/u.test(error.code)
      ? error.code : 'LOCAL_BINDING_RUNTIME_FAILED';
    throw new LocalBindingRuntimeError(code, { cause: error });
  }
}

function copyPreparedRealmBindings(result) {
  return Object.freeze({
    bundleSha256: result.bundleSha256,
    dependencyClosureDigest: result.dependencyClosureDigest,
    bindings: Object.freeze(result.bindings.map(entry => Object.freeze({
      path: entry.path,
      bytes: new Uint8Array(entry.bytes),
    }))),
  });
}

export async function derivePreparedPairedLinuxBindings(...arguments_) {
  if (arguments_.length !== 0) throw new LocalBindingRuntimeError('LOCAL_BINDING_RUNTIME_ARGUMENTS_INVALID');
  try {
    const { deriveFixedPairedLocalBindingRuntime } = await import('./local-binding-runtime-core.mjs');
    const result = await deriveFixedPairedLocalBindingRuntime();
    return Object.freeze({
      profile: result.profile,
      sourceCommit: result.sourceCommit,
      sourceTree: result.sourceTree,
      genesis002: copyPreparedRealmBindings(result.genesis002),
      ptr: copyPreparedRealmBindings(result.ptr),
    });
  } catch (error) {
    if (error instanceof LocalBindingRuntimeError) throw error;
    const code = typeof error?.code === 'string' && /^LOCAL_BINDING_[A-Z0-9_]+$/u.test(error.code)
      ? error.code : 'LOCAL_BINDING_RUNTIME_FAILED';
    throw new LocalBindingRuntimeError(code, { cause: error });
  }
}

export async function derivePreparedGenesis001LinuxCompilation(...arguments_) {
  if (arguments_.length !== 0) throw new LocalBindingRuntimeError('LOCAL_BINDING_RUNTIME_ARGUMENTS_INVALID');
  try {
    const { deriveFixedGenesis001LocalCompilation } = await import('./local-binding-runtime-core.mjs');
    const result = await deriveFixedGenesis001LocalCompilation();
    return Object.freeze({
      profile: result.profile,
      sourceCommit: result.sourceCommit,
      sourceTree: result.sourceTree,
      bundleSha256: result.bundleSha256,
      dependencyClosureDigest: result.dependencyClosureDigest,
      diagnosticBindings: Object.freeze(result.diagnosticBindings.map(entry => Object.freeze({
        path: entry.path,
        bytes: new Uint8Array(entry.bytes),
      }))),
    });
  } catch (error) {
    if (error instanceof LocalBindingRuntimeError) throw error;
    const code = typeof error?.code === 'string' && /^LOCAL_BINDING_[A-Z0-9_]+$/u.test(error.code)
      ? error.code : 'LOCAL_BINDING_RUNTIME_FAILED';
    throw new LocalBindingRuntimeError(code, { cause: error });
  }
}

export async function derivePreparedGenesis001LinuxCompatibility(...arguments_) {
  if (arguments_.length !== 0) throw new LocalBindingRuntimeError('LOCAL_BINDING_RUNTIME_ARGUMENTS_INVALID');
  try {
    const { deriveFixedGenesis001LocalCompatibility } = await import('./local-binding-runtime-core.mjs');
    const result = await deriveFixedGenesis001LocalCompatibility();
    return Object.freeze({
      profile: result.profile,
      sourceCommit: result.sourceCommit,
      sourceTree: result.sourceTree,
      baselineBundleSha256: result.baselineBundleSha256,
      frozenBundleSha256: result.frozenBundleSha256,
      baselineDescriptorSha256: result.baselineDescriptorSha256,
      frozenDescriptorSha256: result.frozenDescriptorSha256,
      checkedFrozenWriters: Object.freeze([...result.checkedFrozenWriters]),
    });
  } catch (error) {
    if (error instanceof LocalBindingRuntimeError) throw error;
    const code = typeof error?.code === 'string' && /^LOCAL_BINDING_[A-Z0-9_]+$/u.test(error.code)
      ? error.code : 'LOCAL_BINDING_RUNTIME_FAILED';
    throw new LocalBindingRuntimeError(code, { cause: error });
  }
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const paired = process.argv.length === 3 && process.argv[2] === '--paired';
  const genesis001 = process.argv.length === 3 && process.argv[2] === '--genesis001';
  const genesis001Compatibility = process.argv.length === 3 && process.argv[2] === '--genesis001-compatibility';
  if (process.argv.length !== 2 && !paired && !genesis001 && !genesis001Compatibility) {
    process.stderr.write('LOCAL_BINDING_RUNTIME_ARGUMENTS_INVALID\n');
    process.exitCode = 1;
  } else {
    (paired ? derivePreparedPairedLinuxBindings()
      : genesis001Compatibility ? derivePreparedGenesis001LinuxCompatibility()
      : genesis001 ? derivePreparedGenesis001LinuxCompilation()
        : derivePreparedPtrLinuxBindings()).then(result => {
      const summary = paired ? {
        profile: result.profile,
        sourceCommit: result.sourceCommit,
        sourceTree: result.sourceTree,
        genesis002: {
          bundleSha256: result.genesis002.bundleSha256,
          dependencyClosureDigest: result.genesis002.dependencyClosureDigest,
          bindingCount: result.genesis002.bindings.length,
        },
        ptr: {
          bundleSha256: result.ptr.bundleSha256,
          dependencyClosureDigest: result.ptr.dependencyClosureDigest,
          bindingCount: result.ptr.bindings.length,
        },
      } : genesis001Compatibility ? result : genesis001 ? {
        profile: result.profile,
        sourceCommit: result.sourceCommit,
        sourceTree: result.sourceTree,
        bundleSha256: result.bundleSha256,
        dependencyClosureDigest: result.dependencyClosureDigest,
        diagnosticBindingCount: result.diagnosticBindings.length,
      } : {
        profile: result.profile,
        sourceCommit: result.sourceCommit,
        sourceTree: result.sourceTree,
        bundleSha256: result.bundleSha256,
        dependencyClosureDigest: result.dependencyClosureDigest,
        bindingCount: result.bindings.length,
      };
      process.stdout.write(`${JSON.stringify(summary)}\n`);
    }).catch(error => {
      process.stderr.write(`${error.code ?? 'LOCAL_BINDING_RUNTIME_FAILED'}\n`);
      process.exitCode = 1;
    });
  }
}
