import { estimatedTime04 } from './Keep04WorkerPanel';
import {
  localRealmNowMicros,
  realmIntervalProgressPercent,
} from '../realm/realmAuthoritySchedule';

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
  const percent = realmIntervalProgressPercent(
    startedAtMicros,
    completesAtMicros,
    localRealmNowMicros(nowMs),
  ) ?? 0;
  const label = remaining === 'Awaiting Realm update'
    ? `${percent}% complete · Awaiting Realm confirmation`
    : `${percent}% complete · ${remaining} remaining`;
  return Object.freeze({ percent, remaining, label });
}
