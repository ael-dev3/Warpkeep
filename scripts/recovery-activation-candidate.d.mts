/** Static consistency only; no source/receipt authentication or deployment authority. */
export function validateRecoveryActivationCandidate(source: string): Readonly<Record<string, string | number | boolean | null>>;
/** Static generation only; no installation, signature, or source authentication. */
export function createRecoveryActivationBinding(source: string): Readonly<Record<string, string | number | boolean | null>>;
/** Static semantics and hash consistency only; no live deployment authority. */
export function parseRecoveryBindingV2(source: string): Readonly<Record<string, string | number | boolean | null>>;
/** Fixed wire policy only; never fills absent live/source facts or grants authority. */
export function recoveryActivationCandidatePolicy(): Readonly<Record<string, string | number | boolean | null>>;

/** Explicit V3 static policy; legacy zero/admission invariants are retained. */
export function recoveryActivationCandidatePolicyForVersion(version: 2 | 3): Readonly<Record<string, string | number | boolean | null>>;
export function validateRecoveryActivationCandidateV3(source: string): Readonly<Record<string, string | number | boolean | null>>;
export function createRecoveryActivationBindingV3(source: string): Readonly<Record<string, string | number | boolean | null>>;
export function parseRecoveryBindingV3(source: string): Readonly<Record<string, string | number | boolean | null>>;
/** Version dispatch for static consistency only; no receipt authentication or live authority. */
export function validateRecoveryActivationCandidateDocument(source: string): Readonly<Record<string, string | number | boolean | null>>;
export function createRecoveryActivationBindingFromCandidate(source: string): Readonly<Record<string, string | number | boolean | null>>;
export function parseRecoveryBinding(source: string): Readonly<Record<string, string | number | boolean | null>>;
