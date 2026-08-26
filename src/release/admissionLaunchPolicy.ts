/**
 * Release-bound 0.4.0 policy. Reopening admission requires a future reviewed
 * implementation across every browser surface and both realm backends.
 */
export const NEW_ADMISSIONS_SUSPENDED = true as const;

export const ADMISSIONS_SUSPENDED_NOTICE =
  'Admissions are temporarily suspended. Existing Genesis 001 access is preserved, and no new access requests are being accepted.';
