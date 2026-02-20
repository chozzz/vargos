/** Mask a secret, showing only the last N characters */
export function maskSecret(value: string, visible = 3): string {
  return value.length > visible ? '****' + value.slice(-visible) : '****';
}
