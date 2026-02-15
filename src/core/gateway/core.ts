/**
 * Modular Gateway Architecture for Vargos
 * Plugin-based input handling with support for multiple input types
 */

import { EventEmitter } from 'node:events';
import type { Server as HTTPServer } from 'node:http';
import type { WebSocket } from 'ws';
import { createLogger } from '../lib/logger.js';

const log = createLogger('gateway');
import { getPiAgentRuntime } from '../runtime/runtime.js';
import { getSessionService } from '../services/factory.js';
import { resolveSessionFile, resolveWorkspaceDir, resolveDataDir } from '../config/paths.js';
import { loadConfig } from '../config/pi-config.js';
import { LOCAL_PROVIDERS } from '../config/validate.js';
import { deliverReply, type SendFn } from '../lib/reply-delivery.js';
import { TextInputPlugin } from '../../extensions/gateway-plugins/text.js';
import { ImageInputPlugin } from '../../extensions/gateway-plugins/image.js';
import { MediaInputPlugin } from '../../extensions/gateway-plugins/media.js';

// Re-export all types so existing imports from './core.js' keep working
export {
  type InputType,
  type NormalizedInput,
  type GatewayContext,
  type GatewayResponse,
  type StreamingChunk,
  type PreparedInput,
  InputPlugin,
} from './types.js';

import type {
  InputType,
  NormalizedInput,
  GatewayContext,
  GatewayResponse,
  StreamingChunk,
} from './types.js';
import { InputPlugin } from './types.js';

// ============================================================================
// Plugin Registry
// ============================================================================

export class PluginRegistry extends EventEmitter {
  private plugins = new Map<InputType, Map<string, InputPlugin>>();

  register(plugin: InputPlugin): void {
    if (!this.plugins.has(plugin.type)) {
      this.plugins.set(plugin.type, new Map());
    }
    this.plugins.get(plugin.type)!.set(plugin.name, plugin);
    this.emit('registered', plugin);
  }

  unregister(type: InputType, name: string): boolean {
    const plugins = this.plugins.get(type);
    if (!plugins) return false;
    const plugin = plugins.get(name);
    if (!plugin) return false;
    plugins.delete(name);
    this.emit('unregistered', type, name);
    return true;
  }

  get(type: InputType, name: string): InputPlugin | undefined {
    return this.plugins.get(type)?.get(name);
  }

  getByType(type: InputType): InputPlugin | undefined {
    const bucket = this.plugins.get(type);
    if (!bucket) return undefined;
    return bucket.values().next().value;
  }

  list(): Array<{ type: InputType; name: string }> {
    const results: Array<{ type: InputType; name: string }> = [];
    for (const [type, plugins] of this.plugins) {
      for (const name of plugins.keys()) {
        results.push({ type, name });
      }
    }
    return results;
  }

  findForInput(input: unknown): InputPlugin | undefined {
    for (const plugins of this.plugins.values()) {
      for (const plugin of plugins.values()) {
        if (plugin.validate(input)) {
          return plugin;
        }
      }
    }
    return undefined;
  }
}

// ============================================================================
// Gateway Core
// ============================================================================

export class Gateway extends EventEmitter {
  private plugins = new PluginRegistry();
  private sessions = new Map<string, GatewayContext>();
  private httpServer?: HTTPServer;
  private wsConnections = new Map<string, WebSocket>();

  constructor(private options: {
    port?: number;
    wsPort?: number;
    authRequired?: boolean;
    maxConcurrentSessions?: number;
  } = {}) {
    super();
    this.registerPlugin(new TextInputPlugin());
    this.registerPlugin(new ImageInputPlugin());
    this.registerPlugin(new MediaInputPlugin('voice'));
    this.registerPlugin(new MediaInputPlugin('file'));
    this.registerPlugin(new MediaInputPlugin('video'));
  }

  async start(): Promise<void> {
    this.emit('starting');
    this.emit('started');
  }

  async stop(): Promise<void> {
    this.emit('stopping');
    this.emit('stopped');
  }

  registerPlugin(plugin: InputPlugin): void {
    plugin.on('input', (input: NormalizedInput) => this.handleInput(input));
    this.plugins.register(plugin);
  }

  async processInput(
    input: NormalizedInput,
    context: GatewayContext
  ): Promise<GatewayResponse> {
    this.emit('input:received', input, context);

    this.sessions.set(context.sessionKey, context);

    try {
      if (!this.validateInput(input)) {
        throw new Error('Invalid input');
      }

      if (!this.checkPermissions(context, input.type)) {
        throw new Error('Insufficient permissions');
      }

      const result = await this.queueForProcessing(input, context);
      this.emit('input:processed', input, result);
      return result;
    } catch (error) {
      this.emit('input:error', input, error);
      return {
        success: false,
        content: error instanceof Error ? error.message : 'Unknown error',
        type: 'error',
      };
    }
  }

