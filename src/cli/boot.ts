import { resolveDataDir, resolveWorkspaceDir, initPaths } from '../core/config/paths.js';
import { loadConfig, type VargosConfig } from '../core/config/pi-config.js';
import { validateConfig } from '../core/config/validate.js';

export interface BootResult {
  config: VargosConfig;
  dataDir: string;
  workspaceDir: string;
}

export async function loadAndValidate(): Promise<BootResult> {
  const dataDir = resolveDataDir();
  const config = await loadConfig(dataDir);

  if (!config) {
    console.error('  No config found. Run: vargos config llm edit');
    process.exit(1);
  }

  initPaths(config.paths);
  const workspaceDir = resolveWorkspaceDir();

  const validation = validateConfig(config);
  for (const w of validation.warnings) console.error(`  ⚠ ${w}`);
  if (!validation.valid) {
    for (const e of validation.errors) console.error(`  ✗ ${e}`);
    process.exit(1);
  }

  return { config, dataDir, workspaceDir };
}
