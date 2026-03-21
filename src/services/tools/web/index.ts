/**
 * Web tools extension
 */

import type { VargosExtension } from '../extension.js';
import { webFetchTool } from './web-fetch.js';
import { BrowserTool } from './browser.js';

const extension: VargosExtension = {
  id: 'tools-web',
  name: 'Web Tools',
  register(ctx) {
    ctx.registerTool(webFetchTool);
    ctx.registerTool(new BrowserTool());
  },
};

export default extension;
