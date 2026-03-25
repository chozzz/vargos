import path from 'node:path';
import os from 'node:os';

export interface DataPaths {
  dataDir:      string;
  workspaceDir: string;
  sessionsDir:  string;
  channelsDir:  string;
  logsDir:      string;
  cacheDir:     string;
  configFile:   string;
}

let _cache: DataPaths | null = null;

/** Cached singleton — reads $VARGOS_DATA_DIR or ~/.vargos on first call. */
export function getDataPaths(): DataPaths {
  if (_cache) return _cache;

  const env = process.env.VARGOS_DATA_DIR?.trim();
  const dataDir = env
    ? (env.startsWith('~') ? path.join(os.homedir(), env.slice(1)) : env)
    : path.join(os.homedir(), '.vargos');

  const xdg  = process.env.XDG_CACHE_HOME?.trim();
  const base = xdg
    ? (xdg.startsWith('~') ? path.join(os.homedir(), xdg.slice(1)) : xdg)
    : path.join(os.homedir(), '.cache');

  _cache = {
    dataDir,
    workspaceDir: path.join(dataDir, 'workspace'),
    sessionsDir:  path.join(dataDir, 'sessions'),
    channelsDir:  path.join(dataDir, 'channels'),
    logsDir:      path.join(dataDir, 'logs'),
    cacheDir:     path.join(base, 'vargos'),
    configFile:   path.join(dataDir, 'config.json'),
  };

  return _cache;
}

export function resetDataPaths(): void { _cache = null; }

/** Sanitize a session key to a safe directory name. */
export function sessionKeyToDir(key: string): string {
  return key.replace(/:/g, '-');
}

/** Resolve the directory for a session, honoring subagent nesting. */
export function resolveSessionDir(sessionKey: string): string {
  const { sessionsDir } = getDataPaths();
  const subIdx = sessionKey.indexOf(':subagent:');
  if (subIdx >= 0) {
    const root = sessionKey.slice(0, subIdx);
    const sub  = sessionKey.slice(subIdx + 1);
    return path.join(sessionsDir, sessionKeyToDir(root), 'subagents', sessionKeyToDir(sub));
  }
  return path.join(sessionsDir, sessionKeyToDir(sessionKey));
}
