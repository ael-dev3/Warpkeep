import { useEffect, useState } from 'react';

const MICROS_PER_MINUTE = 60_000_000n;
const MINUTES_PER_HOUR = 60n;
const MINUTES_PER_DAY = 1_440n;
const SCHEDULE_REFRESH_MS = 30_000;

export function localRealmNowMicros(nowMillis = Date.now()) {
  if (!Number.isSafeInteger(nowMillis) || nowMillis < 0) return undefined;
  return BigInt(nowMillis) * 1_000n;
}

/**
 * Formats a validated authority deadline as time remaining. Positive
 * durations round up to the next minute so the interface never presents a
 * live assignment as having zero minutes left.
 */
export function formatRealmRemainingDuration(
  deadlineMicros: bigint | undefined,
  nowMicros: bigint | undefined
) {
  if (deadlineMicros === undefined || nowMicros === undefined || deadlineMicros <= 0n) {
    return undefined;
  }
  const remainingMicros = deadlineMicros - nowMicros;
  if (remainingMicros <= 0n) return 'Awaiting Realm update';
  if (remainingMicros < MICROS_PER_MINUTE) return '<1m remaining';

  const totalMinutes = (
    remainingMicros + MICROS_PER_MINUTE - 1n
  ) / MICROS_PER_MINUTE;
  const days = totalMinutes / MINUTES_PER_DAY;
  const hours = (totalMinutes % MINUTES_PER_DAY) / MINUTES_PER_HOUR;
  const minutes = totalMinutes % MINUTES_PER_HOUR;

  if (days > 0n) {
    return minutes > 0n
      ? `${days}d ${hours}h ${minutes}m remaining`
      : `${days}d ${hours}h remaining`;
  }
  if (hours > 0n) {
    return minutes > 0n
      ? `${hours}h ${minutes}m remaining`
      : `${hours}h remaining`;
  }
  return `${minutes}m remaining`;
}

/**
 * Keeps a displayed public-authority countdown current without inventing
 * timing data. The authoritative deadline remains the source of truth.
 */
export function useRealmRemainingDuration(deadlineMicros: bigint | undefined) {
  const [nowMicros, setNowMicros] = useState(() => localRealmNowMicros());

  useEffect(() => {
    const refresh = () => setNowMicros(localRealmNowMicros());
    refresh();
    if (deadlineMicros === undefined) return undefined;

    const timer = window.setInterval(refresh, SCHEDULE_REFRESH_MS);
    document.addEventListener('visibilitychange', refresh);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', refresh);
    };
  }, [deadlineMicros]);

  return formatRealmRemainingDuration(deadlineMicros, nowMicros);
}
