/**
 * Active-hours window check — pure scheduling math, used by every cron task.
 */

/**
 * The hour (0–23) in `timeZone` right now.
 *
 * The locale is pinned rather than inherited: on a host set to a locale with
 * non-Latin digits (ar-EG, fa-IR, bn-IN) the formatted hour comes back as "٠٦"
 * and parseInt yields NaN, which would silently evaluate every window to false
 * and stop the task from ever firing. `numberingSystem` states that intent
 * outright, and `hourCycle: 'h23'` pins midnight to "00" rather than "24".
 */
function currentHourInZone(timeZone: string): number {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone,
    hour: 'numeric',
    hourCycle: 'h23',
    numberingSystem: 'latn',
  }).formatToParts(new Date());
  const hourPart = parts.find(p => p.type === 'hour');
  return parseInt(hourPart?.value ?? '0', 10);
}

/**
 * Check if the current hour is within active hours.
 * Returns true if no config (always active).
 * Supports overnight ranges (e.g. 22→6).
 *
 * @param activeHours [startHour, endHour] (0–23). Interpreted in `timeZone` when set, else UTC.
 */
export function isWithinActiveHours(
  activeHours?: [number, number],
  timeZone?: string,
): boolean {
  if (!activeHours) return true;
  const [start, end] = activeHours;
  const hour = timeZone ? currentHourInZone(timeZone) : new Date().getUTCHours();
  if (start <= end) return hour >= start && hour < end;
  // Overnight: e.g. [22, 6] → active 22:00→06:00
  return hour >= start || hour < end;
}
