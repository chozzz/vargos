/**
 * Sessions service — manages session state, history, and lifecycle
 *
 * Methods: session.list, session.get, session.create, session.delete,
 *          session.addMessage, session.getMessages
 * Events:  session.created, session.message
 */

import { ServiceClient } from '../gateway/service-client.js';
import { createLogger } from '../lib/logger.js';
import type { ISessionService, Session, SessionMessage } from './types.js';

const log = createLogger('sessions');

export interface SessionsServiceConfig {
  sessionService: ISessionService;
  gatewayUrl?: string;
}

export class SessionsService extends ServiceClient {
  private sessions: ISessionService;

  constructor(config: SessionsServiceConfig) {
    super({
      service: 'sessions',
      methods: [
        'session.list',
        'session.get',
        'session.create',
        'session.delete',
        'session.addMessage',
        'session.getMessages',
      ],
      events: ['session.created', 'session.message'],
      subscriptions: [],
      gatewayUrl: config.gatewayUrl,
    });
    this.sessions = config.sessionService;
  }

  async initialize(): Promise<void> {
    await this.sessions.initialize();
  }

  async handleMethod(method: string, params: unknown): Promise<unknown> {
    const p = params as Record<string, unknown>;

    switch (method) {
      case 'session.list':
        return this.sessions.list(p as { kind?: Session['kind']; limit?: number });

      case 'session.get':
        return this.sessions.get(p.sessionKey as string);

      case 'session.create': {
        const session = await this.sessions.create(p as Omit<Session, 'createdAt' | 'updatedAt'>);
        log.info(`session created: ${session.sessionKey} kind=${session.kind}`);
        this.emit('session.created', { sessionKey: session.sessionKey, kind: session.kind });
        return session;
      }

      case 'session.delete':
        log.info(`session deleted: ${p.sessionKey}`);
        return this.sessions.delete(p.sessionKey as string);

      case 'session.addMessage': {
        const msg = await this.sessions.addMessage(p as Omit<SessionMessage, 'id' | 'timestamp'>);
        log.debug(`message added: ${p.sessionKey} role=${p.role}`);
        this.emit('session.message', { sessionKey: p.sessionKey, role: p.role });
        return msg;
      }

      case 'session.getMessages':
        return this.sessions.getMessages(
          p.sessionKey as string,
          p as { limit?: number; before?: Date },
        );

      default:
        throw new Error(`Unknown method: ${method}`);
    }
  }

  handleEvent(): void {
    // Sessions service subscribes to nothing
  }
}
