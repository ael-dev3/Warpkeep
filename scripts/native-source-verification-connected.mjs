// Pure fixed continuation of Verify’s connected module lane; no execution or authority.
import { createHash } from 'node:crypto';
import { posix } from 'node:path';
import { isDeepStrictEqual } from 'node:util';

export const NATIVE_CONNECTED_MODULE_PROFILE = 'warpkeep-native-connected-module-v1';
// Exact current recipe inputs, including all predecessor configs used by the additive rehearsal.
export const NATIVE_CONNECTED_SOURCE_INPUTS = Object.freeze({
  "package.json": "8e95f6624282a20fce73efcd4c90c992908da402e24d018ef15359d9dc183715",
  "scripts/genesis002-private-loopback-verifier.ts": "2e87ab6c51a5f385dec5fc97915696610d2da5749abae066083cdcdae045ee6a",
  "scripts/spacetime-additive-migration-proof.mjs": "d19664bf1dbbfd58b2b97cb1deae89940312e70ea20ba01fc24dee628032ae41",
  "scripts/verify-access-request-additive-migration.mjs": "6aa570f4f532ee76fd975f8c5172cf80b19e2474fc9dee9555a39711d4f66c14",
  "scripts/verify-admission-request-cas-rehearsal.mjs": "087750da02e6a3e5128d1792366be46ae9de54141dfbe7f387514d65aca366bf",
  "scripts/verify-castle-worker-additive-migration.mjs": "9aaa148359da8d4a35a83b7e412db2e8e222b1f1a9f7a42fa1883351227aea8e",
  "scripts/verify-greater-realm-connected-active-population.ts": "3b71a6723210b6c344593b16d04135923eb4c8381f6caa146ca1684c2ce41a65",
  "scripts/verify-greater-realm-connected-import.ts": "29e1c868483f880a7d6ff627c80d90d10c4d332e3b943bd7a51473463286365c",
  "scripts/verify-greater-realm-connected-relocation.ts": "ee5ad4902b933fc5f2db3561b572ebfdf947856eb41e5a6ad91981a1d9114f79",
  "scripts/verify-spacetime-additive-migration.mjs": "a03aa598826855f97f4d388a398fdd508b04025af081451b517d5f60f8d89808",
  "scripts/verify-spacetime-bindings.mjs": "7a62e5ee90698f5904e31b4becd0e7a3b587594e9e707b2a52931725316471c1",
  "spacetimedb/genesis002/package.json": "0380d91d6026fb9d7db6966df69a6fec92a4a362f3562cc9a4e1803ae17d49d0",
  "spacetimedb/genesis002/tsconfig.json": "8564a16850d82cc340e67c2bf301972db100d7238daf0bf51dbf1e794c12a31a",
  "spacetimedb/migration-fixtures/additive-v10-schema/package.json": "b9212a91fe012f3a4d0b593fbe95ba438cb7309464877c8528cefdd1f03f38d7",
  "spacetimedb/migration-fixtures/additive-v10-schema/tsconfig.json": "564623c80971527d789f81e9eafe4131bf9972641c466ae001f96a576adae62e",
  "spacetimedb/migration-fixtures/additive-v11-schema/package.json": "7ed608ea04a1e19fd025560a788770da69c92c01c6de3408aa9608ae2042c11c",
  "spacetimedb/migration-fixtures/additive-v11-schema/tsconfig.json": "564623c80971527d789f81e9eafe4131bf9972641c466ae001f96a576adae62e",
  "spacetimedb/migration-fixtures/additive-v12-schema/package.json": "c8617a00dff798bff78c5a5681c01335e7b1defd346b2c16567700a00524fbe4",
  "spacetimedb/migration-fixtures/additive-v12-schema/tsconfig.json": "564623c80971527d789f81e9eafe4131bf9972641c466ae001f96a576adae62e",
  "spacetimedb/migration-fixtures/additive-v13-schema/package.json": "c2e249187a109ead1e176b815e80d716c7c52b9a0c48814a29586b9e5cd9f7d6",
  "spacetimedb/migration-fixtures/additive-v13-schema/tsconfig.json": "564623c80971527d789f81e9eafe4131bf9972641c466ae001f96a576adae62e",
  "spacetimedb/migration-fixtures/additive-v14-schema/package.json": "87d4d7da886bd5943e22061bb9157f42c25121c697bfdb01a4f242f3e209ebd0",
  "spacetimedb/migration-fixtures/additive-v14-schema/tsconfig.json": "564623c80971527d789f81e9eafe4131bf9972641c466ae001f96a576adae62e",
  "spacetimedb/migration-fixtures/additive-v15-schema/package.json": "3def92ba72574e6b60dbcaf2c5172314e6ef8118b04cbdddb22880544b5a075e",
  "spacetimedb/migration-fixtures/additive-v15-schema/tsconfig.json": "564623c80971527d789f81e9eafe4131bf9972641c466ae001f96a576adae62e",
  "spacetimedb/migration-fixtures/additive-v16-schema/package.json": "70322696f8829469bca9b6e6e7865f580bad93136e1514b28def1552484a8dd2",
  "spacetimedb/migration-fixtures/additive-v16-schema/tsconfig.json": "564623c80971527d789f81e9eafe4131bf9972641c466ae001f96a576adae62e",
  "spacetimedb/migration-fixtures/additive-v17-schema/package.json": "9d6045a0e1e87af1ae70a4bcb18c45553de9bd2f480c224da9ee5cba72912952",
  "spacetimedb/migration-fixtures/additive-v17-schema/tsconfig.json": "564623c80971527d789f81e9eafe4131bf9972641c466ae001f96a576adae62e",
  "spacetimedb/migration-fixtures/additive-v2-schema/package.json": "b17a60653cf07c99f0108679df0875596676b0a404b7d9df1c63bff9f7ef3d59",
  "spacetimedb/migration-fixtures/additive-v2-schema/tsconfig.json": "564623c80971527d789f81e9eafe4131bf9972641c466ae001f96a576adae62e",
  "spacetimedb/migration-fixtures/additive-v3-schema/package.json": "3f28e1dc2f8ccc77a65f9e3c3364e6c41d189529e4f5c2e5d030ac0e9c5ff658",
  "spacetimedb/migration-fixtures/additive-v3-schema/tsconfig.json": "564623c80971527d789f81e9eafe4131bf9972641c466ae001f96a576adae62e",
  "spacetimedb/migration-fixtures/additive-v4-schema/package.json": "438703118aa713280eb5de9b29a787464d41992c28c0040e776f8ecd3e15d6e6",
  "spacetimedb/migration-fixtures/additive-v4-schema/tsconfig.json": "564623c80971527d789f81e9eafe4131bf9972641c466ae001f96a576adae62e",
  "spacetimedb/migration-fixtures/additive-v5-schema/package.json": "20d163c3254179a20d4bd27595e2bff752b4cb35f811d4725f42f066f9b66199",
  "spacetimedb/migration-fixtures/additive-v5-schema/tsconfig.json": "564623c80971527d789f81e9eafe4131bf9972641c466ae001f96a576adae62e",
  "spacetimedb/migration-fixtures/additive-v6-schema/package.json": "0fa2806c044de99167bfe4b4b4715579c1f352ffade84b4861e84998ef54cc36",
  "spacetimedb/migration-fixtures/additive-v6-schema/tsconfig.json": "564623c80971527d789f81e9eafe4131bf9972641c466ae001f96a576adae62e",
  "spacetimedb/migration-fixtures/additive-v7-schema/package.json": "365895319306a6e92fb700086739170a11cab939656083995c1bc81c368d9f69",
  "spacetimedb/migration-fixtures/additive-v7-schema/tsconfig.json": "564623c80971527d789f81e9eafe4131bf9972641c466ae001f96a576adae62e",
  "spacetimedb/migration-fixtures/additive-v8-schema/package.json": "1a21b7e597f21493f134d475318472a8ed51e8b23dda187563ab13c5dea051b7",
  "spacetimedb/migration-fixtures/additive-v8-schema/tsconfig.json": "564623c80971527d789f81e9eafe4131bf9972641c466ae001f96a576adae62e",
  "spacetimedb/migration-fixtures/additive-v9-schema/package.json": "999656871425606dba948931fdd3444800d0d8510d394e8f0202830043ba90e5",
  "spacetimedb/migration-fixtures/additive-v9-schema/tsconfig.json": "564623c80971527d789f81e9eafe4131bf9972641c466ae001f96a576adae62e",
  "spacetimedb/migration-fixtures/current-candidate-inspection/package.json": "16d6346ce41a14fec4066f956a4a1e2a3789c5bad63327fb9b63f9733f52cdcd",
  "spacetimedb/migration-fixtures/current-candidate-inspection/tsconfig.json": "564623c80971527d789f81e9eafe4131bf9972641c466ae001f96a576adae62e",
  "spacetimedb/migration-fixtures/production-v1/package.json": "b97c14618fd17f433553fa4f1b102754f686f0b3b58ca97cf3fc537af468401e",
  "spacetimedb/migration-fixtures/production-v1/tsconfig.json": "564623c80971527d789f81e9eafe4131bf9972641c466ae001f96a576adae62e",
  "spacetimedb/package.json": "600b829bb2fd9c991ff918085539e527ecba3c2609bfffe35a9cf6ce3ad7b84f",
  "spacetimedb/pnpm-lock.yaml": "2029b1beb7e5b3bb157e84ec274321e9201f636855e62d56f706628fd14acc74",
  "spacetimedb/pnpm-workspace.yaml": "003d5fdfc324e70ad4d69799807946c72293666e059b93b42ffe08d13378c3ce",
  "spacetimedb/ptr/package.json": "c62a2f986fb79b98651d84c1effa68d1363d93587176e1159861f4c8be71b8f0",
  "spacetimedb/ptr/pnpm-lock.yaml": "3f42eb162fd66cdd2844cbb1dac5827847494aaaa6f509cc3803a82a25ef137e",
  "spacetimedb/ptr/tsconfig.json": "8564a16850d82cc340e67c2bf301972db100d7238daf0bf51dbf1e794c12a31a",
  "spacetimedb/tsconfig.json": "8564a16850d82cc340e67c2bf301972db100d7238daf0bf51dbf1e794c12a31a"
});
const MODULE_ROOTS = Object.freeze(["spacetimedb","spacetimedb/genesis002","spacetimedb/ptr"]);
const MIGRATION_ROOTS = Object.freeze(["spacetimedb/migration-fixtures/production-v1","spacetimedb/migration-fixtures/additive-v2-schema","spacetimedb/migration-fixtures/additive-v3-schema","spacetimedb/migration-fixtures/additive-v4-schema","spacetimedb/migration-fixtures/additive-v5-schema","spacetimedb/migration-fixtures/additive-v6-schema","spacetimedb/migration-fixtures/additive-v7-schema","spacetimedb/migration-fixtures/additive-v8-schema","spacetimedb/migration-fixtures/additive-v9-schema","spacetimedb/migration-fixtures/additive-v10-schema","spacetimedb/migration-fixtures/additive-v11-schema","spacetimedb/migration-fixtures/additive-v12-schema","spacetimedb/migration-fixtures/additive-v13-schema","spacetimedb/migration-fixtures/additive-v14-schema","spacetimedb/migration-fixtures/additive-v15-schema","spacetimedb/migration-fixtures/additive-v16-schema","spacetimedb/migration-fixtures/additive-v17-schema","spacetimedb/migration-fixtures/current-candidate-inspection"]);
const BUILD_FIXTURE_ROOTS = Object.freeze(MIGRATION_ROOTS.slice(-5));
const ROOT_ALIASES = Object.freeze({
  "stdb:verify-bindings": "node scripts/verify-spacetime-bindings.mjs",
  "stdb:genesis002:verify-private-loopback": "tsx scripts/genesis002-private-loopback-verifier.ts",
  "stdb:build-v14-migration-fixture": "spacetime build --module-path spacetimedb/migration-fixtures/additive-v14-schema",
  "stdb:build-v15-migration-fixture": "spacetime build --module-path spacetimedb/migration-fixtures/additive-v15-schema",
  "stdb:build-v16-migration-fixture": "spacetime build --module-path spacetimedb/migration-fixtures/additive-v16-schema",
  "stdb:build-v17-migration-fixture": "spacetime build --module-path spacetimedb/migration-fixtures/additive-v17-schema",
  "stdb:build-current-candidate-inspection-fixture": "spacetime build --module-path spacetimedb/migration-fixtures/current-candidate-inspection",
  "stdb:verify-worker-migration": "node scripts/verify-castle-worker-additive-migration.mjs",
  "stdb:verify-access-request-migration": "node scripts/verify-access-request-additive-migration.mjs",
  "stdb:verify-admission-cas-rehearsal": "node scripts/verify-admission-request-cas-rehearsal.mjs",
  "stdb:verify-additive-migration": "node scripts/verify-spacetime-additive-migration.mjs",
  "stdb:verify-greater-realm-connected-import": "tsx scripts/verify-greater-realm-connected-import.ts",
  "stdb:verify-greater-realm-connected-relocation": "tsx scripts/verify-greater-realm-connected-relocation.ts",
  "stdb:verify-greater-realm-connected-active-population": "tsx scripts/verify-greater-realm-connected-active-population.ts"
});
const SCRIPT_PATHS = Object.freeze(["scripts/verify-spacetime-bindings.mjs","scripts/genesis002-private-loopback-verifier.ts","scripts/verify-castle-worker-additive-migration.mjs","scripts/verify-access-request-additive-migration.mjs","scripts/verify-admission-request-cas-rehearsal.mjs","scripts/verify-spacetime-additive-migration.mjs","scripts/verify-greater-realm-connected-import.ts","scripts/verify-greater-realm-connected-relocation.ts","scripts/verify-greater-realm-connected-active-population.ts"]);
const SOURCE_PATHS = Object.freeze(Object.keys(NATIVE_CONNECTED_SOURCE_INPUTS));
const CONFIG_PATHS = Object.freeze([...MODULE_ROOTS, ...MIGRATION_ROOTS]
  .flatMap(root => [root + '/package.json', root + '/tsconfig.json']).sort());
