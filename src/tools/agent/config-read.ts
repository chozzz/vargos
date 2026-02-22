/**
 * Config read tool - Read current configuration with masked secrets
 */

import { z } from 'zod';
import { Tool, ToolContext, textResult, errorResult } from '../types.js';
import { loadConfig } from '../../config/pi-config.js';
import { resolveDataDir } from '../../config/paths.js';
import { maskSecret } from '../../lib/mask.js';

const ConfigReadParameters = z.object({
  section: z.enum(['models', 'agent', 'channels', 'cron', 'gateway', 'mcp', 'paths', 'storage'])
    .optional()
    .describe('Config section to read (omit for full config)'),
});

type ConfigValue = string | number | boolean | null | undefined | ConfigObj | ConfigValue[];
interface ConfigObj { [key: string]: ConfigValue }

/** Deep-clone config, masking any string value whose key suggests a secret */
function maskSecrets(obj: ConfigObj): ConfigObj {
  const secretKeys = /api.?key|token|secret|password|credential/i;
  const result: ConfigObj = {};

  for (const [key, value] of Object.entries(obj)) {
    if (typeof value === 'string' && secretKeys.test(key)) {
      result[key] = maskSecret(value);
    } else if (Array.isArray(value)) {
      result[key] = value.map(v =>
        v && typeof v === 'object' && !Array.isArray(v) ? maskSecrets(v as ConfigObj) : v
      );
    } else if (value && typeof value === 'object') {
      result[key] = maskSecrets(value as ConfigObj);
    } else {
      result[key] = value;
    }
  }

  return result;
}

export const configReadTool: Tool = {
  name: 'config_read',
  description: 'Read current Vargos configuration. API keys are masked for safety.',
  parameters: ConfigReadParameters,
  formatCall: (args) => String(args.section || 'full'),
  execute: async (args: unknown, _context: ToolContext) => {
    const params = ConfigReadParameters.parse(args);

    try {
      const config = await loadConfig(resolveDataDir());
      if (!config) return errorResult('No config found');

      const raw = config as unknown as ConfigObj;
      const data = params.section ? { [params.section]: raw[params.section] } : raw;
      const masked = maskSecrets(data);
      return textResult(JSON.stringify(masked, null, 2));
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return errorResult(`Failed to read config: ${message}`);
    }
  },
};
