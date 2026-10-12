// Separate one-time compatibility bootstrap. Unknown pre-update private state is never fabricated.
import { createHash } from 'node:crypto';
import { closeSync, constants, existsSync, fchmodSync, fstatSync, fsyncSync, lstatSync, mkdirSync, openSync, realpathSync, writeSync } from 'node:fs';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { capturePtrInitialOwnerSource, inspectPtrInitialOwnerState, type PtrInitialOwnerSource } from './ptr-initial-owner-operator';
import { openPtrInitialOwnerUpdateJournal } from './ptr-initial-owner-update-operator';
import { preparePtrSourceBuiltArtifact, assertPtrSourceBuiltArtifact } from './ptr-production-publisher.mjs';
import { createPtrUpdateProviderCredentials, createPtrInspectionProviderCredentials, disposePtrUpdateProviderCredentials,
  requestPtrInspectionProvider, requestPtrUpdateProvider, type PtrUpdateProviderArtifact } from './ptr-update-provider-credentials.mjs';
import { readLocalBindingBoundedFile } from './local-binding-bounded-file.mjs';
import { assertProductionAdminTrustedAncestors, defaultProductionAdminStateDirectory,
  ensureCanonicalProductionAdminStateDirectory } from './production-admin-token-budget.mjs';
import { takePtrProductionAdminSecret } from './ptr-production-admin-token';
import { verifyAuthBridgeRpcRoleAttestation } from './auth-bridge-config-attestation.mjs';
import { parseExistingUpdateJson, updateCanonical } from './sealed-realms-existing-update-protocol.mjs';
import { parsePtrUpdateDefinition } from './ptr-update-definition-policy.mjs';
import { PTR_BOOTSTRAP_TARGET, createPtrBootstrapInspection, validatePtrBootstrapInspection, classifyPtrBootstrapAfter,
  performPtrBootstrapOnce, PtrCompatibilityBootstrapError, type PtrBootstrapBinding } from './ptr-compatibility-bootstrap-core.mjs';

