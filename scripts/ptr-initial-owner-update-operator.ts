// Fixed PTR initial-owner backend continuation from a clean signed reviewed quality checkpoint.
// It grants no sealed accepted-main/global release authority, bootstraps no owner/atlas and changes no bridge.
import { createHash } from 'node:crypto';
import { closeSync, constants, existsSync, fchmodSync, fsyncSync, lstatSync, mkdirSync,
  openSync, realpathSync, writeSync } from 'node:fs';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { capturePtrInitialOwnerSource, inspectPtrInitialOwnerState, type PtrInitialOwnerSource } from './ptr-initial-owner-operator';
import { preparePtrSourceBuiltArtifact, assertPtrSourceBuiltArtifact } from './ptr-production-publisher.mjs';
import { createPtrUpdateProviderCredentials, createPtrInspectionProviderCredentials, disposePtrUpdateProviderCredentials,
  requestPtrInspectionProvider, requestPtrUpdateProvider, type PtrUpdateProviderArtifact } from './ptr-update-provider-credentials.mjs';
import { readLocalBindingBoundedFile } from './local-binding-bounded-file.mjs';
import { assertProductionAdminTrustedAncestors, ensureCanonicalProductionAdminStateDirectory, defaultProductionAdminStateDirectory } from './production-admin-token-budget.mjs';
import { takePtrProductionAdminSecret } from './ptr-production-admin-token';
import { verifyAuthBridgeRpcRoleAttestation } from './auth-bridge-config-attestation.mjs';
import { parsePtrUpdateDefinition } from './ptr-update-definition-policy.mjs';
import { parseExistingUpdateJson, parseExistingUpdateSuccess, updateCanonical } from './sealed-realms-existing-update-protocol.mjs';
import { createPtrInitialOwnerUpdateInspection, assertPtrInitialOwnerUpdatePreflight,
  classifyPtrInitialOwnerUpdateObservation, validatePtrInitialOwnerUpdateInspection,
  PtrInitialOwnerUpdateError, PTR_INITIAL_OWNER_UPDATE_TARGET,
  type PtrInitialOwnerUpdateBinding, type PtrInitialOwnerUpdateInspection, type PtrInitialOwnerUpdateSnapshot } from './ptr-initial-owner-update-core.mjs';

const ROOT = resolve(import.meta.dirname, '..'), HASH = /^[a-f0-9]{64}$/u;
const MAX_JOURNAL = 1024 * 1024;
const sha = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');
const fail: (code: string) => never = code => { throw new PtrInitialOwnerUpdateError(code); };
type Command = 'prepare-update' | 'apply' | 'reconcile';
type JournalKind = 'inspection' | 'submission' | 'acknowledgement';
type Source = ReturnType<typeof capturePtrInitialOwnerSource>;
type Built = ReturnType<typeof preparePtrSourceBuiltArtifact>;

