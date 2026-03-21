/**
 * Extension system contracts
 * Pure types — no runtime dependencies
 */

import type { Tool } from './types.js';

export interface VargosExtension {
  id: string;
  name: string;
  register(ctx: ExtensionContext): void | Promise<void>;
}

export interface ExtensionContext {
  registerTool(tool: Tool): void;
  paths: { dataDir: string; workspaceDir: string };
}
