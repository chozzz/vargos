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
export interface InterpolationResult {
    prompt: string;
    missing: string[];
}
/**
 * Interpolate prompt variables and return the resolved string.
 * Missing variables (without a default) remain as ${KEY} placeholders and are
 * logged as warnings. Context variables (e.g., from channel metadata) are
 * merged into the template variables.
 */
export declare function interpolatePrompt(prompt: string, context?: Record<string, string>): string;
//# sourceMappingURL=prompt-interpolate.d.ts.map