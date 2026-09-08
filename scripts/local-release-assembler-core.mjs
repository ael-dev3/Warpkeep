import { OPERATION_BUNDLE_NOBLE_GRAPH_FILES } from './local-operation-bundle-noble-v1.mjs';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { closeSync, constants, fchmodSync, fsyncSync, lstatSync, openSync, readdirSync,
  realpathSync, renameSync, statfsSync, writeFileSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { readLocalBindingBoundedFile } from './local-binding-bounded-file.mjs';
import { capturePreparedLinuxReleaseWorkspace } from './local-release-workspace.mjs';
import { derivePreparedLinuxArtifactInputs } from './local-release-artifact-inputs.mjs';
import { acquirePreparedReleaseCandidateLock } from './local-release-candidate-lock.mjs';
import { decodePreparedReleaseJournal } from './local-release-recovery-journal.mjs';
import { recoverPreparedReleaseTransaction, recoverPreparedReleaseTransactionUnderLock } from './local-release-transaction-recovery.mjs';
import { verifyPreparedReleaseCandidateBytes } from './local-release-candidate-verification.mjs';
import { validateLocalBindingYamlManifest } from './local-binding-runtime-core.mjs';

const ROOT = '/home/snapmeter/.warpkeep/release-preparation-v1';
const RUNS = `${ROOT}/runs`;
const NODE = `${ROOT}/toolchain/node-v22.22.3-linux-x64/bin/node`;
const NODE_SHA = 'e6ec2c188d83d813f81f2de8aea084d74dce603ac1abedd0a30ad941b10087b2';
const GIT_SHA = '2a8c18fbf43da9f692d75474c72bea9dfd796c260b0f3dfe456376abc3bbd668';
const PROFILE = 'warpkeep-spacetime-binding-final-preparation-linux-x64-v1';
const SOURCE_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const exists = path => lstatSync(path, { throwIfNoEntry: false }) !== undefined;
function fail(suffix) { throw new Error(`LOCAL_RELEASE_ASSEMBLER_${suffix}`); }
function phase(name, data = {}) { process.stdout.write(`${JSON.stringify({ phase: name, ...data })}\n`); }

function privateDirectory(path) {
  const value = lstatSync(path, { bigint: true });
  if (!value.isDirectory() || value.isSymbolicLink() || value.uid !== 1000n
    || (value.mode & 0o7777n) !== 0o700n || realpathSync(path) !== path
    || statfsSync(path).type !== 0xef53) fail('DIRECTORY_INVALID');
  return value;
}
function attestHost() {
  if (process.platform !== 'linux' || process.arch !== 'x64' || process.getuid?.() !== 1000
    || process.execPath !== NODE || process.versions.node !== '22.22.3' || process.execArgv.length !== 0
    || process.env.NODE_OPTIONS || process.env.NODE_PATH || process.env.ESBUILD_BINARY_PATH
    || process.env.ESBUILD_WORKER_THREADS
    || Object.keys(process.env).some(name => /TOKEN|SECRET|PASSWORD|CREDENTIAL|AUTH|COOKIE|API_KEY/iu.test(name))) {
    fail('HOST_INVALID');
  }
  for (const path of [ROOT, RUNS, join(ROOT, 'toolchain'), dirname(dirname(NODE)), dirname(NODE)]) privateDirectory(path);
  readLocalBindingBoundedFile(NODE, { maximumBytes: 124819136, expectedBytes: 124819136,
    expectedSha256: NODE_SHA, expectedUid: 1000, requireExecutable: true,
    rejectWritableExecutable: true, discardBody: true });
  readLocalBindingBoundedFile('/usr/bin/git', { maximumBytes: 64 * 1024 * 1024,
    expectedSha256: GIT_SHA, expectedUid: 0, requireExecutable: true,
    rejectWritableExecutable: true, discardBody: true });
}
function git(root, args, maximum = 4096) {
  const result = spawnSync('/usr/bin/git', ['--no-replace-objects', '-c', 'core.hooksPath=/dev/null',
    '-c', 'core.fsmonitor=false', ...args], { cwd: root, shell: false,
    env: { PATH: '/usr/bin:/bin', HOME: '/nonexistent', GIT_CONFIG_NOSYSTEM: '1',
      GIT_CONFIG_GLOBAL: '/dev/null', GIT_OPTIONAL_LOCKS: '0' },
    timeout: 10000, killSignal: 'SIGKILL', maxBuffer: maximum });
  if (result.error !== undefined || result.signal !== null || result.status !== 0 || result.stderr.length !== 0) fail('SOURCE_INVALID');
  return result.stdout;
}
function identity(root) {
  const sourceCommit = git(root, ['rev-parse', '--verify', 'HEAD']).toString().trim();
  const sourceTree = git(root, ['rev-parse', '--verify', 'HEAD^{tree}']).toString().trim();
  if (!/^[a-f0-9]{40}$/u.test(sourceCommit) || !/^[a-f0-9]{40}$/u.test(sourceTree)) fail('SOURCE_INVALID');
  return { profile: PROFILE, sourceCommit, sourceTree };
}
function sameSource(left, right) {
  if (['profile', 'sourceCommit', 'sourceTree'].some(key => left[key] !== right[key])) fail('SOURCE_MISMATCH');
}
function assertOperatingSource(expected) {
  sameSource(identity(SOURCE_ROOT), expected);
  if (git(SOURCE_ROOT, ['status', '--porcelain=v1', '--untracked-files=no'], 4 * 1024 * 1024).length !== 0) fail('SOURCE_DIRTY');
  // Compare all executable preparation sources with Git bytes, including files
  // hidden by assume-unchanged/index flags. Untracked diagnostics stay outside
  // authority, and each operating entry must itself be tracked.
  const entries = git(SOURCE_ROOT, ['ls-tree', '-r', '-l', '-z', expected.sourceTree, '--', 'scripts'], 1024 * 1024)
    .toString('utf8').split('\0').filter(Boolean);
  const required = new Set([
    'local-release-assembler.mjs', 'local-release-assembler-core.mjs', 'local-release-candidate-verification.mjs',
    'local-release-workspace.mjs', 'local-release-artifact-inputs.mjs', 'local-release-candidate-lock.mjs',
    'local-release-transaction-install.mjs', 'local-release-transaction-recovery.mjs', 'local-release-recovery-journal.mjs',
    'local-binding-bounded-file.mjs', 'local-binding-runtime.mjs', 'local-binding-runtime-core.mjs',
    'local-operation-bundle-runtime.mjs', 'local-operation-bundle-runtime-core.mjs', 'local-recovery-bundle-runtime.mjs',
    'local-prepared-closure-scanner.mjs', 'local-prepared-closure-scanner-archive.mjs',
    'local-prepared-closure-scanner-namespace.mjs', 'local-prepared-closure-scanner-v1.json',
    'local-prepared-closure-family.mjs', 'local-prepared-closure-inventory.mjs', 'local-prepared-source-pins.mjs',
    'auth-bridge-notification-prepared-deploy-closure-policy.mjs', 'auth-bridge-notification-prepared-deploy-closure.mjs',
    'verify-0.4.0-sealed-launch.mjs',
  ].map(path => `scripts/${path}`));
  for (const entry of entries) {
    const match = /^(100644|100755) blob ([a-f0-9]{40}) +([0-9]+)\t(scripts\/[^\0]+)$/u.exec(entry);
    if (!match || /[\\\x00-\x1f\x7f]/u.test(match[4])) fail('SOURCE_INVALID');
    const [, mode, oid, sizeText, path] = match;
    const size = Number(sizeText);
    if (!Number.isSafeInteger(size) || size > 16 * 1024 * 1024) fail('SOURCE_INVALID');
    const opened = readLocalBindingBoundedFile(join(SOURCE_ROOT, path), { maximumBytes: 16 * 1024 * 1024,
      expectedBytes: size, expectedUid: 1000, expectedMode: mode === '100644' ? 0o644 : 0o755 });
    try {
      if (createHash('sha1').update(`blob ${size}\0`).update(opened.body).digest('hex') !== oid) fail('SOURCE_CHANGED');
    } finally { opened.body.fill(0); }
    required.delete(path);
  }
  if (required.size !== 0) fail('SOURCE_UNCOMMITTED');
}
function openHandle(handle) {
  if (typeof handle !== 'string' || !/^release-workspace-[a-f0-9]{32}$/u.test(handle)) fail('HANDLE_INVALID');
  const operationRoot = join(RUNS, handle);
  const before = privateDirectory(operationRoot);
  const sourceRoot = join(operationRoot, 'source');
  const candidateRoot = join(operationRoot, 'candidate');
  privateDirectory(sourceRoot); privateDirectory(candidateRoot);
  const source = identity(sourceRoot);
  sameSource(identity(candidateRoot), source);
  return { ...source, handle, operationRoot, sourceRoot, candidateRoot,
    assertActive() {
      const after = privateDirectory(operationRoot);
      if (['dev', 'ino', 'uid', 'mode'].some(key => before[key] !== after[key])) fail('DIRECTORY_CHANGED');
      sameSource(identity(sourceRoot), source); sameSource(identity(candidateRoot), source);
    } };
}
function readTransaction(context, expectedId) {
  const control = join(context.candidateRoot, '.git', 'warpkeep-release-assembly-v1');
  privateDirectory(control);
  const names = readdirSync(control);
  if (names.length !== 1 || !/^[a-f0-9]{32}$/u.test(names[0]) || (expectedId && names[0] !== expectedId)) fail('TRANSACTION_INVALID');
  const transactionId = names[0];
  const root = join(control, transactionId);
  privateDirectory(root);
  const path = join(root, 'journal.json');
  const opened = readLocalBindingBoundedFile(path, { maximumBytes: 2 * 1024 * 1024, expectedUid: 1000, expectedMode: 0o600 });
  let journal;
  let journalSha256;
  try { journal = decodePreparedReleaseJournal(opened.body); journalSha256 = sha(opened.body); }
  finally { opened.body.fill(0); }
  const candidate = lstatSync(context.candidateRoot, { bigint: true });
  sameSource(journal, context);
  if (journal.transactionId !== transactionId || journal.candidate.dev !== String(candidate.dev)
    || journal.candidate.ino !== String(candidate.ino)) fail('TRANSACTION_INVALID');
  return { transactionId, journal, journalSha256, path, identity: opened.identity,
    rolledBack: exists(join(root, 'rolled-back.json')) || exists(join(root, 'rolled-back.pending')) };
}
function checkJournalFiles(transaction, files) {
  if (transaction.rolledBack || transaction.journal.entries.length !== files.length) fail('TRANSACTION_INVALID');
  for (let index = 0; index < files.length; index++) {
    const entry = transaction.journal.entries[index];
    const file = files[index];
    if (entry.path !== file.path || entry.after.size !== file.bytes.length || entry.after.sha256 !== sha(file.bytes)) fail('TRANSACTION_MISMATCH');
  }
  readLocalBindingBoundedFile(transaction.path, { maximumBytes: 2 * 1024 * 1024,
    expectedUid: 1000, expectedMode: 0o600, expectedSha256: transaction.journalSha256,
    expectedIdentity: transaction.identity, discardBody: true });
}
function sortFiles(files) {
  const sorted = [...files].sort((left, right) => left.path < right.path ? -1 : left.path > right.path ? 1 : 0);
  if (sorted.some((file, index) => index && sorted[index - 1].path === file.path)) fail('DUPLICATE_OUTPUT');
  return sorted;
}
function sameFiles(left, right) {
  if (left.length !== right.length || left.some((file, index) => file.path !== right[index].path
    || !Buffer.from(file.bytes).equals(Buffer.from(right[index].bytes)))) fail('NONCONVERGENCE');
}
function verifyCompiledInputs(inputs, candidateRoot) {
  const bundleFile = inputs.bundles.files.find(file => file.path === 'scripts/sealed-realms-production-bundle-manifest-v1.json');
  const bundleManifest = JSON.parse(Buffer.from(bundleFile.bytes).toString('utf8'));
  const yamlBody = readLocalBindingBoundedFile(join(candidateRoot, 'scripts/local-binding-runtime-yaml-v1.json'),
    { maximumBytes: 1024 * 1024, expectedUid: 1000 }).body;
  let yaml;
  try { yaml = validateLocalBindingYamlManifest(yamlBody.toString('utf8')); }
  finally { yamlBody.fill(0); }
  let checkedBundleInputs = 0;
  for (const bundle of bundleManifest.bundles) {
    for (const member of bundle.graphManifest) {
      // These package bytes are verified against the immutable archive inventory;
      // the isolated producer reattests the full package namespace after compiling.
      if (member.path.startsWith('node_modules/@noble/hashes/')) {
        const pinned = OPERATION_BUNDLE_NOBLE_GRAPH_FILES.find(file => member.path === `node_modules/@noble/hashes/${file.path}`);
        if (!pinned || pinned.bytes !== member.byteLength || pinned.sha256 !== member.sha256) fail('DEPENDENCY_INVALID');
        checkedBundleInputs++;
        continue;
      }
      let path = join(candidateRoot, member.path);
      if (member.path.startsWith('node_modules/')) {
        const prefix = 'node_modules/yaml/';
        const pinned = member.path.startsWith(prefix) ? yaml.files.find(file => file.path === member.path.slice(prefix.length)) : undefined;
        if (!pinned || pinned.bytes !== member.byteLength || pinned.sha256 !== member.sha256) fail('DEPENDENCY_INVALID');
        path = join(ROOT, 'toolchain/yaml-2.9.0/package', pinned.path);
      }
      readLocalBindingBoundedFile(path, { maximumBytes: 8 * 1024 * 1024, expectedUid: 1000,
        expectedBytes: member.byteLength, expectedSha256: member.sha256, discardBody: true });
      checkedBundleInputs++;
    }
  }
  const recoveryFile = inputs.recovery.files.find(file => file.path === 'scripts/recovery-workflow-bundle-manifest-v1.json');
  const recoveryManifest = JSON.parse(Buffer.from(recoveryFile.bytes).toString('utf8'));
  if (recoveryManifest.sourceCommit !== inputs.sourceCommit || recoveryManifest.sourceTree !== inputs.sourceTree
    || recoveryManifest.bundle.path !== inputs.recovery.path || recoveryManifest.bundle.sha256 !== inputs.recovery.sha256
    || JSON.stringify(recoveryManifest.compilerInputs) !== JSON.stringify(inputs.recovery.inputs)) fail('RECOVERY_INVALID');
  for (const member of inputs.recovery.inputs) {
    if (!member.path.startsWith('node_modules/')) readLocalBindingBoundedFile(join(candidateRoot, member.path),
      { maximumBytes: 4 * 1024 * 1024, expectedUid: 1000, expectedBytes: member.byteLength,
        expectedSha256: member.sha256, discardBody: true });
  }
  return { checkedBundleInputs, checkedRecoveryInputs: inputs.recovery.inputs.length };
}
async function verifyFamily(context, inputs, closure, files, deriveClosure, scanner, owned) {
  context.assertActive(); scanner.assertUnchanged();
  const bytes = verifyPreparedReleaseCandidateBytes({ sourceRoot: context.sourceRoot,
    candidateRoot: context.candidateRoot, sourceCommit: context.sourceCommit, sourceTree: context.sourceTree, files });
  const compiled = verifyCompiledInputs(inputs, context.candidateRoot);
  const verifier = await import(pathToFileURL(join(context.candidateRoot, 'scripts/auth-bridge-notification-prepared-deploy-closure.mjs')).href);
  const checked = verifier.verifyAuthBridgeNotificationPreparedDeployClosure({ repositoryRoot: context.candidateRoot });
  if (checked.memberCount !== closure.memberCount) fail('CLOSURE_MISMATCH');
  const repeated = await deriveClosure({ repositoryRoot: context.candidateRoot });
  owned.push(...repeated.files.map(file => file.bytes));
  sameFiles(closure.files, repeated.files);
  if (repeated.manifestSha256 !== closure.manifestSha256) fail('NONCONVERGENCE');
  scanner.assertUnchanged(); context.assertActive(); assertOperatingSource(inputs);
  return { ...bytes, ...compiled };
}
function sync(path, directory = false) {
  const descriptor = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW | (directory ? constants.O_DIRECTORY : 0));
  try { fsyncSync(descriptor); } finally { closeSync(descriptor); }
}
function complete(context, transaction, files, closure, scanner, verification) {
  const familySha256 = sha(Buffer.from(files.map(file => `${file.path}\0${file.bytes.length}\0${sha(file.bytes)}\n`).join('')));
  const result = { schemaVersion: 1, profile: PROFILE, status: 'prepared-source-candidate',
    sourceCommit: context.sourceCommit, sourceTree: context.sourceTree, transactionId: transaction.transactionId,
    journalSha256: transaction.journalSha256, familySha256, closureManifestSha256: closure.manifestSha256,
    scannerManifestSha256: scanner.manifestSha256, ...verification, finalReleasePrepared: false };
  const body = Buffer.from(`${JSON.stringify(result)}\n`);
  const path = join(context.operationRoot, 'prepared-source.json');
  const pending = join(context.operationRoot, 'prepared-source.pending');
  if (exists(join(context.operationRoot, 'prepared-source.history.json'))) fail('COMPLETION_AMBIGUOUS');
  context.assertActive(); checkJournalFiles(transaction, files);
  const check = name => readLocalBindingBoundedFile(name, { maximumBytes: 16384,
    expectedUid: 1000, expectedMode: 0o600, expectedBytes: body.length, expectedSha256: sha(body), discardBody: true });
  // Derivation/import/temporary-draft recovery happened after the first byte
  // comparison. Recheck the complete source and candidate at completion.
  const finalBytes = verifyPreparedReleaseCandidateBytes({ sourceRoot: context.sourceRoot,
    candidateRoot: context.candidateRoot, sourceCommit: context.sourceCommit, sourceTree: context.sourceTree, files });
  if (Object.keys(finalBytes).some(key => finalBytes[key] !== verification[key])) fail('CANDIDATE_CHANGED');
  if (exists(path) && exists(pending)) fail('COMPLETION_AMBIGUOUS');
  if (exists(path)) check(path);
  else {
    if (!exists(pending)) {
      const descriptor = openSync(pending, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o600);
      try { fchmodSync(descriptor, 0o600); writeFileSync(descriptor, body); fsyncSync(descriptor); }
      finally { closeSync(descriptor); }
    }
    const before = check(pending).identity;
    context.assertActive(); checkJournalFiles(transaction, files);
    if (exists(path)) fail('COMPLETION_AMBIGUOUS');
    renameSync(pending, path); sync(context.operationRoot, true);
    const after = check(path).identity;
    if (['dev', 'ino', 'uid', 'mode', 'nlink', 'size', 'mtimeNs'].some(key => before[key] !== after[key])) fail('COMPLETION_CHANGED');
  }
  sync(context.operationRoot, true); check(path);
  return Object.freeze({ ...result, handle: basename(context.operationRoot), candidateRoot: context.candidateRoot });
}
async function scannerRuntime() {
  const { installPreparedClosureScanner } = await import('./local-prepared-closure-scanner.mjs');
  const scanner = installPreparedClosureScanner();
  try {
    const { derivePreparedClosureFamily } = await import('./local-prepared-closure-family.mjs');
    scanner.assertUnchanged();
    return { scanner, deriveClosure: derivePreparedClosureFamily };
  } catch (error) { scanner.release(); throw error; }
}