const TOOL_KEYS = Object.freeze(['node', 'spacetime', 'tsx', 'typescript']);
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const fail = code => { throw Error('NATIVE_CONNECTED_VERIFICATION_' + code); };
function relativePath(path) {
  return typeof path === 'string' && path.length > 0 && path.length <= 4096
    && !/[\\\x00-\x1f\x7f]/u.test(path) && !path.startsWith('/')
    && path.split('/').every(part => !['', '.', '..', '.git'].includes(part));
}
function absolutePath(path) {
  return typeof path === 'string' && path.startsWith('/') && path.length <= 4096
    && relativePath(path.slice(1)) && posix.normalize(path) === path;
}
function dataRecord(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)
    || ![Object.prototype, null].includes(Object.getPrototypeOf(value))) return false;
  return Reflect.ownKeys(value).every(key => typeof key === 'string'
    && Object.hasOwn(Object.getOwnPropertyDescriptor(value, key), 'value'));
}
function fixedRecipe() {
  return Object.freeze({ profile: NATIVE_CONNECTED_MODULE_PROFILE,
    moduleRoots: MODULE_ROOTS, buildFixtureRoots: BUILD_FIXTURE_ROOTS,
    migrationFixtureRoots: MIGRATION_ROOTS, scriptPaths: SCRIPT_PATHS,
    modulePureTests: 'separate-source-test-partition', completeCoverage: false, productionAuthorized: false });
}
// The producer must prove these actual prerequisites before planning and every launch.
// Descriptors do not attest installed versions/bytes or waive an absent tool/config.
export const NATIVE_CONNECTED_PREREQUISITES = Object.freeze({
  requiredSourceInputs: SOURCE_PATHS, moduleRoots: MODULE_ROOTS, migrationFixtureRoots: MIGRATION_ROOTS,
  metadataRoots: Object.freeze(['', ...MODULE_ROOTS, ...MIGRATION_ROOTS]),
  forbiddenConfigBasenames: Object.freeze(['.env', '.dev.vars', '.npmrc', '.pnpmfile.cjs', '.pnpmfile.mjs', 'spacetime.json', 'spacetime.toml']),
  forbiddenConfigPrefixes: Object.freeze(['.env.', '.dev.vars.']),
  allowedExamplePaths: Object.freeze(['.env.example']),
  forbiddenConfigDirectories: Object.freeze(['.config/pnpm', '.config/spacetime']),
  forbiddenBinBasenames: Object.freeze(['node', 'node.exe', 'spacetime', 'spacetime.exe']),
  requiredAbsentPaths: Object.freeze(['spacetimedb/ptr/node_modules']),
  installedInputs: Object.freeze([
    ['spacetimedb', 'typescript', 'bin/tsc', '5.6.3'], ['', 'tsx', 'dist/cli.mjs', '4.23.0'],
    ['spacetimedb', 'esbuild', 'lib/main.js', '0.25.12'], ['spacetimedb', 'spacetimedb', 'dist/server/index.mjs', '2.6.1'],
  ].map(([owner, dependency, entry, expectedVersion]) => Object.freeze({ dependency, expectedVersion,
    sourcePackagePath: (owner ? owner + '/' : '') + 'package.json',
    packagePath: (owner ? owner + '/' : '') + 'node_modules/' + dependency + '/package.json',
    entryPath: (owner ? owner + '/' : '') + 'node_modules/' + dependency + '/' + entry }))),
  spacetimeCliVersion: '2.6.1', standaloneBinaryRequired: true,
  detachedLoopbackGroupEvidenceRequired: true,
  completeCoverage: false, productionAuthorized: false,
});

