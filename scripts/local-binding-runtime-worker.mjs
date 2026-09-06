import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  closeSync, constants, fsyncSync, lstatSync, mkdirSync, openSync, readdirSync, realpathSync, symlinkSync, unlinkSync,
  writeSync,
} from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { pathToFileURL } from 'node:url';

import { readLocalBindingBoundedFile } from './local-binding-bounded-file.mjs';
import { installLocalBindingNativeTsHooks } from './local-binding-native-ts-hooks.mjs';
import { validateLocalBindingWorkerRequest } from './local-binding-runtime-core.mjs';
import {
  createLocalBindingWorkerResult,
  preserveLocalBindingWorkerBundle,
} from './local-binding-runtime-worker-result.mjs';
import { readLocalBindingWorkerRequest } from './local-binding-runtime-worker-request.mjs';

const MAX_COMMAND_OUTPUT = 4 * 1024 * 1024;
const CLI_BYTES = 47905552;
const CLI_SHA256 = 'cac13c929049f31cb588c230a0d7fe5f388505b4c64047a68b1d5cfdc811624b';
const STANDALONE_BYTES = 130219584;
const STANDALONE_SHA256 = 'a9185a737c9b739896c8f51326e1c3aedefba80a0f01def76ce26f358d5c187b';
const NODE_BYTES = 124819136;
const NODE_SHA256 = 'e6ec2c188d83d813f81f2de8aea084d74dce603ac1abedd0a30ad941b10087b2';
const GENESIS001_NODE_PATH = '/home/snapmeter/.warpkeep/release-preparation-v1/toolchain/node-v24.19.0-linux-x64/bin/node';
const GENESIS001_NODE_BYTES = 125989464;
const GENESIS001_NODE_SHA256 = 'bc17c508ffeed0ec622934f9b7fa72f8e78da65350e63c3eceb56fa688aa5e12';
const GIT_PATH = '/usr/bin/git';
const GIT_SHA256 = '2a8c18fbf43da9f692d75474c72bea9dfd796c260b0f3dfe456376abc3bbd668';
const GENESIS001_COMPATIBILITY_PROFILE = 'warpkeep-local-binding-genesis001-compatibility-worker-v1';
const GENESIS001_COMPATIBILITY_RESULT_PROFILE = 'warpkeep-local-binding-genesis001-compatibility-result-v1';

function isGenesis001Profile(profile) {
  return profile === 'warpkeep-local-binding-genesis001-worker-v1'
    || profile === GENESIS001_COMPATIBILITY_PROFILE;
}

function fail(code, cause) {
  const error = new Error(code, cause === undefined ? undefined : { cause });
  error.code = code;
  throw error;
}

function attestExecutable(path, bytes, digest, uid, expectedMode, expectedIdentity) {
  try {
    const result = readLocalBindingBoundedFile(path, {
      maximumBytes: bytes ?? 64 * 1024 * 1024,
      expectedBytes: bytes,
      expectedSha256: digest,
      expectedUid: uid,
      expectedMode,
      requireExecutable: true,
      rejectWritableExecutable: true,
      discardBody: true,
      expectedIdentity,
    });
    result.body.fill(0);
    return result.identity;
  } catch (error) {
    if (error?.code === 'LOCAL_BINDING_BOUNDED_FILE_INVALID') {
      fail('LOCAL_BINDING_WORKER_EXECUTABLE_INVALID', error);
    }
    fail('LOCAL_BINDING_WORKER_EXECUTABLE_CHANGED', error);
  }
}

function directoryIdentity(state) {
  return Object.freeze(Object.fromEntries(
    ['dev', 'ino', 'mode', 'uid', 'nlink', 'mtimeNs', 'ctimeNs'].map(key => [key, String(state[key])]),
  ));
}

function sameDirectoryIdentity(state, expected) {
  return expected === undefined || Object.entries(expected).every(([key, value]) => String(state[key]) === value);
}

