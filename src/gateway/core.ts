/**
 * Modular Gateway Architecture for Vargos
 * Plugin-based input handling with support for multiple input types
 */

import { EventEmitter } from 'node:events';
import type { Server as HTTPServer } from 'node:http';
import type { WebSocket } from 'ws';
import { getPiAgentRuntime } from '../pi/runtime.js';
import { getSessionService } from '../services/factory.js';
import { resolveSessionFile, resolveWorkspaceDir } from '../config/paths.js';
import { saveMedia } from '../lib/media.js';
import { loadPiSettings, getPiApiKey } from '../config/pi-config.js';
import { deliverReply, type SendFn } from '../lib/reply-delivery.js';

// ============================================================================
// Types
// ============================================================================

export type InputType = 'text' | 'voice' | 'image' | 'file' | 'video' | 'location' | 'custom';

export interface InputHandler {
  type: InputType;
  name: string;
  validate(input: unknown): boolean;
  transform(input: unknown): Promise<NormalizedInput>;
}

export interface NormalizedInput {
  type: InputType;
  content: string | Buffer;
  metadata: {
    mimeType?: string;
    filename?: string;
    size?: number;
    encoding?: string;
    [key: string]: unknown;
  };
  source: {
    channel: string;
    userId: string;
    sessionKey: string;
  };
  timestamp: number;
}

export interface GatewayContext {
  sessionKey: string;
  userId: string;
  channel: string;
  permissions: string[];
  metadata: Record<string, unknown>;
}

export interface GatewayResponse {
  success: boolean;
  content: string | Buffer;
  type: 'text' | 'image' | 'file' | 'error';
  metadata?: Record<string, unknown>;
}

export interface StreamingChunk {
  type: 'assistant' | 'tool' | 'compaction' | 'lifecycle';
  content: string;
  isComplete: boolean;
  metadata?: Record<string, unknown>;
}

// ============================================================================
// Plugin System
// ============================================================================

/**
 * Base class for input plugins
 */
export abstract class InputPlugin extends EventEmitter {
  abstract readonly type: InputType;
  abstract readonly name: string;

  /**
   * Validate raw input from channel
   */
  abstract validate(input: unknown): boolean;

  /**
   * Transform channel-specific input to normalized format
   */
  abstract transform(input: unknown, context: GatewayContext): Promise<NormalizedInput>;

  /**
   * Handle response formatting for this channel
   */
  abstract formatResponse(response: GatewayResponse, context: GatewayContext): Promise<unknown>;

  /**
   * Stream response chunks
   */
  abstract streamChunk(chunk: StreamingChunk, context: GatewayContext): void;
}

/**
 * Plugin registry for managing input handlers
 */
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

