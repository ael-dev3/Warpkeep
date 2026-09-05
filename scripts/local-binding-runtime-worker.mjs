import { spawnSync } from 'node:child_process';
import { lstatSync, realpathSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { pathToFileURL } from 'node:url';

import { readLocalBindingBoundedFile } from './local-binding-bounded-file.mjs';
import { installLocalBindingNativeTsHooks } from './local-binding-native-ts-hooks.mjs';
import { validateLocalBindingWorkerRequest } from './local-binding-runtime-core.mjs';
import { createLocalBindingWorkerResult } from './local-binding-runtime-worker-result.mjs';
import { readLocalBindingWorkerRequest } from './local-binding-runtime-worker-request.mjs';

const MAX_COMMAND_OUTPUT = 4 * 1024 * 1024;
const CLI_BYTES = 47905552;
const CLI_SHA256 = 'cac13c929049f31cb588c230a0d7fe5f388505b4c64047a68b1d5cfdc811624b';
const STANDALONE_BYTES = 130219584;
const STANDALONE_SHA256 = 'a9185a737c9b739896c8f51326e1c3aedefba80a0f01def76ce26f358d5c187b';
const NODE_BYTES = 124819136;
const NODE_SHA256 = 'e6ec2c188d83d813f81f2de8aea084d74dce603ac1abedd0a30ad941b10087b2';
const GIT_PATH = '/usr/bin/git';
const GIT_SHA256 = '2a8c18fbf43da9f692d75474c72bea9dfd796c260b0f3dfe456376abc3bbd668';

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
  return Object.freeze({
    directory: directoryIdentity(directory),
    node: attestExecutable(request.nodePath, NODE_BYTES, NODE_SHA256, 1000, undefined, expected?.node),
    git: attestExecutable(GIT_PATH, undefined, GIT_SHA256, 0, undefined, expected?.git),
    cli: attestExecutable(request.cliPath, CLI_BYTES, CLI_SHA256, 1000, 0o500, expected?.cli),
    standalone: attestExecutable(join(snapshotDirectory, 'spacetimedb-standalone'),
      STANDALONE_BYTES, STANDALONE_SHA256, 1000, 0o500, expected?.standalone),
  });
}

function command(executable, args, cwd, timeout) {
  const result = spawnSync(executable, args, {
    cwd, env: process.env, shell: false, stdio: ['ignore', 'pipe', 'pipe'],
    encoding: 'buffer', timeout, maxBuffer: MAX_COMMAND_OUTPUT,
  });
  if (result.status !== 0 || result.signal !== null || result.error !== undefined
      || !Buffer.isBuffer(result.stdout) || !Buffer.isBuffer(result.stderr)
      || result.stdout.length > MAX_COMMAND_OUTPUT || result.stderr.length > MAX_COMMAND_OUTPUT) {
    fail(result.error?.code === 'ETIMEDOUT'
      ? 'LOCAL_BINDING_WORKER_COMMAND_TIMEOUT' : 'LOCAL_BINDING_WORKER_COMMAND_FAILED', result.error);
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
  const runtimeAuthority = attestRuntimeExecutables(request);
  const hooks = installLocalBindingNativeTsHooks(request.graph, request.yaml);
  let primary;
  let result;
  try {
    const builder = await import('warpkeep:ptr-binding-entry');
    if (typeof builder.withPtrLinuxLockedSourceBuild !== 'function') fail('LOCAL_BINDING_WORKER_BUILDER_INVALID');
    attestRuntimeExecutables(request, runtimeAuthority);
    const built = builder.withPtrLinuxLockedSourceBuild({
      repositoryRoot: request.repositoryRoot,
      moduleSourceCommit: request.sourceCommit,
      dependencyCacheRoot: request.dependencyCacheRoot,
      materializationParent: request.materializationRoot,
      operation(context) {
        const ptrRoot = join(context.materializedRoot, 'spacetimedb', 'ptr');
        attestRuntimeExecutables(request, runtimeAuthority);
        command(request.nodePath, [
          join(ptrRoot, 'node_modules', 'typescript', 'bin', 'tsc'),
          '--noEmit', '--project', join(ptrRoot, 'tsconfig.json'),
        ], ptrRoot, 10 * 60_000);
        attestRuntimeExecutables(request, runtimeAuthority);
        command(request.cliPath, ['build', '--module-path', 'spacetimedb/ptr'], context.materializedRoot, 10 * 60_000);
        attestRuntimeExecutables(request, runtimeAuthority);
        return createLocalBindingWorkerResult({
          bundlePath: join(ptrRoot, 'dist', 'bundle.js'),
          handoffRoot: dirname(request.handoffPath), handoffPath: request.handoffPath,
          nonce: request.nonce, sourceCommit: request.sourceCommit, sourceTree: request.sourceTree,
          moduleTreeId: context.moduleTreeId,
          dependencyClosureDigest: context.dependencyClosureDigest,
        });
      },
    });
    if (built.dependencyClosureDigest !== built.result.dependencyClosureDigest) {
      fail('LOCAL_BINDING_WORKER_PROVENANCE_INVALID');
    }
    attestRuntimeExecutables(request, runtimeAuthority);
    result = built.result;
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