function attestRuntimeExecutables(request, expected) {
  const snapshotDirectory = dirname(request.cliPath);
  const operationRoot = dirname(request.repositoryRoot);
  const directory = lstatSync(snapshotDirectory, { bigint: true });
  if (snapshotDirectory !== join(operationRoot, 'cli')
      || basename(request.cliPath) !== 'spacetimedb-cli'
      || !directory.isDirectory() || directory.isSymbolicLink() || directory.uid !== 1000n
      || (directory.mode & 0o777n) !== 0o700n || realpathSync(snapshotDirectory) !== snapshotDirectory
      || !sameDirectoryIdentity(directory, expected?.directory)) {
    fail('LOCAL_BINDING_WORKER_EXECUTABLE_INVALID');
  }
  const result = {
    directory: directoryIdentity(directory),
    node: attestExecutable(request.nodePath, NODE_BYTES, NODE_SHA256, 1000, undefined, expected?.node),
    git: attestExecutable(GIT_PATH, undefined, GIT_SHA256, 0, undefined, expected?.git),
    cli: attestExecutable(request.cliPath, CLI_BYTES, CLI_SHA256, 1000, 0o500, expected?.cli),
    standalone: attestExecutable(join(snapshotDirectory, 'spacetimedb-standalone'),
      STANDALONE_BYTES, STANDALONE_SHA256, 1000, 0o500, expected?.standalone),
  };
  if (isGenesis001Profile(request.profile)) {
    try {
      const versionRoot = dirname(dirname(GENESIS001_NODE_PATH));
      const binRoot = dirname(GENESIS001_NODE_PATH);
      const directories = [
        [versionRoot, ['bin'], expected?.compilerVersionRoot],
        [binRoot, ['node'], expected?.compilerBinRoot],
      ];
      for (const [path, children, identity] of directories) {
        const state = lstatSync(path, { bigint: true });
        if (!state.isDirectory() || state.isSymbolicLink() || state.uid !== 1000n
            || (state.mode & 0o777n) !== 0o700n || realpathSync(path) !== path
            || JSON.stringify(requireExactChildren(path)) !== JSON.stringify(children)
            || !sameDirectoryIdentity(state, identity)) {
          fail('LOCAL_BINDING_WORKER_COMPILER_INVALID');
        }
        result[path === versionRoot ? 'compilerVersionRoot' : 'compilerBinRoot'] = directoryIdentity(state);
      }
      result.compiler = attestExecutable(
        GENESIS001_NODE_PATH, GENESIS001_NODE_BYTES, GENESIS001_NODE_SHA256,
        1000, 0o500, expected?.compiler,
      );
    } catch (error) {
      if (typeof error?.code === 'string' && error.code.startsWith('LOCAL_BINDING_WORKER_')) throw error;
      fail(expected === undefined
        ? 'LOCAL_BINDING_WORKER_COMPILER_INVALID'
        : 'LOCAL_BINDING_WORKER_COMPILER_CHANGED', error);
    }
  }
  return Object.freeze(result);
}

function requireExactChildren(path) {
  try {
    return Array.from(requireDirectoryEntries(path)).sort();
  } catch (error) {
    fail('LOCAL_BINDING_WORKER_COMPILER_INVALID', error);
  }
}

function requireDirectoryEntries(path) {
  return readdirSync(path);
}

function fixedWorkerLane(profile) {
  if (profile === 'warpkeep-local-binding-worker-v1') return Object.freeze({
    syntheticEntry: 'warpkeep:ptr-binding-entry', builder: 'withPtrLinuxLockedSourceBuild',
    modulePath: 'spacetimedb/ptr', stateChild: 'ptr-locked-source-builds-v1',
  });
  if (profile === 'warpkeep-local-binding-genesis002-worker-v1') return Object.freeze({
    syntheticEntry: 'warpkeep:genesis002-binding-entry', builder: 'withGenesis002LinuxLockedSourceBuild',
    modulePath: 'spacetimedb/genesis002', stateChild: 'genesis002-locked-source-builds-v1',
  });
  if (profile === 'warpkeep-local-binding-genesis001-worker-v1') return Object.freeze({
    syntheticEntry: 'warpkeep:genesis001-binding-entry', builder: 'withGenesis001LinuxLockedSourceBuild',
    modulePath: 'spacetimedb', stateChild: 'genesis001-locked-source-builds-v1',
  });
  if (profile === GENESIS001_COMPATIBILITY_PROFILE) return Object.freeze({
    syntheticEntry: 'warpkeep:genesis001-compatibility-entry',
    modulePath: 'spacetimedb', stateChild: '', compatibility: true,
  });
  fail('LOCAL_BINDING_WORKER_REQUEST_INVALID');
}

