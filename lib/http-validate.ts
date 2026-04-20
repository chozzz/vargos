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
export function validateHttpResponse(
  res: HttpResponse,
  context: string,
): void {
  if (!res.ok) {
    throw new Error(`${context} failed: ${res.status} ${res.statusText || 'error'}`);
  }
}
