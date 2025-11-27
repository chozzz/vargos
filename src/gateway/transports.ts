import http from 'node:http';
import { WebSocketServer, WebSocket } from 'ws';
import { EventEmitter } from 'node:events';
import { getGateway, type GatewayResponse, type StreamingChunk, type NormalizedInput } from './core.js';

/**
 * HTTP Transport for REST API
 */
export class HTTPTransport extends EventEmitter {
  private server?: http.Server;
  
  constructor(
    private port: number = 3000,
    private host: string = '127.0.0.1'
  ) {
    super();
  }

  async start(): Promise<void> {
    this.server = http.createServer((req, res) => this.handleRequest(req, res));
    
    return new Promise((resolve, reject) => {
      this.server!.listen(this.port, this.host, () => {
        console.log(`🌐 HTTP server listening on ${this.host}:${this.port}`);
        this.emit('started');
        resolve();
      });
      
      this.server!.on('error', reject);
    });
  }

  async stop(): Promise<void> {
    return new Promise((resolve) => {
      if (!this.server) {
        resolve();
        return;
      }
      
      this.server.close(() => {
        this.emit('stopped');
        resolve();
      });
    });
  }

  private async handleRequest(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
    // CORS
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Session-Key');

    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }

    const url = new URL(req.url || '/', `http://${req.headers.host}`);
    
    try {
      // Authentication
      const authHeader = req.headers.authorization;
      const apiKey = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : undefined;
      
      if (!apiKey) {
        res.writeHead(401, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Unauthorized - Bearer token required' }));
        return;
      }

      // Routing
      if (url.pathname === '/health') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ status: 'ok', timestamp: new Date().toISOString() }));
        return;
      }

      if (url.pathname === '/api/v1/chat' && req.method === 'POST') {
        await this.handleChat(req, res, apiKey);
        return;
      }

      if (url.pathname === '/api/v1/sessions' && req.method === 'GET') {
        await this.handleListSessions(req, res, apiKey);
        return;
      }

      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Not found' }));
    } catch (error) {
      console.error('HTTP error:', error);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ 
        error: 'Internal server error',
        message: error instanceof Error ? error.message : 'Unknown error'
      }));
    }
  }

  private async handleChat(
    req: http.IncomingMessage, 
    res: http.ServerResponse,
    apiKey: string
  ): Promise<void> {
    const body = await this.readBody(req);
    const data = JSON.parse(body);
    
    const gateway = getGateway();
    const sessionKey = data.sessionKey || `http-${Date.now()}`;
    
    const input: NormalizedInput = {
      type: 'text',
      content: data.message,
      metadata: {
        contentType: 'text/plain',
      },
      source: {
        channel: 'http',
        userId: apiKey,
        sessionKey,
      },
      timestamp: Date.now(),
    };

    const context = {
      sessionKey,
      userId: apiKey,
      channel: 'http',
      permissions: ['*'],
      metadata: {},
    };

    const result = await gateway.processInput(input, context);
    
    res.writeHead(result.success ? 200 : 400, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      success: result.success,
      content: result.content,
      type: result.type,
      sessionKey,
    }));
  }

  private async handleListSessions(
    req: http.IncomingMessage,
    res: http.ServerResponse,
    apiKey: string
  ): Promise<void> {
    // TODO: Implement session listing
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ sessions: [] }));
  }

  private readBody(req: http.IncomingMessage): Promise<string> {
    return new Promise((resolve, reject) => {
      let body = '';
      req.on('data', chunk => body += chunk);
      req.on('end', () => resolve(body));
      req.on('error', reject);
    });
  }
}

/**
 * WebSocket Transport for real-time streaming
 */
export class WebSocketTransport extends EventEmitter {
  private wss?: WebSocketServer;
  private connections = new Map<string, WebSocket>();
  
  constructor(
    private port: number = 3001,
    private host: string = '127.0.0.1'
  ) {
    super();
  }

  async start(): Promise<void> {
    this.wss = new WebSocketServer({ port: this.port, host: this.host });
    
    this.wss.on('connection', (ws, req) => {
      this.handleConnection(ws, req);
    });

    console.log(`🔌 WebSocket server listening on ${this.host}:${this.port}`);
    this.emit('started');
  }

  async stop(): Promise<void> {
    return new Promise((resolve) => {
      if (!this.wss) {
        resolve();
        return;
      }
      
      this.wss.close(() => {
        this.emit('stopped');
        resolve();
      });
    });
  }

  private handleConnection(ws: WebSocket, req: http.IncomingMessage): void {
    const sessionKey = `ws-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    this.connections.set(sessionKey, ws);
    
    console.log(`[WS] Connection established: ${sessionKey}`);
    
    ws.on('message', async (data) => {
      try {
        const message = JSON.parse(data.toString());
        await this.handleMessage(ws, sessionKey, message);
      } catch (error) {
        ws.send(JSON.stringify({
          type: 'error',
          error: 'Invalid message format'
        }));
      }
    });

    ws.on('close', () => {
      console.log(`[WS] Connection closed: ${sessionKey}`);
      this.connections.delete(sessionKey);
    });

    ws.on('error', (error) => {
      console.error(`[WS] Error on ${sessionKey}:`, error);
    });

    // Send welcome
    ws.send(JSON.stringify({
      type: 'connected',
      sessionKey,
    }));
  }

  private async handleMessage(ws: WebSocket, sessionKey: string, message: unknown): Promise<void> {
    const msg = message as { type: string; content: string };
    
    if (msg.type === 'chat') {
      const gateway = getGateway();
      
      const input: NormalizedInput = {
        type: 'text',
        content: msg.content,
        metadata: {},
        source: {
          channel: 'websocket',
          userId: sessionKey,
          sessionKey,
        },
        timestamp: Date.now(),
      };

      const context = {
        sessionKey,
        userId: sessionKey,
        channel: 'websocket',
        permissions: ['*'],
        metadata: {},
      };

      const result = await gateway.processInput(input, context);
      
      ws.send(JSON.stringify({
        type: 'response',
        content: result.content,
        success: result.success,
      }));
    }
  }

  broadcast(chunk: StreamingChunk): void {
    const message = JSON.stringify({
      ...chunk,
      messageType: 'stream',
    });
    
    for (const [sessionKey, ws] of this.connections) {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(message);
      }
    }
  }
}
