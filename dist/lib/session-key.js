/**
 * Pure session key helpers — no domain dependencies.
 */
import { randomBytes } from 'node:crypto';
export function cronSessionKey(taskId) {
    return `cron:${taskId}:${new Date().toISOString().slice(0, 10)}`;
}
export function webhookSessionKey(hookId) {
    return `webhook:${hookId}:${Date.now()}`;
}
/**
 * Generate a unique subagent session key from the parent key.
 * Appends `:subagent:<shortId>` so each delegation gets its own session,
 * enabling parallel subagents without collision.
 */
export function subagentSessionKey(parentKey) {
    const shortId = randomBytes(4).toString('hex');
    return `${parentKey}:subagent:${shortId}`;
}
/** Check if a sessionKey belongs to any subagent (any depth). */
export function isSubagentSession(key) {
    return key.includes(':subagent:');
}
/** Extract the root parent sessionKey by stripping all subagent suffixes. */
export function rootSessionKey(key) {
    const idx = key.indexOf(':subagent:');
    return idx === -1 ? key : key.slice(0, idx);
}
/** Parse "type:id" format from a string, extracting first component. */
function parseTypeIdFormat(str) {
    const sep = str.indexOf(':');
    if (sep === -1)
        return { type: str, id: '' };
    return { type: str.slice(0, sep), id: str.slice(sep + 1) };
}
export function parseSessionKey(key) {
    const root = rootSessionKey(key);
    return parseTypeIdFormat(root);
}
export function parseChannelTarget(target) {
    const { type: channel, id: userId } = parseTypeIdFormat(target);
    return userId ? { channel, userId } : null;
}
//# sourceMappingURL=session-key.js.map