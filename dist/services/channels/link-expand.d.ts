/**
 * Link expansion for inbound channel messages.
 * Fetches URLs found in message text and appends readable content.
 */
import type { LinkExpandConfig } from '../../services/config/index.js';
export type { LinkExpandConfig };
export declare function expandLinks(content: string, config?: LinkExpandConfig): Promise<string>;
//# sourceMappingURL=link-expand.d.ts.map