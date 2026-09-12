import { acquirePreparedReleaseCandidateLock } from '../../scripts/local-release-candidate-lock.mjs';
try {
  if (process.argv[3] === 'restrictive-umask') process.umask(0o777);
  const lock = acquirePreparedReleaseCandidateLock(process.argv[2]);
  if (process.argv[3] === 'hold') {
    process.stdout.write('READY\n');
    process.stdin.resume();
    process.stdin.on('data', () => { lock.release(); process.exit(0); });
  } else {
    lock.assertActive();
    lock.release();
    process.stdout.write('ACQUIRED\n');
  }
} catch (error) {
  process.stdout.write(`${error.code}\n`);
  process.exitCode = 1;
}
