/**
 * Web tools extension
 */

import type { VargosExtension } from '../extension.js';
import { webFetchTool } from './web-fetch.js';
import { createBrowserTool } from './browser.js';

const extension: VargosExtension = {
  id: 'tools-web',
  name: 'Web Tools',
  register(ctx) {
    ctx.registerTool(webFetchTool);
    ctx.registerTool(createBrowserTool());
  },
};

export default extension;
