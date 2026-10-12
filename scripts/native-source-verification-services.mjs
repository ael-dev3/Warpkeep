// Pure source-owned service recipe: no filesystem, process, network or deployment authority.
// The maintained producer owns actual tool/source attestation, execution, reports and cleanup.
import { createHash } from 'node:crypto';
import { posix } from 'node:path';
import { isDeepStrictEqual } from 'node:util';

export const NATIVE_SERVICE_CHECKS_PROFILE = 'warpkeep-native-service-checks-v1';
// Config/lock edits require a reviewed recipe update, never a caller-provided exemption.
export const NATIVE_SERVICE_SOURCE_INPUTS = Object.freeze({
  "services/auth-bridge/package.json": "37c87d57397baa5a826db3f912b995f51dbc5caeafea02a72d9602a943752cd3",
  "services/auth-bridge/pnpm-lock.yaml": "e1478d3eaaaf16505f4171f5c2570164f94a5abb17dcf592ed433c14ae524327",
  "services/auth-bridge/pnpm-workspace.yaml": "f446fd22b741dfefa8614eb93fad169e1f6ff10529c06f455e8fa46519d8485b",
  "services/auth-bridge/vitest.config.ts": "259b2a1329066941e14df139b6898c303c9732d36d12e2d5e5898d2b24ca5e89",
  "services/auth-bridge/vitest.workerd.config.ts": "3a64b9024895f1627986aac43fe7714b2bce31bee0b7c57bbf42eb16868e0b8e",
  "services/auth-bridge/tsconfig.json": "4753c5458db7ebec4581f0f12e8cea21f4598f1de3f835d160a8a18f9a033a7c",
  "services/auth-bridge/test-workerd/tsconfig.json": "f102128941b794e44db0e522f7e9f412ae5000922def9f918abdb4a176dc2235",
  "services/auth-bridge/test-workerd/worker-configuration.d.ts": "1b202ff3791c1df7c7d32af30aec2fbe8f42a6bdef1979243a18c677f0cbf564",
  "services/auth-bridge/wrangler.toml": "29d39b566f208aa36969f569529fe733e53b191cf0a945937be31c15f7b68713",
  "services/release-recovery/package.json": "9fd76bd6a2fd77d7baf6d4e4707ef231956a65263386a17741f3e451019e5149",
  "services/release-recovery/pnpm-lock.yaml": "342a044aca1fc560de23fec19f0a8d4ba107fd5603dfa6f14a5aa6b20bf91317",
  "services/release-recovery/pnpm-workspace.yaml": "7af8c3dfe9e52769c370e2c00333c1283ea410d87f3414f7c18bd6ff1cc1d100",
  "services/release-recovery/vitest.config.ts": "259b2a1329066941e14df139b6898c303c9732d36d12e2d5e5898d2b24ca5e89",
  "services/release-recovery/vitest.workerd.config.ts": "2ccb7a702a2b05c97db931cdcd9b043d63642f32065f14d633fa7e3965b88303",
  "services/release-recovery/tsconfig.json": "4753c5458db7ebec4581f0f12e8cea21f4598f1de3f835d160a8a18f9a033a7c",
  "services/release-recovery/test-workerd/tsconfig.json": "f102128941b794e44db0e522f7e9f412ae5000922def9f918abdb4a176dc2235",
  "services/release-recovery/test-workerd/worker-configuration.d.ts": "2ffe7ee68702117bcb68ef8a261351dba5664b85d1cfaac29a79f82d0151289c",
  "services/release-recovery/wrangler.workerd.toml": "19358abce5c435d18c3913b1c42f7ce8290c9784c4f772eba95f470e9322205f"
});
const CATALOG = {
  "services/auth-bridge": {
    "ordinaryVitestFiles": [
      "services/auth-bridge/test/admissionNotifications.test.ts",
      "services/auth-bridge/test/app.test.ts",
      "services/auth-bridge/test/browserBinding.test.ts",
      "services/auth-bridge/test/challengeStore.test.ts",
      "services/auth-bridge/test/farcaster.test.ts",
      "services/auth-bridge/test/genesis002AdminToken.test.ts",
      "services/auth-bridge/test/miniAppWebhook.test.ts",
      "services/auth-bridge/test/ptrOwnerExchange.test.ts",
      "services/auth-bridge/test/qaObserver.test.ts",
      "services/auth-bridge/test/rateLimit.test.ts",
      "services/auth-bridge/test/releaseRecoveryConfig.test.ts",
      "services/auth-bridge/test/releaseRecoveryConfiguration.test.ts",
      "services/auth-bridge/test/releaseRecoveryObservation.test.ts",
      "services/auth-bridge/test/sessionFamily.test.ts",
      "services/auth-bridge/test/spacetimeAccessRequestResolver.test.ts",
      "services/auth-bridge/test/spacetimeAuthEpochResolver.test.ts",
      "services/auth-bridge/test/spacetimeQaObserverResolver.test.ts",
      "services/auth-bridge/test/spacetimeReleaseRecoveryResolver.test.ts"
    ],
    "workerdVitestFiles": [
      "services/auth-bridge/test-workerd/authBridge.workerd.test.ts"
    ]
  },
  "services/release-recovery": {
    "ordinaryVitestFiles": [
      "services/release-recovery/test/archive.test.ts",
      "services/release-recovery/test/claimReceiptCorrelation.test.ts",
      "services/release-recovery/test/crypto.test.ts",
      "services/release-recovery/test/g002UpdateObservation.test.ts",
      "services/release-recovery/test/gateway.test.ts",
      "services/release-recovery/test/githubEvidence.test.ts",
      "services/release-recovery/test/githubEvidenceEnvironment.test.ts",
      "services/release-recovery/test/githubEvidenceMetadata.test.ts",
      "services/release-recovery/test/githubOidc.test.ts",
      "services/release-recovery/test/http.test.ts",
      "services/release-recovery/test/ledger.test.ts",
      "services/release-recovery/test/ledgerV2.test.ts",
      "services/release-recovery/test/localAuthorizationVerifier.test.ts",
      "services/release-recovery/test/localClaimVerifier.test.ts",
      "services/release-recovery/test/localStatusVerifier.test.ts",
      "services/release-recovery/test/preparationIntent.test.ts",
      "services/release-recovery/test/preparationObservation.test.ts",
      "services/release-recovery/test/preparationOidc.test.ts",
      "services/release-recovery/test/preparationPolicy.test.ts",
      "services/release-recovery/test/preparationReceipt.test.ts",
      "services/release-recovery/test/protocol.test.ts",
      "services/release-recovery/test/ptrObservation.test.ts",
      "services/release-recovery/test/ptrObservationOidc.test.ts",
      "services/release-recovery/test/rawModuleDefV10.test.ts",
      "services/release-recovery/test/realmEvidence.test.ts",
      "services/release-recovery/test/reconciliationEvidence.test.ts",
      "services/release-recovery/test/recoveryBindingProjection.test.ts",
      "services/release-recovery/test/recoverySourceClosure.test.ts",
      "services/release-recovery/test/recoverySourceClosureStream.test.ts",
      "services/release-recovery/test/releaseRecoveryFixtureHost.test.ts",
      "services/release-recovery/test/releaseRecoveryFixtureOutputTransaction.test.ts",
      "services/release-recovery/test/releaseRecoverySpacetimeFixtures.test.ts",
      "services/release-recovery/test/releaseRecoveryToolchainRecords.test.ts",
      "services/release-recovery/test/releaseRecoveryWslBootstrap.test.ts",
      "services/release-recovery/test/releaseRecoveryWslCacheCatalog.test.ts",
      "services/release-recovery/test/releaseRecoveryWslMaterialize.test.ts",
      "services/release-recovery/test/signerCompletion.test.ts",
      "services/release-recovery/test/signerControl.test.ts",
      "services/release-recovery/test/signerEnvironment.test.ts",
      "services/release-recovery/test/signerG002UpdateObservation.test.ts",
      "services/release-recovery/test/signerObservationService.test.ts",
      "services/release-recovery/test/signerPreparation.test.ts",
      "services/release-recovery/test/signerPtrObservation.test.ts",
      "services/release-recovery/test/signerRequests.test.ts",
      "services/release-recovery/test/signerSecrets.test.ts",
      "services/release-recovery/test/signerWorkflowCredential.test.ts",
      "services/release-recovery/test/spacetimeProgramPins.test.ts",
      "services/release-recovery/test/workflowArtifact.test.ts",
      "services/release-recovery/test/workflowClaimPreparation.test.ts"
    ],
    "workerdVitestFiles": [
      "services/release-recovery/test-workerd/g002UpdateObservation.test.ts",
      "services/release-recovery/test-workerd/gateway.workerd.test.ts",
      "services/release-recovery/test-workerd/ledger.workerd.test.ts",
      "services/release-recovery/test-workerd/ledgerDurableObjectV2.test.ts",
      "services/release-recovery/test-workerd/preparationComposition.test.ts",
      "services/release-recovery/test-workerd/preparationIntent.test.ts",
      "services/release-recovery/test-workerd/preparationObservation.test.ts",
      "services/release-recovery/test-workerd/preparationTransport.test.ts"
    ]
  }
};
for (const value of Object.values(CATALOG)) {
  Object.freeze(value.ordinaryVitestFiles); Object.freeze(value.workerdVitestFiles); Object.freeze(value);
}
Object.freeze(CATALOG);