/** Fixed committed-source preparation. No caller source, compiler, secret,
 * deployment binding, evidence callback or release authorization is accepted. */
export async function preparePreparedLinuxReleaseSource(...args) {
  if (args.length !== 0) fail('ARGUMENTS_INVALID');
  attestHost();
  const source = identity(SOURCE_ROOT); assertOperatingSource(source);
  const { scanner, deriveClosure } = await scannerRuntime();
  const owned = [];
  let draft;
  let candidate;
  try {
    draft = capturePreparedLinuxReleaseWorkspace();
    candidate = capturePreparedLinuxReleaseWorkspace();
    sameSource(draft, source); sameSource(candidate, source);
    phase('compiling-bindings-and-bundles', { draft: basename(draft.operationRoot), candidate: basename(candidate.operationRoot) });
    const inputs = await derivePreparedLinuxArtifactInputs();
    sameSource(inputs, source); owned.push(...inputs.files.map(file => file.bytes));
    draft.assertCandidateClean(); candidate.assertCandidateClean();
    const draftTransaction = draft.installOutputs(inputs.files);
    phase('deriving-complete-source-family'); scanner.assertUnchanged();
    const closure = await deriveClosure({ repositoryRoot: draft.candidateRoot });
    owned.push(...closure.files.map(file => file.bytes)); scanner.assertUnchanged();
    const files = sortFiles([...inputs.files, ...closure.files]);
    const installed = candidate.installOutputs(files);
    phase('verifying-candidate');
    const transaction = readTransaction(candidate, installed.transactionId);
    checkJournalFiles(transaction, files);
    const verification = await verifyFamily(candidate, inputs, closure, files, deriveClosure, scanner, owned);
    // Only the temporary derivation draft is rolled back. Keep the independently
    // checked final candidate and its journal for review, check and recovery.
    draft.release();
    recoverPreparedReleaseTransaction(draft.candidateRoot, draftTransaction.transactionId);
    candidate.assertActive(); scanner.assertUnchanged();
    return complete(candidate, transaction, files, closure, scanner, verification);
  } finally {
    for (const bytes of owned) bytes.fill(0);
    try { draft?.release(); } finally { try { candidate?.release(); } finally { scanner.release(); } }
  }
}