  streamResponse(sessionKey: string, chunk: StreamingChunk): void {
    const context = this.sessions.get(sessionKey);
    if (!context) return;

    const plugin = this.findPluginForContext(context);
    if (!plugin) return;

    plugin.streamChunk(chunk, context);
    this.emit('stream', sessionKey, chunk);
  }

  private async queueForProcessing(
    input: NormalizedInput,
    context: GatewayContext
  ): Promise<GatewayResponse> {
    return this.execute(input, context);
  }

  private async execute(
    input: NormalizedInput,
    context: GatewayContext
  ): Promise<GatewayResponse> {
    const sessions = getSessionService();
    const sessionKey = context.sessionKey;

    log.info(`execute: sessionKey=${sessionKey} channel=${context.channel}`);

    let session = await sessions.get(sessionKey);
    if (!session) {
      session = await sessions.create({
        sessionKey,
        kind: 'main',
        label: `${context.channel}:${context.userId}`,
        metadata: { channel: context.channel },
      });
    }

    // Delegate input preparation to the matching plugin
    const plugin = this.plugins.getByType(input.type);
    const { text, images, savedPath } = plugin
      ? await plugin.prepare(input)
      : { text: String(input.content) };

    await sessions.addMessage({
      sessionKey,
      content: text,
      role: 'user',
      metadata: { type: 'task', channel: context.channel, ...(savedPath && { mediaPath: savedPath }) },
    });

    const workspaceDir = resolveWorkspaceDir();
    const config = await loadConfig(resolveDataDir());
    if (!config) {
      log.error('No config.json — run: vargos config');
      return { success: false, content: 'Not configured. Run: vargos config', type: 'error' };
    }
    const provider = config.agent.provider;
    const model = config.agent.model;
    const envKey = process.env[`${provider.toUpperCase()}_API_KEY`];
    const apiKey = envKey || config.agent.apiKey || (LOCAL_PROVIDERS.has(provider) ? 'local' : undefined);

    if (!apiKey) {
      log.error(`No API key for provider "${provider}"`);
      return {
        success: false,
        content: `No API key configured for ${provider}. Run: vargos config`,
        type: 'error',
      };
    }

    log.info(`running agent: provider=${provider} model=${model}`);

    const runtime = getPiAgentRuntime();
    const result = await log.child(() => runtime.run({
      sessionKey,
      sessionFile: resolveSessionFile(sessionKey),
      workspaceDir,
      model,
      provider,
      apiKey,
      baseUrl: config.agent.baseUrl,
      images: images?.length ? images : undefined,
      channel: context.channel,
    }));

    log.info(`result: success=${result.success} response=${(result.response || result.error || '').slice(0, 100)}`);

    if (result.success) {
      return {
        success: true,
        content: result.response || '',
        type: 'text',
      };
    }

    return {
      success: false,
      content: result.error || 'Agent run failed',
      type: 'error',
    };
  }

  private validateInput(input: NormalizedInput): boolean {
    const validTypes: InputType[] = ['text', 'voice', 'image', 'file', 'video', 'location', 'custom'];

    return !!(
      input.type &&
      validTypes.includes(input.type) &&
      input.content &&
      input.source?.sessionKey &&
      input.source?.userId
    );
  }

  private checkPermissions(context: GatewayContext, inputType: InputType): boolean {
    return true;
  }

  private findPluginForContext(context: GatewayContext): InputPlugin | undefined {
    const textPlugins = this.plugins.get('text' as InputType, 'text-plain');
    if (textPlugins) return textPlugins;
    return this.plugins.findForInput({ text: '' });
  }

  private handleInput(input: NormalizedInput): void {
    const context = this.sessions.get(input.source.sessionKey);
    if (!context) return;

    this.processInput(input, context).catch((err) => log.error(err));
  }
}

// ============================================================================
// Module Exports
// ============================================================================

let globalGateway: Gateway | null = null;

export function getGateway(): Gateway {
  if (!globalGateway) {
    globalGateway = new Gateway();
  }
  return globalGateway;
}

export function initializeGateway(options?: ConstructorParameters<typeof Gateway>[0]): Gateway {
  globalGateway = new Gateway(options);
  return globalGateway;
}

/** Process input through gateway and deliver the reply in one call. */
export async function processAndDeliver(
  input: NormalizedInput,
  context: GatewayContext,
  send: SendFn,
  sendTyping?: () => Promise<void>,
): Promise<GatewayResponse> {
  let typingInterval: ReturnType<typeof setInterval> | undefined;

  if (sendTyping) {
    sendTyping().catch(() => {});
    typingInterval = setInterval(() => sendTyping().catch(() => {}), 4000);
  }

  try {
    const result = await getGateway().processInput(input, context);
    if (result.success && result.content) {
      const text = typeof result.content === 'string'
        ? result.content
        : result.content.toString('utf-8');
      await deliverReply(send, text);
    } else if (!result.success && result.content) {
      await send(`[error] ${result.content}`).catch(() => {});
    }
    return result;
  } finally {
    if (typingInterval) clearInterval(typingInterval);
  }
}
