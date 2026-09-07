export const RECOVERY_BINDING_KEYS_V2: readonly string[];
/** Hash projection only; does not validate release semantics or grant authority. */
export function recoveryReceiptCommitmentV2(commitmentKey: string, input: unknown): string;
/** Hash projection only; does not validate release semantics or grant authority. */
export function recoveryAuthorizationCoreSha256(input: unknown): string;
/** Canonical wire decoding only; not semantic binding validation or authority. */
export function parseRecoveryBindingDocumentV2(source: string): Readonly<Record<string, string | number | boolean | null>>;
