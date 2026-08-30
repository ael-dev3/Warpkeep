import { createHash } from 'node:crypto';

export const SEALED_REALMS_OPERATIONS = Object.freeze([
  'preflight',
  'g001-policy-observe',
  'g001-census-first',
  'g001-census-second-inspect',
  'g001-census-second-suspend',
  'g001-current-state',
  'g002-publish-inspect',
  'g002-publish-apply',
  'g002-import-inspect',
  'g002-import-apply',
  'g002-live-inspect',
  'ptr-publish-inspect',
  'ptr-publish-apply',
  'ptr-import-inspect',
  'ptr-import-apply',
  'ptr-owner-provision-inspect',
  'ptr-owner-provision',
  'ptr-live-inspect',
  'activation-evidence-inspect',
  'activation-evidence-generate',
]);

export const SEALED_REALMS_ACTIVATED_OPERATIONS = Object.freeze([
  'preflight',
  'g001-current-state',
  'g002-live-inspect',
  'ptr-live-inspect',
]);

const COMMIT = /^[0-9a-f]{40}$/u;
const ACTIVATION_PATHS = Object.freeze([
  'config/releases/0.4.0-sealed-launch.json',
  'package-lock.json',
  'package.json',
]);
const authenticatedAuthorities = new WeakSet();
const authenticatedSourceCommits = new WeakMap();
const authenticatedPreparationSourceCommits = new WeakMap();

export class SealedRealmsProductionSourceAuthorityError extends Error {
  constructor(code) {
    super(code);
    this.name = 'SealedRealmsProductionSourceAuthorityError';
    this.code = code;
  }
}

function fail(code) {
  throw new SealedRealmsProductionSourceAuthorityError(code);
}

function plainRecord(value, keys) {
  if (
    value === null
    || typeof value !== 'object'
    || Array.isArray(value)
    || Object.getPrototypeOf(value) !== Object.prototype
    || JSON.stringify(Object.keys(value)) !== JSON.stringify(keys)
  ) fail('SEALED_REALMS_SOURCE_AUTHORITY_INPUT_INVALID');
  return value;
}

function exactCommit(value, code) {
  if (typeof value !== 'string' || !COMMIT.test(value)) fail(code);
  return value;
}

function boundedGitText(value) {
  let text;
  try {
    if (typeof value === 'string') text = value;
    else if (value instanceof Uint8Array || Buffer.isBuffer(value)) {
      if (value.byteLength > 128 * 1_024) fail('SEALED_REALMS_SOURCE_AUTHORITY_GIT_INVALID');
      text = new TextDecoder('utf-8', { fatal: true }).decode(value);
    } else fail('SEALED_REALMS_SOURCE_AUTHORITY_GIT_INVALID');
  } catch (error) {
    if (error instanceof SealedRealmsProductionSourceAuthorityError) throw error;
    fail('SEALED_REALMS_SOURCE_AUTHORITY_GIT_INVALID');
  }
  if (Buffer.byteLength(text, 'utf8') > 128 * 1_024 || text.includes('\0')) {
    fail('SEALED_REALMS_SOURCE_AUTHORITY_GIT_INVALID');
  }
  return text;
}

function gitCommit(readGit, arguments_) {
  let text;
  try { text = boundedGitText(readGit(Object.freeze([...arguments_]))); } catch (error) {
    if (error instanceof SealedRealmsProductionSourceAuthorityError) throw error;
    fail('SEALED_REALMS_SOURCE_AUTHORITY_GIT_INVALID');
  }
  if (!/^[0-9a-f]{40}\n$/u.test(text)) fail('SEALED_REALMS_SOURCE_AUTHORITY_GIT_INVALID');
  return text.slice(0, -1);
}

function readParents(readGit, head) {
  let text;
  try {
    text = boundedGitText(readGit(Object.freeze([
      'rev-list', '--parents', '-n', '1', 'HEAD',
    ])));
  } catch (error) {
    if (error instanceof SealedRealmsProductionSourceAuthorityError) throw error;
    fail('SEALED_REALMS_SOURCE_AUTHORITY_GIT_INVALID');
  }
  if (!text.endsWith('\n') || text.includes('\n\n')) {
    fail('SEALED_REALMS_SOURCE_AUTHORITY_GIT_INVALID');
  }
  const values = text.slice(0, -1).split(' ');
  if (values.length < 1 || values.some(value => !COMMIT.test(value)) || values[0] !== head) {
    fail('SEALED_REALMS_SOURCE_AUTHORITY_GIT_INVALID');
  }
  return Object.freeze(values.slice(1));
}