/** Private storage only; this IO helper grants no source, artifact or provider authority. */
export function openPtrInitialOwnerUpdateJournal(stateRoot: string, create = false) {
  assertProductionAdminTrustedAncestors(stateRoot);
  if (realpathSync(stateRoot) !== stateRoot) fail('JOURNAL_PARENT_INVALID');
  const root = join(stateRoot, 'ptr-initial-owner-updates-v1');
  if (!existsSync(root)) {
    if (!create) fail('JOURNAL_ABSENT');
    try { mkdirSync(root, { mode: 0o700 }); }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error; }
  }
  const identity = () => {
    const stat = lstatSync(root, { bigint: true });
    if (!stat.isDirectory() || stat.isSymbolicLink() || realpathSync(root) !== root
      || (stat.mode & 0o7777n) !== 0o700n
      || (process.getuid !== undefined && stat.uid !== BigInt(process.getuid()))) fail('JOURNAL_DIRECTORY_INVALID');
    // Creation of our own exclusive entries changes directory times, never its held identity/owner/mode.
    return `${stat.dev}:${stat.ino}:${stat.mode}:${stat.uid}:${stat.gid}`;
  };
  const original = identity(), assert = () => { if (identity() !== original) fail('JOURNAL_DIRECTORY_CHANGED'); };
  const path = (kind: JournalKind, key: string) => {
    if (!['inspection', 'submission', 'acknowledgement'].includes(kind) || !HASH.test(key)) fail('JOURNAL_KEY_INVALID');
    return join(root, `${kind}-${key}.json`);
  };
  const read = (kind: JournalKind, key: string) => {
    assert(); const file = readLocalBindingBoundedFile(path(kind, key), { minimumBytes: 1, maximumBytes: MAX_JOURNAL,
      expectedMode: 0o600, expectedUid: process.getuid?.() });
    try {
      const value = parseExistingUpdateJson(file.body);
      if (value.schemaVersion !== 1 || value.profile !== 'warpkeep-ptr-initial-owner-update-journal-v1'
        || value.kind !== kind || value.key !== key || typeof value.createdAt !== 'string'
        || !Number.isFinite(Date.parse(value.createdAt)) || new Date(value.createdAt).toISOString() !== value.createdAt
        || updateCanonical(Object.keys(value).sort()) !== updateCanonical(['createdAt', 'key', 'kind', 'profile', 'schemaVersion', 'value'])
        || !file.body.equals(Buffer.from(`${updateCanonical(value)}\n`))) fail('JOURNAL_RECORD_INVALID');
      assert(); return { value: value.value, sha256: sha(file.body), identity: file.identity };
    } finally { file.body.fill(0); }
  };
  const present = (kind: JournalKind, key: string) => { assert(); return existsSync(path(kind, key)); };
  const write = (kind: JournalKind, key: string, value: unknown) => {
    assert(); const bytes = Buffer.from(`${updateCanonical({ schemaVersion: 1,
      profile: 'warpkeep-ptr-initial-owner-update-journal-v1', kind, key, createdAt: new Date().toISOString(), value })}\n`);
    let descriptor: number | undefined;
    try {
      if (bytes.length > MAX_JOURNAL) fail('JOURNAL_BOUND');
      descriptor = openSync(path(kind, key), constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY | constants.O_NOFOLLOW, 0o600);
      fchmodSync(descriptor, 0o600); let offset = 0;
      while (offset < bytes.length) { const count = writeSync(descriptor, bytes, offset, bytes.length - offset);
        if (count < 1) fail('JOURNAL_WRITE_FAILED'); offset += count; }
      fsyncSync(descriptor); closeSync(descriptor); descriptor = undefined;
      const parent = openSync(root, constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW);
      try { fsyncSync(parent); } finally { closeSync(parent); }
      const reopened = read(kind, key);
      if (reopened.sha256 !== sha(bytes) || updateCanonical(reopened.value) !== updateCanonical(value)) fail('JOURNAL_WRITE_READBACK_FAILED');
      assert(); return { path: path(kind, key), sha256: reopened.sha256 };
    } finally {
      if (descriptor !== undefined) closeSync(descriptor);
      bytes.fill(0);
      // An exclusive submission file, including an interrupted/partial file, is retained. Never erase/retry it.
    }
  };
  return Object.freeze({ assert, present, read, write });
}

