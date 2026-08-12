export const PRODUCTION_ADMIN_TOKEN_WINDOW_MS: 300000;
export const PRODUCTION_ADMIN_TOKEN_WINDOW_MAXIMUM: 6;
export const PRODUCTION_ADMIN_TOKEN_RESERVATION_LIFETIME_MS: 300000;

export class ProductionAdminTokenBudgetError extends Error {
  readonly code: string;
}

export type ProductionAdminProcessIdentityProbe = Readonly<{
  state: 'present';
  identity: string;
}> | Readonly<{
  state: 'absent' | 'ambiguous';
}>;

export type ProductionAdminTokenBudgetOptions = Readonly<{
  stateDirectory?: string;
  now?: () => number;
  processIdentityProbe?: (pid: number) => ProductionAdminProcessIdentityProbe;
  randomId?: () => string;
  delay?: (milliseconds: number) => Promise<void>;
  monotonicNow?: () => number;
}>;

export function assertProductionAdminTrustedAncestors(path: string): void;
export function canonicalProductionAdminAccountHome(reportedHome?: string): string;
export function ensureCanonicalProductionAdminStateDirectory(reportedHome?: string): string;
export function defaultProductionAdminStateDirectory(): string;
export function probeProductionAdminProcessIdentity(pid: number): ProductionAdminProcessIdentityProbe;
export function requireCurrentProductionAdminProcessIdentity(
  probe?: (pid: number) => ProductionAdminProcessIdentityProbe,
): string;
export function productionAdminRecordedOwnerIsDead(input: Readonly<{
  pid: number;
  processStartIdentity: string;
  probe?: (pid: number) => ProductionAdminProcessIdentityProbe;
}>): boolean | undefined;

export function reserveProductionAdminTokenBudget(
  input: ProductionAdminTokenBudgetOptions & Readonly<{ slots: number }>,
): Promise<Readonly<{ reservationId: string; remaining: number }>>;
export function ensureProductionAdminTokenReservation(
  input: ProductionAdminTokenBudgetOptions & Readonly<{
    reservationId: string;
    minimumRemaining: number;
  }>,
): Promise<Readonly<{ reservationId: string; remaining: number }>>;
export function releaseProductionAdminTokenReservation(
  input: ProductionAdminTokenBudgetOptions & Readonly<{ reservationId: string }>,
): Promise<Readonly<{ reservationId: string; released: number }>>;
export function recordProductionAdminTokenAttempt(
  input?: ProductionAdminTokenBudgetOptions & Readonly<{ reservationId?: string }>,
): Promise<Readonly<{
  attemptId: string;
  attemptedAtMs: number;
  reservationId: string | null;
}>>;
export function inspectProductionAdminTokenBudget(
  options?: ProductionAdminTokenBudgetOptions,
): Promise<Readonly<{
  attempts: number;
  reserved: number;
  reservations: number;
  remaining: number;
  lastObservedAtMs: number;
}>>;

export const productionAdminTokenBudgetTestSeams: Readonly<Record<string, unknown>>;