function verifyExactEvidence(verifyEvidence, commit) {
  let value;
  try { value = verifyEvidence(commit); } catch {
    fail('SEALED_REALMS_SOURCE_AUTHORITY_VERIFY_INVALID');
  }
  if (
    value === null
    || typeof value !== 'object'
    || Array.isArray(value)
    || Object.getPrototypeOf(value) !== Object.prototype
    || JSON.stringify(Object.keys(value)) !== JSON.stringify(['verifiedSha'])
    || value.verifiedSha !== commit
  ) fail('SEALED_REALMS_SOURCE_AUTHORITY_VERIFY_INVALID');
}

function preparationBinding(readBinding, commit) {
  let binding;
  try { binding = readBinding(commit); } catch {
    fail('SEALED_REALMS_SOURCE_AUTHORITY_BINDING_INVALID');
  }
  if (
    binding === null
    || typeof binding !== 'object'
    || Array.isArray(binding)
    || Object.getPrototypeOf(binding) !== Object.prototype
    || JSON.stringify(Object.keys(binding)) !== JSON.stringify([
      'schemaVersion', 'profile', 'pagesDeploymentApproved', 'preparationSourceCommit',
    ])
    || binding.schemaVersion !== 1
    || binding.profile !== 'warpkeep-0.4.0-sealed-launch-v1'
    || binding.pagesDeploymentApproved !== false
    || binding.preparationSourceCommit !== commit
  ) fail('SEALED_REALMS_SOURCE_AUTHORITY_BINDING_INVALID');
}

function activatedBinding(readBinding, preparationCommit, activationCommit) {
  let binding;
  try { binding = readBinding(activationCommit); } catch {
    fail('SEALED_REALMS_SOURCE_AUTHORITY_BINDING_INVALID');
  }
  if (
    binding === null
    || typeof binding !== 'object'
    || Array.isArray(binding)
    || Object.getPrototypeOf(binding) !== Object.prototype
    || JSON.stringify(Object.keys(binding)) !== JSON.stringify([
      'schemaVersion', 'profile', 'pagesDeploymentApproved', 'preparationSourceCommit',
    ])
    || binding.schemaVersion !== 1
    || binding.profile !== 'warpkeep-0.4.0-sealed-launch-v1'
    || binding.pagesDeploymentApproved !== true
    || binding.preparationSourceCommit !== preparationCommit
  ) fail('SEALED_REALMS_SOURCE_AUTHORITY_BINDING_INVALID');
}

function authenticatePreparationParent(readGit, readBinding, verifyEvidence, preparationCommit) {
  const resolved = gitCommit(readGit, [
    'rev-parse', '--verify', `${preparationCommit}^{commit}`,
  ]);
  if (resolved !== preparationCommit) {
    fail('SEALED_REALMS_SOURCE_AUTHORITY_A_PARENT_INVALID');
  }
  preparationBinding(readBinding, preparationCommit);
  verifyExactEvidence(verifyEvidence, preparationCommit);
}

/** Parses `git diff-tree --raw -z` without accepting renames or special modes. */
export function parseSealedRealmsActivatedRawDiff(value) {
  let bytes;
  if (value instanceof Uint8Array || Buffer.isBuffer(value)) bytes = Buffer.from(value);
  else if (typeof value === 'string') bytes = Buffer.from(value, 'utf8');
  else fail('SEALED_REALMS_SOURCE_AUTHORITY_ACTIVATION_DIFF_INVALID');
  try {
    if (bytes.byteLength < 1 || bytes.byteLength > 128 * 1_024) {
      fail('SEALED_REALMS_SOURCE_AUTHORITY_ACTIVATION_DIFF_INVALID');
    }
    const fields = bytes.toString('utf8').split('\0');
    if (fields.at(-1) !== '') fail('SEALED_REALMS_SOURCE_AUTHORITY_ACTIVATION_DIFF_INVALID');
    fields.pop();
    if (fields.length !== 6) fail('SEALED_REALMS_SOURCE_AUTHORITY_ACTIVATION_DIFF_INVALID');
    const paths = [];
    for (let index = 0; index < fields.length; index += 2) {
      const header = fields[index];
      const path = fields[index + 1];
      if (
        !/^:100644 100644 [0-9a-f]{40} [0-9a-f]{40} M$/u.test(header)
        || !ACTIVATION_PATHS.includes(path)
        || path.includes('\n')
        || path.includes('\r')
      ) fail('SEALED_REALMS_SOURCE_AUTHORITY_ACTIVATION_DIFF_INVALID');
      paths.push(path);
    }
    if (
      new Set(paths).size !== ACTIVATION_PATHS.length
      || ACTIVATION_PATHS.some(path => !paths.includes(path))
    ) fail('SEALED_REALMS_SOURCE_AUTHORITY_ACTIVATION_DIFF_INVALID');
    return Object.freeze([...paths].sort());
  } finally {
    bytes.fill(0);
  }
}

