/** Safe for persistence and rendering legacy records. Never returns executable URLs. */
export function safeSourceUrl(value: unknown): string | undefined {
 if (typeof value !== 'string' || value.length > 2048 || /[\u0000-\u0020\u007f]/.test(value)) return undefined;
 try {
  const url = new URL(value);
  return ['http:', 'https:'].includes(url.protocol) && !url.username && !url.password ? url.href : undefined;
 } catch { return undefined; }
}
