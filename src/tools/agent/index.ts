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
import { cronUpdateTool } from './cron-update.js';
import { cronRunTool } from './cron-run.js';
import { sessionsDeleteTool } from './sessions-delete.js';
import { agentStatusTool } from './agent-status.js';
import { channelStatusTool } from './channel-status.js';
import { configReadTool } from './config-read.js';
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
    ctx.registerTool(cronUpdateTool);
    ctx.registerTool(cronRunTool);
    ctx.registerTool(sessionsDeleteTool);
    ctx.registerTool(agentStatusTool);
    ctx.registerTool(channelStatusTool);
    ctx.registerTool(configReadTool);
    ctx.registerTool(createProcessTool());
  },
};

export default extension;