function activatedDiff(readGit, preparationCommit, activationCommit) {
  let raw;
  try {
    raw = readGit(Object.freeze([
      'diff-tree', '--no-commit-id', '--raw', '--no-renames', '-r', '-z',
      preparationCommit, activationCommit,
    ]));
  } catch {
    fail('SEALED_REALMS_SOURCE_AUTHORITY_ACTIVATION_DIFF_INVALID');
  }
  return parseSealedRealmsActivatedRawDiff(raw);
}

function operationName(value) {
  if (typeof value !== 'string' || !SEALED_REALMS_OPERATIONS.includes(value)) {
    fail('SEALED_REALMS_SOURCE_AUTHORITY_OPERATION_INVALID');
  }
  return value;
}

/**
 * Authenticates the sole S/A source proof. `readGit` and `verifyEvidence` are
 * bounded test/workflow adapters; the resulting authority is opaque to lanes.
 */
export function authenticateSealedRealmsProductionSourceAuthority(input) {
  const options = plainRecord(input, [
    'operation', 'workflowInputSha', 'readGit', 'readBinding', 'verifyEvidence',
  ]);
  const operation = operationName(options.operation);
  if (
    typeof options.readGit !== 'function'
    || typeof options.readBinding !== 'function'
    || typeof options.verifyEvidence !== 'function'
  ) fail('SEALED_REALMS_SOURCE_AUTHORITY_INPUT_INVALID');
  const workflowInputSha = exactCommit(
    options.workflowInputSha,
    'SEALED_REALMS_SOURCE_AUTHORITY_WORKFLOW_INPUT_INVALID',
  );
  const head = gitCommit(options.readGit, ['rev-parse', '--verify', 'HEAD^{commit}']);
  const protectedMain = gitCommit(options.readGit, [
    'rev-parse', '--verify', 'refs/remotes/origin/main^{commit}',
  ]);
  if (head !== protectedMain || head !== workflowInputSha) {
    fail('SEALED_REALMS_SOURCE_AUTHORITY_S_MISMATCH');
  }

  let mode;
  let preparationCommit;
  try {
    preparationBinding(options.readBinding, head);
    verifyExactEvidence(options.verifyEvidence, head);
    mode = 'S';
    preparationCommit = head;
  } catch (error) {
    if (!(error instanceof SealedRealmsProductionSourceAuthorityError)
      || error.code !== 'SEALED_REALMS_SOURCE_AUTHORITY_BINDING_INVALID') {
      throw error;
    }
    const parents = readParents(options.readGit, head);
    if (parents.length !== 1) fail('SEALED_REALMS_SOURCE_AUTHORITY_A_PARENT_INVALID');
    preparationCommit = parents[0];
    activatedBinding(options.readBinding, preparationCommit, head);
    authenticatePreparationParent(
      options.readGit,
      options.readBinding,
      options.verifyEvidence,
      preparationCommit,
    );
    verifyExactEvidence(options.verifyEvidence, head);
    activatedDiff(options.readGit, preparationCommit, head);
    if (!SEALED_REALMS_ACTIVATED_OPERATIONS.includes(operation)) {
      fail('SEALED_REALMS_SOURCE_AUTHORITY_A_OPERATION_FORBIDDEN');
    }
    mode = 'A';
  }

  const token = Object.freeze({
    mode,
    operation,
    authorityDigest: createHash('sha256')
      .update('warpkeep.sealed-realms.source-authority.v1\n')
      .update(mode)
      .update('\n')
      .update(head)
      .update('\n')
      .update(preparationCommit)
      .digest('hex'),
  });
  authenticatedAuthorities.add(token);
  authenticatedSourceCommits.set(token, head);
  authenticatedPreparationSourceCommits.set(token, preparationCommit);
  return token;
}

export function sourceCommitFromSealedRealmsProductionAuthority(authority) {
  if (!authenticatedAuthorities.has(authority)) {
    fail('SEALED_REALMS_SOURCE_AUTHORITY_OPAQUE_RESULT_REQUIRED');
  }
  return authenticatedSourceCommits.get(authority)
    ?? fail('SEALED_REALMS_SOURCE_AUTHORITY_INTERNAL_INVALID');
}

/** Returns S for both a direct S authority and a fully authenticated A child. */
export function preparationSourceCommitFromSealedRealmsProductionAuthority(authority) {
  if (!authenticatedAuthorities.has(authority)) {
    fail('SEALED_REALMS_SOURCE_AUTHORITY_OPAQUE_RESULT_REQUIRED');
  }
  return authenticatedPreparationSourceCommits.get(authority)
    ?? fail('SEALED_REALMS_SOURCE_AUTHORITY_INTERNAL_INVALID');
}