function captureLocal(source: Source, input: NodeJS.ProcessEnv, needsBuild: boolean) {
  const environment = { ...input };
  const configPath = environment.WARPKEEP_SPACETIME_CLI_CONFIG_PATH;
  const executable = environment.WARPKEEP_SPACETIME_EXECUTABLE ?? environment.SPACETIME_BIN;
  const dependencyCacheRoot = environment.WKGR_PRODUCTION_DEPENDENCY_CACHE_ROOT;
  const materializationParent = environment.WK_PTR_MATERIALIZATION_PARENT;
  if (typeof configPath !== 'string' || !isAbsolute(configPath) || realpathSync(configPath) !== configPath
    || typeof executable !== 'string' || !isAbsolute(executable) || realpathSync(executable) !== executable
    || (needsBuild && (typeof dependencyCacheRoot !== 'string' || !isAbsolute(dependencyCacheRoot)
      || realpathSync(dependencyCacheRoot) !== dependencyCacheRoot))
    || (materializationParent !== undefined && (!isAbsolute(materializationParent) || realpathSync(materializationParent) !== materializationParent))
    || ['WARPKEEP_SPACETIMEDB_URI', 'WARPKEEP_SPACETIMEDB_DATABASE', 'WARPKEEP_PTR_SPACETIMEDB_DATABASE',
      'WARPKEEP_AUTH_BRIDGE_URL'].some(key => environment[key] !== undefined)) fail('ENVIRONMENT_INVALID');
  for (const directory of [dirname(configPath), dirname(executable), ...(needsBuild ? [dependencyCacheRoot!] : []),
    ...(materializationParent === undefined ? [] : [materializationParent])]) assertProductionAdminTrustedAncestors(directory);
  const file = readLocalBindingBoundedFile(configPath, { maximumBytes: 64 * 1024, minimumBytes: 1,
    expectedMode: 0o600, expectedUid: 1000 });
  const configDigest = sha(file.body); file.body.fill(0);
  const binary = readLocalBindingBoundedFile(executable, { maximumBytes: 256 * 1024 * 1024, minimumBytes: 1,
    requireExecutable: true, rejectWritableExecutable: true });
  const binaryDigest = sha(binary.body); binary.body.fill(0);
  const assert = () => {
    source.assert();
    readLocalBindingBoundedFile(configPath, { maximumBytes: 64 * 1024, expectedMode: 0o600, expectedUid: 1000,
      expectedIdentity: file.identity, expectedSha256: configDigest }).body.fill(0);
  };
  const assertOriginalExecutable = () => {
    readLocalBindingBoundedFile(executable, { maximumBytes: 256 * 1024 * 1024, requireExecutable: true,
      rejectWritableExecutable: true, expectedIdentity: binary.identity, expectedSha256: binaryDigest }).body.fill(0);
  };

  let secret: string | undefined;
  try { secret = takePtrProductionAdminSecret(environment); } catch { secret = undefined; }
  delete environment.WARPKEEP_ADMIN_TOKEN_SECRET;
  return { environment, configPath, executable, dependencyCacheRoot, materializationParent, configDigest, binaryDigest, assert, assertOriginalExecutable,
    configuration: async () => { assert(); if (secret === undefined) fail('PRIVATE_BRIDGE_CONFIG_UNOBSERVED');
      const value = await verifyAuthBridgeRpcRoleAttestation({ adminToken: secret }); assert(); return value; },
    dispose: () => { secret = undefined; delete environment.WARPKEEP_ADMIN_TOKEN_SECRET; } };
}
function artifactBinding(source: Source, built: Built): PtrInitialOwnerUpdateBinding {
  assertPtrSourceBuiltArtifact(built);
  if (!built.spacetimeCliConfigSha256 || !built.assertCliConfig || !built.spacetimeCliRootDirectory
    || !built.spacetimeCliConfigPath || built.sourceCommit !== source.facts.sourceCommit) fail('ARTIFACT_CONFIG_INVALID');
  return Object.freeze({ sourceCommit: source.facts.sourceCommit, sourceTree: source.facts.sourceTree,
    databaseIdentity: PTR_INITIAL_OWNER_UPDATE_TARGET, candidateProgram: built.moduleProgramHash,
    candidateSha256: built.moduleSha256, candidateDescriptionDigest: built.artifactDescription.descriptionSha256,
    moduleTreeId: built.moduleTreeId, dependencyClosureDigest: built.dependencyClosureDigest,
    cliDigest: built.spacetimeExecutableSha256, cliConfigDigest: built.spacetimeCliConfigSha256 });
}

