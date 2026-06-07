import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { WHISPER_EXTS, MIME_TO_AUDIO_EXT, getMimeTypeFromExt } from '../../../lib/mime.js';
import { validateHttpResponse } from '../../../lib/http-validate.js';
/** Normalize an OpenAI-compatible base URL by stripping a trailing /v1 (we append it per-endpoint). */
function normalizeApiBaseUrl(baseUrl) {
    return (baseUrl ?? 'https://api.openai.com').replace(/\/v1\/?$/, '');
}
export class OpenAIProvider {
    async transcribeAudio(filePath, model, apiKey, baseUrl) {
        const buffer = await readFile(filePath);
        const ext = path.extname(filePath).toLowerCase();
        const fixedExt = WHISPER_EXTS.has(ext) ? ext : (MIME_TO_AUDIO_EXT[ext] || '.ogg');
        const fileName = path.basename(filePath).replace(/\.[^.]+$/, fixedExt) || `audio${fixedExt}`;
        const form = new FormData();
        form.append('file', new Blob([new Uint8Array(buffer)], { type: 'audio/mpeg' }), fileName);
        form.append('model', model || 'whisper-1');
        const res = await fetch(`${normalizeApiBaseUrl(baseUrl)}/v1/audio/transcriptions`, {
            method: 'POST',
            headers: { Authorization: `Bearer ${apiKey}` },
            body: form,
        });
        validateHttpResponse(res, 'Whisper API');
        const data = (await res.json());
        return data.text || '[No speech detected]';
    }
    async describeImage(filePath, model, apiKey, baseUrl) {
        const buffer = await readFile(filePath);
        const ext = path.extname(filePath).toLowerCase();
        const mimeType = getMimeTypeFromExt(ext);
        const imageData = buffer.toString('base64');
        const res = await fetch(`${normalizeApiBaseUrl(baseUrl)}/v1/chat/completions`, {
            method: 'POST',
            headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({
                model,
                max_tokens: 1024,
                messages: [{
                        role: 'user',
                        content: [
                            { type: 'text', text: 'Describe this image concisely.' },
                            { type: 'image_url', image_url: { url: `data:${mimeType};base64,${imageData}` } },
                        ],
                    }],
            }),
        });
        validateHttpResponse(res, 'OpenAI Vision');
        const data = (await res.json());
        return data.choices[0]?.message?.content ?? '';
    }
}
//# sourceMappingURL=openai.js.map