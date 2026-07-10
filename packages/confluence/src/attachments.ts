const TEXT_MIME_PREFIXES = ['text/'] as const;

const TEXT_MIME_EXACT = new Set([
  'application/json',
  'application/xml',
  'application/javascript',
  'application/x-javascript',
  'application/sql',
  'application/x-yaml',
  'application/yaml',
  'application/x-sh',
  'application/typescript',
]);

export function isTextMime(mime: string): boolean {
  const normalized = mime.toLowerCase().split(';')[0]?.trim() ?? '';
  if (!normalized) {
    return false;
  }
  if (TEXT_MIME_PREFIXES.some((prefix) => normalized.startsWith(prefix))) {
    return true;
  }
  return TEXT_MIME_EXACT.has(normalized);
}

export function shouldDownload(size: number, mime: string, maxBytes: number): boolean {
  if (!Number.isFinite(size) || size < 0 || size > maxBytes) {
    return false;
  }
  return isTextMime(mime);
}
