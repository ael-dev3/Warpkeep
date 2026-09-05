import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { closeSync, constants, fstatSync, lstatSync, openSync, readSync } from 'node:fs';
import { dirname, join } from 'node:path';

import { installLocalBindingNativeTsHooks } from './local-binding-native-ts-hooks.mjs';
import { validateLocalBindingWorkerRequest } from './local-binding-runtime-core.mjs';
import { createLocalBindingWorkerResult } from './local-binding-runtime-worker-result.mjs';

const MAX_REQUEST_BYTES = 1024 * 1024;
const MAX_COMMAND_OUTPUT = 4 * 1024 * 1024;
const CLI_BYTES = 47905552;
const CLI_SHA256 = 'cac13c929049f31cb588c230a0d7fe5f388505b4c64047a68b1d5cfdc811624b';
const STANDALONE_BYTES = 130219584;
const STANDALONE_SHA256 = 'a9185a737c9b739896c8f51326e1c3aedefba80a0f01def76ce26f358d5c187b';

function fail(code, cause) {
  throw new Error(code, cause === undefined ? undefined : { cause });
}

function readRequest() {
  const descriptor = 3;
  const chunks = [];
  let total = 0;
  while (true) {
    const chunk = Buffer.allocUnsafe(Math.min(64 * 1024, MAX_REQUEST_BYTES + 1 - total));
    const count = readSync(descriptor, chunk, 0, chunk.length, null);
    if (count === 0) break;
    total += count;
    if (total > MAX_REQUEST_BYTES) fail('LOCAL_BINDING_WORKER_REQUEST_INVALID');
    chunks.push(chunk.subarray(0, count));
  }
  const source = Buffer.concat(chunks).toString('utf8');
  if (!source.endsWith('\n')) fail('LOCAL_BINDING_WORKER_REQUEST_INVALID');
  let value;
  try { value = JSON.parse(source); } catch { fail('LOCAL_BINDING_WORKER_REQUEST_INVALID'); }
  if (`${JSON.stringify(value)}\n` !== source) fail('LOCAL_BINDING_WORKER_REQUEST_INVALID');
  return validateLocalBindingWorkerRequest(value);
}

function attestExecutable(path, bytes, digest) {
  const before = lstatSync(path, { bigint: true });
  if (!before.isFile() || before.isSymbolicLink() || before.nlink !== 1n || before.uid !== 1000n
      || before.size !== BigInt(bytes) || (before.mode & 0o111n) === 0n) {
    fail('LOCAL_BINDING_WORKER_EXECUTABLE_INVALID');
  }
  let descriptor;
  let primary;
  try {
    descriptor = openSync(path, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
    const opened = fstatSync(descriptor, { bigint: true });
    if (opened.dev !== before.dev || opened.ino !== before.ino || opened.mode !== before.mode
        || opened.size !== before.size || opened.mtimeNs !== before.mtimeNs || opened.ctimeNs !== before.ctimeNs) {
      fail('LOCAL_BINDING_WORKER_EXECUTABLE_CHANGED');
    }
    const hash = createHash('sha256');
    const buffer = Buffer.allocUnsafe(1024 * 1024);
    let position = 0;
    while (position < bytes) {
      const count = readSync(descriptor, buffer, 0, Math.min(buffer.length, bytes - position), position);
      if (count === 0) break;
      hash.update(buffer.subarray(0, count));
      position += count;
    }
    if (position !== bytes || hash.digest('hex') !== digest) fail('LOCAL_BINDING_WORKER_EXECUTABLE_CHANGED');
  } catch (error) { primary = error; }
  let closeError;
  try { if (descriptor !== undefined) closeSync(descriptor); } catch (error) { closeError = error; }
  if (primary !== undefined || closeError !== undefined) {
    if (primary !== undefined && closeError === undefined) throw primary;
    throw new AggregateError([primary, closeError].filter(Boolean), 'LOCAL_BINDING_WORKER_EXECUTABLE_READ_FAILED', {
      cause: primary,
    });
  }
}

function command(executable, args, cwd, timeout) {
  const result = spawnSync(executable, args, {
    cwd, env: process.env, shell: false, stdio: ['ignore', 'pipe', 'pipe'],
    encoding: 'buffer', timeout, maxBuffer: MAX_COMMAND_OUTPUT,
  });
  if (result.status !== 0 || result.signal !== null || result.error !== undefined
      || result.stdout.length > MAX_COMMAND_OUTPUT || result.stderr.length > MAX_COMMAND_OUTPUT) {
    fail(result.error?.code === 'ETIMEDOUT'
      ? 'LOCAL_BINDING_WORKER_COMMAND_TIMEOUT' : 'LOCAL_BINDING_WORKER_COMMAND_FAILED', result.error);
  }
}

async function main() {
  if (process.argv.length !== 2 || process.platform !== 'linux' || process.arch !== 'x64'
      || process.getuid?.() !== 1000 || process.execPath !== '/home/snapmeter/.warpkeep/release-preparation-v1/toolchain/node-v22.22.3-linux-x64/bin/node'
      || process.env.NODE_OPTIONS || JSON.stringify(process.execArgv) !== JSON.stringify(['--experimental-vm-modules'])) {
    fail('LOCAL_BINDING_WORKER_HOST_INVALID');
  }
  const request = readRequest();
  attestExecutable(request.cliPath, CLI_BYTES, CLI_SHA256);
  attestExecutable(join(dirname(request.cliPath), 'spacetimedb-standalone'), STANDALONE_BYTES, STANDALONE_SHA256);
  const hooks = installLocalBindingNativeTsHooks(request.graph, request.yaml);
  let primary;
  let result;
  try {
    const builder = await import('warpkeep:ptr-binding-entry');
    if (typeof builder.withPtrLinuxLockedSourceBuild !== 'function') fail('LOCAL_BINDING_WORKER_BUILDER_INVALID');
    const built = builder.withPtrLinuxLockedSourceBuild({
      repositoryRoot: request.repositoryRoot,
      moduleSourceCommit: request.sourceCommit,
      dependencyCacheRoot: request.dependencyCacheRoot,
      materializationParent: request.materializationRoot,
      operation(context) {
        const ptrRoot = join(context.materializedRoot, 'spacetimedb', 'ptr');
        command(request.nodePath, [
          join(ptrRoot, 'node_modules', 'typescript', 'bin', 'tsc'),
          '--noEmit', '--project', join(ptrRoot, 'tsconfig.json'),
        ], ptrRoot, 10 * 60_000);
        command(request.cliPath, ['build', '--module-path', 'spacetimedb/ptr'], context.materializedRoot, 10 * 60_000);
        attestExecutable(request.cliPath, CLI_BYTES, CLI_SHA256);
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
    result = built.result;
  } catch (error) { primary = error; }
  let deregisterError;
  try { hooks.deregister(); } catch (error) { deregisterError = error; }
  if (primary !== undefined || deregisterError !== undefined) {
    if (primary !== undefined && deregisterError === undefined) throw primary;
    throw new AggregateError([primary, deregisterError].filter(Boolean), 'LOCAL_BINDING_WORKER_FAILED', { cause: primary });
  }
  process.stdout.write(`${JSON.stringify(result)}\n`);
}

main().catch(error => {
  process.stderr.write(`${typeof error?.message === 'string' && /^LOCAL_BINDING_[A-Z0-9_]+$/u.test(error.message)
    ? error.message : 'LOCAL_BINDING_WORKER_FAILED'}\n`);
  process.exitCode = 1;
});
