/** Static consistency only; no source/receipt authentication or deployment authority. */
export function validateRecoveryActivationCandidate(source: string): Readonly<Record<string, string | number | boolean | null>>;
/** Static generation only; no installation, signature, or source authentication. */
export function createRecoveryActivationBinding(source: string): Readonly<Record<string, string | number | boolean | null>>;
/** Static semantics and hash consistency only; no live deployment authority. */
export function parseRecoveryBindingV2(source: string): Readonly<Record<string, string | number | boolean | null>>;
/** Fixed wire policy only; never fills absent live/source facts or grants authority. */
export function recoveryActivationCandidatePolicy(): Readonly<Record<string, string | number | boolean | null>>;

/** Static policy only; V4 describes observed preservation without PTR initialization claims. */
export function recoveryActivationCandidatePolicyForVersion(version: 2 | 3 | 4 | 5): Readonly<Record<string, string | number | boolean | null>>;
/** V5 static consistency only; no signed evidence authentication or live authority. */
export function validateRecoveryActivationCandidateV5(source: string): Readonly<Record<string, string | number | boolean | null>>;
export function createRecoveryActivationBindingV5(source: string): Readonly<Record<string, string | number | boolean | null>>;
export function parseRecoveryBindingV5(source: string): Readonly<Record<string, string | number | boolean | null>>;
export function validateRecoveryActivationCandidateV3(source: string): Readonly<Record<string, string | number | boolean | null>>;
export function createRecoveryActivationBindingV3(source: string): Readonly<Record<string, string | number | boolean | null>>;
export function parseRecoveryBindingV3(source: string): Readonly<Record<string, string | number | boolean | null>>;
/** V4 static consistency only; no signed evidence authentication or live authority. */
export function validateRecoveryActivationCandidateV4(source: string): Readonly<Record<string, string | number | boolean | null>>;
export function createRecoveryActivationBindingV4(source: string): Readonly<Record<string, string | number | boolean | null>>;
export function parseRecoveryBindingV4(source: string): Readonly<Record<string, string | number | boolean | null>>;
/** Version dispatch for static consistency only; no receipt authentication or live authority. */
export function validateRecoveryActivationCandidateDocument(source: string): Readonly<Record<string, string | number | boolean | null>>;
export function createRecoveryActivationBindingFromCandidate(source: string): Readonly<Record<string, string | number | boolean | null>>;
export function parseRecoveryBinding(source: string): Readonly<Record<string, string | number | boolean | null>>;
