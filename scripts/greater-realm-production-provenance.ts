import { runGreaterRealmTrustedGit } from './atlas/greater-realm-git';
import type { GreaterRealmRuntimeReleaseArtifacts } from './atlas/greater-realm-runtime-release';
import {
  readGreaterRealmRuntimeRelease,
  verifyGreaterRealmRuntimeReleaseArtifacts,
} from './atlas/greater-realm-runtime-release';
import {
  openGreaterRealmPrivateWorkspace,
  type GreaterRealmPrivateWorkspace,
} from './atlas/greater-realm-private-workspace';

const COMMIT = /^[0-9a-f]{40}$/u;
const SHA256 = /^[0-9a-f]{64}$/u;
const CANONICAL_ORIGIN_URL = 'https://github.com/ael-dev3/Warpkeep.git';
const GATE_POLICY_PATH = 'spacetimedb/src/greaterRealmV17Policy.ts';
const PUBLISHER_POLICY_PATH = 'scripts/greater-realm-production-publisher-core.ts';
const IMPORT_GATE_FALSE = 'export const GREATER_REALM_V17_IMPORT_MUTATIONS_ALLOWED = false;';
const IMPORT_GATE_TRUE = 'export const GREATER_REALM_V17_IMPORT_MUTATIONS_ALLOWED = true;';
const ACTIVATION_GATE_FALSE = 'export const GREATER_REALM_V17_ACTIVATION_MUTATIONS_ALLOWED = false;';
const ACTIVATION_GATE_TRUE = 'export const GREATER_REALM_V17_ACTIVATION_MUTATIONS_ALLOWED = true;';
const ENTRY_APPROVAL_FALSE = '  entryAgreementApproved: false,';
const ENTRY_APPROVAL_TRUE = '  entryAgreementApproved: true,';
const ADDITIVE_APPROVAL_FALSE = '  additivePublishApproved: false,';
const ADDITIVE_APPROVAL_TRUE = '  additivePublishApproved: true,';
const IMPORT_FORWARD_FALSE = '  importForwardFixApproved: false,';
const IMPORT_FORWARD_TRUE = '  importForwardFixApproved: true,';
const ACTIVATION_FORWARD_FALSE = '  activationForwardFixApproved: false,';
const ACTIVATION_FORWARD_TRUE = '  activationForwardFixApproved: true,';

export type GreaterRealmProductionProvenance = Readonly<{
  workspace: GreaterRealmPrivateWorkspace;
  artifacts: GreaterRealmRuntimeReleaseArtifacts;
  atlasSourceCommit: string;
  moduleSourceCommit: string;
  atlasId: string;
  publicReleaseId: string;
  expectedReleaseSha256: string;
}>;

export class GreaterRealmProductionProvenanceError extends Error {
  constructor(readonly code: string) {
    super(code);
    this.name = 'GreaterRealmProductionProvenanceError';
  }
}

export function attestGreaterRealmProductionSourceAncestry(input: Readonly<{
  repositoryRoot: string;
  atlasSourceCommit: string;
  moduleSourceCommit: string;
}>): void {
  if (!COMMIT.test(input.atlasSourceCommit) || !COMMIT.test(input.moduleSourceCommit)) {
    fail('GREATER_REALM_PRODUCTION_SOURCE_ANCESTRY_INVALID');
  }
  const run = (arguments_: readonly string[]) => runGreaterRealmTrustedGit(
    arguments_,
    input.repositoryRoot,
  );
  const atlasExists = run(['cat-file', '-e', `${input.atlasSourceCommit}^{commit}`]);
  const moduleExists = run(['cat-file', '-e', `${input.moduleSourceCommit}^{commit}`]);
  const isAncestor = run([
    'merge-base', '--is-ancestor', input.atlasSourceCommit, input.moduleSourceCommit,
  ]);
  if (
    atlasExists.error !== undefined || atlasExists.status !== 0
    || moduleExists.error !== undefined || moduleExists.status !== 0
    || isAncestor.error !== undefined || isAncestor.status !== 0
  ) fail('GREATER_REALM_PRODUCTION_SOURCE_ANCESTRY_INVALID');
}