function bindPrivateBuildOutput(request, lane, materializedRoot) {
  const expectedParent = join(request.materializationRoot, lane.stateChild);
  const name = basename(materializedRoot);
  const moduleRoot = join(materializedRoot, ...lane.modulePath.split('/'));
  try {
    if (dirname(materializedRoot) !== expectedParent || !/^[0-9a-f]{32}$/u.test(name)) {
      fail('LOCAL_BINDING_WORKER_BUILD_OUTPUT_INVALID');
    }
    for (const path of [expectedParent, materializedRoot, moduleRoot]) {
      const state = lstatSync(path, { bigint: true });
      if (!state.isDirectory() || state.isSymbolicLink() || state.uid !== 1000n
          || (state.mode & 0o7777n) !== 0o700n || realpathSync(path) !== path) {
        fail('LOCAL_BINDING_WORKER_BUILD_OUTPUT_INVALID');
      }
    }
  } catch (error) {
    if (error?.code === 'LOCAL_BINDING_WORKER_BUILD_OUTPUT_INVALID') throw error;
    fail('LOCAL_BINDING_WORKER_BUILD_OUTPUT_INVALID', error);
  }
  const output = join(moduleRoot, 'dist');
  return Object.freeze({
    moduleRoot,
    create() {
      try {
        mkdirSync(output, { recursive: false, mode: 0o700 });
        const state = lstatSync(output, { bigint: true });
        if (!state.isDirectory() || state.isSymbolicLink() || state.uid !== 1000n
            || (state.mode & 0o7777n) !== 0o700n || realpathSync(output) !== output
            || dirname(output) !== moduleRoot) {
          fail('LOCAL_BINDING_WORKER_BUILD_OUTPUT_INVALID');
        }
      } catch (error) {
        if (error?.code === 'LOCAL_BINDING_WORKER_BUILD_OUTPUT_INVALID') throw error;
        fail('LOCAL_BINDING_WORKER_BUILD_OUTPUT_INVALID', error);
      }
    },
  });
}

function command(executable, args, cwd, timeout, env = process.env) {
  const result = spawnSync(executable, args, {
    cwd, env, shell: false, stdio: ['ignore', 'pipe', 'pipe'],
    encoding: 'buffer', timeout, maxBuffer: MAX_COMMAND_OUTPUT,
  });
  if (result.status !== 0 || result.signal !== null || result.error !== undefined
      || !Buffer.isBuffer(result.stdout) || !Buffer.isBuffer(result.stderr)
      || result.stdout.length > MAX_COMMAND_OUTPUT || result.stderr.length > MAX_COMMAND_OUTPUT) {
    fail(result.error?.code === 'ETIMEDOUT'
      ? 'LOCAL_BINDING_WORKER_COMMAND_TIMEOUT' : 'LOCAL_BINDING_WORKER_COMMAND_FAILED', result.error);
  }
}

