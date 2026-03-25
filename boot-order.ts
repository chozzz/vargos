/**
 * Service boot sequence — ordered exports.
 *
 * Each entry is a { boot(bus) } module from a service's index.ts.
 * Boot runs in array order — earlier = higher priority.
 *
 * To add a service:
 *   1. Create services/myservice/index.ts with @on handlers and export boot()
 *   2. Add it here at the right position
 *   3. That's it — no other file needs to change
 */

export { boot as bootConfig }    from './services/config/index.js';  // must be first
export { boot as bootLog }       from './services/log/index.js';     // wires createLogger to bus
export { boot as bootSessions }  from './services/sessions/index.js';
export { boot as bootFs }        from './services/fs/index.js';
export { boot as bootWeb }       from './services/web/index.js';
export { boot as bootWorkspace } from './services/workspace/index.js';
export { boot as bootMemory }    from './services/memory/index.js';
export { boot as bootAgent }     from './services/agent/index.js';
export { boot as bootCron }      from './services/cron/index.js';
export { boot as bootChannels }  from './services/channels/index.js';
export { boot as bootWebhooks }  from './edge/webhooks/index.js';
export { boot as bootMcp }       from './edge/mcp/index.js';
