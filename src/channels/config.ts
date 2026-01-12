/**
 * Channel configuration persistence
 * Load/save channel configs from ~/.vargos/channels.json
 */

import { promises as fs } from 'node:fs';
import { resolveChannelConfigFile } from '../config/paths.js';
import type { ChannelConfig, ChannelsFile, ChannelType } from './types.js';

export async function loadChannelConfigs(): Promise<ChannelConfig[]> {
  const configPath = resolveChannelConfigFile();
  try {
    const content = await fs.readFile(configPath, 'utf-8');
    const data = JSON.parse(content) as ChannelsFile;
    return data.channels ?? [];
  } catch {
    return [];
  }
}

export async function saveChannelConfigs(channels: ChannelConfig[]): Promise<void> {
  const configPath = resolveChannelConfigFile();
  const data: ChannelsFile = { channels };
  await fs.writeFile(configPath, JSON.stringify(data, null, 2), 'utf-8');
}

export async function addChannelConfig(config: ChannelConfig): Promise<void> {
  const channels = await loadChannelConfigs();
  // Replace existing config for same type, or append
  const idx = channels.findIndex((c) => c.type === config.type);
  if (idx >= 0) {
    channels[idx] = config;
  } else {
    channels.push(config);
  }
  await saveChannelConfigs(channels);
}

export async function removeChannelConfig(type: ChannelType): Promise<boolean> {
  const channels = await loadChannelConfigs();
  const filtered = channels.filter((c) => c.type !== type);
  if (filtered.length === channels.length) return false;
  await saveChannelConfigs(filtered);
  return true;
}
