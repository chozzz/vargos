/**
 * Media service — audio transcription, image description, and document extraction
 *
 * Callable: media.transcribeAudio, media.describeImage, media.extractDocument
 */
import type { Bus } from '../../gateway/bus.js';
import type { EventMap } from '../../gateway/events.js';
import type { AppConfig } from '../../services/config/index.js';
export declare class MediaService {
    private readonly bus;
    private readonly config;
    private cache;
    constructor(bus: Bus, config: AppConfig);
    private resolveProviderConfig;
    transcribeAudio(params: EventMap['media.transcribeAudio']['params']): Promise<EventMap['media.transcribeAudio']['result']>;
    describeImage(params: EventMap['media.describeImage']['params']): Promise<EventMap['media.describeImage']['result']>;
    extractDocument(params: EventMap['media.extractDocument']['params']): Promise<EventMap['media.extractDocument']['result']>;
}
export declare function boot(bus: Bus): Promise<{
    stop?(): void;
}>;
//# sourceMappingURL=index.d.ts.map