/** Rebuild from the same committed operating source and check the entire
 * candidate. A valid interrupted completion can finish its durable marker. */
export async function checkPreparedLinuxReleaseSource(...args) {
  if (args.length !== 1) fail('ARGUMENTS_INVALID');
  attestHost();
  const context = openHandle(args[0]); assertOperatingSource(context);
  const lease = acquirePreparedReleaseCandidateLock(context.candidateRoot);
  const assertContext = context.assertActive;
  context.assertActive = () => { lease.assertActive(); assertContext(); };
  let scanner;
  let draft;
  const owned = [];
  try {
    const transaction = readTransaction(context);
    if (transaction.rolledBack) fail('CANDIDATE_ROLLED_BACK');
    const runtime = await scannerRuntime(); scanner = runtime.scanner;
    draft = capturePreparedLinuxReleaseWorkspace();
    sameSource(draft, context);
    phase('rebuilding-for-independent-check', { candidate: context.handle, draft: basename(draft.operationRoot) });
    const inputs = await derivePreparedLinuxArtifactInputs();
    sameSource(inputs, context); owned.push(...inputs.files.map(file => file.bytes));
    const draftTransaction = draft.installOutputs(inputs.files);
    scanner.assertUnchanged();
    // Derive expected consumers from a new captured source plus compiler outputs.
    // Using the candidate as this input could legitimize non-pin edits in a
    // generated consumer whose transformer intentionally preserves other bytes.
    const closure = await runtime.deriveClosure({ repositoryRoot: draft.candidateRoot });
    owned.push(...closure.files.map(file => file.bytes));
    const files = sortFiles([...inputs.files, ...closure.files]);
    checkJournalFiles(transaction, files);
    const verification = await verifyFamily(context, inputs, closure, files, runtime.deriveClosure, scanner, owned);
    draft.release();
    recoverPreparedReleaseTransaction(draft.candidateRoot, draftTransaction.transactionId);
    return complete(context, transaction, files, closure, scanner, verification);
  } finally {
    for (const bytes of owned) bytes.fill(0);
    try { draft?.release(); } finally { try { lease.release(); } finally { scanner?.release(); } }
  }
}