function trustedGitText(
  repositoryRoot: string,
  arguments_: readonly string[],
): string {
  const result = runGreaterRealmTrustedGit(arguments_, repositoryRoot);
  if (
    result.error !== undefined
    || result.status !== 0
    || result.signal !== null
    || Buffer.byteLength(result.stdout, 'utf8') > 2 * 1024 * 1024
  ) fail('GREATER_REALM_PRODUCTION_GATE_DELTA_INVALID');
  return result.stdout;
}

function exactlyOnce(value: string, expected: string): boolean {
  const first = value.indexOf(expected);
  return first >= 0 && value.indexOf(expected, first + expected.length) < 0;
}

/** Initial gate handoffs may change only one exact v17 policy literal. */
export function attestGreaterRealmProductionGateOnlyDelta(input: Readonly<{
  repositoryRoot: string;
  atlasSourceCommit: string;
  moduleSourceCommit: string;
  gate: 'import' | 'activation';
}>): void {
  attestGreaterRealmProductionSourceAncestry(input);
  const changedPaths = trustedGitText(input.repositoryRoot, [
    'diff', '--name-only', '--no-ext-diff', '--no-textconv',
    input.atlasSourceCommit, input.moduleSourceCommit, '--', '.',
  ]).split('\n').filter(Boolean);
  if (
    changedPaths.length !== 2
    || !changedPaths.includes(GATE_POLICY_PATH)
    || !changedPaths.includes(PUBLISHER_POLICY_PATH)
  ) {
    fail('GREATER_REALM_PRODUCTION_GATE_DELTA_INVALID');
  }
  const atlas = trustedGitText(input.repositoryRoot, [
    'show', `${input.atlasSourceCommit}:${GATE_POLICY_PATH}`,
  ]);
  const module = trustedGitText(input.repositoryRoot, [
    'show', `${input.moduleSourceCommit}:${GATE_POLICY_PATH}`,
  ]);
  const atlasPublisher = trustedGitText(input.repositoryRoot, [
    'show', `${input.atlasSourceCommit}:${PUBLISHER_POLICY_PATH}`,
  ]);
  const modulePublisher = trustedGitText(input.repositoryRoot, [
    'show', `${input.moduleSourceCommit}:${PUBLISHER_POLICY_PATH}`,
  ]);
  const selectedFalse = input.gate === 'import' ? IMPORT_GATE_FALSE : ACTIVATION_GATE_FALSE;
  const selectedTrue = input.gate === 'import' ? IMPORT_GATE_TRUE : ACTIVATION_GATE_TRUE;
  const selectedForwardFalse = input.gate === 'import'
    ? IMPORT_FORWARD_FALSE
    : ACTIVATION_FORWARD_FALSE;
  const selectedForwardTrue = input.gate === 'import'
    ? IMPORT_FORWARD_TRUE
    : ACTIVATION_FORWARD_TRUE;
  if (
    !exactlyOnce(atlas, selectedFalse)
    || atlas.includes(selectedTrue)
    || !exactlyOnce(module, selectedTrue)
    || module.includes(selectedFalse)
    || (input.gate === 'import' && (
      !exactlyOnce(atlas, ACTIVATION_GATE_FALSE)
      || !exactlyOnce(module, ACTIVATION_GATE_FALSE)
      || atlas.includes(ACTIVATION_GATE_TRUE)
      || module.includes(ACTIVATION_GATE_TRUE)
    ))
    || (input.gate === 'activation' && (
      !exactlyOnce(atlas, IMPORT_GATE_FALSE)
      || !exactlyOnce(module, IMPORT_GATE_FALSE)
      || atlas.includes(IMPORT_GATE_TRUE)
      || module.includes(IMPORT_GATE_TRUE)
    ))
    || module.replace(selectedTrue, selectedFalse) !== atlas
    || !exactlyOnce(atlasPublisher, ENTRY_APPROVAL_FALSE)
    || !exactlyOnce(atlasPublisher, ADDITIVE_APPROVAL_FALSE)
    || !exactlyOnce(atlasPublisher, selectedForwardFalse)
    || atlasPublisher.includes(ENTRY_APPROVAL_TRUE)
    || atlasPublisher.includes(ADDITIVE_APPROVAL_TRUE)
    || atlasPublisher.includes(selectedForwardTrue)
    || !exactlyOnce(modulePublisher, ENTRY_APPROVAL_TRUE)
    || !exactlyOnce(modulePublisher, ADDITIVE_APPROVAL_TRUE)
    || !exactlyOnce(modulePublisher, selectedForwardTrue)
    || modulePublisher.includes(ENTRY_APPROVAL_FALSE)
    || modulePublisher.includes(ADDITIVE_APPROVAL_FALSE)
    || modulePublisher.includes(selectedForwardFalse)
    || modulePublisher
      .replace(ENTRY_APPROVAL_TRUE, ENTRY_APPROVAL_FALSE)
      .replace(ADDITIVE_APPROVAL_TRUE, ADDITIVE_APPROVAL_FALSE)
      .replace(selectedForwardTrue, selectedForwardFalse) !== atlasPublisher
  ) fail('GREATER_REALM_PRODUCTION_GATE_DELTA_INVALID');
}

