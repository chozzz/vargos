/** HTTP response validation utilities */
/**
 * Validate HTTP response and throw with formatted error message.
 * Extracts method/URL context from error message if available.
 */
export function validateHttpResponse(res, context) {
    if (!res.ok) {
        throw new Error(`${context} failed: ${res.status} ${res.statusText || 'error'}`);
    }
}
//# sourceMappingURL=http-validate.js.map