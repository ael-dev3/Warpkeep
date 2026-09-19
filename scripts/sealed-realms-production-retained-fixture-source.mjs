import { execFileSync } from 'node:child_process';
import { types } from 'node:util';
import { createSealedRealmsProductionRetainedFixtureRuntime,
  attestSealedRealmsProductionRetainedFixtureRuntime } from './sealed-realms-production-linux-preflight.mjs';
import { resolveSealedRealmsProductionWorkflowPrivateState } from './sealed-realms-production-workflow-private-state.mjs';
import { createSealedRealmsProductionContinuationStore } from './sealed-realms-production-continuation.mjs';
import { authenticateSealedRealmsProductionRetainedSource } from './sealed-realms-production-source-authority.mjs';
import { createSealedRealmsProductionRetainedEvidence, refreshSealedRealmsProductionRetainedEvidence,
  verifySealedRealmsProductionRetainedEvidence, revokeSealedRealmsProductionRetainedEvidence } from './sealed-realms-production-workflow-evidence.mjs';
import { readPtrRetainedUpdateSourceCommit, readG002RetainedUpdateSourceCommit } from './ptr-production-existing-update-adapter.mjs';
import { authenticateSealedRealmsProductionPtrHistoricalAdoption, authenticateSealedRealmsProductionG002HistoricalAdoption,
  readSealedRealmsProductionPtrExistingStateAdoptionEvidence, readSealedRealmsProductionG002ExistingStateAdoptionEvidence } from './sealed-realms-production-activation-records.mjs';
import { updateDigest } from './sealed-realms-existing-update-protocol.mjs';
import { parseWorkflowEvidenceJson } from './sealed-realms-production-workflow-evidence-json.mjs';

const GIT = String.fromCodePoint(47, 117, 115, 114, 47, 98, 105, 110, 47, 103, 105, 116);
const NULL = String.fromCodePoint(47, 100, 101, 118, 47, 110, 117, 108, 108);
const PATH = String.fromCodePoint(47, 117, 115, 114, 47, 98, 105, 110, 58, 47, 98, 105, 110);
const COMMIT = /^[a-f0-9]{40}$/u;
const POLICIES = Object.freeze([
  Object.freeze({ realm: 'g002', modulePath: 'spacetimedb/genesis002',
    databaseIdentity: 'c2003223f6e3c86e988775ddd458c3a45635d0d021e11131551471617c392194',
    discover: readG002RetainedUpdateSourceCommit, authenticate: authenticateSealedRealmsProductionG002HistoricalAdoption,
    read: readSealedRealmsProductionG002ExistingStateAdoptionEvidence }),
  Object.freeze({ realm: 'ptr', modulePath: 'spacetimedb/ptr',
    databaseIdentity: 'c200df57bee179af512f05b3c7c328e3d4d7a6074ccc4ed976de84f94fb56d6e',
    discover: readPtrRetainedUpdateSourceCommit, authenticate: authenticateSealedRealmsProductionPtrHistoricalAdoption,
    read: readSealedRealmsProductionPtrExistingStateAdoptionEvidence }),
]);
let active = false;
function fail() { throw new Error('SEALED_REALMS_RETAINED_FIXTURE_SOURCE_INVALID'); }
function readGit(args) {
  try {
    return execFileSync(GIT, ['--no-replace-objects', '--no-optional-locks', '-c', 'core.fsmonitor=false',
      '-c', `core.hooksPath=${NULL}`, ...args], { cwd: process.cwd(), encoding: 'buffer',
      env: { GIT_CONFIG_GLOBAL: NULL, GIT_CONFIG_SYSTEM: NULL, GIT_CONFIG_NOSYSTEM: '1', GIT_NO_REPLACE_OBJECTS: '1',
        GIT_GRAFT_FILE: NULL, GIT_TERMINAL_PROMPT: '0', HOME: NULL, PATH, LANG: 'C', LC_ALL: 'C' },
      maxBuffer: 128 * 1024, timeout: 10_000, stdio: ['ignore', 'pipe', 'pipe'] });
  } catch { fail(); }
}
function gitCommit(args) {
  const bytes = readGit(args);
  try { const text = bytes.toString('utf8'); if (!/^[a-f0-9]{40}\n$/u.test(text)) fail(); return text.slice(0, -1); }
  finally { bytes.fill(0); }
}
function readBinding(commit) {
  const bytes = readGit(['show', `${commit}:config/releases/0.4.0-sealed-launch.json`]);
  try {
    const value = parseWorkflowEvidenceJson(bytes);
    return { schemaVersion: value.schemaVersion, profile: value.profile,
      pagesDeploymentApproved: value.pagesDeploymentApproved, preparationSourceCommit: value.preparationSourceCommit };
  } finally { bytes.fill(0); }
}

