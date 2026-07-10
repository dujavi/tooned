import { describe, expect, it } from 'vitest';
import { isTextMime, shouldDownload } from './attachments.js';

describe('isTextMime', () => {
  it.each([
    'text/plain',
    'text/markdown',
    'application/json',
    'application/xml',
    'application/javascript',
  ])('accepts %s', (mime) => {
    expect(isTextMime(mime)).toBe(true);
  });

  it('rejects binary mime types', () => {
    expect(isTextMime('image/png')).toBe(false);
    expect(isTextMime('application/pdf')).toBe(false);
  });
});

describe('shouldDownload', () => {
  it('allows small text attachments', () => {
    expect(shouldDownload(100, 'text/plain', 524_288)).toBe(true);
  });

  it('rejects oversized attachments', () => {
    expect(shouldDownload(600_000, 'text/plain', 524_288)).toBe(false);
  });

  it('rejects non-text mime types', () => {
    expect(shouldDownload(100, 'image/png', 524_288)).toBe(false);
  });
});