/** Candidate review precedes the exact two-literal inert-append approval. */
export function attestGreaterRealmProductionAppendApprovalOnlyDelta(input: Readonly<{
  repositoryRoot: string;
  atlasSourceCommit: string;
  moduleSourceCommit: string;
}>): void {
  attestGreaterRealmProductionSourceAncestry(input);
  const changedPaths = trustedGitText(input.repositoryRoot, [
    'diff', '--name-only', '--no-ext-diff', '--no-textconv',
    input.atlasSourceCommit, input.moduleSourceCommit, '--', '.',
  ]).split('\n').filter(Boolean);
  if (changedPaths.length !== 1 || changedPaths[0] !== PUBLISHER_POLICY_PATH) {
    fail('GREATER_REALM_PRODUCTION_APPEND_APPROVAL_DELTA_INVALID');
  }
  const atlas = trustedGitText(input.repositoryRoot, [
    'show', `${input.atlasSourceCommit}:${PUBLISHER_POLICY_PATH}`,
  ]);
  const module = trustedGitText(input.repositoryRoot, [
    'show', `${input.moduleSourceCommit}:${PUBLISHER_POLICY_PATH}`,
  ]);
  if (
    !exactlyOnce(atlas, ENTRY_APPROVAL_FALSE)
    || !exactlyOnce(atlas, ADDITIVE_APPROVAL_FALSE)
    || atlas.includes(ENTRY_APPROVAL_TRUE)
    || atlas.includes(ADDITIVE_APPROVAL_TRUE)
    || !exactlyOnce(module, ENTRY_APPROVAL_TRUE)
    || !exactlyOnce(module, ADDITIVE_APPROVAL_TRUE)
    || module.includes(ENTRY_APPROVAL_FALSE)
    || module.includes(ADDITIVE_APPROVAL_FALSE)
    || module
      .replace(ENTRY_APPROVAL_TRUE, ENTRY_APPROVAL_FALSE)
      .replace(ADDITIVE_APPROVAL_TRUE, ADDITIVE_APPROVAL_FALSE) !== atlas
  ) fail('GREATER_REALM_PRODUCTION_APPEND_APPROVAL_DELTA_INVALID');
}

function fail(code: string): never {
  throw new GreaterRealmProductionProvenanceError(code);
}

function exactSingleLine(output: string): string | undefined {
  const value = output.endsWith('\n') ? output.slice(0, -1) : output;
  return value.length > 0 && !value.includes('\n') && !value.includes('\r')
    ? value
    : undefined;
}

