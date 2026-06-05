import type { MediaProvider } from './provider.js';
export declare class OpenAIProvider implements MediaProvider {
    transcribeAudio(filePath: string, model: string, apiKey: string, baseUrl?: string): Promise<string>;
    describeImage(filePath: string, model: string, apiKey: string, baseUrl?: string): Promise<string>;
}
//# sourceMappingURL=openai.d.ts.map