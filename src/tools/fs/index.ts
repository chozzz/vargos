/**
 * File system tools extension
 */

import type { VargosExtension } from '../extension.js';
import { readTool } from './read.js';
import { writeTool } from './write.js';
import { editTool } from './edit.js';
import { execTool } from './exec.js';

const extension: VargosExtension = {
  id: 'tools-fs',
  name: 'File System Tools',
  register(ctx) {
    ctx.registerTool(readTool);
    ctx.registerTool(writeTool);
    ctx.registerTool(editTool);
    ctx.registerTool(execTool);
  },
};

export default extension;
