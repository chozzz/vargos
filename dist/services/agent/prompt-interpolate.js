/**
 * Prompt interpolation — replace template variables in prompts with actual paths/values.
 *
 * Supports:
 * - ${WORKSPACE_DIR} → ~/.vargos/workspace
 * - ${DATA_DIR} → ~/.vargos (or $VARGOS_DATA_DIR)
 * - ${SESSIONS_DIR} → ~/.vargos/sessions
 * - ${CACHE_DIR} → ~/.cache/vargos
 * - ${LOGS_DIR} → ~/.vargos/logs
 * - ${CHANNELS_DIR} → ~/.vargos/channels
 * - ${HOME} → user's home directory
 * - ${PWD} → current working directory
 * - ${SESSION_KEY} → session identity
 * - ${PROVIDER} → provider name (empty — used in docs for ${PROVIDER}_API_KEY pattern)
 * - ${VAR} → generic placeholder (empty — used in docs for ${VAR:-default} pattern)
 *
 * Default values use bash-style syntax: ${VAR:-default}
 *   - Used when VAR is missing OR an empty string.
 *   - Default may be empty: ${VAR:-} resolves to '' if VAR is missing.
 *   - Default cannot contain '}' (closes the placeholder).
 *
 * Missing keys without a default fallback to the original ${KEY} placeholder
 * and are logged as warnings.
 *
 * Usage:
 *   const prompt = 'Read ${WORKSPACE_DIR}/HEARTBEAT.md as ${BRAND:-Vargos}';
 *   const resolved = interpolatePrompt(prompt);
 *   // → 'Read /home/user/.vargos/workspace/HEARTBEAT.md as Vargos'
 */
import { getDataPaths } from '../../lib/paths.js';
import { createLogger } from '../../lib/logger.js';
import os from 'node:os';
import process from 'node:process';
const log = createLogger('interpolate');
const PATTERN = /\$\{([A-Z_]+)(?::-?([^}]*))?\}/g;
/**
 * Interpolate prompt variables and return the resolved string.
 * Missing variables (without a default) remain as ${KEY} placeholders and are
 * logged as warnings. Context variables (e.g., from channel metadata) are
 * merged into the template variables.
 */
export function interpolatePrompt(prompt, context) {
    const { prompt: resolved } = interpolatePromptWithMissing(prompt, context);
    return resolved;
}
/**
 * Interpolate and return both result and missing variable list.
 * Used when you need to know what failed to interpolate.
 */
function interpolatePromptWithMissing(prompt, context) {
    const paths = getDataPaths();
    const currentTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    const variables = {
        DATA_DIR: paths.dataDir,
        WORKSPACE_DIR: paths.workspaceDir,
        SESSIONS_DIR: paths.sessionsDir,
        CRON_DIR: paths.cronDir,
        CACHE_DIR: paths.cacheDir,
        LOGS_DIR: paths.logsDir,
        CHANNELS_DIR: paths.channelsDir,
        HOME: os.homedir(),
        PWD: process.cwd(),
        CURRENT_DATE: new Date().toLocaleString(undefined, {
            timeZone: currentTimezone,
            year: 'numeric', month: 'long', day: '2-digit',
            hour: '2-digit', minute: '2-digit', second: '2-digit',
            hour12: false,
            timeZoneName: 'short',
        }),
        CURRENT_TIMEZONE: currentTimezone,
        // Session identity.
        SESSION_KEY: context?.SESSION_KEY || 'unknown',
        // Known documentation variables — referenced in bootstrap docs but not runtime values.
        // These prevent spurious "Missing interpolation keys" warnings.
        PROVIDER: '',
        VAR: '',
        // Merge any additional context variables (e.g., custom vars from tests or callers).
        ...context,
    };
    const missing = [];
    const result = prompt.replace(PATTERN, (full, key, defaultValue) => {
        const value = variables[key];
        if (value !== undefined && value !== '') {
            return value;
        }
        if (defaultValue !== undefined) {
            return defaultValue;
        }
        missing.push(key);
        return full;
    });
    if (missing.length > 0) {
        log.warn(`Missing interpolation keys: ${missing.join(', ')}`);
    }
    return { prompt: result, missing };
}
//# sourceMappingURL=prompt-interpolate.js.map