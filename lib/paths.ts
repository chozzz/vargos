import path from 'node:path';
import os from 'node:os';

/**
 * Every path under the Vargos data dir. The single source of truth — services
 * (config, agent, mcp, memory, channel) and the web console all derive from here
 * rather than re-joining `dataDir` themselves.
 */
export interface DataPaths {
  dataDir: string;
  workspaceDir: string;
  sessionsDir: string;
  channelsDir: string;
  cronDir: string;
  logsDir: string;
  cacheDir: string;
  configFile: string;
  /** Per-channel persona overrides: `<dataDir>/agents/<channelId>.md` */
  agentsDir: string;
  /** Pi-SDK-managed agent config dir: `<dataDir>/agent` */
  agentDir: string;
  agentModelsFile: string;
  agentSettingsFile: string;
  agentAuthFile: string;
  agentMcpFile: string;
  /** Memory index database. */
  memoryDb: string;
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

  const agentDir = path.join(dataDir, 'agent');

  _cache = {
    dataDir,
    workspaceDir: path.join(dataDir, 'workspace'),
    sessionsDir: path.join(dataDir, 'sessions'),
    channelsDir: path.join(dataDir, 'channels'),
    cronDir: path.join(dataDir, 'cron'),
    logsDir: path.join(dataDir, 'logs'),
    cacheDir: path.join(base, 'vargos'),
    configFile: path.join(dataDir, 'config.json'),
    agentsDir: path.join(dataDir, 'agents'),
    agentDir,
    agentModelsFile: path.join(agentDir, 'models.json'),
    agentSettingsFile: path.join(agentDir, 'settings.json'),
    agentAuthFile: path.join(agentDir, 'auth.json'),
    agentMcpFile: path.join(agentDir, 'mcp.json'),
    memoryDb: path.join(dataDir, 'memory.db'),
  };

  return _cache;
}

export function resetDataPaths(): void { _cache = null; }
