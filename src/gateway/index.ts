/**
 * Gateway exports
 */

export { GatewayServer, type GatewayServerOptions } from './server.js';
export { Router } from './router.js';
export { EventBus } from './bus.js';
export { ServiceRegistry } from './registry.js';
export {
  type RequestFrame,
  type ResponseFrame,
  type EventFrame,
  type Frame,
  type ServiceRegistration,
  RequestFrameSchema,
  ResponseFrameSchema,
  EventFrameSchema,
  FrameSchema,
  ServiceRegistrationSchema,
  parseFrame,
  serializeFrame,
  createRequestId,
} from '../protocol/index.js';
