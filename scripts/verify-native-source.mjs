// Thin maintained CLI; importing the evidence/producer API never executes it.
import { createNativeVerificationPlan, runNativeVerificationPlan } from './native-source-verification.mjs';

try {
  const [mode, ...args] = process.argv.slice(2);
  if (mode === '--help' && args.length === 0 || mode === undefined) {
    process.stdout.write('Native verification first tranche (no release authority).\n'
      + '--plan <exclusive QA plan.json>\n--run <plan.json> <SHA256> <exclusive QA stem> (owned setsid session)\n'
      + 'Collects ordinary, isolated namespace and module pure tests. Services/types/build/policy/preparation remain missing.\n'
      + 'Plan requires existing pinned SPACETIME_BIN, offline .git/yaml-2.9.0.tgz, patched pnpm runtime and installed lock-matching test tools.\n'
      + '--verify-release is refused until the fixed complete verification profile is implemented.\n');
  } else if (mode === '--plan' && args.length === 1) process.stdout.write(JSON.stringify(createNativeVerificationPlan(...args)) + '\n');
  else if (mode === '--run' && args.length === 3) {
    const result = await runNativeVerificationPlan(...args); process.stdout.write(JSON.stringify(result) + '\n');
    if (!result.allRecorded || !result.allTestsPassed) process.exitCode = 1;
  } else throw Error(mode === '--verify-release' ? 'NATIVE_SOURCE_VERIFICATION_INCOMPLETE' : 'NATIVE_SOURCE_VERIFICATION_USAGE');
} catch (error) {
  process.stderr.write(`${/^NATIVE_SOURCE_VERIFICATION_[A-Z_]+$/u.test(error.message) ? error.message : 'NATIVE_SOURCE_VERIFICATION_FAILED'}\n`);
  process.exitCode = 1;
}
