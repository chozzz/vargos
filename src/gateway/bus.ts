/**
 * Event bus — topic-based pub/sub with global sequence counter
 */

import type { WebSocket } from 'ws';
import { serializeFrame, type EventFrame } from '../protocol/index.js';

export class EventBus {
  private subs = new Map<string, Set<WebSocket>>();
  private seq = 0;

  subscribe(events: string[], conn: WebSocket): void {
    for (const event of events) {
      let set = this.subs.get(event);
      if (!set) {
        set = new Set();
        this.subs.set(event, set);
      }
      set.add(conn);
    }
  }

  unsubscribe(conn: WebSocket): void {
    for (const set of this.subs.values()) {
      set.delete(conn);
    }
  }

  publish(source: string, event: string, payload?: unknown): void {
    const frame: EventFrame = {
      type: 'event',
      source,
      event,
      payload,
      seq: ++this.seq,
    };
    const data = serializeFrame(frame);

    const subscribers = this.subs.get(event);
    if (!subscribers) return;

    for (const conn of subscribers) {
      if (conn.readyState === conn.OPEN) {
        conn.send(data);
      }
    }
  }

  listEvents(): string[] {
    return Array.from(this.subs.keys());
  }
}
