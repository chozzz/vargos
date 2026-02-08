/**
 * Gateway input plugins extension
 */

import type { VargosExtension } from '../../core/extensions.js';
import { TextInputPlugin } from './text.js';
import { ImageInputPlugin } from './image.js';
import { MediaInputPlugin } from './media.js';

const extension: VargosExtension = {
  id: 'gateway-plugins',
  name: 'Gateway Input Plugins',
  register(ctx) {
    ctx.registerGatewayPlugin(new TextInputPlugin());
    ctx.registerGatewayPlugin(new ImageInputPlugin());
    ctx.registerGatewayPlugin(new MediaInputPlugin('voice'));
    ctx.registerGatewayPlugin(new MediaInputPlugin('file'));
    ctx.registerGatewayPlugin(new MediaInputPlugin('video'));
  },
};

export default extension;
export { TextInputPlugin } from './text.js';
export { ImageInputPlugin } from './image.js';
export { MediaInputPlugin } from './media.js';