function genesis001CommandEnvironment(request) {
  const operationRoot = dirname(request.repositoryRoot);
  const home = join(operationRoot, 'home');
  const temporary = join(operationRoot, 'tmp');
  for (const path of [home, temporary]) {
    const state = lstatSync(path, { bigint: true });
    if (!state.isDirectory() || state.isSymbolicLink() || state.uid !== 1000n
        || (state.mode & 0o777n) !== 0o700n || realpathSync(path) !== path) {
      fail('LOCAL_BINDING_WORKER_COMPILER_ENVIRONMENT_INVALID');
    }
  }
  return Object.freeze({
    HOME: home, TMPDIR: temporary, PATH: dirname(GENESIS001_NODE_PATH),
    LANG: 'C.UTF-8', LC_ALL: 'C.UTF-8', TZ: 'UTC',
  });
}

function runGenesis002Typecheck(request, moduleRoot) {
  const configPath = join(request.materializationRoot, 'genesis002-typecheck-v1.json');
  const body = Buffer.from(`${JSON.stringify({
    extends: join(moduleRoot, 'tsconfig.json'),
    compilerOptions: {
      baseUrl: moduleRoot,
      paths: {
        spacetimedb: [join(moduleRoot, 'node_modules', 'spacetimedb', 'dist', 'index.d.ts')],
        'spacetimedb/server': [
          join(moduleRoot, 'node_modules', 'spacetimedb', 'dist', 'server', 'index.d.ts'),
        ],
      },
    },
  })}\n`, 'utf8');
  const digest = createHash('sha256').update(body).digest('hex');
  let descriptor;
  let identity;
  let primary;
  try {
    descriptor = openSync(configPath, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL
      | (constants.O_NOFOLLOW ?? 0), 0o600);
    let offset = 0;
    while (offset < body.length) offset += writeSync(descriptor, body, offset, body.length - offset);
    fsyncSync(descriptor);
    closeSync(descriptor);
    descriptor = undefined;
    const opened = readLocalBindingBoundedFile(configPath, {
      maximumBytes: body.length, expectedBytes: body.length, expectedSha256: digest,
      expectedUid: 1000, expectedMode: 0o600,
    });
    opened.body.fill(0);
    identity = opened.identity;
    command(request.nodePath, [
      join(moduleRoot, 'node_modules', 'typescript', 'bin', 'tsc'),
      '--noEmit', '--project', configPath,
    ], moduleRoot, 10 * 60_000);
  } catch (error) { primary = error; }
  let cleanupError;
  try {
    if (descriptor !== undefined) closeSync(descriptor);
    if (identity !== undefined) {
      readLocalBindingBoundedFile(configPath, {
        maximumBytes: body.length, expectedBytes: body.length, expectedSha256: digest,
        expectedUid: 1000, expectedMode: 0o600, expectedIdentity: identity,
      }).body.fill(0);
      unlinkSync(configPath);
      if (process.platform !== 'win32') {
        const directory = openSync(request.materializationRoot,
          constants.O_RDONLY | (constants.O_DIRECTORY ?? 0) | (constants.O_NOFOLLOW ?? 0));
        try { fsyncSync(directory); } finally { closeSync(directory); }
      }
    }
  } catch (error) { cleanupError = error; }
  body.fill(0);
  if (primary !== undefined || cleanupError !== undefined) {
    if (primary !== undefined && cleanupError === undefined) throw primary;
    throw new AggregateError([primary, cleanupError].filter(Boolean), 'LOCAL_BINDING_WORKER_COMMAND_FAILED', {
      cause: primary,
    });
  }
}