/** Fixed native, authenticated history only. No receipt/JWS/player data leaves this call. */
export async function readSealedRealmsProductionRetainedFixtureSources(input) {
  if (arguments.length !== 1 || types.isProxy(input) || input === null || typeof input !== 'object'
    || Object.getPrototypeOf(input) !== Object.prototype || Reflect.ownKeys(input).length !== 2 || active) fail();
  const descriptor = Object.getOwnPropertyDescriptor(input, 'operatingCommit');
  if (!descriptor?.enumerable || !Object.hasOwn(descriptor, 'value')
    || typeof descriptor.value !== 'string' || !COMMIT.test(descriptor.value)) fail();
  const tokenDescriptor = Object.getOwnPropertyDescriptor(input, 'githubToken');
  if (!tokenDescriptor?.enumerable || !Object.hasOwn(tokenDescriptor, 'value')) fail();
  const supplied = tokenDescriptor.value;
  let token;
  if (supplied !== null) {
    if (types.isProxy(supplied) || !Buffer.isBuffer(supplied) || supplied.buffer instanceof SharedArrayBuffer
      || supplied.length < 20 || supplied.length > 4096) fail();
    token = Buffer.from(Uint8Array.prototype.slice.call(supplied));
    if (token.some(byte => byte < 33 || byte > 126)) { token.fill(0); fail(); }
  }
  const operatingCommit = descriptor.value;
  active = true;
  let scope;
  try {
    const runtime = createSealedRealmsProductionRetainedFixtureRuntime({ operatingCommit });
    const attest = () => attestSealedRealmsProductionRetainedFixtureRuntime(runtime);
    const privateState = resolveSealedRealmsProductionWorkflowPrivateState();
    const store = createSealedRealmsProductionContinuationStore({ privateState });
    const selections = POLICIES.map(policy => {
      const sourceCommit = policy.discover({ privateState });
      if (typeof sourceCommit !== 'string' || !COMMIT.test(sourceCommit)) fail();
      return { policy, sourceCommit, sourceRootTree: gitCommit(['rev-parse', '--verify', `${sourceCommit}^{tree}`]) };
    });
    attest();
    scope = await createSealedRealmsProductionRetainedEvidence({ operatingCommit,
      sourceCommits: [...new Set(selections.map(value => value.sourceCommit))], nativeRuntime: runtime, githubToken: token ?? null });
    attest();
    const authenticated = [];
    for (const selection of selections) {
      const retainedSource = authenticateSealedRealmsProductionRetainedSource({ realm: selection.policy.realm,
        operatingCommit, sourceCommit: selection.sourceCommit, sourceTree: selection.sourceRootTree,
        readGit, readBinding, verifyEvidence: commit => verifySealedRealmsProductionRetainedEvidence(scope, commit) });
      attest();
      const evidence = await selection.policy.authenticate({ privateState, retainedSource, store });
      attest();
      authenticated.push({ ...selection, evidence });
    }
    attest();
    await refreshSealedRealmsProductionRetainedEvidence(scope);
    const identity = attest();
    const sources = Object.fromEntries(authenticated.map(({ policy, sourceCommit, sourceRootTree, evidence }) => {
      const retained = policy.read({ evidence, privateState, sourceCommit });
      const receipt = retained.completionReceipt, binding = receipt.binding;
      const moduleTree = gitCommit(['rev-parse', '--verify', `${sourceCommit}:${policy.modulePath}`]);
      if (binding.sourceCommit !== sourceCommit || binding.moduleTreeId !== moduleTree
        || binding.databaseIdentity !== policy.databaseIdentity || retained.sourceTree !== sourceRootTree) fail();
      return [policy.realm, Object.freeze({ sourceAuthority: 'authenticated-existing-state-adoption-v1',
        adoptionReceiptSha256: retained.adoptionReceiptDigest, updateReceiptSha256: updateDigest(receipt),
        databaseIdentity: policy.databaseIdentity, sourceCommit, sourceRootTree, sourceTree: moduleTree,
        installedModuleSha256: binding.candidateSha256, installedProgramKeccak256: binding.candidateProgram,
        historicalDependencyClosureSha256: binding.dependencyClosureDigest })];
    }));
    attest();
    return Object.freeze({ schemaVersion: 1, profile: 'warpkeep-release-recovery-authenticated-adoption-sources-v1',
      ...identity, sources: Object.freeze(sources) });
  } catch { fail(); }
  finally { token?.fill(0); if (scope) revokeSealedRealmsProductionRetainedEvidence(scope); active = false; }
}
