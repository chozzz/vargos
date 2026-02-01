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
  type PreparedInput,
} from './core.js';

export {
  HTTPTransport,
  WebSocketTransport,
} from './transports.js';

export {
  TextInputPlugin,
} from './plugins/text.js';

export {
  ImageInputPlugin,
} from './plugins/image.js';

export {
  MediaInputPlugin,
} from './plugins/media.js';
