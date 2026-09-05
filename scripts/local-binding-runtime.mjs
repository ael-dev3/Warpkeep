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

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  if (process.argv.length !== 2) {
    process.stderr.write('LOCAL_BINDING_RUNTIME_ARGUMENTS_INVALID\n');
    process.exitCode = 1;
  } else {
    derivePreparedPtrLinuxBindings().then(result => {
      process.stdout.write(`${JSON.stringify({
        profile: result.profile,
        sourceCommit: result.sourceCommit,
        sourceTree: result.sourceTree,
        bundleSha256: result.bundleSha256,
        dependencyClosureDigest: result.dependencyClosureDigest,
        bindingCount: result.bindings.length,
      })}\n`);
    }).catch(error => {
      process.stderr.write(`${error.code ?? 'LOCAL_BINDING_RUNTIME_FAILED'}\n`);
      process.exitCode = 1;
    });
  }
}
