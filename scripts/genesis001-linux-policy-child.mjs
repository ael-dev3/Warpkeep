import { closeSync } from 'node:fs';
import { isBuiltin, registerHooks } from 'node:module';
import { types } from 'node:util';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { readLocalBindingBoundedFile } from './local-binding-bounded-file.mjs';
import { attestPolicyHost, attestPolicySource, policyFail, policyOwnedRun, readPolicyRequest } from './genesis001-linux-policy-boundary.mjs';

const ADMITTED_CENSUS_DIAGNOSTICS = new Set([
  'g001-admitted-identity', 'g001-admitted-aggregate', 'g001-admitted-enumeration',
  'g001-admitted-status', 'g001-admitted-reconciliation',
]);
const POLICY_DIAGNOSTICS_BY_CODE = new Map([
  ['GENESIS_001_POLICY_OBSERVATION_LIVE_POLICY_INVALID', 'g001-policy-state'],
  ['GREATER_REALM_PRODUCTION_STATUS_PROCEDURE_UNAVAILABLE', 'g001-policy-procedure'],
  ['GREATER_REALM_PRODUCTION_TRANSPORT_UNAVAILABLE', 'g001-policy-transport'],
  ['GREATER_REALM_PRODUCTION_TRANSPORT_SESSION_CLOSED', 'g001-policy-transport'],
  ['GREATER_REALM_PRODUCTION_TRANSPORT_CLOCK_INVALID', 'g001-policy-transport'],
  ['GREATER_REALM_PRODUCTION_CONTINGENCY_TOKEN_EXPIRED', 'g001-policy-transport'],
  ['GENESIS_001_POLICY_OBSERVATION_SECRET_AUTHORITY_AMBIGUOUS', 'g001-policy-credential'],
  ['GENESIS_001_POLICY_OBSERVATION_SECRET_AUTHORITY_UNAVAILABLE', 'g001-policy-credential'],
  ['GENESIS_001_POLICY_OBSERVATION_SECRET_DESCRIPTOR_CHANGED', 'g001-policy-credential'],
  ['GENESIS_001_POLICY_OBSERVATION_SECRET_DESCRIPTOR_INVALID', 'g001-policy-credential'],
  ['GREATER_REALM_PRODUCTION_ADMIN_SECRET_CONTROL_CHARACTER_REJECTED', 'g001-policy-credential'],
  ['GREATER_REALM_PRODUCTION_ADMIN_SECRET_ENCODING_INVALID', 'g001-policy-credential'],
  ['GREATER_REALM_PRODUCTION_ADMIN_SECRET_FILE_CHANGED', 'g001-policy-credential'],
  ['GREATER_REALM_PRODUCTION_ADMIN_SECRET_FILE_INVALID', 'g001-policy-credential'],
  ['GREATER_REALM_PRODUCTION_ADMIN_SECRET_LENGTH_INVALID', 'g001-policy-credential'],
  ['GREATER_REALM_PRODUCTION_ADMIN_SECRET_STDIN_REQUIRED', 'g001-policy-credential'],
  ['GENESIS_001_POLICY_OBSERVATION_ARGUMENTS_INVALID', 'g001-policy-authority'],
  ['GENESIS_001_POLICY_OBSERVATION_INPUT_INVALID', 'g001-policy-authority'],
  ['GENESIS_001_POLICY_OBSERVATION_NATIVE_PROFILE_INVALID', 'g001-policy-authority'],
  ['GENESIS_001_POLICY_OBSERVATION_SOURCE_INVALID', 'g001-policy-authority'],
  ['GENESIS_001_POLICY_OBSERVATION_TRUSTED_BOOTSTRAP_REQUIRED', 'g001-policy-authority'],
  ['GENESIS_001_POLICY_OBSERVATION_TEST_DEPENDENCY_FORBIDDEN', 'g001-policy-authority'],
  ['GREATER_REALM_PRODUCTION_TOKEN_BUDGET_TEST_DEPENDENCY_REQUIRED', 'g001-policy-authority'],
  ['GENESIS_001_POLICY_OBSERVATION_TIMESTAMP_INVALID', 'g001-receipt'],
  ['GREATER_REALM_PRODUCTION_TRANSPORT_TARGET_OVERRIDE_REJECTED', 'g001-policy-authority'],
  ['GREATER_REALM_PRODUCTION_TRANSPORT_WIRE_NAME_INVALID', 'g001-policy-authority'],
]);

/** Exposes only fixed categories; original messages, causes and fields never leave this process. */
export function projectG001PolicyObservationDiagnostic(error) {
  if (error === null || typeof error !== 'object' || types.isProxy(error)) return undefined;
  let fields;
  try { fields = Object.getOwnPropertyDescriptors(error); } catch { return undefined; }
  const code = fields.code;
  if (code !== undefined && 'value' in code && typeof code.value === 'string') {
    const policyDiagnostic = POLICY_DIAGNOSTICS_BY_CODE.get(code.value);
    if (policyDiagnostic !== undefined) return policyDiagnostic;
    // The policy observer releases its owner-scoped token-budget reservation
    // during session cleanup. Project that typed local-state failure without
    // exposing ledger errors, reservation ids, or provider details.
    if (code.value.startsWith('PRODUCTION_ADMIN_TOKEN_')) return 'g001-policy-budget';
  }
  const message = fields.message;
  let prototype;
  try { prototype = Object.getPrototypeOf(error); } catch { return undefined; }
  if (prototype === AggregateError.prototype
    && message?.value === 'PRODUCTION_ADMIN_TOKEN_LEDGER_MULTIPLE_FAILURES') {
    return 'g001-policy-budget';
  }
  const diagnostic = fields.diagnostic;
  return diagnostic !== undefined && 'value' in diagnostic
    && typeof diagnostic.value === 'string' && ADMITTED_CENSUS_DIAGNOSTICS.has(diagnostic.value)
    ? diagnostic.value : undefined;
}

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
    .catch(error => {
      const diagnostic = projectG001PolicyObservationDiagnostic(error);
      process.stderr.write(`G001_LINUX_POLICY_NATIVE_FAILED${diagnostic === undefined ? '' : `:${diagnostic}`}\n`);
      process.exitCode = 1;
    });
}
