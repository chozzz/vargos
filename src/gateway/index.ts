/**
 * Gateway index - exports all gateway modules
 */

export {
  Gateway,
  PluginRegistry,
  InputPlugin,
  getGateway,
  initializeGateway,
  type InputType,
  type InputHandler,
  type NormalizedInput,
  type GatewayContext,
  type GatewayResponse,
  type StreamingChunk,
} from './core.js';

export {
  HTTPTransport,
  WebSocketTransport,
} from './transports.js';

export {
  TextInputPlugin,
} from './plugins/text.js';
