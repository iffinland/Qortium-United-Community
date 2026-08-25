// ===== Rich Text Primitives =====
//
// Canonical serialization helpers for QUC rich content. The tag language is
// intentionally identical to the proven Qortium Blogs editor so published
// content remains simple, deterministic, and safe to render without raw HTML.
//
// Formatting is stored as lightweight BBCode-style markers:
//   [b]...[/b] [i]...[/i] [u]...[/u] [h2]...[/h2] [h3]...[/h3]
//   [quote]...[/quote] [code]...[/code] [color=#rrggbb]...[/color]
//   [url=...]...[/url]
//   [imageqdn]name|identifier|filename|mimeType|size[/imageqdn]

import type { QdnImageRef } from '../../types';

export type RichTextFormat =
  | 'bold'
  | 'italic'
  | 'underline'
  | 'heading2'
  | 'heading3'
  | 'quote'
  | 'code'
  | 'link';

export const RICH_TEXT_FORMAT_TAGS: Record<RichTextFormat, [string, string]> = {
  bold: ['[b]', '[/b]'],
  italic: ['[i]', '[/i]'],
  underline: ['[u]', '[/u]'],
  heading2: ['[h2]', '[/h2]'],
  heading3: ['[h3]', '[/h3]'],
  quote: ['[quote]', '[/quote]'],
  code: ['[code]', '[/code]'],
  link: ['[url=qdn://]', '[/url]'],
};

export type SelectionFormatResult = {
  value: string;
  nextSelectionStart: number;
  nextSelectionEnd: number;
};

export const applyWrapFormat = ({
  value,
  selectionStart,
  selectionEnd,
  openTag,
  closeTag,
  placeholder = 'text',
}: {
  value: string;
  selectionStart: number;
  selectionEnd: number;
  openTag: string;
  closeTag: string;
  placeholder?: string;
}): SelectionFormatResult => {
  const start = Math.min(selectionStart, selectionEnd);
  const end = Math.max(selectionStart, selectionEnd);
  const selected = value.slice(start, end) || placeholder;
  const inserted = `${openTag}${selected}${closeTag}`;

  return {
    value: `${value.slice(0, start)}${inserted}${value.slice(end)}`,
    nextSelectionStart: start + openTag.length,
    nextSelectionEnd: start + openTag.length + selected.length,
  };
};

export const applyLinkFormat = ({
  value,
  selectionStart,
  selectionEnd,
  url,
  label,
}: {
  value: string;
  selectionStart: number;
  selectionEnd: number;
  url: string;
  label?: string;
}): SelectionFormatResult => {
  const start = Math.min(selectionStart, selectionEnd);
  const end = Math.max(selectionStart, selectionEnd);
  const cleanUrl = url.trim();
  const selected = value.slice(start, end).trim();
  const linkLabel = (label?.trim() || selected || cleanUrl).trim();
  const openTag = `[url=${cleanUrl}]`;
  const inserted = `${openTag}${linkLabel}[/url]`;

  return {
    value: `${value.slice(0, start)}${inserted}${value.slice(end)}`,
    nextSelectionStart: start + openTag.length,
    nextSelectionEnd: start + openTag.length + linkLabel.length,
  };
};

export const applyColorFormat = ({
  value,
  selectionStart,
  selectionEnd,
  color,
}: {
  value: string;
  selectionStart: number;
  selectionEnd: number;
  color: string;
}): SelectionFormatResult => {
  const safeColor = /^#[0-9a-f]{6}$/i.test(color) ? color : '#111827';
  return applyWrapFormat({
    value,
    selectionStart,
    selectionEnd,
    openTag: `[color=${safeColor}]`,
    closeTag: '[/color]',
    placeholder: 'text',
  });
};

export const applyListFormat = ({
  value,
  selectionStart,
  selectionEnd,
  ordered,
}: {
  value: string;
  selectionStart: number;
  selectionEnd: number;
  ordered: boolean;
}): SelectionFormatResult => {
  const start = Math.min(selectionStart, selectionEnd);
  const end = Math.max(selectionStart, selectionEnd);
  const selected = value.slice(start, end) || 'List item';
  const lines = selected.split(/\r?\n/);
  const formatted = lines
    .map((line, index) => `${ordered ? `${index + 1}.` : '-'} ${line.replace(/^(\d+\.|-)\s+/, '')}`)
    .join('\n');

  return {
    value: `${value.slice(0, start)}${formatted}${value.slice(end)}`,
    nextSelectionStart: start,
    nextSelectionEnd: start + formatted.length,
  };
};

