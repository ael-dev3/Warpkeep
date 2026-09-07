/** Signature and canonical byte grammar only; not a complete semantic or deployment gate. */
export function verifyRecoverySignedPayload(compact: string, kind: 'status' | 'claim' | 'authorization'): Readonly<Record<string, unknown>>;
