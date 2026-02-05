/**
 * Channel configuration — reads/writes channels section of main config.json
 */

import { loadConfig, saveConfig, type ChannelEntry } from '../config/pi-config.js';
import { resolveDataDir } from '../config/paths.js';
import type { ChannelConfig, ChannelType } from './types.js';

/** Load channel configs from main config.json, converting record → array */
export async function loadChannelConfigs(): Promise<ChannelConfig[]> {
  const config = await loadConfig(resolveDataDir());
  if (!config?.channels) return [];

  return Object.entries(config.channels).map(([type, entry]) => ({
    type: type as ChannelType,
    enabled: entry.enabled !== false,
    ...entry,
  }));
}

/** Add or update a channel in main config.json */
export async function addChannelConfig(channelConfig: ChannelConfig): Promise<void> {
  const dataDir = resolveDataDir();
  const config = await loadConfig(dataDir);
  if (!config) {
    throw new Error('No config.json — run: vargos config');
  }

  if (!config.channels) config.channels = {};

  const entry: ChannelEntry = {};
  if (channelConfig.enabled !== undefined) entry.enabled = channelConfig.enabled;
  if (channelConfig.botToken) entry.botToken = channelConfig.botToken;
  if (channelConfig.allowFrom) entry.allowFrom = channelConfig.allowFrom;

  config.channels[channelConfig.type] = entry;
  await saveConfig(dataDir, config);
}