export const insertAtSelection = ({
  value,
  selectionStart,
  selectionEnd,
  snippet,
}: {
  value: string;
  selectionStart: number;
  selectionEnd: number;
  snippet: string;
}): SelectionFormatResult => {
  const start = Math.min(selectionStart, selectionEnd);
  const end = Math.max(selectionStart, selectionEnd);

  return {
    value: `${value.slice(0, start)}${snippet}${value.slice(end)}`,
    nextSelectionStart: start + snippet.length,
    nextSelectionEnd: start + snippet.length,
  };
};

const encodeTagValue = (value: string | number | undefined) =>
  encodeURIComponent(String(value ?? ''));

const decodeTagValue = (value: string | undefined) => {
  try {
    return decodeURIComponent(value ?? '');
  } catch {
    return value ?? '';
  }
};

export const encodeQdnImageTag = (ref: QdnImageRef): string => {
  const payload = [ref.name, ref.identifier, ref.filename, ref.mimeType, ref.size].map(
    encodeTagValue,
  );
  return `[imageqdn]${payload.join('|')}[/imageqdn]`;
};

export const decodeQdnImagePayload = (payload: string): QdnImageRef => {
  const [name, identifier, filename, mimeType, size] = payload.split('|').map(decodeTagValue);
  return {
    service: 'IMAGE',
    name,
    identifier,
    filename: filename || undefined,
    mimeType: mimeType || undefined,
    size: Number.isFinite(Number(size)) ? Number(size) : undefined,
  };
};

export const findFirstQdnImageRef = (value: string): QdnImageRef | null => {
  const match = value.match(/\[imageqdn\]([\s\S]*?)\[\/imageqdn\]/i);
  if (!match) return null;
  return decodeQdnImagePayload(match[1]);
};

export const hasRichTextMarkup = (value: string): boolean =>
  /\[(b|i|u|h2|h3|quote|code|color=#[0-9a-f]{6}|url=[^\]]+|imageqdn)\]/i.test(value);

export const stripRichTextMarkup = (value: string) =>
  value
    .replace(/\[(\/)?(b|i|u|h2|h3|quote|code)\]/gi, '')
    .replace(/\[color=#[0-9a-f]{6}\]([\s\S]*?)\[\/color\]/gi, '$1')
    .replace(/\[url=[^\]]+\]([\s\S]*?)\[\/url\]/gi, '$1')
    .replace(/\[imageqdn\][\s\S]*?\[\/imageqdn\]/gi, '')
    .replace(/\s+/g, ' ')
    .trim();

/**
 * Compact plain-text preview for list/card surfaces. It removes the
 * canonical rich-text markers and the legacy Markdown syntax that older
 * QUC resources still use, without changing the stored content.
 */
export const toPlainTextPreview = (value: string): string => {
  const withoutRichTags = stripRichTextMarkup(value);
  return withoutRichTags
    .replace(/!\[([^\]]+)\]\(([^)]+)\)/g, '$1')
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '$1')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/^\s*[-*+]\s+/gm, '')
    .replace(/[*_`]{1,3}/g, '')
    .replace(/\s+/g, ' ')
    .trim();
};

// ---- Link safety ----

const BLOCKED_SCHEMES = /^(javascript|data|vbscript):/i;
const ALLOWED_SCHEMES = /^(qdn|home|core|https?):\/\//i;
const INTERNAL_PREFIX = /^[/#?]/;

/**
 * Returns the href if the value is a safe link, or an empty string.
 * Allows: qdn://, home://, core://, https://, http://, /, #, ?
 * Blocks: javascript:, data:, vbscript:, and anything else.
 */
export const getSafeLinkHref = (value: string | undefined): string => {
  const href = value?.trim() ?? '';
  if (!href) return '';
  if (BLOCKED_SCHEMES.test(href)) return '';
  if (ALLOWED_SCHEMES.test(href)) return href;
  if (INTERNAL_PREFIX.test(href)) return href;
  return '';
};

// ---- Plain-text URL autolinking ----

const AUTOLINK_PATTERN = /((?:qdn|home|core):\/\/[^\s<>"']+|https?:\/\/[^\s<>"']+)/gi;

export type TextSegment =
  | { kind: 'text'; value: string }
  | { kind: 'link'; href: string; value: string };

export const autolinkText = (value: string): TextSegment[] => {
  const segments: TextSegment[] = [];
  let cursor = 0;
  let match: RegExpExecArray | null;
  AUTOLINK_PATTERN.lastIndex = 0;

  while ((match = AUTOLINK_PATTERN.exec(value)) !== null) {
    if (match.index > cursor) {
      segments.push({ kind: 'text', value: value.slice(cursor, match.index) });
    }
    const url = match[0];
    segments.push({ kind: 'link', href: url, value: url });
    cursor = match.index + url.length;
  }

  if (cursor < value.length) {
    segments.push({ kind: 'text', value: value.slice(cursor) });
  }

  return segments.length > 0 ? segments : [{ kind: 'text', value }];
};
