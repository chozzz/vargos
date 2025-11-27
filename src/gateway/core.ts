/**
 * Modular Gateway Architecture for Vargos
 * Plugin-based input handling with support for multiple input types
 */

import { EventEmitter } from 'node:events';
import type { Server as HTTPServer } from 'node:http';
import type { WebSocket } from 'ws';

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
   * Execute agent run
   */
  private async execute(
    input: NormalizedInput,
    context: GatewayContext
  ): Promise<GatewayResponse> {
    // TODO: Integrate with PiAgentRuntime
    return {
      success: true,
      content: 'Placeholder response',
      type: 'text',
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
    // TODO: Map channels to plugins
    return undefined;
  }

  private handleInput(input: NormalizedInput): void {
    const context = this.sessions.get(input.source.sessionKey);
    if (!context) return;
    
    this.processInput(input, context).catch(console.error);
  }
}

// ============================================================================
// Transport Adapters
// ============================================================================

/**
 * WebSocket transport for real-time communication
 */
export class WebSocketTransport extends EventEmitter {
  constructor(private gateway: Gateway) {
    super();
  }

  async handleConnection(ws: WebSocket, sessionKey: string): Promise<void> {
    // TODO: Implement WebSocket handling
  }

  sendChunk(chunk: StreamingChunk): void {
    // TODO: Send chunk over WebSocket
  }
}

/**
 * HTTP/REST transport for request-response
 */
export class HTTPTransport extends EventEmitter {
  constructor(private gateway: Gateway) {
    super();
  }

  async handleRequest(req: unknown, res: unknown): Promise<void> {
    // TODO: Implement HTTP handling
  }
}

/**
 * Server-Sent Events transport for streaming
 */
export class SSETransport extends EventEmitter {
  constructor(private gateway: Gateway) {
    super();
  }

  async handleConnection(req: unknown, res: unknown): Promise<void> {
    // TODO: Implement SSE handling
  }

  sendChunk(chunk: StreamingChunk): void {
    // TODO: Send SSE chunk
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
