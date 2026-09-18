import { estimatedTime04 } from './Keep04WorkerPanel';

export type ConstructionProgress04 = Readonly<{
  percent: number;
  remaining: string;
  label: string;
}>;

/**
 * Construction is Realm-owned. The local clock can show elapsed work, but it
 * must never present 100% until a completed building row arrives.
 */
export function constructionProgress04(startedAtMicros: bigint, completesAtMicros: bigint, nowMs: number): ConstructionProgress04 {
  const remaining = estimatedTime04(completesAtMicros, nowMs);
  if (!Number.isFinite(nowMs)) return Object.freeze({ percent: 0, remaining, label: '0% complete · Awaiting Realm confirmation' });
  const nowMicros = BigInt(Math.max(0, Math.trunc(nowMs))) * 1_000n;
  const total = completesAtMicros - startedAtMicros;
  const percent = total <= 0n || nowMicros <= startedAtMicros
    ? 0
    : nowMicros >= completesAtMicros
      ? 99
      : Number(((nowMicros - startedAtMicros) * 100n) / total);
  const label = remaining === 'Awaiting Realm update'
    ? `${percent}% complete · Awaiting Realm confirmation`
    : `${percent}% complete · ${remaining} remaining`;
  return Object.freeze({ percent, remaining, label });
}
