import { spawn } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const mode = process.argv[2];

if (mode === 'binary-child') {
  process.stdout.write(Buffer.from([0x00, 0xff, 0x80, 0x0a]));
} else if (mode === 'stdout-overflow-child') {
  process.stdout.write(Buffer.alloc(1_025, 0x61));
  setInterval(() => {}, 1_000);
} else if (mode === 'stderr-overflow-child') {
  process.stderr.write(Buffer.alloc(1_025, 0x62));
  setInterval(() => {}, 1_000);
} else if (mode === 'descendant-child') {
  writeFileSync(process.argv[3], `${process.pid}\n`, { flag: 'wx', mode: 0o600 });
  setInterval(() => {}, 1_000);
} else if (mode === 'timeout-parent') {
  spawn(process.execPath, [process.argv[1], 'descendant-child', process.argv[3]], {
    env: { LANG: 'C.UTF-8', LC_ALL: 'C.UTF-8' },
    shell: false,
    stdio: ['ignore', 'ignore', 'ignore'],
  });
  setInterval(() => {}, 1_000);
} else if (mode === 'orchestrate') {
  const { runGenesis001NodeBoundedProcess } = await import(
    '../../scripts/bootstrap-genesis001-local-node-process.mjs'
  );
  const root = mkdtempSync(join(tmpdir(), 'warpkeep-node-process-'));
  const pidPath = join(root, 'descendant.pid');
  const env = { LANG: 'C.UTF-8', LC_ALL: 'C.UTF-8' };
  const run = (childMode, options) => runGenesis001NodeBoundedProcess(
    process.execPath,
    [process.argv[1], childMode, pidPath],
    { cwd: root, env, ...options },
  );
  try {
    const binary = await run('binary-child', {
      timeout: 5_000, maxStdout: 4, maxStderr: 16,
    });
    if (!binary.stdout.equals(Buffer.from([0x00, 0xff, 0x80, 0x0a]))) {
      throw new Error('BINARY_CHANGED');
    }
    binary.stdout.fill(0); binary.stderr.fill(0);
    for (const [childMode, expectedCode] of [
      ['stdout-overflow-child', 'GENESIS001_LOCAL_NODE_BOOTSTRAP_PROCESS_STDOUT_LIMIT'],
      ['stderr-overflow-child', 'GENESIS001_LOCAL_NODE_BOOTSTRAP_PROCESS_STDERR_LIMIT'],
    ]) {
      let code;
      try {
        await run(childMode, { timeout: 5_000, maxStdout: 1_024, maxStderr: 1_024 });
      } catch (error) { code = error.code; }
      if (code !== expectedCode) throw new Error(`WRONG_OVERFLOW:${childMode}:${code}`);
    }
    let timeoutCode;
    try {
      await run('timeout-parent', { timeout: 500, maxStdout: 1_024, maxStderr: 1_024 });
    } catch (error) { timeoutCode = error.code; }
    if (timeoutCode !== 'GENESIS001_LOCAL_NODE_BOOTSTRAP_PROCESS_TIMEOUT') {
      throw new Error(`WRONG_TIMEOUT:${timeoutCode}`);
    }
    const descendantPid = Number(readFileSync(pidPath, 'utf8').trim());
    let descendantAlive = true;
    try { process.kill(descendantPid, 0); } catch (error) {
      if (error?.code === 'ESRCH') descendantAlive = false;
      else throw error;
    }
    if (descendantAlive) throw new Error('DESCENDANT_SURVIVED');
    process.stdout.write(`${JSON.stringify({
      binaryHex: '00ff800a', stdoutOverflow: true, stderrOverflow: true,
      timeout: true, descendantTerminated: true,
    })}\n`);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
} else {
  throw new Error('FIXTURE_MODE_INVALID');
}
