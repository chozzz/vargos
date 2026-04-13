/**
 * Prompt interpolation — replace template variables in prompts with actual paths/values.
 *
 * Supports:
 * - ${WORKSPACE_DIR} → ~/.vargos/workspace
 * - ${DATA_DIR} → ~/.vargos (or $VARGOS_DATA_DIR)
 * - ${SESSIONS_DIR} → ~/.vargos/sessions
 * - ${CACHE_DIR} → ~/.cache/vargos
 * - ${LOGS_DIR} → ~/.vargos/logs
 * - ${HOME} → user's home directory
 * - ${PWD} → current working directory
 *
 * Usage:
 *   const prompt = 'Read ${WORKSPACE_DIR}/HEARTBEAT.md';
 *   const resolved = interpolatePrompt(prompt);
 *   // → 'Read /home/user/.vargos/workspace/HEARTBEAT.md'
 */

import { getDataPaths } from './paths.js';
import os from 'node:os';
import process from 'node:process';

export function interpolatePrompt(prompt: string): string {
  const paths = getDataPaths();

  const variables: Record<string, string> = {
    WORKSPACE_DIR: paths.workspaceDir,
    DATA_DIR: paths.dataDir,
    SESSIONS_DIR: paths.sessionsDir,
    CACHE_DIR: paths.cacheDir,
    LOGS_DIR: paths.logsDir,
    CHANNELS_DIR: paths.channelsDir,
    HOME: os.homedir(),
    PWD: process.cwd(),
  };

  let result = prompt;
  for (const [key, value] of Object.entries(variables)) {
    result = result.replaceAll(`\${${key}}`, value);
  }

  return result;
}
