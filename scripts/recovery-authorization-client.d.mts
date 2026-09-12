/** Transport only. Returned signed objects remain private and require local verification. */
export function requestRecovery(endpoint: 'status' | 'issue' | 'claim' | 'complete' | 'reconcile' | 'terminal', requestSource: string): Promise<Readonly<Record<string, string>>>;
