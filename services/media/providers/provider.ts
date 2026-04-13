export interface MediaProvider {
  transcribeAudio(filePath: string, model: string, apiKey: string, baseUrl?: string): Promise<string>;
  describeImage(imageData: string, mimeType: string, model: string, apiKey: string, baseUrl?: string): Promise<string>;
}
