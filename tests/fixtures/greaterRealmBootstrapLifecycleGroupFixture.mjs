import { spawn } from 'node:child_process';

process.stdin.setEncoding('utf8');
process.stdout.write('READY\n');
process.stdin.once('data', () => {
  const descendant = spawn('/bin/sh', [
    '-c', "trap '' INT TERM; while :; do /bin/sleep 0.05; done",
  ], {
    detached: false,
    stdio: 'ignore',
  });
  if (!Number.isSafeInteger(descendant.pid) || descendant.pid < 2) process.exit(65);
  descendant.unref();
  process.stdout.write(`DESCENDANT ${descendant.pid}\n`, () => process.exit(0));
});
