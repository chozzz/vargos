/**
 * Agent tools extension (sessions, cron, process)
 */

import type { VargosExtension, ExtensionContext } from '../extension.js';
import { CronExtension } from './cron/index.js';
import { SessionsExtension } from './sessions/index.js';
import { agentStatusTool } from './agent-status.js';
import { channelStatusTool } from './channel-status.js';
import { channelSendMediaTool } from './channel-send-media.js';
import { configReadTool } from './config-read.js';
import { skillLoadTool } from './skill-load.js';
import { ProcessTool } from './process.js';

const cronExtension = new CronExtension();
const sessionsExtension = new SessionsExtension();

const extension: VargosExtension = {
  id: 'tools-agent',
  name: 'Agent Tools',
  register(ctx: ExtensionContext) {
    cronExtension.register(ctx);
    sessionsExtension.register(ctx);
    ctx.registerTool(agentStatusTool);
    ctx.registerTool(channelStatusTool);
    ctx.registerTool(channelSendMediaTool);
    ctx.registerTool(configReadTool);
    ctx.registerTool(skillLoadTool);
    ctx.registerTool(new ProcessTool());
  },
};

export default extension;
