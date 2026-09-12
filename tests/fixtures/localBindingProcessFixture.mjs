import { spawn } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

const scenario = process.argv[2];

if (scenario === 'output') {
  process.stdout.write('x'.repeat(4096));
} else if (scenario === 'nonzero') {
  process.stderr.write('controlled failure');
  process.exitCode = 7;
} else if (scenario === 'signal') {
  process.kill(process.pid, 'SIGTERM');
} else if (scenario === 'timeout') {
  setInterval(() => {}, 1000);
} else if (['timeout-descendant', 'failure-descendant', 'success-descendant'].includes(scenario)) {
  const descendant = spawn(process.execPath, [import.meta.filename, 'timeout'], {
    stdio: 'ignore', shell: false,
  });
  writeFileSync(process.argv[3], `${JSON.stringify({ parent: process.pid, descendant: descendant.pid })}\n`, {
    flag: 'wx', mode: 0o600,
  });
  if (scenario === 'success-descendant' && process.argv[4] !== undefined) {
    mkdirSync(dirname(process.argv[4]), { mode: 0o700 });
    writeFileSync(process.argv[4], 'retained evidence', { flag: 'wx', mode: 0o600 });
  }
  if (scenario === 'timeout-descendant') setInterval(() => {}, 1000);
  else process.exit(scenario === 'failure-descendant' ? 7 : 0);
} else if (scenario === 'success') {
  process.stdout.write('ok');
} else if (scenario === 'fd3-early-exit') {
  process.exit(0);
} else if (scenario === 'fd3-success') {
  process.stdout.write(readFileSync(3, 'utf8'));
} else {
  throw new Error('UNKNOWN_LOCAL_BINDING_PROCESS_FIXTURE');
}
