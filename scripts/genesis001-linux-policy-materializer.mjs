import { spawnSync } from 'node:child_process';
import { chmodSync, lstatSync, mkdirSync, realpathSync, rmdirSync, symlinkSync, unlinkSync } from 'node:fs';
import { isBuiltin } from 'node:module';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { pathToFileURL } from 'node:url';
import { deriveGenesis002LocalBindingSourceGraph, validateLocalBindingYamlManifest } from './local-binding-runtime-core.mjs';
import { installLocalBindingNativeTsHooks } from './local-binding-native-ts-hooks.mjs';
import { readLocalBindingBoundedFile } from './local-binding-bounded-file.mjs';
import { attestPolicyHost, attestPolicySource, G001_POLICY_ENV, G001_POLICY_HOME,
  G001_POLICY_OPERATOR, policyDigest, policyFail, policyGit, policyOwnedRun, readPolicyRequest } from './genesis001-linux-policy-boundary.mjs';

function inside(root, path) { return path === root || path.startsWith(`${root}${sep}`); }
function captureGraph(root, yamlRoot, metadata) {
  if (!metadata || !metadata.inputs || !metadata.outputs || Object.keys(metadata.outputs).length !== 1) policyFail();
  const output = Object.values(metadata.outputs)[0];
  if (output.imports.some(edge => edge.external !== true || !isBuiltin(edge.path))) policyFail();
  const records = [];
  for (const input of Object.keys(metadata.inputs).sort()) {
    const path = realpathSync(resolve(root, input));
    if (!inside(root, path) && !inside(yamlRoot, path)) policyFail();
    const opened = readLocalBindingBoundedFile(path, { maximumBytes: 16 * 1024 * 1024, expectedUid: 1000 });
    try { records.push({ path: inside(root, path) ? relative(root, path).split(sep).join('/')
      : `fixed-yaml/${relative(yamlRoot, path).split(sep).join('/')}`, bytes: opened.body.length, sha256: policyDigest(opened.body) }); }
    finally { opened.body.fill(0); }
  }
  if (!records.some(record => record.path === G001_POLICY_OPERATOR) || records.length > 4096) policyFail();
  return policyDigest(Buffer.from(JSON.stringify(records)));
}

