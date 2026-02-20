/** Human-readable labels for common cron expressions */
const SCHEDULE_PRESETS: Record<string, string> = {
  '*/1 * * * *': 'every minute',
  '*/15 * * * *': 'every 15 min',
  '*/30 * * * *': 'every 30 min',
  '0 * * * *': 'every hour',
  '0 */6 * * *': 'every 6 hours',
  '0 9,21 * * *': 'daily at 9am & 9pm',
};

/** Format a cron expression as a human-readable label, falling back to raw expression */
export function formatSchedule(cron: string): string {
  return SCHEDULE_PRESETS[cron] ?? cron;
}
