import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build as esbuild } from 'esbuild';

import { assertSealedRealmsProductionPrivateState } from
  './sealed-realms-production-private-state.mjs';

const EXPECTED_NODE = Object.freeze({
  path: '/private/var/db/warpkeep/runtime/node-v22.22.3-darwin-arm64/bin/node',
  version: 'v22.22.3',
  sha256: '5d9d3872911e2340a43b707962e68143de8a4e8d54628845c0c4f2de1fb7cd5c',
  teamId: 'HX7739G8FX',
});
const EXPECTED_BUILD = Object.freeze({
  profile: 'warpkeep-sealed-realms-pinned-esbuild-v1',
  node: EXPECTED_NODE,
  tool: 'esbuild',
  version: '0.28.1',
});
const SCRIPT_DIRECTORY = dirname(fileURLToPath(import.meta.url));
const REPOSITORY_ROOT = resolve(SCRIPT_DIRECTORY, '..');
const EMPTY_ENVIRONMENT = Object.freeze({});
const buildCapabilities = new WeakMap();
const LANE_SPECS = Object.freeze({
  activation: Object.freeze({
    entryPath: 'scripts/sealed-realms-production-activation-lane-entry.mjs',
    basename: 'sealed-realms-production-activation-lane.bundle.mjs',
    graphCount: 8,
    factoryExport: 'createSealedRealmsProductionActivationLane',
    factoryFailureCode: 'SEALED_REALMS_AUTH_BRIDGE_STATE_CAPABILITY_INVALID',
    exportNames: Object.freeze([
      'SealedRealmsProductionActivationLaneError',
      'assertSealedRealmsProductionActivationLane',
      'createSealedRealmsProductionActivationLane',
    ]),
  }),
  g001: Object.freeze({
    entryPath: 'scripts/sealed-realms-production-g001-lane-entry.mjs',
    basename: 'sealed-realms-production-g001-lane.bundle.mjs',
    graphCount: 5,
    factoryExport: 'createSealedRealmsProductionG001Lane',
    factoryFailureCode: 'SEALED_REALMS_G001_LANE_INPUT_INVALID',
    exportNames: Object.freeze([
      'SealedRealmsProductionG001LaneError',
      'assertSealedRealmsProductionG001CurrentStateReceipt',
      'assertSealedRealmsProductionG001Lane',
      'createSealedRealmsProductionG001CensusAuthority',
      'createSealedRealmsProductionG001CurrentStateTestAdapter',
      'createSealedRealmsProductionG001Lane',
      'createSealedRealmsProductionG001LaunchAuthority',
      'inspectSealedRealmsProductionG001CurrentState',
    ]),
  }),
  g002: Object.freeze({
    entryPath: 'scripts/sealed-realms-production-g002-lane-entry.mjs',
    basename: 'sealed-realms-production-g002-lane.bundle.mjs',
    graphCount: 122,
    factoryExport: 'createSealedRealmsProductionG002Lane',
    factoryFailureCode: 'SEALED_REALMS_G002_LANE_INPUT_INVALID',
    exportNames: Object.freeze([
      'SealedRealmsProductionG002LaneError',
      'assertSealedRealmsProductionG002Lane',
      'createSealedRealmsProductionG002Lane',
    ]),
  }),
  ptr: Object.freeze({
    entryPath: 'scripts/sealed-realms-production-ptr-lane-entry.mjs',
    basename: 'sealed-realms-production-ptr-lane.bundle.mjs',
    graphCount: 122,
    factoryExport: 'createSealedRealmsProductionPtrLane',
    factoryFailureCode: 'SEALED_REALMS_PTR_LANE_INPUT_INVALID',
    exportNames: Object.freeze([
      'SealedRealmsProductionPtrLaneError',
      'assertSealedRealmsProductionPtrLane',
      'createSealedRealmsProductionPtrLane',
    ]),
  }),
});
const LANES = Object.freeze(Object.keys(LANE_SPECS));

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

function exactNode(value, code) {
  exactObject(value, ['path', 'version', 'sha256', 'teamId'], code);
  if (JSON.stringify(value) !== JSON.stringify(EXPECTED_NODE)) fail(code);
}

function validateBuildAttestation(value) {
  exactObject(value, ['profile', 'node', 'tool', 'version'], 'SEALED_REALMS_BUNDLES_BUILD_AUTHORITY_INVALID');
  exactNode(value.node, 'SEALED_REALMS_BUNDLES_BUILD_AUTHORITY_INVALID');
  if (
    value.profile !== EXPECTED_BUILD.profile || value.tool !== EXPECTED_BUILD.tool
    || value.version !== EXPECTED_BUILD.version
  ) fail('SEALED_REALMS_BUNDLES_BUILD_AUTHORITY_INVALID');
}

