import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { isBuiltin } from 'node:module';
import { isAbsolute, relative, resolve, sep } from 'node:path';

function requiredGraphPaths(lane) {
  return Object.freeze([
    `scripts/sealed-realms-production-${lane}-workflow-entry.mjs`,
    `scripts/sealed-realms-production-${lane}-lane-entry.mjs`,
    ...['continuation', 'dispatch', 'private-state', 'source-authority',
      'workflow-authority', 'workflow-evidence', 'workflow-private-state']
      .map(name => `scripts/sealed-realms-production-${name}.mjs`),
    ...(lane === 'g001' ? [] : [
      'scripts/sealed-realms-production-auth-bridge-state.mjs',
      'scripts/sealed-realms-production-activation-records.mjs',
      'scripts/sealed-realms-production-activation-generation-receipt.mjs',
      'scripts/generate-0.4.0-recovery-launch-activation.mjs',
      'scripts/verify-sealed-realms-public-activation-artifact.mjs',
    ]),
    ...(['g002', 'ptr'].includes(lane) ? ['scripts/sealed-realms-production-reconciliation.mjs'] : []),
  ].sort());
}

const LANE_SPECS = Object.freeze({
  activation: Object.freeze({
    entryPath: 'scripts/sealed-realms-production-activation-workflow-entry.mjs',
    basename: 'sealed-realms-production-activation-lane.bundle.mjs',
    requiredGraphPaths: requiredGraphPaths('activation'),
    factoryExport: 'createSealedRealmsProductionActivationWorkflowRuntime',
    factoryFailureCode: 'SEALED_REALMS_ACTIVATION_WORKFLOW_INPUT_INVALID',
    exportNames: Object.freeze([
      'createSealedRealmsProductionActivationWorkflowRuntime',
      'runSealedRealmsProductionActivationOperation',
    ]),
  }),
  g001: Object.freeze({
    entryPath: 'scripts/sealed-realms-production-g001-workflow-entry.mjs',
    basename: 'sealed-realms-production-g001-lane.bundle.mjs',
    requiredGraphPaths: requiredGraphPaths('g001'),
    factoryExport: 'createSealedRealmsProductionG001WorkflowRuntime',
    factoryFailureCode: 'SEALED_REALMS_G001_WORKFLOW_INPUT_INVALID',
    exportNames: Object.freeze([
      'createSealedRealmsProductionG001WorkflowRuntime',
      'runSealedRealmsProductionG001Operation',
    ]),
  }),
  g002: Object.freeze({
    entryPath: 'scripts/sealed-realms-production-g002-workflow-entry.mjs',
    basename: 'sealed-realms-production-g002-lane.bundle.mjs',
    requiredGraphPaths: requiredGraphPaths('g002'),
    factoryExport: 'createSealedRealmsProductionG002WorkflowRuntime',
    factoryFailureCode: 'SEALED_REALMS_G002_WORKFLOW_INPUT_INVALID',
    exportNames: Object.freeze([
      'createSealedRealmsProductionG002WorkflowRuntime',
      'runSealedRealmsProductionG002Operation',
    ]),
  }),
  ptr: Object.freeze({
    entryPath: 'scripts/sealed-realms-production-ptr-workflow-entry.mjs',
    basename: 'sealed-realms-production-ptr-lane.bundle.mjs',
    requiredGraphPaths: requiredGraphPaths('ptr'),
    factoryExport: 'createSealedRealmsProductionPtrWorkflowRuntime',
    factoryFailureCode: 'SEALED_REALMS_PTR_WORKFLOW_INPUT_INVALID',
    exportNames: Object.freeze([
      'createSealedRealmsProductionPtrWorkflowRuntime',
      'runSealedRealmsProductionPtrOperation',
    ]),
  }),
});

export class SealedRealmsProductionBundlesError extends Error {
  constructor(code) {
    super(code);
    this.name = 'SealedRealmsProductionBundlesError';
    this.code = code;
  }
}

function fail(code) { throw new SealedRealmsProductionBundlesError(code); }

function exactObject(value, keys, code) {
  if (
    value === null || typeof value !== 'object' || Array.isArray(value)
    || Object.getPrototypeOf(value) !== Object.prototype
    || JSON.stringify(Object.keys(value)) !== JSON.stringify(keys)
  ) fail(code);
  return value;
}

