/** Generate a short unique ID with a prefix: `prefix-timestamp-random` */
export function generateId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}
