/** HTTP response validation utilities */
export interface HttpResponse {
    ok: boolean;
    status: number;
    statusText?: string;
}
/**
 * Validate HTTP response and throw with formatted error message.
 * Extracts method/URL context from error message if available.
 */
export declare function validateHttpResponse(res: HttpResponse, context: string): void;
//# sourceMappingURL=http-validate.d.ts.map