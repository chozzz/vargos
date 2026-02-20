/**
 * Browser automation tool
 * Multi-action browser tool for web automation
 */

import { z } from 'zod';
import { BaseTool } from '../base.js';
import { ToolContext, ToolResult, textResult, errorResult, imageResult } from '../types.js';
import { getBrowserService } from '../../services/browser.js';

const BrowserAction = z.enum([
  'start', 'stop', 'list',
  'open', 'navigate', 'snapshot',
  'click', 'type', 'press',
  'screenshot', 'pdf',
  'evaluate', 'close'
]);

const BrowserParameters = z.object({
  action: BrowserAction.describe('Browser action to perform'),
  sessionId: z.string().optional().describe('Browser session ID for target actions'),
  url: z.string().optional().describe('URL for open/navigate actions'),
  ref: z.string().optional().describe('Element reference (e.g., e12) for click/type'),
  text: z.string().optional().describe('Text to type'),
  key: z.string().optional().describe('Key to press'),
  fullPage: z.boolean().optional().describe('Full page screenshot (default: false)'),
  script: z.string().optional().describe('JavaScript to evaluate'),
  maxChars: z.number().optional().describe('Max chars for snapshot'),
});

export class BrowserTool extends BaseTool {
  constructor() {
    super({
      name: 'browser',
      description: 'Control a web browser: navigate, click, type, screenshot, run JavaScript',
      parameters: BrowserParameters,
    });
  }

  formatCall = (args: Record<string, unknown>) => {
    const action = String(args.action || '');
    const url = args.url ? ` ${String(args.url).slice(0, 80)}` : '';
    const ref = args.ref ? ` ref=${args.ref}` : '';
    return `${action}${url}${ref}`;
  };

  async executeImpl(args: z.infer<typeof BrowserParameters>, context: ToolContext): Promise<ToolResult> {
    const service = getBrowserService();

    switch (args.action) {
      case 'start': {
        const session = await service.createSession();
        return textResult(`Browser session started: ${session.id}`, { sessionId: session.id });
      }

      case 'stop': {
        await service.closeAll();
        return textResult('All browser sessions closed');
      }

      case 'list': {
        const sessions = service.listSessions();
        if (sessions.length === 0) {
          return textResult('No active browser sessions');
        }
        const lines = sessions.map(s => `${s.id}: ${s.url ?? 'no page'} (started ${new Date(s.startedAt).toISOString()})`);
        return textResult(lines.join('\n'));
      }

      case 'open': {
        if (!args.url) {
          return errorResult('url required for open action');
        }
        const session = await service.createSession();
        const result = await service.navigate(session.id, args.url);
        return textResult(`Opened ${result.url}\nTitle: ${result.title}`, { sessionId: session.id });
      }

      case 'navigate': {
        if (!args.sessionId) {
          return errorResult('sessionId required for navigate action');
        }
        if (!args.url) {
          return errorResult('url required for navigate action');
        }
        const result = await service.navigate(args.sessionId, args.url);
        return textResult(`Navigated to ${result.url}\nTitle: ${result.title}`);
      }

      case 'snapshot': {
        if (!args.sessionId) {
          return errorResult('sessionId required for snapshot action');
        }
        const snapshot = await service.getSnapshot(args.sessionId, args.maxChars);
        return textResult(snapshot);
      }

      case 'click': {
        if (!args.sessionId) {
          return errorResult('sessionId required for click action');
        }
        if (!args.ref) {
          return errorResult('ref required for click action');
        }
        await service.click(args.sessionId, args.ref);
        return textResult(`Clicked element ${args.ref}`);
      }

      case 'type': {
        if (!args.sessionId) {
          return errorResult('sessionId required for type action');
        }
        if (!args.ref) {
          return errorResult('ref required for type action');
        }
        if (!args.text) {
          return errorResult('text required for type action');
        }
        await service.type(args.sessionId, args.ref, args.text);
        return textResult(`Typed into element ${args.ref}`);
      }

      case 'press': {
        if (!args.sessionId) {
          return errorResult('sessionId required for press action');
        }
        if (!args.key) {
          return errorResult('key required for press action');
        }
        // Map common keys
        const session = service.getSession(args.sessionId);
        if (!session) {
          return errorResult(`Session not found: ${args.sessionId}`);
        }
        await session.page.keyboard.press(args.key);
        return textResult(`Pressed key: ${args.key}`);
      }

      case 'screenshot': {
        if (!args.sessionId) {
          return errorResult('sessionId required for screenshot action');
        }
        const buffer = await service.screenshot(args.sessionId, { fullPage: args.fullPage });
        const base64 = buffer.toString('base64');
        return imageResult(base64, 'image/png');
      }

      case 'pdf': {
        if (!args.sessionId) {
          return errorResult('sessionId required for pdf action');
        }
        const buffer = await service.pdf(args.sessionId);
        // PDFs are returned as base64 text (too big for image result)
        return textResult(`PDF generated (${buffer.length} bytes)`, { 
          base64: buffer.toString('base64'),
          size: buffer.length 
        });
      }

      case 'evaluate': {
        if (!args.sessionId) {
          return errorResult('sessionId required for evaluate action');
        }
        if (!args.script) {
          return errorResult('script required for evaluate action');
        }
        const result = await service.evaluate(args.sessionId, args.script);
        return textResult(JSON.stringify(result, null, 2));
      }

      case 'close': {
        if (!args.sessionId) {
          return errorResult('sessionId required for close action');
        }
        await service.closeSession(args.sessionId);
        return textResult(`Closed browser session ${args.sessionId}`);
      }

      default: {
        return errorResult(`Unknown action: ${args.action}`);
      }
    }
  }
}

export function createBrowserTool(): BrowserTool {
  return new BrowserTool();
}