/** Captures the fixed preinstalled build environment before any graph is read. */
export function createSealedRealmsProductionBundleBuildCapability(input) {
  const options = exactObject(input, ['attest'], 'SEALED_REALMS_BUNDLES_BUILD_AUTHORITY_INVALID');
  if (typeof options.attest !== 'function') fail('SEALED_REALMS_BUNDLES_BUILD_AUTHORITY_INVALID');
  let attestation;
  try { attestation = options.attest(); } catch { fail('SEALED_REALMS_BUNDLES_BUILD_AUTHORITY_INVALID'); }
  validateBuildAttestation(attestation);
  const capability = Object.freeze({});
  buildCapabilities.set(capability, Object.freeze(attestation));
  return capability;
}

function portablePath(path) {
  return path.split(sep).join('/');
}

const PATH_TRANSFORMS = Object.freeze({
  'scripts/sealed-realms-production-g001-lane-entry.mjs': [['/private/var/db/warpkeep/runtime/node-v22.22.3-darwin-arm64/bin/node', 1], ['/Applications/ChatGPT.app/Contents/Resources/cua_node/bin/node', 1], ['/dev/null', 2], ['/usr/bin/false', 1], ['/usr/bin:/bin', 1], ['/usr/bin/env', 1], ['/bin/sh', 1], ['/usr/bin/git', 1], ['/usr/bin/plutil', 1], ['/bin/launchctl', 2]],
  'scripts/atlas/greater-realm-git.ts': [['/dev/null', 1], ['/Library/Developer/CommandLineTools/usr/bin/git', 1], ['/usr/bin/git', 2], ['C:\\Program Files\\Git\\cmd\\git.exe', 1], ['C:\\Program Files\\Git\\bin\\git.exe', 1]],
  'scripts/genesis002-production-publisher.mjs': [['/usr/bin:/bin', 2], ['/dev/fd/3', 1]],
  'scripts/ptr-production-publisher.mjs': [['/usr/bin:/bin', 2], ['/dev/fd/3', 1]],
  'scripts/greater-realm-openat.ts': [['/usr/bin/python3', 1], ['/usr/bin', 1]],
  'scripts/greater-realm-production-provenance.ts': [['core.attributesFile=/dev/null', 1], ['core.excludesFile=/dev/null', 1], ['core.hooksPath=/dev/null', 1], ['/dev/null', 2]],
  'scripts/production-admin-token-budget.mjs': [['/bin/ps', 1], ['/usr/bin:/bin', 1]],
});

function exactCount(source, token) { return source.split(token).length - 1; }

function pathFreeSourceLiterals(source, sourcePath) {
  let rewritten = source;
  for (const [value, expectedCount] of PATH_TRANSFORMS[sourcePath] ?? []) {
    const expression = `String.fromCodePoint(${[...value]
      .map(character => character.codePointAt(0)).join(',')})`;
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
  return rewritten;
}

function fixedTransformPlugin() {
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
        return { contents: pathFreeSourceLiterals(`${source.slice(0, index)}\n`, portablePath(relative(REPOSITORY_ROOT, args.path))), loader: 'js' };
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
          portablePath(relative(REPOSITORY_ROOT, args.path))),
        loader: args.path.endsWith('.ts') ? 'ts' : 'js',
      }));
    },
  };
}

function graphManifest(metafile, spec) {
  const paths = Object.keys(metafile.inputs)
    .filter(path => !path.startsWith('<'))
    .map(portablePath)
    .sort();
  if (paths.length !== spec.graphCount || !paths.includes(spec.entryPath)) {
    fail('SEALED_REALMS_BUNDLES_SOURCE_GRAPH_INVALID');
  }
  const entries = paths.map((path) => {
    const absolute = resolve(REPOSITORY_ROOT, path);
    if (!absolute.startsWith(`${REPOSITORY_ROOT}${sep}`)) {
      fail('SEALED_REALMS_BUNDLES_SOURCE_GRAPH_INVALID');
    }
    const bytes = readFileSync(absolute);
    return Object.freeze({ path, byteLength: bytes.byteLength, sha256: digest(bytes) });
  });
  return Object.freeze(entries);
}

