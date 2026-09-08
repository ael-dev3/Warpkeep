/** Static consistency only; no source/receipt authentication or deployment authority. */
export function validateRecoveryActivationCandidate(source: string): Readonly<Record<string, string | number | boolean | null>>;
/** Static generation only; no installation, signature, or source authentication. */
export function createRecoveryActivationBinding(source: string): Readonly<Record<string, string | number | boolean | null>>;
/** Static semantics and hash consistency only; no live deployment authority. */
export function parseRecoveryBindingV2(source: string): Readonly<Record<string, string | number | boolean | null>>;
/** Fixed wire policy only; never fills absent live/source facts or grants authority. */
export function recoveryActivationCandidatePolicy(): Readonly<Record<string, string | number | boolean | null>>;
