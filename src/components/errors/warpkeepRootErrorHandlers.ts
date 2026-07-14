function reportSanitizedRootFailure() {
  // React's default root handlers include the Error object and component stack.
  // Keep production browser logs useful but bounded to a closed event name.
  console.error('warpkeep_ui_failure');
}

export const WARPKEEP_ROOT_ERROR_HANDLERS = Object.freeze({
  onCaughtError: reportSanitizedRootFailure,
  onRecoverableError: reportSanitizedRootFailure,
  onUncaughtError: reportSanitizedRootFailure
});
