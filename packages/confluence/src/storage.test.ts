import { describe, expect, it } from 'vitest';
import { storageToMarkdown } from './storage.js';

const SANITIZED_HEADING = '<h1>Overview</h1><p>Intro text</p>';
const SANITIZED_LIST = '<ul><li>First</li><li>Second</li></ul>';
const SANITIZED_LINK = '<p>See <a href="https://example.test/doc">docs</a></p>';
const SANITIZED_CODE =
  '<ac:structured-macro ac:name="code"><ac:plain-text-body><![CDATA[const x = 1;]]></ac:plain-text-body></ac:structured-macro>';
const SANITIZED_TABLE =
  '<table><tr><th>Name</th><th>Value</th></tr><tr><td>Alpha</td><td>1</td></tr></table>';

describe('storageToMarkdown', () => {
  it('converts headings and paragraphs', () => {
    expect(storageToMarkdown(SANITIZED_HEADING)).toContain('# Overview');
    expect(storageToMarkdown(SANITIZED_HEADING)).toContain('Intro text');
  });

  it('converts lists', () => {
    const markdown = storageToMarkdown(SANITIZED_LIST);
    expect(markdown).toContain('- First');
    expect(markdown).toContain('- Second');
  });

  it('converts links', () => {
    expect(storageToMarkdown(SANITIZED_LINK)).toContain('[docs](https://example.test/doc)');
  });

  it('converts code macros', () => {
    expect(storageToMarkdown(SANITIZED_CODE)).toContain('const x = 1;');
  });

  it('converts tables', () => {
    const markdown = storageToMarkdown(SANITIZED_TABLE);
    expect(markdown).toContain('| Name | Value |');
    expect(markdown).toContain('| Alpha | 1 |');
  });

  it('falls back to plain text on malformed html', () => {
    expect(storageToMarkdown('<<broken>>')).toBe('broken');
  });
});