/** Fixed source/build process only; no administrator descriptor is inherited. */
export async function materializeFixedLinuxG001Policy(request) {
  if (!request || JSON.stringify(Object.keys(request)) !== JSON.stringify(['runId', 'operationRoot', 'source'])
    || process.argv.length !== 2) policyFail();
  const host = attestPolicyHost(undefined, true);
  policyOwnedRun(request.operationRoot, request.runId);
  const root = process.cwd(), source = attestPolicySource(request.source, root);
  const manifestPath = 'scripts/local-binding-runtime-yaml-v1.json';
  const committed = policyGit(root, ['show', `${source.sourceCommit}:${manifestPath}`], true);
  let yaml;
  try {
    readLocalBindingBoundedFile(join(root, manifestPath), { maximumBytes: 1024 * 1024,
      expectedBytes: committed.length, expectedSha256: policyDigest(committed), expectedUid: 1000 }).body.fill(0);
    yaml = validateLocalBindingYamlManifest(committed.toString('utf8'));
  } finally { committed.fill(0); }
  const yamlRoot = join(G001_POLICY_HOME, '.warpkeep', 'release-preparation-v1', 'toolchain', 'yaml-2.9.0', 'package');
  const graph = deriveGenesis002LocalBindingSourceGraph(root);
  const hooks = installLocalBindingNativeTsHooks(graph, { root: yamlRoot, entry: yaml.entry, files: yaml.files });
  try {
    const builder = await import('warpkeep:genesis002-binding-entry');
    const built = builder.withGenesis002LinuxLockedSourceBuild({ repositoryRoot: root,
      moduleSourceCommit: source.sourceCommit,
      dependencyCacheRoot: join(G001_POLICY_HOME, '.warpkeep', 'release-preparation-v1', 'cache', 'genesis002'),
      materializationParent: request.operationRoot,
      operation(context) {
        const modules = join(context.materializedRoot, 'node_modules');
        mkdirSync(modules, { mode: 0o700 });
        const sdk = realpathSync(join(context.materializedRoot, 'spacetimedb', 'node_modules', 'spacetimedb'));
        const links = [join(modules, 'spacetimedb'), join(modules, 'yaml')];
        const created = [];
        try {
          symlinkSync(sdk, links[0]); created.push(links[0]);
          symlinkSync(yamlRoot, links[1]); created.push(links[1]);
          const compiler = realpathSync(join(context.materializedRoot, 'spacetimedb', 'node_modules',
            '.pnpm', '@esbuild+linux-x64@0.25.12', 'node_modules', '@esbuild', 'linux-x64', 'bin', 'esbuild'));
          let first;
          for (const cycle of ['first', 'second']) {
            attestPolicyHost(host, true); attestPolicySource(source, root);
            const destination = join(request.operationRoot, `${cycle}.mjs`);
            const metafile = join(request.operationRoot, `${cycle}.json`);
            // Compiler and SDK bytes are enclosed by the existing locked-source
            // materializer's complete before/after archive and tree attestation.
            const compilation = spawnSync(compiler, [G001_POLICY_OPERATOR, '--bundle', '--platform=node', '--format=esm',
              '--target=node22', '--log-level=warning', '--charset=utf8',
              '--banner:js=import {createRequire as policyCreateRequire,isBuiltin as policyIsBuiltin} from "node:module"; const require=(name)=>{if(!policyIsBuiltin(name))throw Error("G001_POLICY_REQUIRE_DENIED");return policyCreateRequire(import.meta.url)(name);};',
              `--outfile=${destination}`, `--metafile=${metafile}`], {
              cwd: context.materializedRoot, env: G001_POLICY_ENV, encoding: 'buffer',
              timeout: 180000, maxBuffer: 32768, stdio: ['ignore', 'pipe', 'pipe'] });
            if (compilation.error !== undefined || compilation.signal !== null || compilation.status !== 0
              || compilation.stdout.length !== 0 || compilation.stderr.length !== 0) policyFail();
            chmodSync(destination, 0o600); chmodSync(metafile, 0o600);
            const bundle = readLocalBindingBoundedFile(destination, { maximumBytes: 16 * 1024 * 1024,
              expectedUid: 1000, expectedMode: 0o600 });
            const meta = readLocalBindingBoundedFile(metafile, { maximumBytes: 4 * 1024 * 1024,
              expectedUid: 1000, expectedMode: 0o600 });
            let result;
            try { result = { bundleSha256: policyDigest(bundle.body), bundleBytes: bundle.body.length,
              sourceClosureSha256: captureGraph(context.materializedRoot, yamlRoot, JSON.parse(meta.body.toString('utf8'))) }; }
            finally { bundle.body.fill(0); meta.body.fill(0); }
            if (first && JSON.stringify(first) !== JSON.stringify(result)) policyFail();
            first = result;
          }
          return first;
        } finally {
          for (const [index, path] of created.entries()) {
            const target = index === 0 ? sdk : yamlRoot;
            const state = lstatSync(path);
            if (!state.isSymbolicLink() || realpathSync(path) !== target) policyFail();
            unlinkSync(path);
          }
          rmdirSync(modules);
        }
      },
    });
    attestPolicyHost(host, true); attestPolicySource(source, root);
    policyOwnedRun(request.operationRoot, request.runId);
    if (built.moduleTreeId !== source.sourceTree) policyFail();
    return Object.freeze({ ...built.result, dependencyClosureSha256: built.dependencyClosureDigest });
  } finally { hooks.deregister(); }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  process.umask(0o077);
  let request;
  try { request = readPolicyRequest(); }
  catch { process.stderr.write('G001_LINUX_POLICY_NATIVE_FAILED\n'); process.exitCode = 1; }
  if (request) materializeFixedLinuxG001Policy(request).then(result => process.stdout.write(`${JSON.stringify(result)}\n`))
    .catch(() => { process.stderr.write('G001_LINUX_POLICY_NATIVE_FAILED\n'); process.exitCode = 1; });
}
