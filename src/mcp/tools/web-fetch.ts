/**
 * Web fetch tool - Ported from OpenClaw
 * Fetch URLs and extract readable content
 */

import { z } from 'zod';
import { Tool, ToolContext, textResult, errorResult } from './types.js';

const WebFetchParameters = z.object({
  url: z.string().describe('HTTP or HTTPS URL to fetch'),
  extractMode: z.enum(['markdown', 'text']).optional().describe('Extraction mode (default: markdown)'),
  maxChars: z.number().optional().describe('Maximum characters to return (truncates when exceeded)'),
});

// Simple HTML to Markdown conversion
function htmlToMarkdown(html: string): { text: string; title?: string } {
  // Extract title
  const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  const title = titleMatch ? titleMatch[1].trim() : undefined;

  // Remove script, style, noscript tags
  let text = html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, '');

  // Convert common elements to markdown
  text = text.replace(/<a\s+[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi, (_, href, body) => {
    const label = body.trim();
    return label ? `[${label}](${href})` : href;
  });

  text = text.replace(/<h([1-6])[^>]*>([\s\S]*?)<\/h\1>/gi, (_, level, body) => {
    const prefix = '#'.repeat(Math.max(1, Math.min(6, parseInt(level, 10))));
    return `\n${prefix} ${body.trim()}\n`;
  });

  text = text.replace(/<li[^>]*>([\s\S]*?)<\/li>/gi, (_, body) => {
    const label = body.trim();
    return label ? `\n- ${label}` : '';
  });

  text = text
    .replace(/<(br|hr)\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|section|article|header|footer)>/gi, '\n');

  // Strip remaining tags
  text = text.replace(/<[^>]+>/g, '');

  // Decode entities
  text = text
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>');

  // Normalize whitespace
  text = text
    .replace(/\r/g, '')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]{2,}/g, ' ')
    .trim();

  return { text, title };
}

function markdownToText(markdown: string): string {
  let text = markdown;
  // Remove images
  text = text.replace(/!\[[^\]]*]\([^)]+\)/g, '');
  // Convert links to just text
  text = text.replace(/\[([^\]]+)]\([^)]+\)/g, '$1');
  // Remove code block markers
  text = text.replace(/```[\s\S]*?```/g, (block) =>
    block.replace(/```[^\n]*\n?/g, '').replace(/```/g, '')
  );
  // Remove inline code markers
  text = text.replace(/`([^`]+)`/g, '$1');
  // Remove heading markers
  text = text.replace(/^#{1,6}\s+/gm, '');
  // Remove list markers
  text = text.replace(/^\s*[-*+]\s+/gm, '');
  text = text.replace(/^\s*\d+\.\s+/gm, '');
  
  return text
    .replace(/\r/g, '')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]{2,}/g, ' ')
    .trim();
}

export const webFetchTool: Tool = {
  name: 'web_fetch',
  description: 'Fetch and extract readable content from a URL (HTML → markdown/text)',
  parameters: WebFetchParameters,
  execute: async (args: unknown, context: ToolContext) => {
    const params = WebFetchParameters.parse(args);
    const extractMode = params.extractMode ?? 'markdown';
    const maxChars = params.maxChars ?? 50000;

    // Validate URL
    let url: URL;
    try {
      url = new URL(params.url);
    } catch {
      return errorResult('Invalid URL: must be a valid HTTP or HTTPS URL');
    }

    if (!['http:', 'https:'].includes(url.protocol)) {
      return errorResult('Invalid URL: must be http or https');
    }

    try {
      const response = await fetch(params.url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; Vargos/0.1)',
        },
        redirect: 'follow',
      });

      if (!response.ok) {
        return errorResult(`Fetch failed: ${response.status} ${response.statusText}`);
      }

      const contentType = response.headers.get('content-type') || '';
      const isHtml = contentType.includes('text/html') || 
                     contentType.includes('application/xhtml');

      let text: string;
      let title: string | undefined;

      if (isHtml) {
        const html = await response.text();
        const converted = htmlToMarkdown(html);
        text = converted.text;
        title = converted.title;
      } else {
        // Plain text or other content
        text = await response.text();
      }

      // Apply extract mode
      if (extractMode === 'text') {
        text = markdownToText(text);
      }

      // Apply maxChars limit
      const truncated = text.length > maxChars;
      if (truncated) {
        text = text.slice(0, maxChars) + '\n... (truncated)';
      }

      // Format output
      let output = '';
      if (title) {
        output += `# ${title}\n\n`;
      }
      output += text;
      if (truncated) {
        output += `\n\n[Content truncated at ${maxChars} characters]`;
      }

      return textResult(output);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return errorResult(`Fetch failed: ${message}`);
    }
  },
};
