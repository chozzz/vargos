/**
 * File-based service implementations extension
 */

import type { VargosExtension } from '../../core/extensions.js';

const extension: VargosExtension = {
  id: 'service-file',
  name: 'File-based Services',
  register(ctx) {
    ctx.registerMemoryService((config) => {
      // Lazy import to avoid circular deps
      const { FileMemoryService } = require('./memory-file.js');
      return new FileMemoryService(config);
    });
    ctx.registerSessionService((config) => {
      const { FileSessionService } = require('./sessions-file.js');
      return new FileSessionService(config);
    });
  },
};

export default extension;
export { FileMemoryService } from './memory-file.js';
export { FileSessionService } from './sessions-file.js';
export { MemoryContext, initializeMemoryContext } from './memory-context.js';
export { MemorySQLiteStorage } from './sqlite-storage.js';
