export { type MediaProvider } from './provider.js';
export { OpenAIProvider } from './openai.js';
export { AnthropicProvider } from './anthropic.js';

import type { MediaProvider } from './provider.js';
import { OpenAIProvider } from './openai.js';
import { AnthropicProvider } from './anthropic.js';

export function createProvider(name: string): MediaProvider {
  switch (name) {
    case 'openai':
      return new OpenAIProvider();
    case 'anthropic':
      return new AnthropicProvider();
    default:
      throw new Error(`Unknown provider: ${name}`);
  }
}