function digest(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

export function getSealedRealmOperationBundleSpecification(lane) {
  if (typeof lane !== 'string' || !Object.hasOwn(LANE_SPECS, lane)) {
    fail('SEALED_REALMS_BUNDLES_INPUT_INVALID');
  }
  return LANE_SPECS[lane];
}

export function deriveSealedRealmOperationBundleSourceClosureDigest(lane, manifest) {
  getSealedRealmOperationBundleSpecification(lane);
  return digest(Buffer.from(JSON.stringify([
    'warpkeep-sealed-realms-production-source-graph-v1', lane, manifest,
  ]), 'utf8'));
}

function portablePath(path) {
  return path.split(sep).join('/');
}

const PATH_TRANSFORMS = Object.freeze({
  'scripts/generate-0.4.0-recovery-launch-activation.mjs': [['/dev/null', 3], ['/usr/bin/false', 1], ['/usr/bin:/bin', 1], ['/usr/bin/git', 1]],
  'scripts/sealed-realms-production-g001-lane-entry.mjs': [['/private/var/db/warpkeep/runtime/node-v22.22.3-darwin-arm64/bin/node', 1], ['/Applications/ChatGPT.app/Contents/Resources/cua_node/bin/node', 1], ['/dev/null', 2], ['/usr/bin/false', 1], ['/usr/bin:/bin', 1], ['/usr/bin/env', 1], ['/bin/sh', 1], ['/usr/bin/git', 1], ['/usr/bin/plutil', 1], ['/bin/launchctl', 2]],
  'scripts/atlas/greater-realm-git.ts': [['/dev/null', 1], ['/Library/Developer/CommandLineTools/usr/bin/git', 1], ['/usr/bin/git', 2], ['C:\\Program Files\\Git\\cmd\\git.exe', 1], ['C:\\Program Files\\Git\\bin\\git.exe', 1]],
  'scripts/genesis002-production-publisher.mjs': [['/usr/bin:/bin', 2], ['/dev/fd/3', 1]],
  'scripts/ptr-production-publisher.mjs': [['/usr/bin:/bin', 2], ['/dev/fd/3', 1]],
  'scripts/greater-realm-openat.ts': [['/usr/bin/python3', 1], ['/usr/bin', 1]],
  'scripts/greater-realm-production-provenance.ts': [['core.attributesFile=/dev/null', 1], ['core.excludesFile=/dev/null', 1], ['core.hooksPath=/dev/null', 1], ['/dev/null', 2]],
  'scripts/production-admin-token-budget.mjs': [['/bin/ps', 1], ['/usr/bin:/bin', 1]],
  'scripts/genesis001-admission-monitor-current-state.mjs': [['/usr/bin/git', 1], ['/bin/launchctl', 1], ['/usr/bin/plutil', 1], ['/dev/null', 2], ['/usr/bin/false', 1], ['/usr/bin:/bin', 1]],
  'scripts/genesis001-binding-frozen-source.mjs': [['core.attributesFile=/dev/null', 1], ['core.excludesFile=/dev/null', 1], ['core.hooksPath=/dev/null', 1], ['/dev/null', 2], ['/usr/bin/git', 1], ['/usr/bin:/bin', 1]],
});

function exactCount(source, token) { return source.split(token).length - 1; }

function codePointExpression(value) {
  return `String.fromCodePoint(${[...value]
    .map(character => character.codePointAt(0)).join(',')})`;
}

function pathFreeSourceLiterals(source, sourcePath) {
  let rewritten = source;
  for (const [value, expectedCount] of PATH_TRANSFORMS[sourcePath] ?? []) {
    const expression = codePointExpression(value);
    const single = `'${value.replaceAll('\\', '\\\\').replaceAll("'", "\\'")}'`;
    const double = `"${value.replaceAll('\\', '\\\\').replaceAll('"', '\\"')}"`;
    if (exactCount(rewritten, single) + exactCount(rewritten, double) !== expectedCount) {
      fail('SEALED_REALMS_BUNDLES_SOURCE_INVALID');
    }
    rewritten = rewritten.replaceAll(single, expression).replaceAll(double, expression);
  }
  if (sourcePath === 'scripts/greater-realm-production-immutable-artifact.ts') {
    const token = '`${runRoot}:/usr/bin:/bin`';
    if (exactCount(rewritten, token) !== 1) fail('SEALED_REALMS_BUNDLES_SOURCE_INVALID');
    rewritten = rewritten.replace(token,
      '`${runRoot}:${String.fromCodePoint(47,117,115,114,47,98,105,110,58,47,98,105,110)}`');
  }
  if (sourcePath === 'scripts/genesis001-binding-frozen-source.mjs') {
    const importBootstrap = '"const loaded=await import(process.argv[1]);"';
    const valueBootstrap = '`const value=loaded.${operation}({repoRoot:process.argv[2],destination:process.argv[3]});`';
    if (exactCount(rewritten, importBootstrap) !== 1 || exactCount(rewritten, valueBootstrap) !== 1) {
      fail('SEALED_REALMS_BUNDLES_SOURCE_INVALID');
    }
    rewritten = rewritten.replace(
      importBootstrap,
      codePointExpression('const loaded=await import(process.argv[1]);'),
    ).replace(
      valueBootstrap,
      `${codePointExpression('const value=loaded.')} + operation + ${codePointExpression('({repoRoot:process.argv[2],destination:process.argv[3]});')}`,
    );
  }
  return rewritten;
}

function fixedTransformPlugin(sourceRoot) {
  return {
    name: 'warpkeep-sealed-realms-fixed-entry-transform',
    setup(build) {
      build.onLoad({ filter: /sealed-realms-production-g001-lane-entry\.mjs$/ }, args => {
        let source = readFileSync(args.path, 'utf8');
        const plistTemplate = 'const plistPath = `${accountHome}/Library/LaunchAgents/${LABEL}.plist`;';
        const programTemplate = 'const programPath = `${accountHome}/.hermes/scripts/warpkeep_admission_monitor.py`;';
        if (exactCount(source, plistTemplate) !== 1 || exactCount(source, programTemplate) !== 1) {
          fail('SEALED_REALMS_BUNDLES_SOURCE_INVALID');
        }
        source = source.replace(
          plistTemplate,
          "const plistPath = posix.join(accountHome, 'Library', 'LaunchAgents', `${LABEL}.plist`);",
        ).replace(
          programTemplate,
          "const programPath = posix.join(accountHome, '.hermes', 'scripts', 'warpkeep_admission_monitor.py');",
        );
        return { contents: pathFreeSourceLiterals(source, 'scripts/sealed-realms-production-g001-lane-entry.mjs'), loader: 'js' };
      });
      build.onLoad({ filter: /auth-bridge-config-attestation\.mjs$/ }, args => {
        const source = readFileSync(args.path, 'utf8');
        const marker = '\nasync function main() {';
        const index = source.indexOf(marker);
        if (index < 0) fail('SEALED_REALMS_BUNDLES_SOURCE_INVALID');
        return { contents: pathFreeSourceLiterals(`${source.slice(0, index)}\n`, portablePath(relative(sourceRoot, args.path))), loader: 'js' };
      });
      build.onLoad({ filter: /genesis002-production-publisher\.mjs$/ }, args => {
        const source = readFileSync(args.path, 'utf8');
        const expected = "const REPOSITORY_ROOT = realpathSync(resolve(fileURLToPath(new URL('..', import.meta.url))));";
        if (!source.includes(expected)) fail('SEALED_REALMS_BUNDLES_SOURCE_INVALID');
        return {
          contents: pathFreeSourceLiterals(source.replace(expected,
            'const REPOSITORY_ROOT = process.cwd();'), 'scripts/genesis002-production-publisher.mjs'),
          loader: 'js',
        };
      });
      build.onLoad({ filter: /ptr-production-publisher\.mjs$/ }, args => {
        const source = readFileSync(args.path, 'utf8');
        const expected = "const REPOSITORY_ROOT = realpathSync(resolve(\n  fileURLToPath(new URL('..', import.meta.url)),\n));";
        if (!source.includes(expected)) fail('SEALED_REALMS_BUNDLES_SOURCE_INVALID');
        return {
          contents: pathFreeSourceLiterals(source.replace(expected,
            'const REPOSITORY_ROOT = process.cwd();'), 'scripts/ptr-production-publisher.mjs'),
          loader: 'js',
        };
      });
      build.onLoad({ filter: /\.(?:mjs|js|ts)$/ }, args => ({
        contents: pathFreeSourceLiterals(readFileSync(args.path, 'utf8'),
          portablePath(relative(sourceRoot, args.path))),
        loader: args.path.endsWith('.ts') ? 'ts' : 'js',
      }));
    },
  };
}

function graphManifest(metafile, spec, sourceRoot) {
  // Cardinality is a derived fact, never a substitute for membership. The pinned
  // compiler reports the closed import graph from this lane's fixed entry; reject
  // missing edge targets, disconnected inputs and unauthorized external inputs.
  // The native producer separately compares two complete independently built
  // manifests and verifies every source byte against the captured source tree.
  const inputs = new Map();
  const aliases = new Set();
  const virtual = '<define:process.argv>';
  const validPath = path => typeof path === 'string' && path.length > 0 && path.length <= 512
    && /^[A-Za-z0-9@._/-]+$/u.test(path)
    && path.split('/').every(part => part && part !== '.' && part !== '..')
    && (path.startsWith('scripts/') || path.startsWith('spacetimedb/') || path.startsWith('node_modules/yaml/'));
  if (metafile.inputs === null || typeof metafile.inputs !== 'object' || Array.isArray(metafile.inputs)) {
    fail('SEALED_REALMS_BUNDLES_SOURCE_GRAPH_INVALID');
  }
  for (const [raw, record] of Object.entries(metafile.inputs)) {
    const path = portablePath(raw);
    if ((path !== virtual && !validPath(path)) || aliases.has(path.toLowerCase())
      || !Number.isSafeInteger(record?.bytes) || record.bytes < 0 || record.bytes > 4 * 1024 * 1024
      || !Array.isArray(record.imports) || record.imports.length > 1024 || inputs.size >= 257) {
      fail('SEALED_REALMS_BUNDLES_SOURCE_GRAPH_INVALID');
    }
    if (path === virtual && (record.bytes !== 2 || record.imports.length !== 0)) {
      fail('SEALED_REALMS_BUNDLES_SOURCE_GRAPH_INVALID');
    }
    aliases.add(path.toLowerCase()); inputs.set(path, record);
  }
  const paths = [...inputs.keys()].filter(path => path !== virtual).sort();
  if (paths.length < 1 || paths.length > 256
    || spec.requiredGraphPaths.some(path => !inputs.has(path))) fail('SEALED_REALMS_BUNDLES_SOURCE_GRAPH_INVALID');
  const yamlBuiltinRequires = new Map([
    ['node_modules/yaml/dist/log.js', 'process'],
    ['node_modules/yaml/dist/compose/composer.js', 'process'],
    ['node_modules/yaml/dist/parse/parser.js', 'process'],
    ['node_modules/yaml/dist/schema/yaml-1.1/binary.js', 'buffer'],
  ]);
  for (const [sourcePath, record] of inputs) {
    for (const edge of record.imports) {
      if (typeof edge?.path !== 'string' || !['import-statement', 'dynamic-import', 'require-call', 'require-resolve'].includes(edge.kind)
        || ![undefined, false, true].includes(edge.external)) fail('SEALED_REALMS_BUNDLES_SOURCE_GRAPH_INVALID');
      if (edge.path === virtual) {
        // esbuild marks its injected define module external in import records,
        // but records the exact synthetic body in inputs. It is still reachable
        // graph data, not an allowed runtime external import.
        if (edge.external !== true || edge.kind !== 'import-statement' || !inputs.has(virtual)) {
          fail('SEALED_REALMS_BUNDLES_SOURCE_GRAPH_INVALID');
        }
      } else if (edge.external === true) {
        const pinnedYamlBuiltin = yamlBuiltinRequires.get(sourcePath) === edge.path && edge.kind === 'require-call';
        if ((!edge.path.startsWith('node:') && !pinnedYamlBuiltin) || !isBuiltin(edge.path)) {
          fail('SEALED_REALMS_BUNDLES_SOURCE_GRAPH_INVALID');
        }
      } else if (!inputs.has(portablePath(edge.path))) fail('SEALED_REALMS_BUNDLES_SOURCE_GRAPH_INVALID');
    }
  }
  const reached = new Set();
  const pending = [spec.entryPath];
  while (pending.length > 0) {
    const path = pending.pop();
    if (reached.has(path)) continue;
    reached.add(path);
    for (const edge of inputs.get(path).imports) if (edge.external !== true || edge.path === virtual) pending.push(portablePath(edge.path));
  }
  if (reached.size !== inputs.size) fail('SEALED_REALMS_BUNDLES_SOURCE_GRAPH_INVALID');
  const sourceRootPrefix = sourceRoot.endsWith(sep) ? sourceRoot : `${sourceRoot}${sep}`;
  const entries = paths.map((path) => {
    const absolute = resolve(sourceRoot, path);
    if (!absolute.startsWith(sourceRootPrefix)) {
      fail('SEALED_REALMS_BUNDLES_SOURCE_GRAPH_INVALID');
    }
    const bytes = readFileSync(absolute);
    return Object.freeze({ path, byteLength: bytes.byteLength, sha256: digest(bytes) });
  });
  return Object.freeze(entries);
}

function validateArtifactSource(bytes, sourceRoot) {
  let source;
  try { source = new TextDecoder('utf-8', { fatal: true }).decode(bytes); } catch {
    fail('SEALED_REALMS_BUNDLES_SOURCE_INVALID');
  }
  const imports = [...source.matchAll(/(?:\bfrom\s*|\bimport\s*\()\s*['"]([^'"]+)['"]/gu)]
    .map(match => match[1]);
  if (imports.some(specifier => !specifier.startsWith('node:'))
    || source.includes('sourceMappingURL') || source.includes('process.argv')
    || source.includes('import.meta.url') || source.includes('require.main')
    || source.includes(sourceRoot) || source.includes(portablePath(sourceRoot))) {
    fail('SEALED_REALMS_BUNDLES_SOURCE_INVALID');
  }
  const forbiddenPathText = [
    '/Applications/ChatGPT.app/', '/Library/Developer/', '/Library/LaunchAgents/',
    '/bin/launchctl', '/bin/ps', '/bin/sh', '/dev/null', '/private/var/',
    '/usr/bin/env', '/usr/bin/git', '/usr/local/bin/git', '/opt/homebrew/bin/git',
    'file:///',
  ];
  const foundForbidden = forbiddenPathText.find(value => source.includes(value));
  if (foundForbidden !== undefined) {
    fail('SEALED_REALMS_BUNDLES_ABSOLUTE_PATH_INVALID');
  }
  if (/["'`](?:\/(?:Applications|Library|System|Users|bin|dev|etc|home|opt|private|sbin|tmp|usr|var)\/|[A-Za-z]:[\\/]|file:\/\/\/)/u.test(source)) {
    fail('SEALED_REALMS_BUNDLES_ABSOLUTE_PATH_INVALID');
  }
}

export async function buildSealedRealmOperationBundle(input) {
  const options = exactObject(
    input, ['lane', 'sourceRoot', 'build'], 'SEALED_REALMS_BUNDLES_INPUT_INVALID',
  );
  if (
    typeof options.lane !== 'string' || !Object.hasOwn(LANE_SPECS, options.lane)
    || typeof options.sourceRoot !== 'string' || !isAbsolute(options.sourceRoot)
    || typeof options.build !== 'function'
  ) fail('SEALED_REALMS_BUNDLES_INPUT_INVALID');
  const { lane, build } = options;
  const sourceRoot = resolve(options.sourceRoot);
  const spec = getSealedRealmOperationBundleSpecification(lane);
  let result;
  try {
    result = await build({
      entryPoints: [spec.entryPath],
      absWorkingDir: sourceRoot,
      bundle: true,
      preserveSymlinks: true,
      format: 'esm',
      platform: 'node',
      target: 'node22',
      write: false,
      metafile: true,
      sourcemap: false,
      packages: 'bundle',
      legalComments: 'none',
      charset: 'utf8',
      treeShaking: true,
      minifyWhitespace: true,
      minifySyntax: true,
      minifyIdentifiers: true,
      define: {
        'process.argv': '[]',
        'import.meta.url': '__warpkeepModuleUrl',
        'import.meta.dirname': '__warpkeepRuntimeDirectory',
      },
      banner: {
        js: "import { createRequire as __warpkeepCreateRequire } from 'node:module'; import { pathToFileURL as __warpkeepPathToFileURL } from 'node:url'; const __warpkeepRuntimeDirectory = process.cwd(); const __warpkeepModulePath = __warpkeepRuntimeDirectory + ['', 'sealed-realms-production-bundle.mjs'].join('/'); const __warpkeepModuleUrl = __warpkeepPathToFileURL(__warpkeepModulePath).href; const require = __warpkeepCreateRequire(__warpkeepModuleUrl);",
      },
      plugins: [fixedTransformPlugin(sourceRoot)],
      logLevel: 'silent',
    });
  } catch (error) {
    if (error instanceof SealedRealmsProductionBundlesError) throw error;
    fail('SEALED_REALMS_BUNDLES_BUILD_FAILED');
  }
  if (result.outputFiles.length !== 1 || result.metafile === undefined) {
    fail('SEALED_REALMS_BUNDLES_BUILD_FAILED');
  }
  const bytes = Buffer.from(result.outputFiles[0].contents);
  validateArtifactSource(bytes, sourceRoot);
  const manifest = graphManifest(result.metafile, spec, sourceRoot);
  const sourceClosureDigest = deriveSealedRealmOperationBundleSourceClosureDigest(lane, manifest);
  return Object.freeze({
    lane,
    basename: spec.basename,
    bytes,
    byteDigest: digest(bytes),
    sourceClosureDigest,
    graphManifest: manifest,
    exportNames: spec.exportNames,
    factoryExport: spec.factoryExport,
    factoryFailureCode: spec.factoryFailureCode,
  });
}
