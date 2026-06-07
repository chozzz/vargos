export { OpenAIProvider } from './openai.js';
export { AnthropicProvider } from './anthropic.js';
import { OpenAIProvider } from './openai.js';
import { AnthropicProvider } from './anthropic.js';
export function createProvider(name) {
    switch (name) {
        case 'openai':
            return new OpenAIProvider();
        case 'anthropic':
            return new AnthropicProvider();
        default:
            throw new Error(`Unknown provider: ${name}`);
    }
}
//# sourceMappingURL=index.js.map