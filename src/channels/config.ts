/**
 * Channel configuration — reads/writes channels section of main config.json
 */

import { loadConfig, saveConfig, type ChannelEntry } from '../config/pi-config.js';
import { resolveDataDir } from '../config/paths.js';

/** Load channel configs from main config.json */
export async function loadChannelConfigs(): Promise<ChannelEntry[]> {
  const config = await loadConfig(resolveDataDir());
  if (!config?.channels) return [];
  return config.channels;
}

/** Add or update a channel in main config.json (matched by id) */
export async function addChannelConfig(entry: ChannelEntry): Promise<void> {
  const dataDir = resolveDataDir();
  const config = await loadConfig(dataDir);
  if (!config) {
    throw new Error('No config.json — run: vargos config');
  }

  if (!config.channels) config.channels = [];

  const idx = config.channels.findIndex((ch) => ch.id === entry.id);
  if (idx >= 0) {
    config.channels[idx] = entry;
  } else {
    config.channels.push(entry);
  }

  await saveConfig(dataDir, config);
}