const ROOT = resolve(import.meta.dirname, '..'), HASH = /^[a-f0-9]{64}$/u;
const hash = (body: Uint8Array) => createHash('sha256').update(body).digest('hex');
const fail: (code: string) => never = code => { throw new PtrCompatibilityBootstrapError(code); };
type Built = ReturnType<typeof preparePtrSourceBuiltArtifact>;
/** Storage only: persist every created ancestor entry before admitting a submission marker. */
export function openPtrCompatibilityBootstrapJournal(create: boolean) {
  const parent = create ? ensureCanonicalProductionAdminStateDirectory() : defaultProductionAdminStateDirectory();
  assertProductionAdminTrustedAncestors(parent);
  const root = join(parent, 'ptr-compatibility-bootstrap-v1');
  if (create && !existsSync(root)) mkdirSync(root, { mode: 0o700 });
  const stat = lstatSync(root);
  if (!stat.isDirectory() || stat.isSymbolicLink() || realpathSync(root) !== root || stat.uid !== 1000
    || (stat.mode & 0o7777) !== 0o700) fail('JOURNAL_DIRECTORY_INVALID');
  // Existing reviewed exclusive/fsynced IO is reused; its storage profile grants no update authority.
  const store = openPtrInitialOwnerUpdateJournal(root, create);
  const privateRoot = dirname(dirname(parent)), home = dirname(privateRoot);
  if (parent !== join(home, '.warpkeep', 'private', 'production-admin-v1')) fail('JOURNAL_PARENT_INVALID');
  const directories = [join(root, 'ptr-initial-owner-updates-v1'), root, parent, dirname(parent), privateRoot, home];
  const identity = (path: string) => {
    const value = lstatSync(path, { bigint: true });
    if (!value.isDirectory() || value.isSymbolicLink() || realpathSync(path) !== path || value.uid !== 1000n
      || (path === home ? (value.mode & 0o022n) !== 0n : (value.mode & 0o7777n) !== 0o700n)) fail('JOURNAL_ANCESTOR_INVALID');
    return `${value.dev}:${value.ino}:${value.mode}:${value.uid}:${value.gid}`;
  };
  const original = directories.map(path => ({ path, identity: identity(path) }));
  for (const fact of original) {
    const fd = openSync(fact.path, constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW);
    try {
      const value = fstatSync(fd, { bigint: true });
      if (`${value.dev}:${value.ino}:${value.mode}:${value.uid}:${value.gid}` !== fact.identity
        || identity(fact.path) !== fact.identity) fail('JOURNAL_ANCESTOR_CHANGED');
      // Child first, then its parent: this also persists newly created production-admin ancestors.
      if (create) fsyncSync(fd);
      const finished = fstatSync(fd, { bigint: true });
      if (`${finished.dev}:${finished.ino}:${finished.mode}:${finished.uid}:${finished.gid}` !== fact.identity
        || identity(fact.path) !== fact.identity) fail('JOURNAL_ANCESTOR_CHANGED');
    } finally { closeSync(fd); }
  }
  return Object.freeze({ ...store, assert() {
    store.assert();
    if (original.some(fact => identity(fact.path) !== fact.identity)) fail('JOURNAL_ANCESTOR_CHANGED');
  } });
}
function builtBinding(source: ReturnType<typeof capturePtrInitialOwnerSource>, built: Built): PtrBootstrapBinding {
  assertPtrSourceBuiltArtifact(built);
  if (built.sourceCommit !== source.facts.sourceCommit || !built.spacetimeCliConfigSha256
    || !built.assertCliConfig || !built.spacetimeCliRootDirectory || !built.spacetimeCliConfigPath) fail('ARTIFACT_CONFIG_INVALID');
  return Object.freeze({ sourceCommit: source.facts.sourceCommit, sourceTree: source.facts.sourceTree,
    databaseIdentity: PTR_BOOTSTRAP_TARGET, candidateProgram: built.moduleProgramHash,
    candidateSha256: built.moduleSha256, candidateDescriptionDigest: built.artifactDescription.descriptionSha256,
    moduleTreeId: built.moduleTreeId, dependencyClosureDigest: built.dependencyClosureDigest,
    cliDigest: built.spacetimeExecutableSha256, cliConfigDigest: built.spacetimeCliConfigSha256 });
}
export async function executePtrCompatibilityBootstrap(input: Readonly<{ command: 'bootstrap' | 'reconcile';
  source: PtrInitialOwnerSource; environment: NodeJS.ProcessEnv; inspectionDigest?: string }>) {
  if (process.platform !== 'linux' || process.arch !== 'x64' || process.getuid?.() !== 1000) fail('PLATFORM_INVALID');
  if (!['bootstrap', 'reconcile'].includes(input.command)
    || (input.command === 'bootstrap' ? input.inspectionDigest !== undefined : !HASH.test(input.inspectionDigest ?? ''))) fail('ARGUMENT_INVALID');
  const source = capturePtrInitialOwnerSource(ROOT, input.source), env = { ...input.environment };
  const configPath = env.WARPKEEP_SPACETIME_CLI_CONFIG_PATH, executable = env.WARPKEEP_SPACETIME_EXECUTABLE ?? env.SPACETIME_BIN;
  const cache = env.WKGR_PRODUCTION_DEPENDENCY_CACHE_ROOT, materialization = env.WK_PTR_MATERIALIZATION_PARENT;
  if (typeof configPath !== 'string' || !isAbsolute(configPath) || realpathSync(configPath) !== configPath
    || typeof executable !== 'string' || !isAbsolute(executable) || realpathSync(executable) !== executable
    || (input.command === 'bootstrap' && (typeof cache !== 'string' || !isAbsolute(cache) || realpathSync(cache) !== cache))
    || (materialization !== undefined && (!isAbsolute(materialization) || realpathSync(materialization) !== materialization))
    || ['WARPKEEP_SPACETIMEDB_URI', 'WARPKEEP_SPACETIMEDB_DATABASE', 'WARPKEEP_PTR_SPACETIMEDB_DATABASE', 'WARPKEEP_AUTH_BRIDGE_URL']
      .some(key => env[key] !== undefined)) fail('ENVIRONMENT_INVALID');
  for (const directory of [dirname(configPath), dirname(executable), ...(input.command === 'bootstrap' ? [cache!] : []),
    ...(materialization === undefined ? [] : [materialization])]) assertProductionAdminTrustedAncestors(directory);
  const config = readLocalBindingBoundedFile(configPath, { minimumBytes: 1, maximumBytes: 64 * 1024, expectedUid: 1000, expectedMode: 0o600 });
  const configSha = hash(config.body); config.body.fill(0);
  const binary = readLocalBindingBoundedFile(executable, { minimumBytes: 1, maximumBytes: 256 * 1024 * 1024,
    requireExecutable: true, rejectWritableExecutable: true });
  const binarySha = hash(binary.body); binary.body.fill(0);
  const assertLocal = () => {
    source.assert();
    readLocalBindingBoundedFile(configPath, { maximumBytes: 64 * 1024, expectedUid: 1000, expectedMode: 0o600,
      expectedIdentity: config.identity, expectedSha256: configSha }).body.fill(0);
    readLocalBindingBoundedFile(executable, { maximumBytes: 256 * 1024 * 1024, requireExecutable: true,
      rejectWritableExecutable: true, expectedIdentity: binary.identity, expectedSha256: binarySha }).body.fill(0);
  };
  const ownedResponseBuffers: Buffer[] = [];
  let built: Built | undefined, capability: ReturnType<typeof createPtrUpdateProviderCredentials> | undefined,
    secret: string | undefined, journal: ReturnType<typeof openPtrCompatibilityBootstrapJournal> | undefined;
  let result: Awaited<ReturnType<typeof performPtrBootstrapOnce>> | null = null,
    error: string | null = null, credentialCleanupCompleted = false, artifactCleanupCompleted = false, sourcePreserved = false;
  const safe = (failure: unknown) => failure instanceof PtrCompatibilityBootstrapError ? failure.code : 'PTR_COMPATIBILITY_BOOTSTRAP_PROVIDER_BUILD_OR_PROTOCOL_FAILED';
  try {
    journal = openPtrCompatibilityBootstrapJournal(input.command === 'bootstrap');
    // Even an interrupted/empty submission slot closes further bootstrap attempts before building.
    if (input.command === 'bootstrap' && journal.present('submission', PTR_BOOTSTRAP_TARGET)) fail('SUBMISSION_ALREADY_MARKED_RECONCILE_ONLY');
    try { secret = takePtrProductionAdminSecret(env); } catch { secret = undefined; }
    delete env.WARPKEEP_ADMIN_TOKEN_SECRET;
    if (input.command === 'bootstrap') {
      assertLocal();
      built = preparePtrSourceBuiltArtifact({ sourceCommit: source.facts.sourceCommit, reattestSource: () => { assertLocal(); return source.facts.sourceCommit; },
        dependencyCacheRoot: cache!, cliConfigSourcePath: configPath, executable, environment: env,
        ...(materialization === undefined ? {} : { materializationParent: materialization }) });
      const binding = builtBinding(source, built);
      if (binding.cliDigest !== binarySha || binding.cliConfigDigest !== configSha) fail('ARTIFACT_TOOLS_DIFFERENT');
      capability = createPtrUpdateProviderCredentials({ artifact: built as Built & PtrUpdateProviderArtifact });
    } else capability = createPtrInspectionProviderCredentials({ credentials: { spacetimeExecutable: executable,
      spacetimeExecutableSha256: binarySha, spacetimeCliRootDirectory: dirname(configPath), spacetimeCliConfigPath: configPath,
      spacetimeCliConfigSha256: configSha, assertSource: assertLocal, assertCliConfig: assertLocal } });
    const held = capability, store = journal;
    const assert = () => { assertLocal(); built?.assertSourceAndArtifact(); store.assert(); };
    const read = async (operation: 'metadata' | 'health' | 'schema' | 'plan') => {
      assert(); const response = await requestPtrUpdateProvider(held, { operation }); ownedResponseBuffers.push(response.bytes); assert(); return response;
    };
    const readPrivate = async (operation: 'schema-v9' | 'schema-v10') => {
      assert(); const response = await requestPtrInspectionProvider(held, { operation }); ownedResponseBuffers.push(response.bytes); assert(); return response.bytes;
    };
    const configuration = async () => { assert(); if (secret === undefined) fail('PRIVATE_BRIDGE_CONFIG_UNOBSERVED');
      const value = await verifyAuthBridgeRpcRoleAttestation({ adminToken: secret }); assert(); return value; };
    const observeAfter = async () => {
      const installedV9 = await readPrivate('schema-v9'), installedV10 = await readPrivate('schema-v10');
      try {
        const observed = await inspectPtrInitialOwnerState({ assertSource: assert, configuration,
          request: async operation => (await requestPtrInspectionProvider(held, { operation })).bytes });
        const v9Repeat = await readPrivate('schema-v9'), v10Repeat = await readPrivate('schema-v10');
        try {
          if (!observed.preservation.installedStateObservedEqual || !installedV9.equals(v9Repeat)
            || parsePtrUpdateDefinition(installedV10).fullDigest !== parsePtrUpdateDefinition(v10Repeat).fullDigest) fail('AFTER_CHANGED_DURING_READ');
          // These are complete post-update private observations, not a comparison with unknown pre-update rows.
          return { state: observed.after, installedV9: Buffer.from(installedV9), installedV10: Buffer.from(installedV10) };
        } finally { v9Repeat.fill(0); v10Repeat.fill(0); }
      } finally { installedV9.fill(0); installedV10.fill(0); }
    };
    if (input.command === 'bootstrap') {
      const artifact = built!;
      result = await performPtrBootstrapOnce({ assert, journal: store, observeBefore: async () => {
        const health = await read('health');
        try { const value = parseExistingUpdateJson(health.bytes); if (value.version !== '2.10.2' || value.package_name !== 'spacetimedb-cloud') fail('HOST_UNSUPPORTED'); }
        finally { health.bytes.fill(0); }
        const metadata = await read('metadata'), priorV9 = await readPrivate('schema-v9'), priorV10 = await read('schema');
        let plan: Awaited<ReturnType<typeof read>> | undefined;
        try {
          plan = await read('plan');
          return createPtrBootstrapInspection({ binding: builtBinding(source, artifact), metadataBytes: metadata.bytes,
            claimedProviderIdentity: metadata.claimedProviderIdentity, priorV9, priorV10: priorV10.bytes,
            candidateDefinition: artifact.artifactDescription.definition, planBytes: plan.bytes });
        } finally { metadata.bytes.fill(0); priorV9.fill(0); priorV10.bytes.fill(0); plan?.bytes.fill(0); }
      }, apply: async (migrationToken, beforeSend) => (await requestPtrUpdateProvider(held, { operation: 'apply', migrationToken, beforeSend })).bytes,
      observeAfter });
    } else {
      const record = validatePtrBootstrapInspection(store.read('inspection', input.inspectionDigest!).value);
      if (record.inspectionDigest !== input.inspectionDigest || record.binding.sourceCommit !== source.facts.sourceCommit
        || record.binding.sourceTree !== source.facts.sourceTree || record.binding.cliDigest !== binarySha
        || record.binding.cliConfigDigest !== configSha) fail('INSPECTION_SOURCE_OR_TOOLS_DIFFERENT');
      const marker = store.read('submission', PTR_BOOTSTRAP_TARGET).value;
      if (updateCanonical(marker) !== updateCanonical({ inspectionDigest: record.inspectionDigest, binding: record.binding,
        programBefore: null, rowsBefore: null, submissionState: 'possibly-submitted' })) fail('SUBMISSION_MARKER_DIFFERENT');
      const after = await observeAfter();
      try { result = { inspectionDigest: record.inspectionDigest, submissionMarked: true, submissionSlotPresent: true, acknowledgementReceived: false,
        acknowledgementError: null, result: classifyPtrBootstrapAfter(record, after), error: null,
        candidateInstallationObserved: true, submissionOutcome: null, retryAuthorized: false,
        preRowEqualityObserved: false, productionAuthorized: false, globalReleaseAuthority: false }; }
      finally { after.installedV9.fill(0); after.installedV10.fill(0); }
    }
  } catch (failure) { error = safe(failure); }
  finally {
    for (const bytes of ownedResponseBuffers) bytes.fill(0);
    secret = undefined; delete env.WARPKEEP_ADMIN_TOKEN_SECRET;
    try { if (capability !== undefined) disposePtrUpdateProviderCredentials(capability); credentialCleanupCompleted = true; }
    catch { error ??= 'PTR_COMPATIBILITY_BOOTSTRAP_CREDENTIAL_CLEANUP_FAILED'; }
    try { built?.cleanup(); artifactCleanupCompleted = true; }
    catch { error ??= 'PTR_COMPATIBILITY_BOOTSTRAP_ARTIFACT_CLEANUP_FAILED'; }
    try { assertLocal(); journal?.assert(); sourcePreserved = true; }
    catch { error = 'PTR_COMPATIBILITY_BOOTSTRAP_SOURCE_CONFIG_OR_JOURNAL_CHANGED'; }
  }
  return Object.freeze({ schemaVersion: 1, profile: 'warpkeep-ptr-compatibility-bootstrap-operation-v1', command: input.command,
    source: source.facts, result, error, sourcePreserved, credentialCleanupCompleted, artifactCleanupCompleted,
    commandSucceeded: error === null && result?.error === null && result.candidateInstallationObserved === true
      && sourcePreserved && credentialCleanupCompleted && artifactCleanupCompleted,
    programBefore: null, rowsBefore: null, preRowEqualityObserved: false, retryAuthorized: false,
    usableOwnerPtrVerified: false, fullNativeAuthority: false, productionAuthorized: false, globalReleaseAuthority: false });
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    const [command, ...args] = process.argv.slice(2), values = new Map<string, string>();
    for (const argument of args) { const match = /^--(source|tree|signer|signer-identity|native-evidence|inspection|out)=(.+)$/u.exec(argument);
      if (!match || values.has(match[1]!)) fail('ARGUMENT_INVALID'); values.set(match[1]!, match[2]!); }
    if (!['bootstrap', 'reconcile'].includes(command ?? '') || ['source', 'tree', 'signer', 'signer-identity', 'out'].some(key => !values.has(key))) fail('ARGUMENT_INVALID');
    const output = resolve(values.get('out')!);
    if (dirname(output) !== join(ROOT, 'artifacts', 'qa') || !/^[A-Za-z0-9-]+\.json$/u.test(output.slice(dirname(output).length + 1))) fail('OUTPUT_PATH_INVALID');
    assertProductionAdminTrustedAncestors(dirname(output));
    const fd = openSync(output, constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY | constants.O_NOFOLLOW, 0o600);
    try {
      fchmodSync(fd, 0o600);
      const reserved = fstatSync(fd, { bigint: true });
      if (!reserved.isFile() || reserved.nlink !== 1n || reserved.size !== 0n || reserved.uid !== 1000n) fail('OUTPUT_IDENTITY_INVALID');
      const receipt = await executePtrCompatibilityBootstrap({ command: command as 'bootstrap' | 'reconcile', source: {
        sourceCommit: values.get('source')!, sourceTree: values.get('tree')!, signerFingerprint: values.get('signer')!, signerIdentity: values.get('signer-identity')!,
        ...(values.has('native-evidence') ? { nativeEvidence: values.get('native-evidence')! } : {}) }, environment: process.env,
        ...(values.has('inspection') ? { inspectionDigest: values.get('inspection')! } : {}) });
      const bytes = Buffer.from(`${JSON.stringify(receipt, null, 2)}\n`);
      if (bytes.length > 256 * 1024) fail('OUTPUT_BOUND');
      const current = fstatSync(fd, { bigint: true }), byPath = lstatSync(output, { bigint: true });
      if (['dev', 'ino', 'mode', 'uid', 'gid', 'nlink', 'size', 'mtimeNs', 'ctimeNs'].some(key =>
        current[key as keyof typeof current] !== reserved[key as keyof typeof reserved]
        || byPath[key as keyof typeof byPath] !== reserved[key as keyof typeof reserved]) || byPath.isSymbolicLink()) fail('OUTPUT_CHANGED');
      for (let offset = 0; offset < bytes.length;) { const count = writeSync(fd, bytes, offset, bytes.length - offset); if (count < 1) fail('OUTPUT_WRITE_FAILED'); offset += count; }
      fsyncSync(fd);
      const finished = fstatSync(fd, { bigint: true });
      const identity = { dev: String(finished.dev), ino: String(finished.ino), mode: String(finished.mode), uid: String(finished.uid),
        nlink: String(finished.nlink), size: String(finished.size), mtimeNs: String(finished.mtimeNs), ctimeNs: String(finished.ctimeNs) };
      readLocalBindingBoundedFile(output, { maximumBytes: 256 * 1024, expectedMode: 0o600, expectedUid: 1000,
        expectedIdentity: identity, expectedSha256: hash(bytes) }).body.fill(0);
      if (!receipt.commandSucceeded) process.exitCode = 1;
      process.stdout.write(`${JSON.stringify({ path: output, sha256: hash(bytes), commandSucceeded: receipt.commandSucceeded })}\n`);
    } finally { closeSync(fd); }
  } catch (failure) { process.stderr.write(`${failure instanceof PtrCompatibilityBootstrapError ? failure.code : 'PTR_COMPATIBILITY_BOOTSTRAP_FAILED'}\n`); process.exitCode = 1; }
}
