import { createHash, randomBytes } from 'node:crypto';
import { lstatSync, mkdirSync, readFileSync, realpathSync, rmSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { readLocalBindingBoundedFile } from './local-binding-bounded-file.mjs';
import { captureFixedRecoveryBundleSource, deriveOperationBundlePackageSourceGraph,
  validateLocalBindingYamlManifest, runLocalBindingBoundedProcess } from './local-binding-runtime-core.mjs';
import { installLocalBindingNativeTsHooks } from './local-binding-native-ts-hooks.mjs';

const ROOT = '/home/warpkeep/.warpkeep/release-preparation-v1';
const NODE = `${ROOT}/toolchain/node-v22.22.3-linux-x64/bin/node`;
const PROFILE = 'warpkeep-recovery-bundle-preparation-linux-x64-v1';
const BUNDLE_PATH = 'services/release-recovery/scripts/prepare-recovery-workflow-claim.bundle.mjs';
const MANIFEST_PATH = 'scripts/recovery-workflow-bundle-manifest-v1.json';
const fail = () => { throw new Error('LOCAL_RECOVERY_BUNDLE_RUNTIME_INVALID'); };
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
function privateDirectory(path) {
  const state = lstatSync(path, {bigint: true});
  if (!state.isDirectory() || state.uid !== 1000n || (state.mode & 0o7777n) !== 0o700n
    || realpathSync(path) !== path) fail();
}
function attest(path, sha256, uid, expectedIdentity) {
  return readLocalBindingBoundedFile(path, {maximumBytes: 128 * 1024 * 1024,
    expectedSha256: sha256, expectedUid: uid, requireExecutable: true,
    rejectWritableExecutable: true, discardBody: true, ...(expectedIdentity ? {expectedIdentity} : {})}).identity;
}

/** Local preparation only; no credentials, installation or deployment effect. */
export async function derivePreparedLinuxRecoveryBundle(...args) {
  let operationRoot, hooks, result;
  try {
    if (args.length !== 0 || process.platform !== 'linux' || process.arch !== 'x64'
      || process.getuid?.() !== 1000 || process.execPath !== NODE || process.execArgv.length !== 0
      || Object.keys(process.env).some(key => /TOKEN|SECRET|PASSWORD|CREDENTIAL|AUTH|COOKIE|API_KEY|NODE_OPTIONS|NODE_PATH|ESBUILD_/iu.test(key))) fail();
    for (const path of [ROOT, `${ROOT}/runs`, `${ROOT}/cache/operation-bundles`]) privateDirectory(path);
    const nodeSha = 'e6ec2c188d83d813f81f2de8aea084d74dce603ac1abedd0a30ad941b10087b2';
    const gitSha = '2a8c18fbf43da9f692d75474c72bea9dfd796c260b0f3dfe456376abc3bbd668';
    const nodeIdentity = attest(NODE, nodeSha, 1000), gitIdentity = attest('/usr/bin/git', gitSha, 0);
    operationRoot = `${ROOT}/runs/recovery-bundle-${randomBytes(16).toString('hex')}`;
    mkdirSync(operationRoot, {mode: 0o700}); privateDirectory(operationRoot);
    for (const name of ['home', 'tmp']) mkdirSync(join(operationRoot, name), {mode: 0o700});
    const environment = {HOME: join(operationRoot, 'home'), TMPDIR: join(operationRoot, 'tmp'),
      PATH: `${dirname(NODE)}:/usr/bin:/bin`, LANG: 'C.UTF-8', LC_ALL: 'C.UTF-8', TZ: 'UTC'};
    const source = captureFixedRecoveryBundleSource({
      repositoryRoot: resolve(dirname(fileURLToPath(import.meta.url)), '..'), operationRoot, environment, gitIdentity});
    source.verify();
    const graph = deriveOperationBundlePackageSourceGraph(source.root);
    const yaml = validateLocalBindingYamlManifest(readFileSync(join(source.root, 'scripts/local-binding-runtime-yaml-v1.json'), 'utf8'));
    const yamlRoot = `${ROOT}/toolchain/yaml-2.9.0/package`;
    hooks = installLocalBindingNativeTsHooks(graph, {root: yamlRoot, entry: yaml.entry, files: yaml.files});
    const packages = await import('warpkeep:operation-bundle-packages');
    const cycles = [];
    for (let cycle = 1; cycle <= 2; cycle++) {
      const materialization = join(operationRoot, `cycle-${cycle}`);
      source.materialize(materialization); source.verifyMaterialization(materialization);
      const namespace = packages.materializeFixedRecoveryBundlePackages({sourceRoot: materialization,
        cacheRoot: `${ROOT}/cache/operation-bundles`, yamlRoot, yamlManifest: {entry: yaml.entry, files: yaml.files}});
      source.verify();
      const output = await runLocalBindingBoundedProcess(NODE,
        ['--no-warnings', join(source.root, 'scripts/local-recovery-bundle-worker.mjs')], {
          cwd: materialization, env: environment, fd3: `${JSON.stringify({cycle})}\n`,
          timeout: 60_000, maxOutput: 3 * 1024 * 1024, containProcessGroup: true,
        });
      if (output.stderr !== '') fail();
      const parsed = JSON.parse(output.stdout);
      if (`${JSON.stringify(parsed)}\n` !== output.stdout || parsed === null || typeof parsed !== 'object'
        || Object.keys(parsed).join(',') !== 'bytes,sha256,inputPaths' || typeof parsed.bytes !== 'string'
        || typeof parsed.sha256 !== 'string' || !/^[0-9a-f]{64}$/.test(parsed.sha256)
        || !Array.isArray(parsed.inputPaths) || parsed.inputPaths.length < 1 || parsed.inputPaths.length > 256
        || parsed.inputPaths.some((path, index) => typeof path !== 'string' || path.length > 512
          || (index > 0 && parsed.inputPaths[index - 1] >= path))) fail();
      const bytes = Buffer.from(parsed.bytes, 'base64');
      if (bytes.length < 1 || bytes.length > 2 * 1024 * 1024 || bytes.toString('base64') !== parsed.bytes
        || hash(bytes) !== parsed.sha256) fail();
      const built = {bytes, sha256: parsed.sha256, inputPaths: parsed.inputPaths};
      packages.reattestFixedOperationBundlePackages({sourceRoot: materialization, ...namespace});
      source.verifyMaterialization(materialization); source.verify();
      const inputs = built.inputPaths.map(path => {
        if (typeof path !== 'string' || path.startsWith('/') || path.includes('\\')
          || path.split('/').some(part => !part || part === '.' || part === '..')) fail();
        const body = readLocalBindingBoundedFile(join(materialization, path), {maximumBytes: 4 * 1024 * 1024, expectedUid: 1000}).body;
        try {
          if (path.startsWith('node_modules/')) {
            const record = namespace.records.find(record => `node_modules/${record.path}` === path);
            if (!record || record.bytes !== body.length || record.sha256 !== hash(body)) fail();
          } else {
            const committed = source.gitBuffer(source.root, ['show', `${source.commit}:${path}`], 4 * 1024 * 1024);
            if (!body.equals(committed)) fail();
          }
          return {path, byteLength: body.length, sha256: hash(body)};
        } finally { body.fill(0); }
      });
      source.verifyMaterialization(materialization);
      packages.reattestFixedOperationBundlePackages({sourceRoot: materialization, ...namespace});
      cycles.push({...built, inputs});
    }
    const [first, second] = cycles;
    if (!first.bytes.equals(second.bytes) || first.sha256 !== second.sha256
      || JSON.stringify(first.inputs) !== JSON.stringify(second.inputs)) fail();
    source.verify(); attest(NODE, nodeSha, 1000, nodeIdentity); attest('/usr/bin/git', gitSha, 0, gitIdentity);
    const manifest = Buffer.from(`${JSON.stringify({schemaVersion: 1, profile: PROFILE,
      sourceCommit: source.commit, sourceTree: source.tree,
      bundle: {path: BUNDLE_PATH, byteLength: first.bytes.length, sha256: first.sha256},
      compilerInputs: first.inputs}, null, 2)}\n`);
    result = Object.freeze({profile: PROFILE, sourceCommit: source.commit, sourceTree: source.tree,
      path: BUNDLE_PATH, bytes: first.bytes, sha256: first.sha256, inputs: Object.freeze(first.inputs),
      files: Object.freeze([Object.freeze({path: MANIFEST_PATH, bytes: manifest}),
        Object.freeze({path: BUNDLE_PATH, bytes: first.bytes})])});
    second.bytes.fill(0);
  } catch { fail(); }
  finally {
    hooks?.deregister();
    // Failed preparation is preserved for inspection. Only successful owned
    // independent snapshots are removed; the user's checkout is never a target.
    if (result && operationRoot) { privateDirectory(operationRoot); rmSync(operationRoot, {recursive: true, force: false}); }
  }
  return result;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    if (process.argv.length !== 2) fail();
    const result = await derivePreparedLinuxRecoveryBundle();
    process.stdout.write(`${JSON.stringify({sourceCommit: result.sourceCommit, sourceTree: result.sourceTree,
      byteLength: result.bytes.length, sha256: result.sha256, inputCount: result.inputs.length})}\n`);
    result.bytes.fill(0);
  } catch { process.stderr.write('LOCAL_RECOVERY_BUNDLE_RUNTIME_INVALID\n'); process.exitCode = 1; }
}
