import { bootstrapRecoveryBundleCache } from './bootstrap-operation-bundle-cache.mjs';

try {
  if (process.argv.length !== 2) throw new Error('RECOVERY_BUNDLE_CACHE_ARGUMENTS_INVALID');
  const result = await bootstrapRecoveryBundleCache();
  process.stdout.write(`${JSON.stringify(result)}\n`);
} catch {
  process.stderr.write('RECOVERY_BUNDLE_CACHE_BOOTSTRAP_FAILED\n');
  process.exitCode = 1;
}
