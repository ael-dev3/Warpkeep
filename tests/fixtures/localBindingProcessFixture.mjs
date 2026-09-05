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
} else {
  throw new Error('UNKNOWN_LOCAL_BINDING_PROCESS_FIXTURE');
}
