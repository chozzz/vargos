/**
 * JSON-RPC 2.0 over TCP client — one request per connection, newline-delimited,
 * matching `core/rpc-server.ts`. Used by the CLI (surface 1) and the web console
 * (`edge/web`) to talk to a running daemon.
 */

import { createConnection } from 'node:net';

export class RpcClient {
  constructor(private readonly host: string, private readonly port: number) {}

  /** One request/response over a fresh connection. Rejects on connect failure. */
  call<T = unknown>(method: string, params?: unknown, connectTimeoutMs = 2000): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const socket = createConnection({ host: this.host, port: this.port });
      let buffer = '';
      let settled = false;
      const fail = (err: Error) => { if (!settled) { settled = true; socket.destroy(); reject(err); } };

      socket.setTimeout(connectTimeoutMs, () => fail(new Error('daemon connect timeout')));
      socket.on('connect', () => {
        socket.setTimeout(0); // no idle limit once connected; long calls (agent) are allowed
        socket.write(JSON.stringify({ jsonrpc: '2.0', method, params, id: 1 }) + '\n');
      });
      socket.on('error', (err) => fail(err));
      socket.on('data', (chunk) => {
        buffer += chunk.toString();
        const nl = buffer.indexOf('\n');
        if (nl === -1) return;
        settled = true;
        socket.end();
        try {
          const res = JSON.parse(buffer.slice(0, nl)) as { result?: T; error?: { message?: string } };
          if (res.error) reject(new Error(res.error.message ?? 'rpc error'));
          else resolve(res.result as T);
        } catch (err) {
          reject(err instanceof Error ? err : new Error(String(err)));
        }
      });
    });
  }

  /** Is a daemon answering on the port? */
  async isUp(): Promise<boolean> {
    try {
      await this.call('bus.has', { method: 'bus.list' }, 1000);
      return true;
    } catch {
      return false;
    }
  }
}
