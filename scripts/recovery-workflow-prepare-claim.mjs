// Executed only by the protected recovery workflow after installation of the
// reviewed compiled module. No runtime compilation, path overrides or receipts
// on stdout: a successful exit is preparation, not deployment authorization.
try {
  if (process.argv.length !== 2) throw new Error('INVALID_ARGUMENTS');
  const { prepareRecoveryWorkflowClaim } = await import('../services/release-recovery/scripts/prepare-recovery-workflow-claim.bundle.mjs');
  const result = await prepareRecoveryWorkflowClaim();
  if (result === null || typeof result !== 'object'
      || Object.keys(result).length !== 1 || result.claimPersisted !== true) throw new Error('INVALID_RESULT');
  process.stdout.write('RECOVERY_WORKFLOW_CLAIM_PREPARED\n');
} catch {
  process.stderr.write('RECOVERY_WORKFLOW_CLAIM_PREPARATION_INVALID\n');
  process.exitCode = 1;
}
