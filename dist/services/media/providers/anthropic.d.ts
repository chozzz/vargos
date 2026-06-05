import type { MediaProvider } from './provider.js';
export declare class AnthropicProvider implements MediaProvider {
    transcribeAudio(): Promise<string>;
    describeImage(filePath: string, model: string, apiKey: string, baseUrl?: string): Promise<string>;
}
//# sourceMappingURL=anthropic.d.ts.map