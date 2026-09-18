import { closeSync } from 'node:fs';
import { isBuiltin, registerHooks } from 'node:module';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { readLocalBindingBoundedFile } from './local-binding-bounded-file.mjs';
import { attestPolicyHost, attestPolicySource, policyFail, policyOwnedRun, readPolicyRequest } from './genesis001-linux-policy-boundary.mjs';

/** This process has no selectable operator, module URL, target, or secret path. */
export async function runFixedLinuxG001PolicyChild(request) {
  let transferred = false, hooks;
  try {
    const kind = request?.kind === 'census' ? 'census' : 'policy';
    const keys = ['runId', 'operationRoot', 'source', 'bundleSha256', 'bundleBytes',
      ...(kind === 'census' ? ['kind', 'githubRunId', 'githubRunAttempt'] : [])];
    if (!request || JSON.stringify(Object.keys(request)) !== JSON.stringify(keys)
      || process.argv.length !== 2 || !/^[a-f0-9]{64}$/u.test(request.bundleSha256)
      || (kind === 'census' && (!/^[1-9][0-9]{0,19}$/u.test(request.githubRunId)
        || !/^[1-9][0-9]{0,19}$/u.test(request.githubRunAttempt)))
      || !Number.isSafeInteger(request.bundleBytes) || request.bundleBytes < 1 || request.bundleBytes > 16 * 1024 * 1024) policyFail();
    const host = attestPolicyHost();
    const source = attestPolicySource(request.source, process.cwd(), kind);
    policyOwnedRun(request.operationRoot, request.runId);
    const path = join(request.operationRoot, 'first.mjs'), url = pathToFileURL(path).href;
    const initial = readLocalBindingBoundedFile(path, { maximumBytes: 16 * 1024 * 1024,
      expectedBytes: request.bundleBytes, expectedSha256: request.bundleSha256, expectedUid: 1000, expectedMode: 0o600 });
    initial.body.fill(0);
    const read = () => readLocalBindingBoundedFile(path, { maximumBytes: 16 * 1024 * 1024,
      expectedBytes: request.bundleBytes, expectedSha256: request.bundleSha256, expectedUid: 1000,
      expectedMode: 0o600, expectedIdentity: initial.identity }).body;
    hooks = registerHooks({
      resolve(specifier, context, next) {
        if (context.parentURL === url && !isBuiltin(specifier)) policyFail();
        return next(specifier, context);
      },
      load(target, context, next) {
        if (target === url) return { format: 'module', source: read(), shortCircuit: true };
        return next(target, context);
      },
    });
    const operator = await import(url);
    const entry = kind === 'census' ? operator.executeGenesis001LinuxCensusFromDescriptor
      : operator.executeGenesis001PolicyObservationFromDescriptor;
    if (typeof entry !== 'function') policyFail();
    attestPolicyHost(host); attestPolicySource(source, process.cwd(), kind); read().fill(0);
    transferred = true;
    const receipt = await entry({
      sourceCommit: source.sourceCommit, repositoryRoot: process.cwd(), descriptor: 4,
      ...(kind === 'census' ? { attemptId: request.runId, githubRunId: request.githubRunId,
        githubRunAttempt: request.githubRunAttempt } : {}),
    });
    attestPolicyHost(host); attestPolicySource(source, process.cwd(), kind); read().fill(0);
    return receipt;
  } finally {
    hooks?.deregister();
    // The operator owns FD4 once called and closes it before network work. Do
    // not close its number afterward: another resource may have reused it.
    if (!transferred) { try { closeSync(4); } catch { /* already absent */ } }
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  process.umask(0o077);
  let request;
  try { request = readPolicyRequest(); }
  catch { try { closeSync(4); } catch { /* absent */ }
    process.stderr.write('G001_LINUX_POLICY_NATIVE_FAILED\n'); process.exitCode = 1; }
  if (request) runFixedLinuxG001PolicyChild(request).then(result => process.stdout.write(`${JSON.stringify(result)}\n`))
    .catch(() => { process.stderr.write('G001_LINUX_POLICY_NATIVE_FAILED\n'); process.exitCode = 1; });
}
