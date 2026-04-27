import path from 'node:path';
import os from 'node:os';

export interface DataPaths {
  dataDir: string;
  workspaceDir: string;
  sessionsDir: string;
  channelsDir: string;
  cronDir: string;
  logsDir: string;
  cacheDir: string;
  configFile: string;
}

let _cache: DataPaths | null = null;

/** Cached singleton — reads $VARGOS_DATA_DIR or ~/.vargos on first call. */
export function getDataPaths(): DataPaths {
  if (_cache) return _cache;

  const env = process.env.VARGOS_DATA_DIR?.trim();
  const dataDir = env
    ? (env.startsWith('~') ? path.join(os.homedir(), env.slice(1)) : env)
    : path.join(os.homedir(), '.vargos');

  const xdg = process.env.XDG_CACHE_HOME?.trim();
  const base = xdg
    ? (xdg.startsWith('~') ? path.join(os.homedir(), xdg.slice(1)) : xdg)
    : path.join(os.homedir(), '.cache');

  _cache = {
    dataDir,
    workspaceDir: path.join(dataDir, 'workspace'),
    sessionsDir: path.join(dataDir, 'sessions'),
    channelsDir: path.join(dataDir, 'channels'),
    cronDir: path.join(dataDir, 'cron'),
    logsDir: path.join(dataDir, 'logs'),
    cacheDir: path.join(base, 'vargos'),
    configFile: path.join(dataDir, 'config.json'),
  };

  return _cache;
}

export function resetDataPaths(): void { _cache = null; }


