import { execFileSync, spawnSync } from 'node:child_process';
import { buildSealedRealmOperationBundle } from '../../scripts/sealed-realms-production-bundle-engine.mjs';
import { createHash, randomBytes } from 'node:crypto';
import {
  chmodSync, closeSync, openSync, mkdirSync, readFileSync, rmSync, writeFileSync,
} from 'node:fs';
import { dirname, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { buildRecoveryWorkflowModule } from '../../scripts/recovery-workflow-bundle-engine.mjs';

import {
  deriveOperationBundlePackageSourceGraph,
  validateLocalBindingYamlManifest,
} from '../../scripts/local-binding-runtime-core.mjs';
import { installLocalBindingNativeTsHooks } from '../../scripts/local-binding-native-ts-hooks.mjs';

const ROOT = '/home/snapmeter/.warpkeep/release-preparation-v1';
const FIXED_CACHE = `${ROOT}/cache/operation-bundles`;
const YAML_ROOT = `${ROOT}/toolchain/yaml-2.9.0/package`;
const ESBUILD_SRI = 'sha512-HrJrvZv5ayxBzPfwphOoNzkzOIIlifzk0KJrGK2c8R4+LKpMtpYLQeUdjnwjWv/LZlkH2laZk+4w78pi99D4Vw==';

function archivePath(cacheRoot, integrity) {
  const digest = Buffer.from(integrity.slice('sha512-'.length), 'base64').toString('hex');
  return join(cacheRoot, '_cacache', 'content-v2', 'sha512', digest.slice(0, 2), digest.slice(2, 4), digest.slice(4));
}

function makePrivateParents(path, stop) {
  const pending = [];
  let current = dirname(path);
  while (current !== stop) {
    pending.push(current);
    current = dirname(current);
  }
  for (const directory of pending.reverse()) {
    mkdirSync(directory, { mode: 0o700 });
    chmodSync(directory, 0o700);
  }
}

const repositoryRoot = process.argv[2];
const scenario = process.argv[3];
const operationRoot = join(ROOT, 'runs', `operation-bundle-packages-test-${randomBytes(16).toString('hex')}`);
mkdirSync(operationRoot, { mode: 0o700 });
chmodSync(operationRoot, 0o700);
try {
  const graph = deriveOperationBundlePackageSourceGraph(repositoryRoot);
  const transportBuiltins = graph.modules.flatMap(module => module.imports
    .filter(entry => entry.builtin === true
      && new Set(['node:dns', 'node:http', 'node:https', 'node:net', 'node:tls']).has(entry.specifier))
    .map(entry => entry.specifier));
  const yamlManifest = validateLocalBindingYamlManifest(readFileSync(
    join(repositoryRoot, 'scripts', 'local-binding-runtime-yaml-v1.json'), 'utf8',
  ));
  const hooks = installLocalBindingNativeTsHooks(graph, {
    root: YAML_ROOT, entry: yamlManifest.entry, files: yamlManifest.files,
  });
  try {
    const packages = await import('warpkeep:operation-bundle-packages');
    const sourceRoot = join(operationRoot, 'source');
    mkdirSync(sourceRoot, { mode: 0o700 });
    chmodSync(sourceRoot, 0o700);
    writeFileSync(join(sourceRoot, 'package-lock.json'), readFileSync(join(repositoryRoot, 'package-lock.json')), {
      mode: 0o600,
    });
    let cacheRoot = FIXED_CACHE;
    if (scenario === 'missing' || scenario === 'corrupt') {
      cacheRoot = join(operationRoot, 'cache');
      mkdirSync(cacheRoot, { mode: 0o700 });
      chmodSync(cacheRoot, 0o700);
    }
    if (scenario === 'corrupt') {
      const path = archivePath(cacheRoot, ESBUILD_SRI);
      makePrivateParents(path, cacheRoot);
      writeFileSync(path, 'corrupt', { mode: 0o400 });
      chmodSync(path, 0o400);
    }
    let code = 'UNEXPECTED_SUCCESS';
    let recoveryBuild;
    try {
      const materialize = scenario === 'recovery' ? packages.materializeFixedRecoveryBundlePackages
        : packages.materializeFixedOperationBundlePackages;
      const namespace = materialize({
        sourceRoot, cacheRoot, yamlRoot: YAML_ROOT,
        yamlManifest: { entry: yamlManifest.entry, files: yamlManifest.files },
      });
      if (scenario === 'operation') {
        const { keccak_256 } = await import(pathToFileURL(join(namespace.root, '@noble/hashes/esm/sha3.js')).href);
        if (Buffer.from(keccak_256(new Uint8Array())).toString('hex') !== 'c5d2460186f7233c927e7db2dcc703c0e500b653ca82273b7bfad8045d85a470') throw new Error('KECCAK_VECTOR_INVALID');
        const tracked = execFileSync('/usr/bin/git', ['-c', 'safe.directory='+repositoryRoot, '-C', repositoryRoot, 'ls-files', '-z', '--', 'scripts', 'spacetimedb'], {encoding: 'utf8'}).split('\0').filter(Boolean);
        for (const path of tracked) {
          const destination = join(sourceRoot, path);
          mkdirSync(dirname(destination), {recursive: true, mode: 0o700});
          writeFileSync(destination, readFileSync(join(repositoryRoot, path)), {mode: 0o400});
        }
        const compiler = await import(pathToFileURL(namespace.esbuildEntry).href);
        try {
          const builds = [];
          const loadRoot = join(operationRoot, 'load');
          mkdirSync(loadRoot, { mode: 0o700 });
          for (const lane of ['g002', 'ptr']) {
            let metafile;
            const build = async options => { const result = await compiler.build(options); metafile = result.metafile; return result; };
            try {
              const first = await buildSealedRealmOperationBundle({ lane, sourceRoot, build });
              const repeated = await buildSealedRealmOperationBundle({ lane, sourceRoot, build });
              if (!first.bytes.equals(repeated.bytes) || first.sourceClosureDigest !== repeated.sourceClosureDigest) throw new Error('OPERATION_BUILD_NONDETERMINISTIC');
              const artifactPath = join(loadRoot, first.basename);
              writeFileSync(artifactPath, first.bytes, { mode: 0o400 });
              const requestPath = join(loadRoot, lane + '-request.json');
              writeFileSync(requestPath, JSON.stringify({schemaVersion: 1, profile: 'warpkeep-local-operation-bundle-load-request-v1', nonce: randomBytes(16).toString('hex'), artifactPath, byteDigest: first.byteDigest, exportNames: first.exportNames, factoryExport: first.factoryExport, factoryFailureCode: first.factoryFailureCode})+'\n', {mode: 0o400});
              const descriptor = openSync(requestPath, 'r');
              let loaded;
              try { loaded = spawnSync(process.execPath, [join(repositoryRoot, 'scripts/local-operation-bundle-load.mjs')], {cwd: loadRoot, env: {}, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe', descriptor], timeout: 30000}); }
              finally { closeSync(descriptor); }
              if (loaded.status !== 0) throw new Error('OPERATION_LOAD_FAILED:'+loaded.stderr);
              builds.push({ lane, byteLength: first.bytes.length, sha256: first.byteDigest, repeatable: true, loaded: JSON.parse(loaded.stdout), graph: first.graphManifest.filter(x => x.path.includes('@noble')) });
            } catch (error) {
              process.stderr.write(JSON.stringify({lane, code:error.code, noble: Object.keys(metafile?.inputs ?? {}).filter(x=>x.includes('@noble'))})+'\n'); throw error;
            }
          }
          const nobleSpec = packages.selectFixedOperationBundlePackages(JSON.parse(readFileSync(join(sourceRoot, 'package-lock.json'), 'utf8'))).find(spec => spec.key === 'node_modules/@noble/hashes');
          let offset = 0;
          const bodies = [], entries = [];
          for (const file of nobleSpec.files) {
            const body = readFileSync(join(namespace.root, '@noble/hashes', file.path)); bodies.push(body);
            entries.push({ path: file.path, kind: 'file', offset, size: body.length }); offset += body.length;
          }
          const uncompressed = Buffer.concat(bodies);
          const parsed = {uncompressed, entries, fileBytes: offset};
          packages.validateFixedOperationBundleArchive('node_modules/@noble/hashes', parsed);
          for (const changed of [{...parsed, entries: entries.slice(1)}, {...parsed, entries: [...entries, entries[0]]}, {...parsed, uncompressed: Buffer.from(uncompressed)}]) {
            if (changed.uncompressed !== uncompressed) changed.uncompressed[0] ^= 1;
            let rejected = false;
            try { packages.validateFixedOperationBundleArchive('node_modules/@noble/hashes', changed); } catch (error) { rejected = error.code === 'OPERATION_BUNDLE_PACKAGES_ARCHIVE_INVALID'; }
            if (!rejected) throw new Error('NOBLE_ARCHIVE_MUTATION_ACCEPTED');
          }
          const sha3Path = join(namespace.root, '@noble/hashes/esm/sha3.js');
          const original = readFileSync(sha3Path), altered = Buffer.from(original);
          altered[altered.length - 1] = 32;
          chmodSync(sha3Path, 0o600); writeFileSync(sha3Path, altered); chmodSync(sha3Path, 0o400);
          let changedGraphRejected = false;
          try { await buildSealedRealmOperationBundle({lane: 'g002', sourceRoot, build: compiler.build}); }
          catch (error) { changedGraphRejected = error.code === 'SEALED_REALMS_BUNDLES_SOURCE_GRAPH_INVALID'; }
          finally { chmodSync(sha3Path, 0o600); writeFileSync(sha3Path, original); chmodSync(sha3Path, 0o400); }
          if (!changedGraphRejected) throw new Error('NOBLE_GRAPH_MUTATION_ACCEPTED');
          recoveryBuild = builds;
          packages.reattestFixedOperationBundlePackages({ sourceRoot, ...namespace });
          code = 'OPERATION_ISOLATED_BUILD_VERIFIED';
        } finally { compiler.stop(); }
      }
      if (scenario === 'recovery') {
        const files = namespace.records.filter(record => record.path.startsWith('fflate/'));
        if (files.length !== 17 || files.some(record => record.mode !== 0o400)) throw new Error('RECOVERY_FILES_INVALID');
        packages.reattestFixedOperationBundlePackages({ sourceRoot, ...namespace });
        // Diagnostic source copies, not the captured production source worker.
        for (const path of [
          'services/release-recovery/scripts/prepare-recovery-workflow-claim.ts',
          'services/release-recovery/scripts/read-recovery-workflow-artifact.ts',
          'services/release-recovery/src/archive.ts', 'services/release-recovery/src/config.ts',
          'services/release-recovery/src/http.ts', 'services/release-recovery/src/recoveryPublicKey.ts',
          'services/release-recovery/tsconfig.json', 'services/release-recovery/package.json',
        ]) {
          const destination = join(sourceRoot, path);
          mkdirSync(dirname(destination), { recursive: true, mode: 0o700 });
          writeFileSync(destination, readFileSync(join(repositoryRoot, path)), { mode: 0o400 });
        }
        const compiler = await import(pathToFileURL(namespace.esbuildEntry).href);
        try {
          const first = await buildRecoveryWorkflowModule(sourceRoot, compiler.build, 'claim');
          const second = await buildRecoveryWorkflowModule(sourceRoot, compiler.build, 'claim');
          if (!first.bytes.equals(second.bytes) || first.sha256 !== second.sha256
            || !first.inputPaths.includes('node_modules/fflate/esm/index.mjs')) throw new Error('RECOVERY_BUILD_INVALID');
          packages.reattestFixedOperationBundlePackages({ sourceRoot, ...namespace });
          recoveryBuild = { byteLength: first.bytes.length, sha256: first.sha256, repeatable: true };
          first.bytes.fill(0); second.bytes.fill(0);
          code = 'RECOVERY_ISOLATED_BUILD_VERIFIED';
        } finally { compiler.stop(); }
      }
      if (scenario === 'post-use-mutation' || scenario === 'noble-post-use-mutation') {
        const target = scenario === 'noble-post-use-mutation' ? join(namespace.root, '@noble/hashes/esm/sha3.js') : join(namespace.root, 'esbuild', 'package.json');
        chmodSync(target, 0o600);
        writeFileSync(target, '{"changed":true}');
        chmodSync(target, 0o400);
        try {
          packages.reattestFixedOperationBundlePackages({ sourceRoot, ...namespace });
        } catch (error) { code = error?.code ?? error?.message; }
      }
    } catch (error) { code = error?.code ?? error?.message; }
    process.stdout.write(`${JSON.stringify({ code, transportBuiltins, ...(recoveryBuild ? {recoveryBuild} : {}) })}\n`);
  } finally { hooks.deregister(); }
} finally {
  rmSync(operationRoot, { recursive: true, force: true });
}
