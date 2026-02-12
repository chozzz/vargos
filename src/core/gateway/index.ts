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
  type NormalizedInput,
  type GatewayContext,
  type GatewayResponse,
  type StreamingChunk,
  type PreparedInput,
} from './core.js';

export {
  TextInputPlugin,
} from '../../extensions/gateway-plugins/text.js';

export {
  ImageInputPlugin,
} from '../../extensions/gateway-plugins/image.js';

export {
  MediaInputPlugin,
} from '../../extensions/gateway-plugins/media.js';