/** Pure derivation from the actual tracked inventory and exact source byte inputs. */
export function deriveNativeConnectedModuleRecipe(paths, inputBytesByPath) {
  if (!Array.isArray(paths) || paths.length > 8192 || new Set(paths).size !== paths.length
    || paths.some(path => !relativePath(path))) fail('INVENTORY_INVALID');
  if (!dataRecord(inputBytesByPath)
    || !isDeepStrictEqual(Object.keys(inputBytesByPath).sort(), [...SOURCE_PATHS].sort())) fail('SOURCE_INPUTS_INVALID');
  const inventory = new Set(paths);
  for (const path of SOURCE_PATHS) {
    const body = inputBytesByPath[path];
    if (!inventory.has(path) || !(typeof body === 'string' || body instanceof Uint8Array)
      || Buffer.byteLength(body) > 1024 * 1024 || sha(body) !== NATIVE_CONNECTED_SOURCE_INPUTS[path]) fail('SOURCE_RECIPE_CHANGED');
  }
  const configs = paths.filter(path => /^spacetimedb\/(?:.+\/)?(?:package|tsconfig)\.json$/u.test(path)).sort();
  if (!isDeepStrictEqual(configs, [...CONFIG_PATHS])) fail('MODULE_NAMESPACE_CHANGED');
  const connectedScripts = paths.filter(path => /^scripts\/verify-greater-realm-connected-.*\.[cm]?[jt]sx?$/u.test(path)).sort();
  if (!isDeepStrictEqual(connectedScripts, SCRIPT_PATHS.filter(path => path.startsWith('scripts/verify-greater-realm-connected-')).sort())) fail('MODULE_NAMESPACE_CHANGED');
  const sourceText = path => typeof inputBytesByPath[path] === 'string' ? inputBytesByPath[path] : Buffer.from(inputBytesByPath[path]).toString('utf8');
  const rootPackage = JSON.parse(sourceText('package.json'));
  if (rootPackage.packageManager !== 'npm@10.9.8') fail('SOURCE_RECIPE_CHANGED');
  for (const [alias, body] of Object.entries(ROOT_ALIASES)) {
    if (rootPackage.scripts?.[alias] !== body || Object.hasOwn(rootPackage.scripts, 'pre' + alias)
      || Object.hasOwn(rootPackage.scripts, 'post' + alias)) fail('SOURCE_RECIPE_CHANGED');
  }
  for (const moduleRoot of MODULE_ROOTS) {
    const metadata = JSON.parse(sourceText(moduleRoot + '/package.json'));
    if (metadata.packageManager !== 'pnpm@11.7.0' || metadata.scripts?.typecheck !== 'tsc --noEmit'
      || metadata.scripts?.['stdb:build'] !== 'spacetime build --module-path .'
      || metadata.dependencies?.spacetimedb !== '2.6.1' || metadata.devDependencies?.typescript !== '5.6.3'
      || ['pretypecheck', 'posttypecheck', 'prestdb:build', 'poststdb:build'].some(key => Object.hasOwn(metadata.scripts, key))) fail('SOURCE_RECIPE_CHANGED');
  }
  return fixedRecipe();
}

