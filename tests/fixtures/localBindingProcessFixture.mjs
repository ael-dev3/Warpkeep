import { readFileSync } from 'node:fs';

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
} else if (scenario === 'success') {
  process.stdout.write('ok');
} else if (scenario === 'fd3-early-exit') {
  process.exit(0);
} else if (scenario === 'fd3-success') {
  process.stdout.write(readFileSync(3, 'utf8'));
} else {
  throw new Error('UNKNOWN_LOCAL_BINDING_PROCESS_FIXTURE');
}
