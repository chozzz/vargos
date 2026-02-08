/**
 * Service registry — tracks connected services and their registrations
 */

import type { WebSocket } from 'ws';
import type { ServiceRegistration } from './protocol.js';

interface ServiceEntry {
  registration: ServiceRegistration;
  conn: WebSocket;
}

export class ServiceRegistry {
  private services = new Map<string, ServiceEntry>();

  add(registration: ServiceRegistration, conn: WebSocket): void {
    this.services.set(registration.service, { registration, conn });
  }

  remove(conn: WebSocket): string | null {
    for (const [name, entry] of this.services) {
      if (entry.conn === conn) {
        this.services.delete(name);
        return name;
      }
    }
    return null;
  }

  get(name: string): ServiceEntry | undefined {
    return this.services.get(name);
  }

  list(): ServiceRegistration[] {
    return Array.from(this.services.values()).map((e) => e.registration);
  }

  getRoutingTable(): { services: string[]; methods: string[]; events: string[] } {
    const services: string[] = [];
    const methods: string[] = [];
    const events: string[] = [];

    for (const { registration } of this.services.values()) {
      services.push(registration.service);
      methods.push(...registration.methods);
      events.push(...registration.events);
    }

    return { services, methods, events };
  }
}