function runGenesis002Build(request, lane, materializedRoot, moduleRoot) {
  const dependencyRoot = join(moduleRoot, 'node_modules');
  const sharedModuleRoot = dirname(moduleRoot);
  const linkPath = join(sharedModuleRoot, 'node_modules');
  const target = process.platform === 'win32'
    ? dependencyRoot : join(basename(moduleRoot), 'node_modules');
  let identity;
  let primary;
  try {
    for (const path of [sharedModuleRoot, dependencyRoot]) {
      const state = lstatSync(path, { bigint: true });
      if (!state.isDirectory() || state.isSymbolicLink() || state.uid !== 1000n
          || (state.mode & 0o7777n) !== 0o700n || realpathSync(path) !== path) {
        fail('LOCAL_BINDING_WORKER_BUILD_RESOLUTION_INVALID');
      }
    }
    try {
      lstatSync(linkPath);
      fail('LOCAL_BINDING_WORKER_BUILD_RESOLUTION_INVALID');
    } catch (error) {
      if (error?.code !== 'ENOENT') throw error;
    }
    symlinkSync(target, linkPath, process.platform === 'win32' ? 'junction' : 'dir');
    const state = lstatSync(linkPath, { bigint: true });
    if (!state.isSymbolicLink() || state.uid !== 1000n || realpathSync(linkPath) !== dependencyRoot) {
      fail('LOCAL_BINDING_WORKER_BUILD_RESOLUTION_INVALID');
    }
    identity = directoryIdentity(state);
    command(request.cliPath, ['build', '--module-path', lane.modulePath], materializedRoot, 10 * 60_000);
  } catch (error) { primary = error; }
  let cleanupError;
  try {
    if (identity !== undefined) {
      const state = lstatSync(linkPath, { bigint: true });
      if (!state.isSymbolicLink() || !sameDirectoryIdentity(state, identity)
          || realpathSync(linkPath) !== dependencyRoot) {
        fail('LOCAL_BINDING_WORKER_BUILD_RESOLUTION_CHANGED');
      }
      unlinkSync(linkPath);
      if (process.platform !== 'win32') {
        const directory = openSync(sharedModuleRoot,
          constants.O_RDONLY | (constants.O_DIRECTORY ?? 0) | (constants.O_NOFOLLOW ?? 0));
        try { fsyncSync(directory); } finally { closeSync(directory); }
      }
    }
  } catch (error) { cleanupError = error; }
  if (primary !== undefined || cleanupError !== undefined) {
    if (primary !== undefined && cleanupError === undefined) throw primary;
    throw new AggregateError([primary, cleanupError].filter(Boolean), 'LOCAL_BINDING_WORKER_COMMAND_FAILED', {
      cause: primary,
    });
  }
}

function assertWorkerHost() {
  if (process.argv.length !== 2 || process.platform !== 'linux' || process.arch !== 'x64'
      || process.getuid?.() !== 1000 || process.execPath !== '/home/snapmeter/.warpkeep/release-preparation-v1/toolchain/node-v22.22.3-linux-x64/bin/node'
      || process.env.NODE_OPTIONS || JSON.stringify(process.execArgv) !== JSON.stringify(['--experimental-vm-modules'])) {
    fail('LOCAL_BINDING_WORKER_HOST_INVALID');
  }
}

