/**
 * Format an exact Realm duration for a player-facing label.
 *
 * The input remains integer microseconds so callers do not lose a partial
 * second while converting server timestamps.  We keep sub-minute fractions
 * to the smallest useful precision, and use minutes/hours for longer waits.
 */
export function formatKeep04Duration(micros: bigint): string {
  if (micros <= 0n) return '0 s';

  const microsPerSecond = 1_000_000n;
  const microsPerMinute = 60n * microsPerSecond;
  const microsPerHour = 60n * microsPerMinute;

  const formatSeconds = (value: bigint): string => {
    const whole = value / microsPerSecond;
    const fraction = value % microsPerSecond;
    if (fraction === 0n) return `${whole} s`;

    // Gameplay durations currently use tenth-second precision. Keep the
    // formatter correct for finer future values while avoiding noisy zeros.
    const fractionText = fraction.toString().padStart(6, '0').replace(/0+$/, '');
    return `${whole}.${fractionText} s`;
  };

  if (micros < microsPerMinute) return formatSeconds(micros);

  const hours = micros / microsPerHour;
  const afterHours = micros % microsPerHour;
  const minutes = afterHours / microsPerMinute;
  const afterMinutes = afterHours % microsPerMinute;
  const parts: string[] = [];
  if (hours > 0n) parts.push(`${hours} hr`);
  if (minutes > 0n) parts.push(`${minutes} min`);
  if (afterMinutes > 0n) parts.push(formatSeconds(afterMinutes));
  return parts.join(' ');
}