function attestProtectedMainAgainstOrigin(input: Readonly<{
  repositoryRoot: string;
  expectedOriginUrl: string;
}>): string {
  if (
    !input.repositoryRoot.startsWith('/')
    || input.expectedOriginUrl.length < 1
    || input.expectedOriginUrl.includes('\0')
  ) fail('GREATER_REALM_PRODUCTION_PROTECTED_MAIN_INVALID');
  const read = (arguments_: readonly string[]): string => {
    const result = runGreaterRealmTrustedGit(arguments_, input.repositoryRoot);
    if (result.error !== undefined || result.status !== 0 || result.stderr !== '') {
      fail('GREATER_REALM_PRODUCTION_PROTECTED_MAIN_UNAVAILABLE');
    }
    return result.stdout;
  };
  const branch = exactSingleLine(read(['symbolic-ref', '--quiet', '--short', 'HEAD']));
  const sourceCommit = exactSingleLine(read(['rev-parse', '--verify', 'HEAD^{commit}']));
  const configuredOrigin = exactSingleLine(read([
    'config', '--local', '--get-all', 'remote.origin.url',
  ]));
  const resolvedOrigin = exactSingleLine(read(['remote', 'get-url', '--all', 'origin']));
  const protectedMain = read([
    'ls-remote', '--exit-code', 'origin', 'refs/heads/main',
  ]);
  const status = read([
    'status', '--porcelain=v1', '--untracked-files=all', '--no-renames',
  ]);
  const protectedMainMatch = protectedMain.match(
    /^([0-9a-f]{40})\trefs\/heads\/main\n?$/u,
  );
  if (
    branch !== 'main'
    || sourceCommit === undefined
    || !COMMIT.test(sourceCommit)
    || configuredOrigin !== input.expectedOriginUrl
    || resolvedOrigin !== input.expectedOriginUrl
    || protectedMainMatch === null
    || protectedMainMatch[1] !== sourceCommit
    || status !== ''
  ) fail('GREATER_REALM_PRODUCTION_PROTECTED_MAIN_MISMATCH');
  return sourceCommit;
}

/** Exact clean canonical main attestation using only the pinned, scrubbed Git runner. */
export function attestGreaterRealmProductionProtectedMain(
  repositoryRoot: string,
): string {
  return attestProtectedMainAgainstOrigin({
    repositoryRoot,
    expectedOriginUrl: CANONICAL_ORIGIN_URL,
  });
}

function manifestString(
  manifest: Readonly<Record<string, unknown>>,
  field: 'sourceCommit' | 'atlasId' | 'publicReleaseId' | 'releaseSha256',
): string {
  const value = manifest[field];
  if (
    typeof value !== 'string'
    || value.length < 1
    || value.length > 512
    || /[\u0000-\u001f\u007f]/u.test(value)
  ) fail('GREATER_REALM_PRODUCTION_ATLAS_PROVENANCE_INVALID');
  return value;
}

/**
 * Binds the immutable atlas-generation identity and the currently attested
 * server-module identity without ever requiring the two commits to be equal.
 */
export function inspectGreaterRealmProductionProvenance(input: Readonly<{
  repositoryRoot: string;
  workspaceRoot?: string;
  attestModuleSourceCommit: () => string;
}>): GreaterRealmProductionProvenance {
  const moduleSourceCommit = input.attestModuleSourceCommit();
  if (!COMMIT.test(moduleSourceCommit)) {
    fail('GREATER_REALM_PRODUCTION_MODULE_PROVENANCE_INVALID');
  }
  const workspace = openGreaterRealmPrivateWorkspace({
    repositoryRoot: input.repositoryRoot,
    workspaceRoot: input.workspaceRoot,
  });
  const artifacts = readGreaterRealmRuntimeRelease(workspace);
  verifyGreaterRealmRuntimeReleaseArtifacts(artifacts);
  const atlasSourceCommit = manifestString(artifacts.manifest, 'sourceCommit');
  const atlasId = manifestString(artifacts.manifest, 'atlasId');
  const publicReleaseId = manifestString(artifacts.manifest, 'publicReleaseId');
  const expectedReleaseSha256 = manifestString(artifacts.manifest, 'releaseSha256');
  if (!COMMIT.test(atlasSourceCommit) || !SHA256.test(expectedReleaseSha256)) {
    fail('GREATER_REALM_PRODUCTION_ATLAS_PROVENANCE_INVALID');
  }
  attestGreaterRealmProductionSourceAncestry({
    repositoryRoot: input.repositoryRoot,
    atlasSourceCommit,
    moduleSourceCommit,
  });
  return Object.freeze({
    workspace,
    artifacts,
    atlasSourceCommit,
    moduleSourceCommit,
    atlasId,
    publicReleaseId,
    expectedReleaseSha256,
  });
}

export const greaterRealmProductionProvenanceTestSeams = Object.freeze({
  attestProtectedMainAgainstOrigin,
});
