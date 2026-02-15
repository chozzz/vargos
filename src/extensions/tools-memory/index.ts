/**
 * Memory tools extension
 */

import type { VargosExtension } from '../../contracts/extension.js';
import { memorySearchTool } from './memory-search.js';
import { memoryGetTool } from './memory-get.js';

const extension: VargosExtension = {
  id: 'tools-memory',
  name: 'Memory Tools',
  register(ctx) {
    ctx.registerTool(memorySearchTool);
    ctx.registerTool(memoryGetTool);
  },
};

export default extension;