export async function runFixedLocalBindingWorker(input) {
  const request = validateLocalBindingWorkerRequest(input);
  const lane = fixedWorkerLane(request.profile);
  const runtimeAuthority = attestRuntimeExecutables(request);
  const hooks = installLocalBindingNativeTsHooks(request.graph, request.yaml);
  let primary;
  let result;
  try {
    const builder = await import(lane.syntheticEntry);
    if (lane.compatibility === true) {
      const handoffRoot = dirname(request.handoffPath);
      const buildCycle = (builderName, stateChild, label, index) => {
        if (typeof builder[builderName] !== 'function') fail('LOCAL_BINDING_WORKER_BUILDER_INVALID');
        const fixedLane = Object.freeze({ modulePath: 'spacetimedb', stateChild });
        const built = builder[builderName]({
          repositoryRoot: request.repositoryRoot,
          dependencyCacheRoot: request.dependencyCacheRoot,
          materializationParent: request.materializationRoot,
          operation(context) {
            const buildOutput = bindPrivateBuildOutput(request, fixedLane, context.materializedRoot);
            const { moduleRoot } = buildOutput;
            attestRuntimeExecutables(request, runtimeAuthority);
            command(GENESIS001_NODE_PATH, [
              join(moduleRoot, 'node_modules', 'typescript', 'bin', 'tsc'),
              '--noEmit', '--project', join(moduleRoot, 'tsconfig.json'),
            ], moduleRoot, 10 * 60_000, genesis001CommandEnvironment(request));
            attestRuntimeExecutables(request, runtimeAuthority);
            buildOutput.create();
            command(request.cliPath, ['build', '--module-path', 'spacetimedb'],
              context.materializedRoot, 10 * 60_000, genesis001CommandEnvironment(request));
            attestRuntimeExecutables(request, runtimeAuthority);
            const preserved = preserveLocalBindingWorkerBundle({
              bundlePath: join(moduleRoot, 'dist', 'bundle.js'), handoffRoot,
              handoffPath: join(handoffRoot, `${label}-${index}.js`),
            });
            return Object.freeze({
              ...preserved, dependencyClosureDigest: context.dependencyClosureDigest,
              moduleTreeId: context.moduleTreeId,
            });
          },
        });
        if (built.dependencyClosureDigest !== built.result.dependencyClosureDigest
            || built.moduleTreeId !== built.result.moduleTreeId) {
          fail('LOCAL_BINDING_WORKER_PROVENANCE_INVALID');
        }
        return built.result;
      };
      const baselineFirst = buildCycle(
        'withGenesis001BaselineLinuxLockedSourceBuild',
        'genesis001-baseline-locked-source-builds-v1', 'baseline', 1,
      );
      const baselineSecond = buildCycle(
        'withGenesis001BaselineLinuxLockedSourceBuild',
        'genesis001-baseline-locked-source-builds-v1', 'baseline', 2,
      );
      const frozenFirst = buildCycle(
        'withGenesis001LinuxLockedSourceBuild',
        'genesis001-locked-source-builds-v1', 'frozen', 1,
      );
      const frozenSecond = buildCycle(
        'withGenesis001LinuxLockedSourceBuild',
        'genesis001-locked-source-builds-v1', 'frozen', 2,
      );
      const sameCycle = (left, right) => left.sha256 === right.sha256
        && left.dependencyClosureDigest === right.dependencyClosureDigest
        && left.moduleTreeId === right.moduleTreeId
        && Buffer.from(left.bytes).equals(Buffer.from(right.bytes));
      if (!sameCycle(baselineFirst, baselineSecond) || !sameCycle(frozenFirst, frozenSecond)) {
        fail('LOCAL_BINDING_RUNTIME_REPRODUCIBILITY_FAILED');
      }
      if (baselineFirst.sha256 === frozenFirst.sha256
          || baselineFirst.dependencyClosureDigest === frozenFirst.dependencyClosureDigest) {
        fail('LOCAL_BINDING_WORKER_CROSS_LANE_SUBSTITUTION');
      }
      attestRuntimeExecutables(request, runtimeAuthority);
      const proof = await builder.runGenesis001LocalUpgradeProof({
        cliPath: request.cliPath,
        baselineArtifact: Object.freeze({
          path: baselineFirst.path, bytes: baselineFirst.byteLength,
          sha256: baselineFirst.sha256, identity: baselineFirst.identity,
        }),
        frozenArtifact: Object.freeze({
          path: frozenFirst.path, bytes: frozenFirst.byteLength,
          sha256: frozenFirst.sha256, identity: frozenFirst.identity,
        }),
        operationRoot: dirname(request.repositoryRoot),
        environment: genesis001CommandEnvironment(request),
        verifyExecutables: () => attestRuntimeExecutables(request, runtimeAuthority),
      });
      attestRuntimeExecutables(request, runtimeAuthority);
      result = Object.freeze({
        schemaVersion: 1, profile: GENESIS001_COMPATIBILITY_RESULT_PROFILE,
        nonce: request.nonce, sourceCommit: request.sourceCommit, sourceTree: request.sourceTree,
        baselineBundleSha256: baselineFirst.sha256,
        frozenBundleSha256: frozenFirst.sha256,
        baselineDescriptorSha256: proof.baselineDescriptorSha256,
        frozenDescriptorSha256: proof.frozenDescriptorSha256,
        checkedFrozenWriters: proof.checkedFrozenWriters,
      });
    } else {
      if (typeof builder[lane.builder] !== 'function') fail('LOCAL_BINDING_WORKER_BUILDER_INVALID');
      attestRuntimeExecutables(request, runtimeAuthority);
      const builderInput = {
      repositoryRoot: request.repositoryRoot,
      dependencyCacheRoot: request.dependencyCacheRoot,
      materializationParent: request.materializationRoot,
      operation(context) {
        const buildOutput = bindPrivateBuildOutput(request, lane, context.materializedRoot);
        const { moduleRoot } = buildOutput;
        attestRuntimeExecutables(request, runtimeAuthority);
        if (request.profile === 'warpkeep-local-binding-genesis002-worker-v1') {
          runGenesis002Typecheck(request, moduleRoot);
        } else if (isGenesis001Profile(request.profile)) {
          command(GENESIS001_NODE_PATH, [
            join(moduleRoot, 'node_modules', 'typescript', 'bin', 'tsc'),
            '--noEmit', '--project', join(moduleRoot, 'tsconfig.json'),
          ], moduleRoot, 10 * 60_000, genesis001CommandEnvironment(request));
        } else {
          command(request.nodePath, [
            join(moduleRoot, 'node_modules', 'typescript', 'bin', 'tsc'),
            '--noEmit', '--project', join(moduleRoot, 'tsconfig.json'),
          ], moduleRoot, 10 * 60_000);
        }
        attestRuntimeExecutables(request, runtimeAuthority);
        buildOutput.create();
        if (request.profile === 'warpkeep-local-binding-genesis002-worker-v1') {
          runGenesis002Build(request, lane, context.materializedRoot, moduleRoot);
        } else if (isGenesis001Profile(request.profile)) {
          command(request.cliPath, ['build', '--module-path', 'spacetimedb'],
            context.materializedRoot, 10 * 60_000, genesis001CommandEnvironment(request));
        } else {
          command(request.cliPath, ['build', '--module-path', lane.modulePath],
            context.materializedRoot, 10 * 60_000);
        }
        attestRuntimeExecutables(request, runtimeAuthority);
        return createLocalBindingWorkerResult({
          bundlePath: join(moduleRoot, 'dist', 'bundle.js'),
          handoffRoot: dirname(request.handoffPath), handoffPath: request.handoffPath,
          nonce: request.nonce, sourceCommit: request.sourceCommit, sourceTree: request.sourceTree,
          moduleTreeId: context.moduleTreeId,
          dependencyClosureDigest: context.dependencyClosureDigest,
          requestProfile: request.profile,
        });
      },
      };
      if (request.profile !== 'warpkeep-local-binding-genesis001-worker-v1') {
        builderInput.moduleSourceCommit = request.sourceCommit;
      }
      const built = builder[lane.builder](builderInput);
      if (built.dependencyClosureDigest !== built.result.dependencyClosureDigest) {
        fail('LOCAL_BINDING_WORKER_PROVENANCE_INVALID');
      }
      attestRuntimeExecutables(request, runtimeAuthority);
      result = built.result;
    }
  } catch (error) { primary = error; }
  let deregisterError;
  try { hooks.deregister(); } catch (error) { deregisterError = error; }
  if (primary !== undefined || deregisterError !== undefined) {
    if (primary !== undefined && deregisterError === undefined) throw primary;
    throw new AggregateError([primary, deregisterError].filter(Boolean), 'LOCAL_BINDING_WORKER_FAILED', { cause: primary });
  }
  return result;
}

async function main() {
  assertWorkerHost();
  const result = await runFixedLocalBindingWorker(readLocalBindingWorkerRequest());
  process.stdout.write(`${JSON.stringify(result)}\n`);
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(error => {
    process.stderr.write(`${typeof error?.message === 'string' && /^LOCAL_BINDING_[A-Z0-9_]+$/u.test(error.message)
      ? error.message : 'LOCAL_BINDING_WORKER_FAILED'}\n`);
    process.exitCode = 1;
  });
}
