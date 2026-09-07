import { readSync, realpathSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { buildRecoveryWorkflowModule } from './recovery-workflow-bundle-engine.mjs';

const ROOT = '/home/snapmeter/.warpkeep/release-preparation-v1';
let compiler;
try {
  if (process.platform !== 'linux' || process.arch !== 'x64' || process.getuid?.() !== 1000
    || process.execPath !== `${ROOT}/toolchain/node-v22.22.3-linux-x64/bin/node`
    || process.argv.length !== 2 || JSON.stringify(process.execArgv) !== '["--no-warnings"]'
    || Object.keys(process.env).some(key => /TOKEN|SECRET|PASSWORD|CREDENTIAL|AUTH|COOKIE|API_KEY|NODE_OPTIONS|NODE_PATH|ESBUILD_/iu.test(key))) throw new Error('HOST');
  const sourceRoot = dirname(dirname(fileURLToPath(import.meta.url)));
  const operationRoot = dirname(sourceRoot);
  if (!sourceRoot.startsWith(`${ROOT}/runs/`)
    || !/^recovery-bundle-[0-9a-f]{32}\/source$/.test(sourceRoot.slice(`${ROOT}/runs/`.length))
    || realpathSync(sourceRoot) !== sourceRoot) throw new Error('SOURCE');
  const request = Buffer.alloc(33); let size = 0;
  while (size < request.length) {
    const count = readSync(3, request, size, request.length - size, null);
    if (count === 0) break;
    size += count;
  }
  const value = request.subarray(0, size).toString('utf8');
  if (!['{"cycle":1}\n', '{"cycle":2}\n'].includes(value)) throw new Error('REQUEST');
  const cycle = JSON.parse(value).cycle;
  const materialization = join(operationRoot, `cycle-${cycle}`);
  if (process.cwd() !== materialization || realpathSync(materialization) !== materialization) throw new Error('CWD');
  compiler = await import(pathToFileURL(join(materialization, 'node_modules/esbuild/lib/main.js')).href);
  const built = await buildRecoveryWorkflowModule(materialization, compiler.build, 'claim');
  compiler.stop(); compiler = undefined;
  process.stdout.write(`${JSON.stringify({bytes: built.bytes.toString('base64'), sha256: built.sha256, inputPaths: built.inputPaths})}\n`);
  built.bytes.fill(0);
} catch {
  process.stderr.write('LOCAL_RECOVERY_BUNDLE_WORKER_INVALID\n'); process.exitCode = 1;
} finally { compiler?.stop(); }
