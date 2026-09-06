import { chmodSync, existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { runLocalBindingBoundedProcess } from '../../scripts/local-binding-runtime-process.mjs';

const fixture = join(import.meta.dirname, 'localBindingProcessFixture.mjs');
const scenario = process.argv[2] ?? 'timeout-descendant';
const expectedCode = scenario === 'timeout-descendant'
  ? 'LOCAL_BINDING_RUNTIME_PROCESS_TIMEOUT'
  : scenario === 'failure-descendant'
    ? 'LOCAL_BINDING_RUNTIME_PROCESS_FAILED'
    : 'LOCAL_BINDING_RUNTIME_PROCESS_CONTAINMENT_FAILED';
const root = mkdtempSync(join(tmpdir(), 'local-binding-group-proof-'));
chmodSync(root, 0o700);
const pidPath = join(root, 'pids.json');
const delay = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));
const exists = pid => {
  try { process.kill(pid, 0); return true; } catch (error) {
    if (error?.code === 'ESRCH') return false;
    throw error;
  }
};

let pids;
let error;
try {
  const pending = runLocalBindingBoundedProcess(process.execPath, [fixture, scenario, pidPath], {
    cwd: root, env: { PATH: process.env.PATH }, maxOutput: 1024, timeout: 150,
    containProcessGroup: true,
  }).catch(caught => caught);
  const pidDeadline = Date.now() + 3_000;
  while (!existsSync(pidPath) && Date.now() < pidDeadline) await delay(10);
  if (!existsSync(pidPath)) throw new Error('LOCAL_BINDING_PROCESS_GROUP_PID_TIMEOUT');
  pids = JSON.parse(readFileSync(pidPath, 'utf8'));
  error = await pending;
  await delay(50);
  const result = {
    code: error?.code,
    parentSurvives: exists(pids.parent),
    descendantSurvives: exists(pids.descendant),
  };
  process.stdout.write(`${JSON.stringify(result)}\n`);
  if (result.code !== expectedCode
      || result.parentSurvives || result.descendantSurvives) process.exitCode = 1;
} finally {
  for (const pid of [pids?.descendant, pids?.parent]) {
    if (Number.isSafeInteger(pid) && exists(pid)) {
      try { process.kill(pid, 'SIGKILL'); } catch { /* best-effort fixture cleanup */ }
    }
  }
  rmSync(root, { recursive: true, force: true });
}
