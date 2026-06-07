import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { getMimeTypeFromExt } from '../../../lib/mime.js';
export class AnthropicProvider {
    async transcribeAudio() {
        throw new Error('Anthropic does not support audio transcription. Use openai provider.');
    }
    async describeImage(filePath, model, apiKey, baseUrl) {
        const buffer = await readFile(filePath);
        const ext = path.extname(filePath).toLowerCase();
        const mimeType = getMimeTypeFromExt(ext);
        const imageData = buffer.toString('base64');
        const res = await fetch(`${baseUrl ?? 'https://api.anthropic.com'}/v1/messages`, {
            method: 'POST',
            headers: {
                'x-api-key': apiKey,
                'anthropic-version': '2023-06-01',
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                model,
                max_tokens: 1024,
                messages: [{
                        role: 'user',
                        content: [
                            { type: 'image', source: { type: 'base64', media_type: mimeType, data: imageData } },
                            { type: 'text', text: 'Describe this image concisely.' },
                        ],
                    }],
            }),
        });
        if (!res.ok)
            throw new Error(`Anthropic Vision ${res.status}: ${(await res.text()).slice(0, 100)}`);
        const data = (await res.json());
        return data.content.find(b => b.type === 'text')?.text ?? '';
    }
}
//# sourceMappingURL=anthropic.js.map