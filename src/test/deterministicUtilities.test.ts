// ===== Deterministic Utility Tests =====
// Tests for pure utility functions that will form the foundation of the QDN refactor.

import { describe, it, expect } from 'vitest';
import {
  parseQdnResponse,
  extractArray,
} from '../services/qortium/qortiumClient';
import { encodeJsonToBase64 } from '../services/qortium/qdnService';
import { parseMarkdown } from '../services/forum/markdown';

// ---- parseQdnResponse ----

describe('parseQdnResponse', () => {
  it('returns falsy values as-is', () => {
    expect(parseQdnResponse(null)).toBeNull();
    expect(parseQdnResponse(undefined)).toBeUndefined();
    expect(parseQdnResponse('')).toBe('');
  });

  it('returns non-string values as-is', () => {
    expect(parseQdnResponse(42)).toBe(42);
    expect(parseQdnResponse({ key: 'value' })).toEqual({ key: 'value' });
  });

  it('parses plain JSON strings', () => {
    expect(parseQdnResponse('{"a":1}')).toEqual({ a: 1 });
    expect(parseQdnResponse('[1,2,3]')).toEqual([1, 2, 3]);
  });

  it('parses base64-encoded JSON strings', () => {
    expect(parseQdnResponse(btoa('{"x":"y"}'))).toEqual({ x: 'y' });
  });

  it('handles double-encoded base64 JSON', () => {
    const inner = btoa('{"double":true}');
    const outer = btoa(inner);
    expect(parseQdnResponse(outer)).toEqual({ double: true });
  });

  it('returns raw string when all parse attempts fail', () => {
    expect(parseQdnResponse('not-json-or-base64!!!')).toBe('not-json-or-base64!!!');
  });

  it('handles malformed JSON gracefully', () => {
    expect(parseQdnResponse('{ broken')).toBe('{ broken');
  });

  it('handles malformed base64 gracefully', () => {
    // "!!!" is valid base64 but not valid UTF-8 JSON
    const result = parseQdnResponse('!!!');
    expect(typeof result).toBe('string');
  });
});

// ---- encodeJsonToBase64 ----

describe('encodeJsonToBase64', () => {
  it('encodes a simple object to base64', () => {
    const result = encodeJsonToBase64({ hello: 'world' });
    const decoded = JSON.parse(atob(result));
    expect(decoded).toEqual({ hello: 'world' });
  });

  it('handles UTF-8 characters correctly', () => {
    const result = encodeJsonToBase64({ emoji: '🎉', estonian: 'Tere maailm!' });
    const bytes = Uint8Array.from(atob(result), (c) => c.charCodeAt(0));
    const decoded = JSON.parse(new TextDecoder().decode(bytes));
    expect(decoded).toEqual({ emoji: '🎉', estonian: 'Tere maailm!' });
  });

  it('encodes arrays', () => {
    const result = encodeJsonToBase64([1, 2, 3]);
    const decoded = JSON.parse(atob(result));
    expect(decoded).toEqual([1, 2, 3]);
  });

  it('encodes strings', () => {
    const result = encodeJsonToBase64('plain string');
    const decoded = JSON.parse(atob(result));
    expect(decoded).toBe('plain string');
  });

  it('round-trips complex nested objects', () => {
    const complex = {
      id: 'test-1',
      nested: { deep: [1, { x: null }] },
      date: '2026-07-25T12:00:00.000Z',
      unicode: '日本語',
    };
    const result = encodeJsonToBase64(complex);
    const bytes = Uint8Array.from(atob(result), (c) => c.charCodeAt(0));
    const decoded = JSON.parse(new TextDecoder().decode(bytes));
    expect(decoded).toEqual(complex);
  });
});

// ---- extractArray ----

describe('extractArray', () => {
  it('extracts a named array from an object', () => {
    expect(extractArray({ items: [1, 2, 3] }, 'items')).toEqual([1, 2, 3]);
  });

  it('returns empty array when key is missing', () => {
    expect(extractArray({ other: [1, 2] }, 'items')).toEqual([]);
  });

  it('returns empty array when value is not an array', () => {
    expect(extractArray({ items: 'not-array' }, 'items')).toEqual([]);
  });

  it('returns empty array for empty object', () => {
    expect(extractArray({}, 'items')).toEqual([]);
  });
});

// ---- parseMarkdown ----

describe('parseMarkdown', () => {
  it('renders plain text as paragraph', () => {
    const result = parseMarkdown('Hello world');
    expect(result).toHaveLength(1);
  });

  it('renders bold text', () => {
    const result = parseMarkdown('**bold text**');
    expect(result).toHaveLength(1);
  });

  it('renders italic text', () => {
    const result = parseMarkdown('*italic text*');
    expect(result).toHaveLength(1);
  });

  it('renders headings', () => {
    const result = parseMarkdown('# Heading 1\n\n## Heading 2');
    expect(result).toHaveLength(2);
  });

  it('renders unordered lists', () => {
    const result = parseMarkdown('- Item 1\n- Item 2');
    expect(result).toHaveLength(1);
  });

  it('handles empty input', () => {
    const result = parseMarkdown('');
    expect(result).toEqual([]);
  });

  it('handles only whitespace', () => {
    const result = parseMarkdown('   \n\n  ');
    expect(result).toEqual([]);
  });

  it('renders inline code', () => {
    const result = parseMarkdown('Use `const x = 1` in code');
    expect(result).toHaveLength(1);
  });

  it('renders links', () => {
    const result = parseMarkdown('[click here](https://example.com)');
    expect(result).toHaveLength(1);
  });
});
