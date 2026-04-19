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
 * Missing keys fallback to a placeholder (${KEY}) and are logged as warnings.
 *
 * Usage:
 *   const prompt = 'Read ${WORKSPACE_DIR}/HEARTBEAT.md';
 *   const resolved = interpolatePrompt(prompt);
 *   // → 'Read /home/user/.vargos/workspace/HEARTBEAT.md'
 */

import { getDataPaths } from './paths.js';
import { createLogger } from './logger.js';
import os from 'node:os';
import process from 'node:process';

const log = createLogger('interpolate');

export interface InterpolationResult {
  prompt: string;
  missing: string[];
}

/**
 * Interpolate prompt variables and return result + list of missing keys.
 * Missing variables remain as ${KEY} placeholders and are logged as warnings.
 */
export function interpolatePrompt(prompt: string): string {
  const { prompt: resolved } = interpolatePromptWithMissing(prompt);
  return resolved;
}

/**
 * Interpolate and return both result and missing variable list.
 * Used when you need to know what failed to interpolate.
 */
function interpolatePromptWithMissing(prompt: string): InterpolationResult {
  const paths = getDataPaths();

  const variables: Record<string, string> = {
    WORKSPACE_DIR: paths.workspaceDir,
    DATA_DIR: paths.dataDir,
    SESSIONS_DIR: paths.sessionsDir,
    CRON_DIR: paths.cronDir,
    CACHE_DIR: paths.cacheDir,
    LOGS_DIR: paths.logsDir,
    CHANNELS_DIR: paths.channelsDir,
    HOME: os.homedir(),
    PWD: process.cwd(),

    /** Some non-path variables */
    currentTime: new Date().toISOString(),
    currentTimezone: Intl.DateTimeFormat().resolvedOptions().timeZone
  };

  let result = prompt;
  const missing: string[] = [];

  // Find all ${...} patterns
  const pattern = /\$\{([A-Z_]+)\}/g;
  let match;

  while ((match = pattern.exec(prompt)) !== null) {
    const key = match[1];
    const value = variables[key];

    if (value) {
      result = result.replaceAll(`\${${key}}`, value);
    } else {
      missing.push(key);
    }
  }

  if (missing.length > 0) {
    log.warn(`Missing interpolation keys: ${missing.join(', ')}`, { missing, prompt });
  }

  return { prompt: result, missing };
}
