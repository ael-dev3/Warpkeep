import { pathToFileURL } from 'node:url';

export async function runLocalReleaseAssembler(args) {
  if (!Array.isArray(args) || args.some(arg => typeof arg !== 'string')
    || !((args.length === 1 && args[0] === 'prepare')
      || (args.length === 2 && ['check', 'recover'].includes(args[0])
        && /^release-workspace-[a-f0-9]{32}$/u.test(args[1])))) {
    throw new Error('LOCAL_RELEASE_ASSEMBLER_ARGUMENTS_INVALID');
  }
  const runtime = await import('./local-release-assembler-core.mjs');
  if (args[0] === 'prepare') return runtime.preparePreparedLinuxReleaseSource();
  if (args[0] === 'check') return runtime.checkPreparedLinuxReleaseSource(args[1]);
  return runtime.recoverPreparedLinuxReleaseSource(args[1]);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const result = await runLocalReleaseAssembler(process.argv.slice(2));
    process.stdout.write(`${JSON.stringify(result)}\n`);
  } catch (error) {
    const code = error?.code ?? error?.message;
    process.stderr.write(`${typeof code === 'string' && /^(?:LOCAL|OPERATION)_[A-Z0-9_]+$/u.test(code)
      ? code : 'LOCAL_RELEASE_ASSEMBLER_FAILED'}\n`);
    process.exitCode = 1;
  }
}
