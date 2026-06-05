/**
 * Primitive types and enums shared across config schemas
 */
import { z } from 'zod';
// z.lazy is required for the recursive JSON type
export const JsonSchema = z.lazy(() => z.union([
    z.string(),
    z.number(),
    z.boolean(),
    z.null(),
    z.array(JsonSchema),
    z.record(z.string(), JsonSchema),
]));
// ─── Common enums ─────────────────────────────────────────────────────────────
export const ThinkingLevelSchema = z.enum(['off', 'minimal', 'low', 'medium', 'high', 'xhigh']);
//# sourceMappingURL=primitives.js.map