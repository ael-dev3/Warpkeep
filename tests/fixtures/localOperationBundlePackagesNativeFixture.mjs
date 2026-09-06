import { createHash, randomBytes } from 'node:crypto';
import {
  chmodSync, mkdirSync, readFileSync, rmSync, writeFileSync,
} from 'node:fs';
import { dirname, join } from 'node:path';

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
    try {
      const namespace = packages.materializeFixedOperationBundlePackages({
        sourceRoot, cacheRoot, yamlRoot: YAML_ROOT,
        yamlManifest: { entry: yamlManifest.entry, files: yamlManifest.files },
      });
      if (scenario === 'post-use-mutation') {
        const target = join(namespace.root, 'esbuild', 'package.json');
        chmodSync(target, 0o600);
        writeFileSync(target, '{"changed":true}');
        chmodSync(target, 0o400);
        try {
          packages.reattestFixedOperationBundlePackages({ sourceRoot, ...namespace });
        } catch (error) { code = error?.code ?? error?.message; }
      }
    } catch (error) { code = error?.code ?? error?.message; }
    process.stdout.write(`${JSON.stringify({ code, transportBuiltins })}\n`);
  } finally { hooks.deregister(); }
} finally {
  rmSync(operationRoot, { recursive: true, force: true });
}