/** Restore only the named native candidate's exact recorded prior bytes. */
export function recoverPreparedLinuxReleaseSource(...args) {
  if (args.length !== 1) fail('ARGUMENTS_INVALID');
  attestHost();
  const context = openHandle(args[0]);
  const lease = acquirePreparedReleaseCandidateLock(context.candidateRoot);
  const assertContext = context.assertActive;
  context.assertActive = () => { lease.assertActive(); assertContext(); };
  let previous;
  try {
    const transaction = readTransaction(context);
    const paths = ['prepared-source.json', 'prepared-source.pending', 'prepared-source.history.json']
      .map(name => join(context.operationRoot, name));
    const present = paths.filter(exists);
    if (present.length > 1) fail('COMPLETION_AMBIGUOUS');
    if (present.length === 1) {
      previous = readLocalBindingBoundedFile(present[0], { maximumBytes: 16384, expectedUid: 1000, expectedMode: 0o600 });
      const value = JSON.parse(previous.body.toString('utf8'));
      if (!Buffer.from(`${JSON.stringify(value)}\n`).equals(previous.body)
        || value.schemaVersion !== 1 || value.profile !== PROFILE || value.status !== 'prepared-source-candidate'
        || value.sourceCommit !== context.sourceCommit || value.sourceTree !== context.sourceTree
        || value.transactionId !== transaction.transactionId || value.journalSha256 !== transaction.journalSha256
        || value.finalReleasePrepared !== false) fail('COMPLETION_INVALID');
    }
    const result = recoverPreparedReleaseTransactionUnderLock(context.candidateRoot, transaction.transactionId, lease);
    context.assertActive();
    let historyIdentity;
    if (previous) {
      readLocalBindingBoundedFile(present[0], { maximumBytes: 16384, expectedUid: 1000, expectedMode: 0o600,
        expectedIdentity: previous.identity, expectedSha256: sha(previous.body), discardBody: true });
      if (present[0] !== paths[2]) {
        if (exists(paths[2])) fail('COMPLETION_AMBIGUOUS');
        renameSync(present[0], paths[2]);
        const relocated = readLocalBindingBoundedFile(paths[2], { maximumBytes: 16384, expectedUid: 1000, expectedMode: 0o600,
          expectedSha256: sha(previous.body), discardBody: true });
        if (['dev', 'ino', 'uid', 'mode', 'nlink', 'size', 'mtimeNs']
          .some(key => previous.identity[key] !== relocated.identity[key])) fail('COMPLETION_CHANGED');
        historyIdentity = relocated.identity;
      } else historyIdentity = previous.identity;
      sync(paths[2]);
    }
    // A restart may see the history name after a process died between rename
    // and directory fsync. Re-establish durability even on this idempotent path.
    sync(context.operationRoot, true);
    context.assertActive();
    if (JSON.stringify(paths.filter(exists)) !== JSON.stringify(previous ? [paths[2]] : [])) fail('COMPLETION_AMBIGUOUS');
    if (previous) readLocalBindingBoundedFile(paths[2], { maximumBytes: 16384, expectedUid: 1000, expectedMode: 0o600,
      expectedIdentity: historyIdentity, expectedSha256: sha(previous.body), discardBody: true });
    return Object.freeze({ ...result, handle: context.handle, sourceCommit: context.sourceCommit,
      sourceTree: context.sourceTree, finalReleasePrepared: false });
  } finally { previous?.body.fill(0); lease.release(); }
}