/** Only this entry wires source-owned building and the fixed provider transport; no caller-selected effect seam. */
export async function executePtrInitialOwnerUpdate(input: Readonly<{ command: Command; source: PtrInitialOwnerSource;
  environment: NodeJS.ProcessEnv; inspectionDigest?: string }>) {
  if (process.platform !== 'linux' || process.arch !== 'x64' || process.getuid?.() !== 1000) fail('PLATFORM_INVALID');
  if (!['prepare-update', 'apply', 'reconcile'].includes(input.command)
    || (input.command === 'prepare-update' ? input.inspectionDigest !== undefined : !HASH.test(input.inspectionDigest ?? ''))) fail('ARGUMENT_INVALID');
  const source = capturePtrInitialOwnerSource(ROOT, input.source), local = captureLocal(source, input.environment, input.command !== 'reconcile');
  // Reconciliation creates no journal path and never builds or submits a new artifact.
  let journal: ReturnType<typeof openPtrInitialOwnerUpdateJournal>;
  try {
    journal = openPtrInitialOwnerUpdateJournal(input.command === 'reconcile' ? defaultProductionAdminStateDirectory()
      : ensureCanonicalProductionAdminStateDirectory(), input.command !== 'reconcile');
  } catch (failure) { local.dispose(); throw failure; }

  const ownedResponseBuffers: Buffer[] = [];
  let built: Built | undefined, capability: ReturnType<typeof createPtrUpdateProviderCredentials> | undefined;
  let inspection: PtrInitialOwnerUpdateInspection | undefined, inspectionFile: { path: string; sha256: string } | null = null;
  let result: ReturnType<typeof classifyPtrInitialOwnerUpdateObservation> | null = null;
  let readinessBlockers: readonly string[] = [], error: string | null = null, sourcePreserved = false;
  let applyRequested = false, submissionMarked = false, submissionSlotPresent: boolean | null = null, acknowledgementReceived = false,
    credentialCleanupCompleted = false, artifactCleanupCompleted = false, cleanupCompleted = false, privateConfigurationObserved = false;
  try {
    if (input.command !== 'prepare-update') {
      const held = journal.read('inspection', input.inspectionDigest!);
      inspection = validatePtrInitialOwnerUpdateInspection(held.value);
      if (inspection.inspectionDigest !== input.inspectionDigest || inspection.binding.sourceCommit !== source.facts.sourceCommit
        || inspection.binding.sourceTree !== source.facts.sourceTree || inspection.binding.cliConfigDigest !== local.configDigest
        || inspection.binding.cliDigest !== local.binaryDigest) fail('INSPECTION_SOURCE_OR_TOOLS_DIFFERENT');
      submissionMarked = journal.present('submission', inspection.before.program);
      if (input.command === 'apply' && submissionMarked) fail('SUBMISSION_ALREADY_MARKED_RECONCILE_ONLY');
      if (input.command === 'reconcile' && !submissionMarked) fail('SUBMISSION_NOT_MARKED');
      if (submissionMarked) {
        const marker = journal.read('submission', inspection.before.program).value;
        if (updateCanonical(marker) !== updateCanonical({ inspectionDigest: inspection.inspectionDigest,
          binding: inspection.binding, beforeProgram: inspection.before.program, submissionState: 'possibly-submitted' })) fail('SUBMISSION_MARKER_DIFFERENT');
      }
    }
    // Reconcile uses the reviewed read-only facade, so no artifact bytes or mutation request can exist in that branch.
    if (input.command === 'reconcile') {
      local.assertOriginalExecutable();
      capability = createPtrInspectionProviderCredentials({ credentials: {
        spacetimeExecutable: local.executable, spacetimeExecutableSha256: local.binaryDigest,
        spacetimeCliRootDirectory: dirname(local.configPath), spacetimeCliConfigPath: local.configPath,
        spacetimeCliConfigSha256: local.configDigest, assertSource: local.assert, assertCliConfig: local.assert,
      } });
    } else {
      local.assert(); local.assertOriginalExecutable();
      built = preparePtrSourceBuiltArtifact({ sourceCommit: source.facts.sourceCommit,
        reattestSource: () => { local.assert(); return source.facts.sourceCommit; }, dependencyCacheRoot: local.dependencyCacheRoot!,
        cliConfigSourcePath: local.configPath, executable: local.executable, environment: local.environment,
        ...(local.materializationParent === undefined ? {} : { materializationParent: local.materializationParent }) });
      local.assertOriginalExecutable(); const bound = artifactBinding(source, built);
      if (bound.cliDigest !== local.binaryDigest || bound.cliConfigDigest !== local.configDigest) fail('ARTIFACT_TOOLS_DIFFERENT');
      // artifactBinding authenticated this exact factory-owned value and required its staged config fields.
      capability = createPtrUpdateProviderCredentials({ artifact: built as Built & PtrUpdateProviderArtifact });
    }
    const heldCapability = capability;
    const assert = () => { local.assert(); built?.assertSourceAndArtifact(); journal.assert(); };
    const request = async (operation: 'health' | 'schema' | 'plan') => {
      assert(); const response = await requestPtrUpdateProvider(heldCapability, { operation });
      try { assert(); const held = Buffer.from(response.bytes); ownedResponseBuffers.push(held); return held; } finally { response.bytes.fill(0); }
    };
    const supportedHost = async () => {
      const bytes = await request('health');
      try { const value = parseExistingUpdateJson(bytes);
        if (value.version !== '2.10.2' || value.package_name !== 'spacetimedb-cloud') fail('HOST_UNSUPPORTED');
      } finally { bytes.fill(0); }
    };
    const observe = async () => {
      const value = await inspectPtrInitialOwnerState({ assertSource: assert, configuration: local.configuration,
        request: async operation => (await requestPtrInspectionProvider(heldCapability, { operation })).bytes });
      if (!value.preservation.installedStateObservedEqual
        || (value.beforeConfiguration !== null && value.afterConfiguration !== null
          && !value.preservation.privateConfigurationObservedEqual)) fail('INSTALLED_STATE_CHANGED');
      readinessBlockers = value.blockers; privateConfigurationObserved = value.beforeConfiguration !== null && value.afterConfiguration !== null;
      // The pure consumer below validates the complete observed snapshot; this cast grants no authority.
      return { state: value.after as PtrInitialOwnerUpdateSnapshot, configuration: privateConfigurationObserved ? value.afterConfiguration : null };
    };
    if (input.command === 'reconcile') {
      assert();
      const response = await requestPtrInspectionProvider(heldCapability, { operation: 'schema-v10' });
      try {
        assert(); const after = await observe();
        const repeated = await requestPtrInspectionProvider(heldCapability, { operation: 'schema-v10' });
        try {
          assert(); if (parsePtrUpdateDefinition(response.bytes).fullDigest !== parsePtrUpdateDefinition(repeated.bytes).fullDigest) fail('DEFINITION_CHANGED_DURING_READ');
          result = classifyPtrInitialOwnerUpdateObservation(inspection!, { state: after.state,
            configuration: after.configuration, installedV10: response.bytes });
        } finally { repeated.bytes.fill(0); }
      } finally { response.bytes.fill(0); }
    } else {
      await supportedHost();
      const priorV10 = await request('schema');
      const baseline = await observe(); const planBytes = await request('plan');
      const repeatedV10 = await request('schema');
      try {
        if (parsePtrUpdateDefinition(priorV10).fullDigest !== parsePtrUpdateDefinition(repeatedV10).fullDigest) fail('DEFINITION_CHANGED_DURING_READ');
        const bound = artifactBinding(source, built!);
        if (input.command === 'prepare-update') {
          inspection = createPtrInitialOwnerUpdateInspection({ binding: bound, before: baseline.state,
            configuration: baseline.configuration, priorV10, candidateDefinition: built!.artifactDescription.definition, planBytes });
          assert(); inspectionFile = journal.write('inspection', inspection.inspectionDigest, inspection); assert();
        } else {
          assertPtrInitialOwnerUpdatePreflight(inspection!, { binding: bound, state: baseline.state,
            configuration: baseline.configuration, priorV10, candidateDefinition: built!.artifactDescription.definition, planBytes });
          assert(); applyRequested = true;
          const response = await requestPtrUpdateProvider(heldCapability, { operation: 'apply',
            migrationToken: inspection!.plan.token, beforeSend: () => {
              // No request on this busy capability inside the hook. Durable exclusive marker precedes transport PUT.
              assert(); local.assertOriginalExecutable(); journal.write('submission', inspection!.before.program, { inspectionDigest: inspection!.inspectionDigest,
                binding: inspection!.binding, beforeProgram: inspection!.before.program, submissionState: 'possibly-submitted' });
              submissionMarked = true; assert();
            } });
          try {
            parseExistingUpdateSuccess(response.bytes, PTR_INITIAL_OWNER_UPDATE_TARGET); acknowledgementReceived = true;
            journal.write('acknowledgement', inspection!.inspectionDigest, { inspectionDigest: inspection!.inspectionDigest,
              responseSha256: sha(response.bytes), response: 'fixed-target-update-success' });
          } finally { response.bytes.fill(0); }
          const installedV10 = await request('schema');
          try {
            const after = await observe(), repeatedInstalledV10 = await request('schema');
            if (parsePtrUpdateDefinition(installedV10).fullDigest !== parsePtrUpdateDefinition(repeatedInstalledV10).fullDigest)
              fail('DEFINITION_CHANGED_DURING_READ');
            result = classifyPtrInitialOwnerUpdateObservation(inspection!, {
              state: after.state, configuration: after.configuration, installedV10 });
          }
          finally { installedV10.fill(0); }
        }
      } finally { priorV10.fill(0); repeatedV10.fill(0); planBytes.fill(0); }
    }
  } catch (failure) {
    error = failure instanceof PtrInitialOwnerUpdateError ? failure.code : 'PTR_INITIAL_OWNER_UPDATE_PROVIDER_BUILD_OR_PROTOCOL_FAILED';
  } finally {
    for (const bytes of ownedResponseBuffers) bytes.fill(0);
    try { if (capability !== undefined) disposePtrUpdateProviderCredentials(capability); credentialCleanupCompleted = true; }
    catch { error ??= 'PTR_INITIAL_OWNER_UPDATE_CREDENTIAL_CLEANUP_FAILED'; }
    try { built?.cleanup(); artifactCleanupCompleted = true; }
    catch { error ??= 'PTR_INITIAL_OWNER_UPDATE_ARTIFACT_CLEANUP_FAILED'; }
    try { local.assert(); local.assertOriginalExecutable(); journal.assert();
      submissionSlotPresent = inspection === undefined ? null : journal.present('submission', inspection.before.program);
      sourcePreserved = true; }
    catch { error = 'PTR_INITIAL_OWNER_UPDATE_SOURCE_CONFIG_OR_JOURNAL_CHANGED'; }
    local.dispose(); cleanupCompleted = credentialCleanupCompleted && artifactCleanupCompleted;
  }
  // Execution completion is distinct from actual candidate installation/resolution. Unresolved effects exit nonzero.
  const operationComplete = error === null && sourcePreserved && cleanupCompleted;
  const candidateInstallationObserved = input.command === 'prepare-update' ? null : result?.outcome === 'observed-preserved-candidate';
  const resolutionComplete = input.command === 'prepare-update' ? null : operationComplete && candidateInstallationObserved === true;
  const commandSucceeded = operationComplete && (input.command === 'prepare-update' || resolutionComplete === true);
  return Object.freeze({ schemaVersion: 1, profile: 'warpkeep-ptr-initial-owner-update-operation-v1', command: input.command,
    source: source.facts, inspectionDigest: inspection?.inspectionDigest ?? input.inspectionDigest ?? null,
    inspectionFile, result, error, sourcePreserved, cleanupCompleted, credentialCleanupCompleted, artifactCleanupCompleted, applyRequested, submissionMarked, submissionSlotPresent,
    acknowledgementReceived, privateConfigurationObserved, readinessBlockers,
    submissionOutcome: (submissionMarked || submissionSlotPresent === true) && result?.outcome !== 'observed-preserved-candidate' ? 'uncertain' : null,
    retryAuthorized: false as const, usableOwnerPtrVerified: false as const, ownerAuthTokenVerified: false as const,
    productionAuthorized: false as const, globalReleaseAuthority: false as const,
    operationComplete, candidateInstallationObserved, resolutionComplete, commandSucceeded });
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    const [command, ...args] = process.argv.slice(2), values = new Map<string, string>();
    for (const argument of args) {
      const match = /^--(source|tree|signer|signer-identity|native-evidence|inspection|out)=(.+)$/u.exec(argument);
      if (!match || values.has(match[1]!)) fail('ARGUMENT_INVALID'); values.set(match[1]!, match[2]!);
    }
    if (!['prepare-update', 'apply', 'reconcile'].includes(command ?? '')
      || ['source', 'tree', 'signer', 'signer-identity', 'out'].some(key => !values.has(key))) fail('ARGUMENT_INVALID');
    const output = resolve(values.get('out')!);
    if (dirname(output) !== join(ROOT, 'artifacts', 'qa') || !/^[A-Za-z0-9-]+\.json$/u.test(output.slice(dirname(output).length + 1))) fail('OUTPUT_PATH_INVALID');
    assertProductionAdminTrustedAncestors(dirname(output));
    // Reserve the reviewable output before an explicit apply can have any provider effect.
    const descriptor = openSync(output, constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY | constants.O_NOFOLLOW, 0o600);
    try {
      fchmodSync(descriptor, 0o600);
      const receipt = await executePtrInitialOwnerUpdate({ command: command as Command, source: {
        sourceCommit: values.get('source')!, sourceTree: values.get('tree')!, signerFingerprint: values.get('signer')!,
        signerIdentity: values.get('signer-identity')!, ...(values.has('native-evidence') ? { nativeEvidence: values.get('native-evidence')! } : {}) },
        environment: process.env, ...(values.has('inspection') ? { inspectionDigest: values.get('inspection')! } : {}) });
      const bytes = Buffer.from(`${JSON.stringify(receipt, null, 2)}\n`);
      if (bytes.length > 256 * 1024) fail('OUTPUT_BOUND');
      try { let offset = 0; while (offset < bytes.length) { const count = writeSync(descriptor, bytes, offset, bytes.length - offset);
        if (count < 1) fail('OUTPUT_WRITE_FAILED'); offset += count; } fsyncSync(descriptor);
        const read = readLocalBindingBoundedFile(output, { maximumBytes: 256 * 1024, expectedUid: 1000, expectedMode: 0o600,
          expectedSha256: sha(bytes) }); read.body.fill(0);
        process.stdout.write(`${JSON.stringify({ path: output, sha256: sha(bytes), inspectionDigest: receipt.inspectionDigest,
          operationComplete: receipt.operationComplete, commandSucceeded: receipt.commandSucceeded,
          resolutionComplete: receipt.resolutionComplete, candidateInstallationObserved: receipt.candidateInstallationObserved,
          submissionOutcome: receipt.submissionOutcome, productionAuthorized: false })}\n`);
      } finally { bytes.fill(0); }
      if (!receipt.commandSucceeded) process.exitCode = 1;
    } finally { closeSync(descriptor); }
  } catch (failure) { process.stderr.write(`${failure instanceof PtrInitialOwnerUpdateError ? failure.code : 'PTR_INITIAL_OWNER_UPDATE_FAILED'}\n`); process.exitCode = 1; }
}
