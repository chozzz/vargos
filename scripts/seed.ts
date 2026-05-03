import { getDataPaths } from '../lib/paths.js';
import { seedDataDir } from '../lib/templates.js';

await seedDataDir(getDataPaths().dataDir, console);
