import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

import {
  derivePreparedLinuxOperationBundlesCore,
  OperationBundleRuntimeError,
} from './local-operation-bundle-runtime-core.mjs';

const WSL_PATH = 'C:/Windows/System32/wsl.exe';
const WSL_ARGUMENTS = Object.freeze([
  '--distribution', 'Ubuntu-24.04', '--user', 'snapmeter', '--',
  '/usr/bin/env', '-i', 'LANG=C.UTF-8', 'LC_ALL=C.UTF-8',
  '/home/snapmeter/.warpkeep/release-preparation-v1/toolchain/node-v22.22.3-linux-x64/bin/node',
  '/mnt/c/Users/heyas/Documents/Codex/2026-08-11/pl/Warpkeep-0.4.0-worktree/scripts/local-operation-bundle-runtime.mjs',
]);

function fail(code, cause) {
  throw new OperationBundleRuntimeError(code, cause === undefined ? undefined : { cause });
}

export async function derivePreparedLinuxOperationBundles(...arguments_) {
  if (arguments_.length !== 0) fail('OPERATION_BUNDLE_RUNTIME_ARGUMENTS_INVALID');
  if (process.platform !== 'linux') fail('OPERATION_BUNDLE_RUNTIME_HOST_INVALID');
  return derivePreparedLinuxOperationBundlesCore();
}

function metadata(result) {
  return Object.freeze({
    profile: result.profile,
    sourceCommit: result.sourceCommit,
    sourceTree: result.sourceTree,
    bundles: Object.freeze(result.bundles.map(bundle => Object.freeze({
      lane: bundle.lane,
      basename: bundle.basename,
      bundleBytes: bundle.bytes.byteLength,
      byteDigest: bundle.byteDigest,
      sourceClosureDigest: bundle.sourceClosureDigest,
      graphCount: bundle.graphManifest.length,
      exportCount: bundle.exportNames.length,
      load: bundle.load,
    }))),
  });
}

function validateCliMetadata(source) {
  if (typeof source !== 'string' || Buffer.byteLength(source) > 64 * 1024 || !source.endsWith('\n')) {
    fail('OPERATION_BUNDLE_RUNTIME_WSL_RESULT_INVALID');
  }
  let value;
  try { value = JSON.parse(source); } catch (error) {
    fail('OPERATION_BUNDLE_RUNTIME_WSL_RESULT_INVALID', error);
  }
  if (`${JSON.stringify(value)}\n` !== source
      || value?.profile !== 'warpkeep-spacetime-binding-final-preparation-linux-x64-v1'
      || !/^[0-9a-f]{40}$/u.test(value.sourceCommit ?? '')
      || !/^[0-9a-f]{40}$/u.test(value.sourceTree ?? '')
      || !Array.isArray(value.bundles)
      || JSON.stringify(value.bundles.map(bundle => bundle?.lane))
        !== JSON.stringify(['activation', 'g001', 'g002', 'ptr'])
      || value.bundles.some(bundle => Object.hasOwn(bundle ?? {}, 'bytes')
        || !Number.isSafeInteger(bundle?.bundleBytes) || bundle.bundleBytes < 1
        || !Number.isSafeInteger(bundle?.graphCount) || bundle.graphCount < 1
        || !/^[0-9a-f]{64}$/u.test(bundle?.byteDigest ?? '')
        || !/^[0-9a-f]{64}$/u.test(bundle?.sourceClosureDigest ?? '')
        || bundle?.load?.profile !== 'warpkeep-linux-operation-bundle-load-v1'
        || bundle.load.byteDigest !== bundle.byteDigest)) {
    fail('OPERATION_BUNDLE_RUNTIME_WSL_RESULT_INVALID');
  }
  return value;
}

async function cli() {
  if (process.platform === 'win32') {
    const child = spawnSync(WSL_PATH, WSL_ARGUMENTS, {
      env: {}, encoding: 'utf8', shell: false, windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 64 * 1024,
      timeout: 45 * 60_000,
    });
    if (child.status !== 0 || child.signal !== null || child.error !== undefined || child.stderr !== '') {
      fail('OPERATION_BUNDLE_RUNTIME_WSL_FAILED', child.error);
    }
    return validateCliMetadata(child.stdout);
  }
  return metadata(await derivePreparedLinuxOperationBundles());
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  if (process.argv.length !== 2) {
    process.stderr.write('OPERATION_BUNDLE_RUNTIME_ARGUMENTS_INVALID\n');
    process.exitCode = 1;
  } else {
    cli().then(result => process.stdout.write(`${JSON.stringify(result)}\n`)).catch(error => {
      process.stderr.write(`${error?.code ?? error?.message ?? 'OPERATION_BUNDLE_RUNTIME_FAILED'}\n`);
      process.exitCode = 1;
    });
  }
}

export { OperationBundleRuntimeError };
