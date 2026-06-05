/**
 * MIME ↔ file-extension maps and helpers. Pure data — no I/O, no domain imports.
 */
export declare const WHISPER_EXTS: Set<string>;
export declare const MIME_TO_AUDIO_EXT: Record<string, string>;
export declare const MIME_EXT: Record<string, string>;
export declare const MEDIA_TYPE_MIME_DEFAULTS: Record<string, string>;
export declare const EXT_TO_MIME: Record<string, string>;
/** Get file extension for a MIME type. */
export declare function extFromMime(mimeType: string): string;
/** Get MIME type from a file extension. */
export declare function getMimeTypeFromExt(ext: string): string;
//# sourceMappingURL=mime.d.ts.map