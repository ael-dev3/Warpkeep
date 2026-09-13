export const RECOVERY_BINDING_KEYS_V2: readonly string[];
/** Hash projection only; does not validate release semantics or grant authority. */
export function recoveryReceiptCommitmentV2(commitmentKey: string, input: unknown): string;
/** Hash projection only; does not validate release semantics or grant authority. */
export function recoveryAuthorizationCoreSha256(input: unknown): string;
/** Canonical wire decoding only; not semantic binding validation or authority. */
export function parseRecoveryBindingDocumentV2(source: string): Readonly<Record<string, string | number | boolean | null>>;

export const RECOVERY_BINDING_KEYS_V3: readonly string[];
export const RECOVERY_BINDING_KEYS_V4: readonly string[];
export const RECOVERY_BINDING_KEYS_V5: readonly string[];
export function recoveryBindingKeys(version: 2 | 3 | 4 | 5): readonly string[];
/** Canonical V5 wire decoding only; no signed adoption authority. */
export function parseRecoveryBindingDocumentV5(source: string): Readonly<Record<string, string | number | boolean | null>>;
export function recoveryReceiptCommitmentV5(commitmentKey: string, input: unknown): string;
export function recoveryAuthorizationCoreSha256V5(input: unknown): string;
/** Canonical wire decoding only; does not authenticate an existing-update receipt. */
export function parseRecoveryBindingDocumentV3(source: string): Readonly<Record<string, string | number | boolean | null>>;
/** Canonical wire decoding only; does not authenticate signed adoption evidence. */
export function parseRecoveryBindingDocumentV4(source: string): Readonly<Record<string, string | number | boolean | null>>;
/** Explicit version dispatch with no invalid-version fallback. */
export function parseRecoveryBindingDocument(source: string): Readonly<Record<string, string | number | boolean | null>>;
/** V3 hash projection only; no source authentication or deployment authority. */
export function recoveryReceiptCommitmentV3(commitmentKey: string, input: unknown): string;
/** V4 hash projection only; no receipt authentication or deployment authority. */
export function recoveryReceiptCommitmentV4(commitmentKey: string, input: unknown): string;
export function recoveryReceiptCommitment(commitmentKey: string, input: unknown): string;
export function recoveryAuthorizationCoreSha256V3(input: unknown): string;
export function recoveryAuthorizationCoreSha256V4(input: unknown): string;
export function recoveryAuthorizationCoreSha256ForBinding(input: unknown): string;