/** Fixed commands only. The caller attests every tool path and retains actual terminal/output/cleanup evidence. */
export function nativeConnectedModuleCommands(root, recipe, tools, stem) {
  if (!absolutePath(root) || !absolutePath(stem) || posix.dirname(stem) !== root + '/artifacts/qa'
    || !/^[A-Za-z0-9._-]+$/u.test(posix.basename(stem))) fail('COMMAND_ROOT_INVALID');
  if (!isDeepStrictEqual(recipe, fixedRecipe())) fail('RECIPE_CHANGED');
  if (!dataRecord(tools) || !isDeepStrictEqual(Object.keys(tools).sort(), [...TOOL_KEYS])) fail('TOOL_INPUTS_INVALID');
  for (const key of TOOL_KEYS) {
    if (!dataRecord(tools[key]) || !absolutePath(tools[key].path)
      || ['env', 'environment', 'args', 'cwd', 'executable'].some(field => Object.hasOwn(tools[key], field))) fail('TOOL_INPUTS_INVALID');
  }
  const environment = Object.freeze({ SPACETIME_BIN: tools.spacetime.path });
  const command = (id, cwd, executable, args, extra = {}) => ({ id, kind: 'terminal-check', files: [],
    cwd, executable, args, reportPath: stem + '-' + id + '.report.json', deadlineMs: 900_000, environment,
    outputContract: { kind: 'terminal', assertionCounts: false, terminalAndCleanupRequired: true },
    ownership: { separateGroupEvidenceRequired: false }, ...extra });
  const typed = (id, moduleRoot) => command(id, root + '/' + moduleRoot, tools.node.path,
    [tools.typescript.path, '--noEmit'], { sourcePackagePath: moduleRoot + '/package.json', sourceScript: 'typecheck' });
  const built = (id, moduleRoot) => command(id, root, tools.spacetime.path,
    ['build', '--module-path', root + '/' + moduleRoot], { moduleRoot,
      buildOutput: { path: root + '/' + moduleRoot + '/dist/bundle.js', maximumBytes: 16 * 1024 * 1024 } });
  const script = (id, alias, path, extra = {}) => command(id, root, tools.node.path,
    [...(path.endsWith('.ts') ? [tools.tsx.path] : []), root + '/' + path],
    { sourcePackagePath: 'package.json', sourceScript: alias, sourceScriptSha256: sha(ROOT_ALIASES[alias]),
      sourcePath: path, sourceSha256: NATIVE_CONNECTED_SOURCE_INPUTS[path], ...extra });
  const result = [
    typed('module-types', MODULE_ROOTS[0]), built('module-build', MODULE_ROOTS[0]),
    typed('genesis002-types', MODULE_ROOTS[1]), built('genesis002-build', MODULE_ROOTS[1]),
    typed('ptr-types', MODULE_ROOTS[2]), built('ptr-build', MODULE_ROOTS[2]),
    script('module-bindings', 'stdb:verify-bindings', 'scripts/verify-spacetime-bindings.mjs'),
    script('genesis002-private-loopback', 'stdb:genesis002:verify-private-loopback', 'scripts/genesis002-private-loopback-verifier.ts', {
      outputContract: { kind: 'genesis002-loopback-json', schemaVersion: 1, profile: 'warpkeep-genesis-002-private-loopback-v1',
        tableCount: 23, procedureCount: 2, requiredTrueFields: Object.freeze(['atlasFinalized', 'anonymousConnectionRejected',
          'nonAdminConnectionRejected', 'anonymousSqlRejected', 'nonAdminSqlRejected', 'anonymousSubscriptionRejected',
          'nonAdminSubscriptionRejected', 'anonymousProceduresRejected', 'nonAdminProceduresRejected']),
        assertionCounts: false, terminalAndCleanupRequired: true },
      ownership: { separateGroupEvidenceRequired: true } }),
    ...BUILD_FIXTURE_ROOTS.map((moduleRoot, index) => built(['fixture-v14-build', 'fixture-v15-build',
      'fixture-v16-build', 'fixture-v17-build', 'fixture-current-inspection-build'][index], moduleRoot)),
    script('worker-migration-static', 'stdb:verify-worker-migration', 'scripts/verify-castle-worker-additive-migration.mjs'),
    script('access-request-migration-static', 'stdb:verify-access-request-migration', 'scripts/verify-access-request-additive-migration.mjs'),
    script('admission-cas-rehearsal', 'stdb:verify-admission-cas-rehearsal', 'scripts/verify-admission-request-cas-rehearsal.mjs', { deadlineMs: 360_000 }),
    script('additive-migration-rehearsal', 'stdb:verify-additive-migration', 'scripts/verify-spacetime-additive-migration.mjs', {
      // The actual CI lane has no additive-leaf deadline. Keep a bounded local outer phase;
      // a timeout is failed/incomplete evidence, never an unsupported-platform disposition.
      deadlineMs: 3_600_000, outputContract: { kind: 'additive-protocol-v18-receipt',
        parserSourcePath: 'scripts/spacetime-additive-migration-proof.mjs', assertionCounts: false, terminalAndCleanupRequired: true } }),
    script('greater-realm-connected-import', 'stdb:verify-greater-realm-connected-import', 'scripts/verify-greater-realm-connected-import.ts', { deadlineMs: 540_000 }),
    script('greater-realm-connected-relocation', 'stdb:verify-greater-realm-connected-relocation', 'scripts/verify-greater-realm-connected-relocation.ts', { deadlineMs: 1_260_000 }),
    script('greater-realm-connected-active-population', 'stdb:verify-greater-realm-connected-active-population', 'scripts/verify-greater-realm-connected-active-population.ts', { deadlineMs: 1_560_000 }),
  ];
  return Object.freeze(result.map(value => Object.freeze({ ...value, files: Object.freeze(value.files),
    args: Object.freeze(value.args), outputContract: Object.freeze(value.outputContract),
    ownership: Object.freeze(value.ownership), ...(value.buildOutput ? { buildOutput: Object.freeze(value.buildOutput) } : {}) })));
}
