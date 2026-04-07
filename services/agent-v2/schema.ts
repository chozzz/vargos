/**
 * Agent v2 — Type schemas
 */

import type { Bus } from '../../gateway/bus.js';
import type { AppConfig } from '../../services/config/index.js';

export interface AgentDeps {
  bus: Bus;
  config: AppConfig;
}
