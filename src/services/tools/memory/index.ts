/**
 * Memory tools extension
 */

import type { VargosExtension } from '../extension.js';
import { memorySearchTool } from './memory-search.js';
import { memoryGetTool } from './memory-get.js';
import { memoryWriteTool } from './memory-write.js';

const extension: VargosExtension = {
  id: 'tools-memory',
  name: 'Memory Tools',
  register(ctx) {
    ctx.registerTool(memorySearchTool);
    ctx.registerTool(memoryGetTool);
    ctx.registerTool(memoryWriteTool);
  },
};

export default extension;
