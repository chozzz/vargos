import { InputPlugin, type NormalizedInput, type PreparedInput, type GatewayContext, type GatewayResponse, type StreamingChunk } from '../types.js';
import { saveMedia } from '../../lib/media.js';

export class ImageInputPlugin extends InputPlugin {
  readonly type = 'image' as const;
  readonly name = 'image';

  validate(input: unknown): boolean {
    return Buffer.isBuffer(input);
  }

  async transform(input: unknown, context: GatewayContext): Promise<NormalizedInput> {
    return { type: 'image', content: input as Buffer, metadata: {}, source: { channel: context.channel, userId: context.userId, sessionKey: context.sessionKey }, timestamp: Date.now() };
  }

  async prepare(input: NormalizedInput): Promise<PreparedInput> {
    const buffer = input.content as Buffer;
    const mimeType = (input.metadata.mimeType as string) || 'application/octet-stream';
    const savedPath = await saveMedia({ buffer, sessionKey: input.source.sessionKey, mimeType });
    const caption = (input.metadata.caption as string) || 'User sent an image.';
    return {
      text: `${caption}\n\n[Image saved: ${savedPath}]`,
      images: [{ data: buffer.toString('base64'), mimeType }],
      savedPath,
    };
  }

  async formatResponse(response: GatewayResponse, _context: GatewayContext): Promise<unknown> {
    return { type: 'text', content: response.content };
  }

  streamChunk(chunk: StreamingChunk, context: GatewayContext): void {
    this.emit('stream', { type: chunk.type, content: chunk.content, isComplete: chunk.isComplete, sessionKey: context.sessionKey });
  }
}