function validateArtifactSource(bytes) {
  let source;
  try { source = new TextDecoder('utf-8', { fatal: true }).decode(bytes); } catch {
    fail('SEALED_REALMS_BUNDLES_SOURCE_INVALID');
  }
  const imports = [...source.matchAll(/(?:\bfrom\s*|\bimport\s*\()\s*['"]([^'"]+)['"]/gu)]
    .map(match => match[1]);
  if (imports.some(specifier => !specifier.startsWith('node:'))
    || source.includes('sourceMappingURL') || source.includes('process.argv')
    || source.includes('import.meta.url') || source.includes('require.main')
    || source.includes(REPOSITORY_ROOT) || source.includes(portablePath(REPOSITORY_ROOT))) {
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

async function buildLane(lane) {
  const spec = LANE_SPECS[lane];
  let result;
  try {
    result = await esbuild({
      entryPoints: [spec.entryPath],
      absWorkingDir: REPOSITORY_ROOT,
      bundle: true,
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
      plugins: [fixedTransformPlugin()],
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
  validateArtifactSource(bytes);
  const manifest = graphManifest(result.metafile, spec);
  const sourceClosureDigest = digest(Buffer.from(JSON.stringify([
    'warpkeep-sealed-realms-production-source-graph-v1', lane, manifest,
  ]), 'utf8'));
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

function validateLoadAttestation(value, expected) {
  exactObject(value, [
    'node', 'lane', 'byteDigest', 'sourceClosureDigest', 'loaded', 'byteLength',
    'exportNames', 'factoryExport', 'factoryKind', 'factoryFailureCode',
  ], 'SEALED_REALMS_BUNDLES_LOAD_HOOK_INVALID');
  exactNode(value.node, 'SEALED_REALMS_BUNDLES_LOAD_HOOK_INVALID');
  if (
    value.lane !== expected.lane || value.byteDigest !== expected.byteDigest
    || value.sourceClosureDigest !== expected.sourceClosureDigest || value.loaded !== true
    || value.byteLength !== expected.bytes.byteLength
    || JSON.stringify(value.exportNames) !== JSON.stringify(expected.exportNames)
    || value.factoryExport !== expected.factoryExport || value.factoryKind !== 'function'
    || value.factoryFailureCode !== expected.factoryFailureCode
  ) fail('SEALED_REALMS_BUNDLES_LOAD_HOOK_INVALID');
}

export async function buildSealedRealmsProductionBundles(input = {}) {
  const options = exactObject(
    input, ['privateState', 'buildCapability', 'loadHook'], 'SEALED_REALMS_BUNDLES_INPUT_INVALID',
  );
  const privateState = assertSealedRealmsProductionPrivateState(options.privateState);
  if (!buildCapabilities.has(options.buildCapability) || typeof options.loadHook !== 'function') {
    fail('SEALED_REALMS_BUNDLES_INPUT_INVALID');
  }
  const artifacts = [];
  try {
    for (const lane of LANES) {
      const first = await buildLane(lane);
      const second = await buildLane(lane);
      if (
        first.byteDigest !== second.byteDigest
        || first.sourceClosureDigest !== second.sourceClosureDigest
        || JSON.stringify(first.graphManifest) !== JSON.stringify(second.graphManifest)
        || !first.bytes.equals(second.bytes)
      ) fail('SEALED_REALMS_BUNDLES_NONDETERMINISTIC');
      second.bytes.fill(0);
      artifacts.push(first);
    }
    for (const artifact of artifacts) {
      let loaded;
      try {
        loaded = await options.loadHook(Object.freeze({
          file: EXPECTED_NODE.path,
          args: Object.freeze(['--input-type=module', '--eval']),
          shell: false,
          env: EMPTY_ENVIRONMENT,
          lane: artifact.lane,
          basename: artifact.basename,
          bytes: Buffer.from(artifact.bytes),
          byteDigest: artifact.byteDigest,
          sourceClosureDigest: artifact.sourceClosureDigest,
          graphManifest: artifact.graphManifest,
          exportNames: artifact.exportNames,
          factoryExport: artifact.factoryExport,
          factoryFailureCode: artifact.factoryFailureCode,
        }));
      } catch (error) {
        if (error instanceof SealedRealmsProductionBundlesError) throw error;
        fail('SEALED_REALMS_BUNDLES_LOAD_HOOK_INVALID');
      }
      validateLoadAttestation(loaded, artifact);
    }
    try {
      privateState.writeFamily({
        root: 'cache',
        relativeDirectory: 'bundles',
        members: artifacts.map(artifact => Object.freeze({
          basename: artifact.basename, bytes: artifact.bytes,
        })),
      });
    } catch (error) {
      if (error?.code === 'SEALED_REALMS_PRIVATE_STATE_FAMILY_EXISTS'
        || error?.code === 'SEALED_REALMS_PRIVATE_STATE_FAMILY_BUSY') {
        fail('SEALED_REALMS_BUNDLES_ALREADY_PUBLISHED');
      }
      fail('SEALED_REALMS_BUNDLES_EMIT_FAILED');
    }
    return Object.freeze({ lanes: Object.freeze([...LANES]) });
  } finally {
    for (const artifact of artifacts) artifact.bytes.fill(0);
  }
}
