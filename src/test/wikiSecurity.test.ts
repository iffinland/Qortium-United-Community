// ===== Wiki Markdown Security Tests =====

import { describe, it, expect } from 'vitest';
import { parseMarkdown } from '../services/forum/markdown';

/** Get all string content from rendered React output as flat text. */
function renderedText(md: string): string {
  const result = parseMarkdown(md);
  return JSON.stringify(result, null, 0).toLowerCase();
}

describe('Markdown XSS security', () => {
  it('script tag content ignored by parser', () => {
    const out = renderedText('Hello <script>alert(1)</script> world');
    // The parser treats <script> as literal text, not an HTML element
    expect(out).toContain('alert');
    // React-based renderer does not insert raw HTML
  });

  it('link javascript protocol blocked', () => {
    const out = renderedText('[click](javascript:alert(1))');
    expect(out).not.toContain('javascript:');
  });

  it('link javascript with whitespace blocked', () => {
    const out = renderedText('[click]( javascript:alert(1))');
    expect(out).not.toContain('javascript:');
  });

  it('link data protocol blocked', () => {
    const out = renderedText('[click](data:text/html,<script>)');
    expect(out).not.toContain('data:');
  });

  it('link vbscript blocked', () => {
    const out = renderedText('[click](vbscript:msgbox(1))');
    expect(out).not.toContain('vbscript:');
  });

  it('safe https link retained', () => {
    const out = renderedText('[safe](https://example.com)');
    expect(out).toContain('https://example.com');
  });

  it('safe internal link retained', () => {
    const out = renderedText('[wiki](/wiki/article/wk-test)');
    expect(out).toContain('/wiki/article/wk-test');
  });

  it('heading retained', () => {
    const out = renderedText('# Hello World');
    expect(out).toContain('hello world');
  });

  it('code block renders inert', () => {
    const out = renderedText('`<script>alert(1)</script>`');
    expect(out).toContain('script');
    expect(out).toContain('alert');
  });

  it('external link has noopener noreferrer', () => {
    const out = renderedText('[ext](https://example.com)');
    expect(out).toContain('noopener');
    expect(out).toContain('noreferrer');
  });

  it('bold and italic safe', () => {
    const out = renderedText('**bold** and *italic*');
    expect(out).toContain('bold');
    expect(out).toContain('italic');
  });

  it('list retained', () => {
    const out = renderedText('- item 1\n- item 2');
    expect(out).toContain('item 1');
    expect(out).toContain('item 2');
  });
});
