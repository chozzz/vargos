/**
 * Agent — Type schemas
 */

import type { Bus } from '../../core/types.js';
import type { AppConfig } from '../../services/config/index.js';

export interface AgentDeps {
  bus: Bus;
  config: AppConfig;
}