/**
 * Main Gateway class - orchestrates input processing
 */
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
  }

  /**
   * Initialize and start gateway
   */
  async start(): Promise<void> {
    this.emit('starting');
    
    // TODO: Initialize HTTP server
    // TODO: Initialize WebSocket server
    // TODO: Start listening
    
    this.emit('started');
  }

  /**
   * Stop gateway gracefully
   */
  async stop(): Promise<void> {
    this.emit('stopping');
    
    // TODO: Close all connections
    // TODO: Stop servers
    // TODO: Clean up
    
    this.emit('stopped');
  }

  /**
   * Register an input plugin
   */
  registerPlugin(plugin: InputPlugin): void {
    plugin.on('input', (input: NormalizedInput) => this.handleInput(input));
    this.plugins.register(plugin);
  }

  /**
   * Process input through the pipeline
   */
  async processInput(
    input: NormalizedInput,
    context: GatewayContext
  ): Promise<GatewayResponse> {
    this.emit('input:received', input, context);

    // Track session context for streaming
    this.sessions.set(context.sessionKey, context);

    try {
      // Step 1: Validate input
      if (!this.validateInput(input)) {
        throw new Error('Invalid input');
      }

      // Step 2: Check permissions
      if (!this.checkPermissions(context, input.type)) {
        throw new Error('Insufficient permissions');
      }

      // Step 3: Queue for processing
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

  /**
   * Handle streaming response
   */
  streamResponse(
    sessionKey: string,
    chunk: StreamingChunk
  ): void {
    const context = this.sessions.get(sessionKey);
    if (!context) return;

    const plugin = this.findPluginForContext(context);
    if (!plugin) return;

    plugin.streamChunk(chunk, context);
    this.emit('stream', sessionKey, chunk);
  }

  /**
   * Queue input for serialized processing
   */
  private async queueForProcessing(
    input: NormalizedInput,
    context: GatewayContext
  ): Promise<GatewayResponse> {
    // TODO: Integrate with SessionMessageQueue
    // For now, direct processing
    return this.execute(input, context);
  }

  /**
   * Execute agent run via PiAgentRuntime
   */
  private async execute(
    input: NormalizedInput,
    context: GatewayContext
  ): Promise<GatewayResponse> {
    const sessions = getSessionService();
    const sessionKey = context.sessionKey;

    console.error(`[Gateway] execute: sessionKey=${sessionKey} channel=${context.channel}`);

    // Ensure session exists
    let session = await sessions.get(sessionKey);
    if (!session) {
      session = await sessions.create({
        sessionKey,
        kind: 'main',
        label: `${context.channel}:${context.userId}`,
        metadata: { channel: context.channel },
      });
    }

    // Extract text and images from input
    const images: Array<{ data: string; mimeType: string }> = [];
    let text: string;
    let savedPath: string | undefined;

    if (Buffer.isBuffer(input.content)) {
      const mimeType = (input.metadata.mimeType as string) || 'application/octet-stream';

      // Vision-capable types get passed to the model
      if (input.type === 'image') {
        images.push({ data: input.content.toString('base64'), mimeType });
      }

      savedPath = await saveMedia({ buffer: input.content, sessionKey, mimeType });

      const label = input.type === 'image' ? 'Image' : input.type.charAt(0).toUpperCase() + input.type.slice(1);
      const caption = (input.metadata.caption as string) || `User sent ${label.toLowerCase() === 'file' ? 'a' : 'an'} ${label.toLowerCase()}.`;
      text = `${caption}\n\n[${label} saved: ${savedPath}]`;
    } else {
      text = input.content as string;
    }

    // Store user message as a task so PiAgentRuntime picks it up
    await sessions.addMessage({
      sessionKey,
      content: text,
      role: 'user',
      metadata: { type: 'task', channel: context.channel, ...(savedPath && { mediaPath: savedPath }) },
    });

    // Resolve runtime config
    const workspaceDir = resolveWorkspaceDir();
    const piSettings = await loadPiSettings(workspaceDir);
    const provider = piSettings.defaultProvider || 'openai';
    const model = piSettings.defaultModel || 'gpt-4o-mini';
    const apiKey = await getPiApiKey(workspaceDir, provider);

    if (!apiKey) {
      console.error(`[Gateway] No API key for provider "${provider}"`);
      return {
        success: false,
        content: `No API key configured for ${provider}. Run: pnpm cli config:set`,
        type: 'error',
      };
    }

    console.error(`[Gateway] Running agent: provider=${provider} model=${model}`);

    const runtime = getPiAgentRuntime();
    const result = await runtime.run({
      sessionKey,
      sessionFile: resolveSessionFile(sessionKey),
      workspaceDir,
      model,
      provider,
      apiKey,
      images: images.length ? images : undefined,
      channel: context.channel,
    });

    console.error(`[Gateway] Agent result: success=${result.success} response=${(result.response || result.error || '').slice(0, 100)}`);

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
    // TODO: Implement permission checking
    return true;
  }

  private findPluginForContext(context: GatewayContext): InputPlugin | undefined {
    // Find a text plugin for the given channel
    const textPlugins = this.plugins.get('text' as InputType, 'text-plain');
    if (textPlugins) return textPlugins;
    return this.plugins.findForInput({ text: '' });
  }

  private handleInput(input: NormalizedInput): void {
    const context = this.sessions.get(input.source.sessionKey);
    if (!context) return;
    
    this.processInput(input, context).catch(console.error);
  }
}

// ============================================================================
// Module Exports
// ============================================================================

// Singleton instance
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
    }
    return result;
  } finally {
    if (typingInterval) clearInterval(typingInterval);
  }
}