const ROOTS = Object.freeze(['services/auth-bridge', 'services/release-recovery']);
const SCRIPTS = Object.freeze({ typecheck: 'tsc --noEmit',
  'typecheck:workerd': 'tsc --noEmit -p test-workerd/tsconfig.json',
  test: 'vitest run', 'test:workerd': 'vitest run --config vitest.workerd.config.ts' });
// These are metadata-only conditions for the maintained capture, checked at plan and prelaunch.
// Do not read private ambient values or treat an installed entry as full dependency attestation.
export const NATIVE_SERVICE_PREREQUISITES = Object.freeze({
  serviceRoots: ROOTS,
  forbiddenConfigBasenames: Object.freeze(['.env', '.dev.vars', '.npmrc', '.pnpmfile.cjs', '.pnpmfile.mjs']),
  forbiddenConfigPrefixes: Object.freeze(['.env.', '.dev.vars.']),
  // These example filenames are not loaded by the fixed service/Vite modes.
  // Do not read their values or expand the exception to real ambient configs.
  allowedExamplePaths: Object.freeze(['.env.example', 'services/auth-bridge/.dev.vars.example']),
  forbiddenConfigDirectories: Object.freeze(['.config/pnpm']),
  requiredSourceInputs: Object.freeze(Object.keys(NATIVE_SERVICE_SOURCE_INPUTS)),
  installedInputs: Object.freeze(ROOTS.flatMap(serviceRoot => [
    ['vitest', 'vitest.mjs'], ['typescript', 'bin/tsc'], ['wrangler', 'bin/wrangler.js'],
    ['@cloudflare/vitest-pool-workers', 'dist/pool/index.mjs'],
  ].map(([name, entry]) => Object.freeze({ serviceRoot, dependency: name,
    sourcePackagePath: serviceRoot + '/package.json',
    packagePath: serviceRoot + '/node_modules/' + name + '/package.json',
    entryPath: serviceRoot + '/node_modules/' + name + '/' + entry })))),
  completeCoverage: false, productionAuthorized: false,
});
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const fail = code => { throw Error('NATIVE_SERVICE_VERIFICATION_' + code); };
function relativePath(value) {
  return typeof value === 'string' && value.length > 0 && value.length <= 4096
    && !/[\\:\x00-\x1f\x7f]/u.test(value) && !value.startsWith('/')
    && value.split('/').every(part => part !== '' && part !== '.' && part !== '..' && part !== '.git');
}
function absolutePath(value) {
  return typeof value === 'string' && value.length > 1 && value.length <= 4096
    && !/[\\\x00-\x1f\x7f]/u.test(value) && posix.isAbsolute(value) && posix.normalize(value) === value;
}
function fixedPartitions() {
  return { profile: NATIVE_SERVICE_CHECKS_PROFILE,
    authBridge: { ordinaryVitestFiles: [...CATALOG['services/auth-bridge'].ordinaryVitestFiles],
      workerdVitestFiles: [...CATALOG['services/auth-bridge'].workerdVitestFiles] },
    releaseRecovery: { ordinaryVitestFiles: [...CATALOG['services/release-recovery'].ordinaryVitestFiles],
      workerdVitestFiles: [...CATALOG['services/release-recovery'].workerdVitestFiles] },
    completeCoverage: false, productionAuthorized: false };
}
/** Match the whole service test inventory and actual bounded source bytes, not a caller recipe. */
export function deriveNativeServicePartitions(paths, inputBytesByPath) {
  if (!Array.isArray(paths) || paths.some(path => !relativePath(path))
    || new Set(paths).size !== paths.length) fail('INVENTORY_INVALID');
  if (inputBytesByPath === null || typeof inputBytesByPath !== 'object' || Array.isArray(inputBytesByPath)
    || !isDeepStrictEqual(Object.keys(inputBytesByPath).sort(), Object.keys(NATIVE_SERVICE_SOURCE_INPUTS).sort())) fail('SOURCE_INPUTS_INVALID');
  const source = new Set(paths);
  for (const [path, expected] of Object.entries(NATIVE_SERVICE_SOURCE_INPUTS)) {
    const bytes = inputBytesByPath[path];
    if (!source.has(path) || !(typeof bytes === 'string' || bytes instanceof Uint8Array)
      || Buffer.byteLength(bytes) > 512 * 1024 || sha(bytes) !== expected) fail('SOURCE_RECIPE_CHANGED');
  }
  for (const serviceRoot of ROOTS) {
    const packageBytes = inputBytesByPath[serviceRoot + '/package.json'];
    const metadata = JSON.parse(typeof packageBytes === 'string' ? packageBytes
      : new TextDecoder('utf-8', { fatal: true }).decode(packageBytes));
    for (const [name, body] of Object.entries(SCRIPTS)) {
      if (metadata.scripts?.[name] !== body || Object.hasOwn(metadata.scripts, 'pre' + name)
        || Object.hasOwn(metadata.scripts, 'post' + name)) fail('SOURCE_RECIPE_CHANGED');
    }
  }
  // Configs name only these namespaces. Misplaced/spec/JS/TSX or new-service tests cannot disappear silently.
  const actual = paths.filter(path => path.startsWith('services/') && /\.(?:test|spec)\.[cm]?[jt]sx?$/u.test(path)).sort();
  const expected = Object.values(CATALOG).flatMap(value => [...value.ordinaryVitestFiles, ...value.workerdVitestFiles]).sort();
  if (!isDeepStrictEqual(actual, expected)) fail('TEST_NAMESPACE_CHANGED');
  return fixedPartitions();
}
/** Commands require already attested installed paths; this function performs no tool discovery. */
export function nativeServiceCommands(root, partitions, tools, stem) {
  if (!absolutePath(root) || !absolutePath(stem) || posix.dirname(stem) !== root + '/artifacts/qa'
    || !/^[A-Za-z0-9._-]+$/u.test(posix.basename(stem))) fail('COMMAND_ROOT_INVALID');
  if (!isDeepStrictEqual(partitions, fixedPartitions())) fail('PARTITIONS_CHANGED');
  for (const tool of [tools?.node, tools?.pnpm, tools?.authBridge?.vitest,
    tools?.releaseRecovery?.vitest, tools?.releaseRecovery?.wrangler]) {
    if (!absolutePath(tool?.path)) fail('TOOL_INPUTS_INVALID');
  }
  const environment = Object.freeze({ WRANGLER_SEND_METRICS: 'false', WRANGLER_WRITE_LOGS: 'false' });
  const command = (id, service, executable, args, extra = {}) => ({ id, service,
    kind: 'terminal-check', files: [], cwd: root + '/' + service,
    executable, args, reportPath: stem + '-' + id + '.report.json',
    deadlineMs: 900_000, environment, ...extra });
  const typecheck = (id, service, name) => command(id, service, tools.pnpm.path,
    ['--pm-on-fail=ignore', '--config.verify-deps-before-run=false', '--dir', root + '/' + service, 'run', name],
    { script: name, scriptSha256: sha(SCRIPTS[name]) });
  const test = (id, service, name, files, tool) => command(id, service, tools.node.path,
    [tool.path, 'run', ...files.map(path => path.slice(service.length + 1)), '--config',
      name === 'test' ? 'vitest.config.ts' : 'vitest.workerd.config.ts', '--maxWorkers=1',
      '--no-cache', '--reporter=json', '--outputFile=' + stem + '-' + id + '.report.json'],
    { kind: 'vitest-json', files: [...files], script: name, scriptSha256: sha(SCRIPTS[name]),
      report: { kind: 'vitest-json', repositoryRoot: root, expectedFiles: [...files], childTerminalRequired: true } });
  const auth = 'services/auth-bridge', recovery = 'services/release-recovery';
  return [typecheck('auth-bridge-types', auth, 'typecheck'),
    typecheck('auth-bridge-workerd-types', auth, 'typecheck:workerd'),
    test('auth-bridge-ordinary-tests', auth, 'test', partitions.authBridge.ordinaryVitestFiles, tools.authBridge.vitest),
    test('auth-bridge-workerd-tests', auth, 'test:workerd', partitions.authBridge.workerdVitestFiles, tools.authBridge.vitest),
    typecheck('release-recovery-types', recovery, 'typecheck'),
    typecheck('release-recovery-workerd-types', recovery, 'typecheck:workerd'),
    command('release-recovery-worker-configuration', recovery, tools.node.path,
      [tools.releaseRecovery.wrangler.path, 'types', 'test-workerd/worker-configuration.d.ts',
        '--config', 'wrangler.workerd.toml', '--include-runtime', 'false', '--check']),
    test('release-recovery-ordinary-tests', recovery, 'test', partitions.releaseRecovery.ordinaryVitestFiles, tools.releaseRecovery.vitest),
    test('release-recovery-workerd-tests', recovery, 'test:workerd', partitions.releaseRecovery.workerdVitestFiles, tools.releaseRecovery.vitest)];
}
