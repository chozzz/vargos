/**
 * Channel send media tool — send image/video/audio/document to a channel
 */

import { z } from 'zod';
import { Tool, ToolContext, textResult, errorResult } from '../types.js';
import { toMessage } from '../../lib/error.js';

const ChannelSendMediaParameters = z.object({
  channel: z.string().describe('Channel type (e.g. "whatsapp", "telegram")'),
  userId: z.string().describe('Recipient user ID'),
  filePath: z.string().describe('Absolute path to the file on disk'),
  mimeType: z.string().describe('MIME type (e.g. "image/png", "video/mp4")'),
  caption: z.string().optional().describe('Optional caption for the media'),
});

export const channelSendMediaTool: Tool = {
  name: 'channel_send_media',
  description: 'Send a media file (image, video, audio, document) to a messaging channel. Use this when you need to deliver generated images, screenshots, or other files to the user via WhatsApp/Telegram.',
  parameters: ChannelSendMediaParameters,
  formatCall: (args) => `${args.channel}:${args.userId} ${args.filePath}`,
  execute: async (args: unknown, context: ToolContext) => {
    const params = ChannelSendMediaParameters.parse(args);
    if (!context.call) return errorResult('Gateway not available');

    try {
      await context.call('channel', 'channel.sendMedia', {
        channel: params.channel,
        userId: params.userId,
        filePath: params.filePath,
        mimeType: params.mimeType,
        caption: params.caption,
      });

      return textResult(`Media sent to ${params.channel}:${params.userId}`);
    } catch (err) {
      const message = toMessage(err);
      return errorResult(`Failed to send media: ${message}`);
    }
  },
};
