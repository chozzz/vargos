import { z } from 'zod';
import type { Bus, Service } from '../../core/types.js';

const FetchSchema = z.object({
  url: z.string().describe('HTTP or HTTPS URL'),
  extractMode: z.enum(['markdown', 'text']).optional().describe('Output format (default: markdown)'),
  maxChars: z.number().optional().default(50_000).describe('Max characters to return (default: 50000)'),
});

export const BOOT_PRIORITY = 30; // web fetch tool before agent runs
export class WebService implements Service {
  readonly name = 'web';

  init(bus: Bus): void {
    bus.register('web.fetch', {
      description: 'Fetch a URL and return readable content (HTML → markdown).',
      schema: FetchSchema,
      cli: { positional: ['url'] },
    }, (p) => this.fetch(p));
  }

  dispose(): void { }

  private async fetch(params: z.infer<typeof FetchSchema>): Promise<{ text: string }> {
    throw new Error(
      `The built-in 'web.fetch' tool is deprecated and disabled (requested: ${params.url}). ` +
      `Use one of these instead:\n` +
      `  • Playwright MCP — for browser-based fetching with JS rendering and full HTML→markdown.\n` +
      `  • Node's native fetch — for simple HTTP calls, call it directly from your own code.\n` +
      `Remove this service (or lower BOOT_PRIORITY) if you don't need it registered.`
    );
  }
}

export function createService(): Service {
  return new WebService();
}
