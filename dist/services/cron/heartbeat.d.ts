/**
 * Heartbeat utilities — pure functions for heartbeat poll logic
 */
/**
 * Returns true if HEARTBEAT.md content has no actionable tasks.
 * Skips blank lines, markdown headers, empty list items, and HTML comments.
 */
export declare function isHeartbeatContentEffectivelyEmpty(content: string): boolean;
/**
 * Strip HEARTBEAT_OK token from response text.
 * Returns null if the entire response was only the token (signal to skip delivery).
 * Returns cleaned text otherwise.
 */
export declare function stripHeartbeatToken(text: string): string | null;
/**
 * Check if the current hour is within active hours.
 * Returns true if no config (always active).
 * Supports overnight ranges (e.g. 22→6).
 *
 * @param activeHours [startHour, endHour] (0–23). Interpreted in `timeZone` when set, else UTC.
 */
export declare function isWithinActiveHours(activeHours?: [number, number], timeZone?: string): boolean;
//# sourceMappingURL=heartbeat.d.ts.map