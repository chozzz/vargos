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

export interface InterpolationResult {
  prompt: string;
  missing: string[];
}

const PATTERN = /\$\{([A-Z_]+)(?::-?([^}]*))?\}/g;

/**
 * Interpolate prompt variables and return the resolved string.
 * Missing variables (without a default) remain as ${KEY} placeholders and are
 * logged as warnings. Context variables (e.g., from channel metadata) are
 * merged into the template variables.
 */
export function interpolatePrompt(prompt: string, context?: Record<string, string>): string {
  const { prompt: resolved } = interpolatePromptWithMissing(prompt, context);
  return resolved;
}

/**
 * Interpolate and return both result and missing variable list.
 * Used when you need to know what failed to interpolate.
 */
function interpolatePromptWithMissing(prompt: string, context?: Record<string, string>): InterpolationResult {
  const paths = getDataPaths();
  const currentTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone;

  const variables: Record<string, string> = {
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

    // Channel context variables
    CHANNEL_TYPE: context?.CHANNEL_TYPE || 'unknown',
    CHANNEL_ID: context?.CHANNEL_ID || 'unknown',
    BOT_NAME: context?.BOT_NAME || 'unknown',
    FROM_USER: context?.FROM_USER || 'unknown',

    // Just in case context is provided, but not all variables are present.
    ...context,
  };

  const missing: string[] = [];

  const result = prompt.replace(PATTERN, (full, key: string, defaultValue?: string) => {
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
