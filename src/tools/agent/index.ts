/**
 * Agent tools extension (sessions, cron, process)
 */

import type { VargosExtension } from '../extension.js';
import { sessionsListTool } from './sessions-list.js';
import { sessionsHistoryTool } from './sessions-history.js';
import { sessionsSendTool } from './sessions-send.js';
import { sessionsSpawnTool } from './sessions-spawn.js';
import { cronAddTool } from './cron-add.js';
import { cronListTool } from './cron-list.js';
import { cronRemoveTool } from './cron-remove.js';
import { createProcessTool } from './process.js';

const extension: VargosExtension = {
  id: 'tools-agent',
  name: 'Agent Tools',
  register(ctx) {
    ctx.registerTool(sessionsListTool);
    ctx.registerTool(sessionsHistoryTool);
    ctx.registerTool(sessionsSendTool);
    ctx.registerTool(sessionsSpawnTool);
    ctx.registerTool(cronAddTool);
    ctx.registerTool(cronListTool);
    ctx.registerTool(cronRemoveTool);
    ctx.registerTool(createProcessTool());
  },
};

export default extension;
