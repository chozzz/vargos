import { InputPlugin, type InputType, type NormalizedInput, type PreparedInput, type GatewayContext, type GatewayResponse, type StreamingChunk } from '../types.js';
import { saveMedia } from '../../lib/media.js';

/**
 * Handles voice, file, and video inputs — saves to disk, no vision.
 * Register one instance per type.
 */
export class MediaInputPlugin extends InputPlugin {
  readonly type: InputType;
  readonly name: string;

  constructor(type: 'voice' | 'file' | 'video') {
    super();
    this.type = type;
    this.name = `media-${type}`;
  }

  validate(input: unknown): boolean {
    return Buffer.isBuffer(input);
  }

  async transform(input: unknown, context: GatewayContext): Promise<NormalizedInput> {
    return { type: this.type, content: input as Buffer, metadata: {}, source: { channel: context.channel, userId: context.userId, sessionKey: context.sessionKey }, timestamp: Date.now() };
  }

  async prepare(input: NormalizedInput): Promise<PreparedInput> {
    const buffer = input.content as Buffer;
    const mimeType = (input.metadata.mimeType as string) || 'application/octet-stream';
    const savedPath = await saveMedia({ buffer, sessionKey: input.source.sessionKey, mimeType });
    const label = this.type.charAt(0).toUpperCase() + this.type.slice(1);
    const article = label.toLowerCase() === 'file' ? 'a' : 'an';
    const caption = (input.metadata.caption as string) || `User sent ${article} ${label.toLowerCase()}.`;
    return { text: `${caption}\n\n[${label} saved: ${savedPath}]`, savedPath };
  }

  async formatResponse(response: GatewayResponse, _context: GatewayContext): Promise<unknown> {
    return { type: 'text', content: response.content };
  }

  streamChunk(chunk: StreamingChunk, context: GatewayContext): void {
    this.emit('stream', { type: chunk.type, content: chunk.content, isComplete: chunk.isComplete, sessionKey: context.sessionKey });
  }
}
