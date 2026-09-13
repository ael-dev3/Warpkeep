// Native test transport only. The production caller has no fixture selector,
// path/factory override, or test capability. This process never calls real fetch.
import { registerHooks, syncBuiltinESMExports } from 'node:module';
import fs, { readFileSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const scenario = process.argv[2];
let closureManifestOpens = 0;
if (scenario === 'observe-closure') {
  const closureManifestPath = `${process.cwd()}/scripts/auth-bridge-notification-prepared-deploy-closure-v1.json`;
  const openSync = fs.openSync;
  // Observe the real closure reader without changing its arguments, bytes,
  // exceptions or return value. This distinguishes graph rejection from a
  // later outer-closure rejection after a committed graph mutation.
  fs.openSync = function (...args) {
    if (args[0] === closureManifestPath) closureManifestOpens += 1;
    return Reflect.apply(openSync, fs, args);
  };
  syncBuiltinESMExports();
}
const closureObservation = () => scenario === 'observe-closure' ? { closureManifestOpens } : {};

const commit = process.env.GITHUB_SHA;
const api = 'https://api.github.com/repos/ael-dev3/Warpkeep';
const repository = { id: 1273513252, name: 'Warpkeep', full_name: 'ael-dev3/Warpkeep',
  default_branch: 'main', archived: false, disabled: false, owner: { id: 183124839, login: 'ael-dev3' } };
const run = (operation = false) => ({ id: operation ? 7001 : 4001, run_attempt: 1, run_number: operation ? 30 : 21,
  workflow_id: operation ? 200 : 100, name: operation ? 'Sealed Realms Production' : 'Verify',
  path: operation ? '.github/workflows/sealed-realms-production.yml' : '.github/workflows/verify.yml',
  event: operation ? 'workflow_dispatch' : 'push', status: operation ? 'in_progress' : 'completed',
  conclusion: operation ? null : 'success', head_branch: 'main', head_sha: commit,
  url: `${api}/actions/runs/${operation ? 7001 : 4001}`,
  workflow_url: `${api}/actions/workflows/${operation ? 200 : 100}`,
  repository, head_repository: repository, head_commit: { id: commit, tree_id: 'a'.repeat(40) } });
const calls = [];
globalThis.fetch = async (input, options) => {
  const url = String(input);
  if (options?.method !== 'GET' || !url.startsWith(`${api}`)) throw new Error('fixture forbids all other transport');
  calls.push(url);
  let value;
  if (url === api) value = repository;
  else if (url === `${api}/branches/main`) value = { name: 'main', protected: true, commit: { sha: commit } };
  else if (url === `${api}/actions/runs/7001`) value = run(true);
  else if (url.startsWith(`${api}/actions/workflows/verify.yml/runs?`)) value = { total_count: 1, workflow_runs: [run()] };
  else if ([`${api}/actions/runs/4001`, `${api}/actions/runs/4001/attempts/1`].includes(url)) value = run();
  else throw new Error('unexpected fixed endpoint');
  if (scenario === 'failed-verify' && value.workflow_runs) value.workflow_runs[0].conclusion = 'failure';
  if (scenario === 'changed-source-after-auth' && calls.length === 2) {
    const path = 'scripts/sealed-realms-production-g001-workflow-entry.mjs';
    writeFileSync(path, `${readFileSync(path, 'utf8')}\n`);
  }
  const body = JSON.stringify(value);
  const response = new Response(body, { headers: { 'content-type': 'application/json', 'content-length': String(Buffer.byteLength(body)) } });
  Object.defineProperty(response, 'url', { value: url });
  return response;
};
if (scenario === 'changed-import' || scenario === 'extra-export') {
  registerHooks({ load(url, context, next) {
    const result = next(url, context);
    if (url.endsWith('/sealed-realms-production-g001-lane.bundle.mjs')) {
      const source = typeof result.source === 'string' ? result.source : Buffer.from(result.source).toString();
      return { ...result, source: `${source}\n${scenario === 'extra-export' ? 'export const extra = true;' : '// changed between file verification and import'}\n` };
    }
    return result;
  } });
}
const module = await import(pathToFileURL(`${process.cwd()}/scripts/sealed-realms-production-linux-preflight.mjs`).href);
try {
  const operation = process.env.WARPKEEP_OPERATION;
  const runOperation = operation === 'preflight'
    ? module.runSealedRealmsProductionLinuxPreflight : module.runSealedRealmsProductionLinuxOperation;
  const result = await runOperation({ operation, workflowInputSha: commit });
  process.stdout.write(`${JSON.stringify({ result, calls: calls.length, onlyReadRequests: true, ...closureObservation() })}\n`);
} catch (error) {
  process.stdout.write(`${JSON.stringify({ phase: error.phase, calls: calls.length, onlyReadRequests: true, ...closureObservation() })}\n`);
  process.exitCode = 1;
}
