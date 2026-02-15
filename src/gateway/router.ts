/**
 * Method router — maps method names to service connections
 */

import type { WebSocket } from 'ws';
import type { RequestFrame } from '../protocol/index.js';

export class Router {
  private routes = new Map<string, WebSocket>();

  register(methods: string[], conn: WebSocket): void {
    for (const method of methods) {
      this.routes.set(method, conn);
    }
  }

  route(frame: RequestFrame): WebSocket | null {
    return this.routes.get(frame.method) ?? null;
  }

  unregister(conn: WebSocket): void {
    for (const [method, c] of this.routes) {
      if (c === conn) this.routes.delete(method);
    }
  }

  listMethods(): string[] {
    return Array.from(this.routes.keys());
  }
}
