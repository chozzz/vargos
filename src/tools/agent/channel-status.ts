/**
 * Channel status tool - Show channel adapter status via gateway RPC
 */

import { z } from 'zod';
import { Tool, ToolContext, textResult, errorResult } from '../types.js';

const ChannelStatusParameters = z.object({
  channel: z.string().optional().describe('Specific channel name to check (omit for all)'),
});

type AdapterInfo = { type: string; status: string };

export const channelStatusTool: Tool = {
  name: 'channel_status',
  description: 'Show connection status of messaging channels (WhatsApp, Telegram, etc.).',
  parameters: ChannelStatusParameters,
  formatCall: (args) => String(args.channel || 'all'),
  execute: async (args: unknown, context: ToolContext) => {
    const params = ChannelStatusParameters.parse(args);
    if (!context.call) return errorResult('Gateway not available');

    try {
      const response = await context.call<AdapterInfo | AdapterInfo[]>('channel', 'channel.status', {
        channel: params.channel,
      });

      const channels = Array.isArray(response) ? response : [response];

      if (channels.length === 0) {
        return textResult('No channels configured.');
      }

      const lines = [
        `Channels (${channels.length}):`,
        '',
        ...channels.map(c => `- ${c.type}: ${c.status}`),
      ];

      return textResult(lines.join('\n'));
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return errorResult(`Failed to get channel status: ${message}`);
    }
  },
};
